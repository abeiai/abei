import { access, mkdir, readFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../../packages/database/src/index.js";
import {
  getYilinTypingLibraryConfig,
  yilinSeniorTypingBookKeys,
  yilinTypingLibraryConfigs
} from "../../packages/database/prisma/yilin-typing-library-config.js";
import {
  canReuseTypingIllustration,
  typingMediaRelativePath,
  type TypingMediaItem
} from "./typing-media-manifest.js";

interface SourceEntry {
  order: number;
  sourcePath: string;
  text: string;
}

interface ReuseNode {
  book: string;
  directValid: boolean;
  outputPath: string;
  sourcePath: string;
  target: TypingMediaItem;
  unit: number;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const quarantineRoot = resolve(projectRoot, "uploads/typing-content-reuse-quarantine-20260829-strict");
const sourcePathPattern = /\/uploads\/typing-content\/(yl-(?:[3-9][ab]|b[1-3]|xb[1-4]))\/unit-(\d{2})\/images\/(\d{2,3})-[^/]+\.png$/u;

loadEnv({ path: resolve(projectRoot, ".env") });

async function main() {
  const quarantine = process.argv.slice(2).includes("--quarantine");
  const prisma = getPrismaClient();

  try {
    const configs = Object.values(yilinTypingLibraryConfigs);
    const assetKeyByLibrarySlug = new Map(configs.map((config) => [
      config.librarySlug,
      config.assetKey
    ]));
    const items = await prisma.englishContentItem.findMany({
      where: {
        unit: {
          library: {
            slug: { in: configs.map((config) => config.librarySlug) }
          }
        }
      },
      select: {
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
    const itemByLocation = new Map<string, TypingMediaItem>();
    for (const item of items) {
      const assetKey = assetKeyByLibrarySlug.get(item.unit.library.slug);
      if (!assetKey) {
        continue;
      }
      itemByLocation.set(
        `${assetKey}:${unitNumber(item.unit.code)}:${item.sourceOrder}`,
        item
      );
    }

    const nodes: ReuseNode[] = [];
    for (const book of yilinSeniorTypingBookKeys) {
      const config = getYilinTypingLibraryConfig(book);
      for (let unit = 1; unit <= config.expectedUnitCounts.length; unit += 1) {
        const manifestPath = resolve(
          projectRoot,
          `uploads/typing-content/${config.assetKey}/unit-${String(unit).padStart(2, "0")}/image-generation-sources.json`
        );
        const entries = JSON.parse(await readFile(manifestPath, "utf8")) as SourceEntry[];
        for (const entry of entries) {
          const target = itemByLocation.get(`${config.assetKey}:${unit}:${entry.order}`);
          if (!target) {
            throw new Error(`${book} Unit ${unit} 第 ${entry.order} 条缺少数据库词条`);
          }
          const outputPath = resolve(
            projectRoot,
            typingMediaRelativePath(target, unit, "ILLUSTRATION", config.assetKey)
          );
          const sourceMatch = entry.sourcePath.match(sourcePathPattern);
          const source = sourceMatch
            ? itemByLocation.get(
              `${sourceMatch[1]}:${Number(sourceMatch[2])}:${Number(sourceMatch[3])}`
            )
            : null;
          nodes.push({
            book,
            directValid: !sourceMatch || Boolean(
              source && canReuseTypingIllustration(target, source)
            ),
            outputPath,
            sourcePath: entry.sourcePath,
            target,
            unit
          });
        }
      }
    }

    const nodeByOutput = new Map(nodes.map((node) => [node.outputPath, node]));
    const invalid = new Set(nodes.filter((node) => !node.directValid).map((node) => node.outputPath));
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (
          !invalid.has(node.outputPath)
          && nodeByOutput.has(node.sourcePath)
          && invalid.has(node.sourcePath)
        ) {
          invalid.add(node.outputPath);
          changed = true;
        }
      }
    }

    const invalidNodes = nodes.filter((node) => invalid.has(node.outputPath));
    const counts = new Map<string, number>();
    for (const node of invalidNodes) {
      counts.set(node.book, (counts.get(node.book) ?? 0) + 1);
    }
    console.log(`高中词汇插图复用审计：${nodes.length} 张，需替换 ${invalidNodes.length} 张。`);
    console.log(`分册：${[...counts].map(([book, count]) => `${book}=${count}`).join("，") || "无"}`);
    for (const node of invalidNodes.slice(0, 50)) {
      console.log(`${node.book} Unit ${node.unit} ${node.target.text} <- ${node.sourcePath}`);
    }

    if (!quarantine || invalidNodes.length === 0) {
      console.log(quarantine ? "无需隔离。" : "当前为只读审计；添加 --quarantine 后隔离错误复用图。 ");
      return;
    }

    for (const node of invalidNodes) {
      await access(node.outputPath);
      const relativePath = node.outputPath.slice(`${projectRoot}/`.length);
      const quarantinePath = resolve(quarantineRoot, relativePath);
      await mkdir(dirname(quarantinePath), { recursive: true });
      await rename(node.outputPath, quarantinePath);
    }
    console.log(`已将 ${invalidNodes.length} 张错误复用图移至 ${quarantineRoot}`);
  } finally {
    await prisma.$disconnect();
  }
}

function unitNumber(code: string) {
  const match = code.match(/^unit-(\d{2})$/u);
  if (!match) {
    throw new Error(`单元编号不合法：${code}`);
  }
  return Number(match[1]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "高中词汇插图复用审计失败");
  process.exitCode = 1;
});
