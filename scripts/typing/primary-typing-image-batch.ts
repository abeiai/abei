import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPrismaClient } from "../../packages/database/src/index.js";
import {
  yilinPrimaryTypingBookKeys,
  yilinSeniorTypingBookKeys
} from "../../packages/database/prisma/yilin-typing-library-config.js";
import {
  getTypingLibraryConfig,
  hujiaoTypingLibraryConfigList,
  type TypingLibraryConfig
} from "../../packages/database/prisma/typing-library-config.js";
import { prepareTypingImage } from "./register-typing-media.js";
import {
  buildIllustrationPrompt,
  canReuseTypingIllustration,
  mediaInputHash,
  typingMediaRelativePath
} from "./typing-media-manifest.js";

interface GeneratedImageBatchEntry {
  book: string;
  order: number;
  outputPath: string;
  sourcePath: string;
  text: string;
  unit: number;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

try {
  process.loadEnvFile(resolve(projectRoot, ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const requestedBook = stringArg(args, "--book");
  const configs: readonly TypingLibraryConfig[] = requestedBook
    ? [getTypingLibraryConfig(requestedBook)]
    : args.includes("--hujiao")
      ? hujiaoTypingLibraryConfigList
    : args.includes("--senior")
      ? yilinSeniorTypingBookKeys.map(getTypingLibraryConfig)
      : yilinPrimaryTypingBookKeys.map(getTypingLibraryConfig);
  if (args.includes("--reuse-existing")) {
    await reuseExistingGeneratedImages(args.includes("--apply"), configs);
    return;
  }
  if (args.includes("--process")) {
    await processGeneratedBatch();
    return;
  }

  await printMissingBatch(positiveIntegerArg(args, "--limit") ?? 16, configs);
}

async function printMissingBatch(limit: number, configs: readonly TypingLibraryConfig[]) {
  const prisma = getPrismaClient();
  const configBySlug = new Map(configs.map((config) => [config.librarySlug, config]));

  try {
    const items = await prisma.englishContentItem.findMany({
      where: {
        unit: {
          library: {
            slug: { in: configs.map((config) => config.librarySlug) }
          }
        }
      },
      orderBy: [
        { unit: { library: { sortOrder: "asc" } } },
        { unit: { sortOrder: "asc" } },
        { sourceOrder: "asc" }
      ],
      select: {
        id: true,
        normalizedText: true,
        sourceOrder: true,
        text: true,
        translation: true,
        unit: {
          select: {
            code: true,
            library: { select: { slug: true } }
          }
        }
      }
    });

    const missing = [];
    for (const item of items) {
      const config = configBySlug.get(item.unit.library.slug);
      if (!config) {
        throw new Error(`无法识别内容库：${item.unit.library.slug}`);
      }
      const unitNumber = unitNumberFromCode(item.unit.code);
      const outputPath = typingMediaRelativePath(
        item,
        unitNumber,
        "ILLUSTRATION",
        config.assetKey
      );
      if (await exists(resolve(projectRoot, outputPath))) {
        continue;
      }
      const prompt = buildIllustrationPrompt(item);
      missing.push({
        book: config.assetKey,
        id: item.id,
        order: item.sourceOrder,
        outputPath,
        prompt,
        text: item.text,
        unit: unitNumber
      });
      if (missing.length >= limit) {
        break;
      }
    }

    if (missing.length > 0) {
      await prisma.$transaction(missing.map((item) => prisma.englishContentMedia.update({
        where: {
          itemId_kind: { itemId: item.id, kind: "ILLUSTRATION" }
        },
        data: {
          errorMessage: null,
          inputHash: mediaInputHash(item.prompt),
          prompt: item.prompt
        }
      })));
    }

    const existing = items.length - await countMissingOutputs(items, configBySlug);
    console.log(JSON.stringify({
      existing,
      items: missing.map(({ id: _id, ...item }) => item),
      missing: items.length - existing,
      total: items.length
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function countMissingOutputs(
  items: readonly {
    sourceOrder: number;
    text: string;
    unit: { code: string; library: { slug: string } };
  }[],
  configBySlug: ReadonlyMap<string, TypingLibraryConfig>
) {
  let missing = 0;
  for (const item of items) {
    const config = configBySlug.get(item.unit.library.slug);
    if (!config) {
      throw new Error(`无法识别内容库：${item.unit.library.slug}`);
    }
    const outputPath = typingMediaRelativePath(
      { ...item, normalizedText: "", translation: null },
      unitNumberFromCode(item.unit.code),
      "ILLUSTRATION",
      config.assetKey
    );
    if (!await exists(resolve(projectRoot, outputPath))) {
      missing += 1;
    }
  }
  return missing;
}

async function processGeneratedBatch() {
  const encoded = process.env.TYPING_GENERATED_BATCH?.trim();
  const uriEncoded = process.env.TYPING_GENERATED_BATCH_URI?.trim();
  if (!encoded && !uriEncoded) {
    throw new Error("TYPING_GENERATED_BATCH 未提供");
  }
  const json = uriEncoded
    ? decodeURIComponent(uriEncoded)
    : Buffer.from(encoded ?? "", "base64").toString("utf8");
  const entries = JSON.parse(json) as GeneratedImageBatchEntry[];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("生成图片批次为空");
  }

  await processEntries(entries);
}

async function processEntries(entries: GeneratedImageBatchEntry[]) {

  const manifestEntriesByPath = new Map<string, GeneratedImageBatchEntry[]>();
  for (const entry of entries) {
    const outputPath = resolve(projectRoot, entry.outputPath);
    const assetKey = /^(?:yl|hj|pep)-/u.test(entry.book) ? entry.book : `yl-${entry.book}`;
    const allowedRoot = resolve(projectRoot, `uploads/typing-content/${assetKey}`);
    if (!outputPath.startsWith(`${allowedRoot}/`)) {
      throw new Error(`图片输出路径超出允许目录：${entry.outputPath}`);
    }
    await access(entry.sourcePath);
    await prepareTypingImage(entry.sourcePath, outputPath);
    const manifestPath = resolve(
      projectRoot,
      `uploads/typing-content/${assetKey}/unit-${String(entry.unit).padStart(2, "0")}/image-generation-sources.json`
    );
    const grouped = manifestEntriesByPath.get(manifestPath) ?? [];
    grouped.push(entry);
    manifestEntriesByPath.set(manifestPath, grouped);
  }

  for (const [manifestPath, batchEntries] of manifestEntriesByPath) {
    const existing = await readJsonIfExists<GeneratedImageBatchEntry[]>(manifestPath, []);
    const merged = new Map(existing.map((entry) => [entry.order, entry]));
    for (const entry of batchEntries) {
      merged.set(entry.order, entry);
    }
    const sources = [...merged.values()]
      .sort((left, right) => left.order - right.order)
      .map(({ outputPath: _outputPath, book: _book, unit: _unit, ...entry }) => entry);
    await mkdir(dirname(manifestPath), { recursive: true });
    const partialPath = `${manifestPath}.part`;
    await writeFile(partialPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
    await rename(partialPath, manifestPath);
  }

  console.log(`已处理 ${entries.length} 张词汇插图。`);
}

async function reuseExistingGeneratedImages(
  apply: boolean,
  configs: readonly TypingLibraryConfig[]
) {
  const prisma = getPrismaClient();
  const targetSlugs = configs.map((config) => config.librarySlug);
  const configBySlug = new Map(configs.map((config) => [config.librarySlug, config]));

  try {
    const [targetItems, sourceMedia] = await Promise.all([
      prisma.englishContentItem.findMany({
        where: { unit: { library: { slug: { in: targetSlugs } } } },
        orderBy: [
          { unit: { library: { sortOrder: "asc" } } },
          { unit: { sortOrder: "asc" } },
          { sourceOrder: "asc" }
        ],
        select: {
          dictionaryEntryId: true,
          normalizedText: true,
          sourceOrder: true,
          text: true,
          translation: true,
          unit: { select: { code: true, library: { select: { slug: true } } } }
        }
      }),
      prisma.englishContentMedia.findMany({
        where: {
          kind: "ILLUSTRATION",
          mediaAssetId: { not: null },
          status: "READY",
          item: { unit: { library: { slug: { notIn: targetSlugs } } } }
        },
        select: {
          item: {
            select: {
              dictionaryEntryId: true,
              normalizedText: true,
              sourceOrder: true,
              text: true,
              translation: true
            }
          },
          mediaAsset: {
            select: { filename: true, storageProvider: true, url: true }
          }
        }
      })
    ]);

    const sourceByPrompt = new Map<string, string>();
    const sourceCandidates: {
      item: typeof sourceMedia[number]["item"];
      sourcePath: string;
    }[] = [];
    const sourceCandidatesByText = new Map<string, {
      item: typeof sourceMedia[number]["item"];
      sourcePath: string;
    }[]>();
    for (const media of sourceMedia) {
      if (!media.mediaAsset) {
        continue;
      }
      const relativePath = media.mediaAsset.storageProvider === "S3"
        ? `uploads/${media.mediaAsset.filename}`
        : media.mediaAsset.url.replace(/^\/+/, "");
      const sourcePath = resolve(projectRoot, relativePath);
      if (await exists(sourcePath)) {
        sourceByPrompt.set(buildIllustrationPrompt(media.item), sourcePath);
        const candidates = sourceCandidatesByText.get(media.item.normalizedText) ?? [];
        const candidate = { item: media.item, sourcePath };
        candidates.push(candidate);
        sourceCandidates.push(candidate);
        sourceCandidatesByText.set(media.item.normalizedText, candidates);
      }
    }

    for (const item of targetItems) {
      const config = configBySlug.get(item.unit.library.slug);
      if (!config) {
        throw new Error(`无法识别内容库：${item.unit.library.slug}`);
      }
      const unit = unitNumberFromCode(item.unit.code);
      const outputPath = typingMediaRelativePath(
        item,
        unit,
        "ILLUSTRATION",
        config.assetKey
      );
      const sourcePath = resolve(projectRoot, outputPath);
      if (await exists(sourcePath)) {
        sourceByPrompt.set(buildIllustrationPrompt(item), sourcePath);
        const candidates = sourceCandidatesByText.get(item.normalizedText) ?? [];
        const candidate = { item, sourcePath };
        candidates.push(candidate);
        sourceCandidates.push(candidate);
        sourceCandidatesByText.set(item.normalizedText, candidates);
      }
    }

    const reusable: GeneratedImageBatchEntry[] = [];
    for (const item of targetItems) {
      const config = configBySlug.get(item.unit.library.slug);
      if (!config) {
        throw new Error(`无法识别内容库：${item.unit.library.slug}`);
      }
      const unit = unitNumberFromCode(item.unit.code);
      const outputPath = typingMediaRelativePath(
        item,
        unit,
        "ILLUSTRATION",
        config.assetKey
      );
      if (await exists(resolve(projectRoot, outputPath))) {
        continue;
      }
      const sourcePath = sourceByPrompt.get(buildIllustrationPrompt(item))
        ?? sourceCandidatesByText.get(item.normalizedText)
          ?.find((candidate) => (
            Boolean(item.dictionaryEntryId)
            && item.dictionaryEntryId === candidate.item.dictionaryEntryId
          ) || canReuseTypingIllustration(item, candidate.item))
          ?.sourcePath
        ?? sourceCandidates.find((candidate) => (
          canReuseTypingIllustration(item, candidate.item)
        ))?.sourcePath;
      if (sourcePath) {
        reusable.push({
          book: config.assetKey,
          order: item.sourceOrder,
          outputPath,
          sourcePath,
          text: item.text,
          unit
        });
      }
    }

    console.log(`可复用既有同提示词插图：${reusable.length} 张${apply ? "，开始处理" : ""}。`);
    if (apply && reusable.length > 0) {
      await processEntries(reusable);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function positiveIntegerArg(args: string[], name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? Number(args[index + 1]) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function stringArg(args: string[], name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1]?.trim().toLocaleLowerCase("en-GB") : "";
  return value || null;
}

function unitNumberFromCode(code: string) {
  const match = code.match(/^unit-(\d{2})$/u);
  if (!match) {
    throw new Error(`单元编号不合法：${code}`);
  }
  return Number(match[1]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "词汇插图批处理失败");
  process.exitCode = 1;
});
