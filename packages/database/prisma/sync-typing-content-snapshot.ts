import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { Prisma, PrismaClient } from "../generated/client/index.js";
import {
  pepTypingLibraryConfigList,
  typingLibraryConfigList
} from "./typing-library-config.js";

const sourceLibraryInclude = {
  sourceTextbook: { select: { slug: true } },
  units: {
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sourceOrder: "asc" },
        include: {
          acceptedAnswers: { orderBy: { sortOrder: "asc" } },
          media: { include: { mediaAsset: true } }
        }
      }
    }
  }
} satisfies Prisma.EnglishContentLibraryInclude;

export type SourceTypingContentLibrary = Prisma.EnglishContentLibraryGetPayload<{
  include: typeof sourceLibraryInclude;
}>;

type TargetTextbook = {
  id: string;
  slug: string;
};

type ExpectedTypingLibrary = {
  expectedUnitCounts: readonly number[];
  librarySlug: string;
};

export type TypingContentBootstrapPlan = {
  libraries: Prisma.EnglishContentLibraryCreateManyInput[];
  units: Prisma.EnglishContentUnitCreateManyInput[];
  items: Prisma.EnglishContentItemCreateManyInput[];
  answers: Prisma.EnglishContentAcceptedAnswerCreateManyInput[];
  mediaAssets: Prisma.MediaAssetCreateManyInput[];
  media: Prisma.EnglishContentMediaCreateManyInput[];
  summary: {
    libraries: number;
    units: number;
    items: number;
    answers: number;
    mediaAssets: number;
    media: number;
  };
};

export function buildTypingContentBootstrapPlan(input: {
  createId: (sourceId: string) => string;
  expectedLibraries: readonly ExpectedTypingLibrary[];
  sourceLibraries: readonly SourceTypingContentLibrary[];
  targetLibraryCount: number;
  targetTextbooks: readonly TargetTextbook[];
}): TypingContentBootstrapPlan {
  if (input.targetLibraryCount !== 0) {
    throw new Error(`生产内容库不是空库（已有 ${input.targetLibraryCount} 个），拒绝执行首次快照同步`);
  }
  return buildTypingContentCreatePlan(input);
}

export function buildTypingContentIncrementPlan(input: {
  createId: (sourceId: string) => string;
  expectedLibraries: readonly ExpectedTypingLibrary[];
  sourceLibraries: readonly SourceTypingContentLibrary[];
  targetLibrarySlugs: readonly string[];
  targetTextbooks: readonly TargetTextbook[];
}): TypingContentBootstrapPlan {
  const expectedSlugs = new Set(input.expectedLibraries.map((library) => library.librarySlug));
  const existing = input.targetLibrarySlugs.filter((slug) => expectedSlugs.has(slug));
  if (existing.length > 0) {
    throw new Error(`生产库已存在待增量同步内容库：${existing.join("、")}`);
  }
  assertIllustrationOnlySourceSnapshot(input.sourceLibraries);
  return buildTypingContentCreatePlan(input);
}

export function assertPepIncrementTargetBaseline(
  actual: TypingContentBootstrapPlan["summary"]
) {
  const expected = { answers: 11_049, items: 11_049, libraries: 46, units: 322 };
  const selected = {
    answers: actual.answers,
    items: actual.items,
    libraries: actual.libraries,
    units: actual.units
  };
  if (JSON.stringify(selected) !== JSON.stringify(expected)) {
    throw new Error(
      `生产公共内容库基线不一致：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(selected)}`
    );
  }
}

function buildTypingContentCreatePlan(input: {
  createId: (sourceId: string) => string;
  expectedLibraries: readonly ExpectedTypingLibrary[];
  sourceLibraries: readonly SourceTypingContentLibrary[];
  targetTextbooks: readonly TargetTextbook[];
}): TypingContentBootstrapPlan {
  if (input.sourceLibraries.length === 0) {
    throw new Error("源数据库没有可同步的已发布打字内容库");
  }
  assertCompleteSourceSnapshot(input.sourceLibraries, input.expectedLibraries);

  const targetTextbookIdBySlug = new Map(
    input.targetTextbooks.map((textbook) => [textbook.slug, textbook.id])
  );
  const missingTextbooks = input.sourceLibraries
    .map((library) => library.sourceTextbook?.slug)
    .filter((slug): slug is string => Boolean(slug) && !targetTextbookIdBySlug.has(slug));
  const librariesWithoutTextbooks = input.sourceLibraries.filter((library) => !library.sourceTextbook);
  if (missingTextbooks.length > 0 || librariesWithoutTextbooks.length > 0) {
    const missing = [
      ...new Set([
        ...missingTextbooks,
        ...librariesWithoutTextbooks.map((library) => `${library.slug}（未绑定来源教材）`)
      ])
    ];
    throw new Error(`生产库缺少来源教材：${missing.join("、")}`);
  }

  const plan: TypingContentBootstrapPlan = {
    answers: [],
    items: [],
    libraries: [],
    media: [],
    mediaAssets: [],
    summary: { answers: 0, items: 0, libraries: 0, media: 0, mediaAssets: 0, units: 0 },
    units: []
  };
  const targetAssetIdBySourceId = new Map<string, string>();

  for (const library of input.sourceLibraries) {
    const { sourceTextbook, units, ...libraryData } = library;
    const sourceTextbookId = targetTextbookIdBySlug.get(sourceTextbook!.slug);
    if (!sourceTextbookId) {
      throw new Error(`生产库缺少来源教材：${sourceTextbook!.slug}`);
    }
    plan.libraries.push({ ...libraryData, sourceTextbookId });

    for (const unit of units) {
      const { items, ...unitData } = unit;
      const firstUnitMediaIndex = plan.media.length;

      for (const item of items) {
        assertReadyIllustration(library.slug, unit.code, item);
        const { acceptedAnswers, media, ...itemData } = item;
        plan.items.push({ ...itemData, dictionaryEntryId: null });
        plan.answers.push(...acceptedAnswers);

        for (const mediaRecord of media) {
          const { mediaAsset, ...mediaData } = mediaRecord;
          const isBritishAudio = mediaRecord.kind === "BRITISH_PRONUNCIATION";
          const isPortableAsset = isPortableMediaAsset(mediaAsset);
          if (isBritishAudio && !isPortableAsset) {
            plan.media.push({
              ...mediaData,
              errorMessage: null,
              mediaAssetId: null,
              status: "PENDING"
            });
            continue;
          }
          if (mediaRecord.status === "READY" && !mediaAsset) {
            throw new Error(`READY 媒体缺少资源：${library.slug}/${unit.code}/${item.text}/${mediaRecord.kind}`);
          }

          let targetAssetId: string | null = null;
          if (mediaAsset) {
            if (!isPortableAsset) {
              throw new Error(
                `READY 媒体必须已上传到 S3 HTTPS 资源：${library.slug}/${unit.code}/${item.text}/${mediaRecord.kind}`
              );
            }
            targetAssetId = targetAssetIdBySourceId.get(mediaAsset.id) ?? null;
            if (!targetAssetId) {
              targetAssetId = input.createId(mediaAsset.id);
              targetAssetIdBySourceId.set(mediaAsset.id, targetAssetId);
              plan.mediaAssets.push({
                ...mediaAsset,
                id: targetAssetId,
                createdByAdminId: null,
                createdByUserId: null
              });
            }
          }
          plan.media.push({ ...mediaData, mediaAssetId: targetAssetId });
        }
      }
      const unitMedia = plan.media.slice(firstUnitMediaIndex);
      plan.units.push({
        ...unitData,
        mediaStatus: unitMedia.length > 0 && unitMedia.every((entry) => entry.status === "READY")
          ? "READY"
          : "PENDING"
      });
    }
  }

  plan.summary = {
    answers: plan.answers.length,
    items: plan.items.length,
    libraries: plan.libraries.length,
    media: plan.media.length,
    mediaAssets: plan.mediaAssets.length,
    units: plan.units.length
  };
  return plan;
}

function assertCompleteSourceSnapshot(
  sourceLibraries: readonly SourceTypingContentLibrary[],
  expectedLibraries: readonly ExpectedTypingLibrary[]
) {
  const expectedSlugs = new Set(expectedLibraries.map((library) => library.librarySlug));
  const sourceSlugs = new Set(sourceLibraries.map((library) => library.slug));
  const missing = [...expectedSlugs].filter((slug) => !sourceSlugs.has(slug));
  const unexpected = [...sourceSlugs].filter((slug) => !expectedSlugs.has(slug));
  const hasDuplicates = sourceSlugs.size !== sourceLibraries.length
    || expectedSlugs.size !== expectedLibraries.length;
  if (hasDuplicates || missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `源内容库集合不完整：缺少 ${missing.join("、") || "无"}；额外 ${unexpected.join("、") || "无"}`
    );
  }

  const sourceBySlug = new Map(sourceLibraries.map((library) => [library.slug, library]));
  for (const expected of expectedLibraries) {
    const library = sourceBySlug.get(expected.librarySlug)!;
    if (library.units.length !== expected.expectedUnitCounts.length) {
      throw new Error(
        `${library.slug} 单元数量不一致：期望 ${expected.expectedUnitCounts.length}，实际 ${library.units.length}`
      );
    }
    expected.expectedUnitCounts.forEach((expectedItemCount, index) => {
      const unit = library.units[index]!;
      const expectedCode = `unit-${String(index + 1).padStart(2, "0")}`;
      if (unit.code !== expectedCode) {
        throw new Error(`${library.slug} 单元顺序不一致：期望 ${expectedCode}，实际 ${unit.code}`);
      }
      if (unit.items.length !== expectedItemCount) {
        throw new Error(
          `${library.slug}/${unit.code} 词条数量不一致：期望 ${expectedItemCount}，实际 ${unit.items.length}`
        );
      }
    });
  }
}

function assertIllustrationOnlySourceSnapshot(
  sourceLibraries: readonly SourceTypingContentLibrary[]
) {
  for (const library of sourceLibraries) {
    for (const unit of library.units) {
      for (const item of unit.items) {
        const unexpected = item.media.find((entry) => entry.kind !== "ILLUSTRATION");
        if (unexpected) {
          throw new Error(
            `${library.slug}/${unit.code}/${item.text} 只能包含插图媒体，发现 ${unexpected.kind}`
          );
        }
      }
    }
  }
}

function assertReadyIllustration(
  librarySlug: string,
  unitCode: string,
  item: SourceTypingContentLibrary["units"][number]["items"][number]
) {
  const illustrations = item.media.filter((entry) => entry.kind === "ILLUSTRATION");
  if (
    illustrations.length !== 1
    || illustrations[0]?.status !== "READY"
    || !isPortableMediaAsset(illustrations[0].mediaAsset)
  ) {
    throw new Error(`${librarySlug}/${unitCode}/${item.text} 必须恰有一个 READY S3 HTTPS 插图`);
  }
}

function isPortableMediaAsset(
  mediaAsset: SourceTypingContentLibrary["units"][number]["items"][number]["media"][number]["mediaAsset"]
): boolean {
  if (!mediaAsset || mediaAsset.storageProvider !== "S3") return false;
  try {
    const url = new URL(mediaAsset.url);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function deterministicAssetId(sourceId: string): string {
  const digest = createHash("sha256")
    .update(`typing-content-v1:${sourceId}`)
    .digest("hex")
    .slice(0, 24);
  return `typing-${digest}`;
}

function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function batches<T>(records: readonly T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < records.length; index += size) {
    result.push(records.slice(index, index + size));
  }
  return result;
}

async function readTargetSummary(prisma: PrismaClient | Prisma.TransactionClient) {
  const [libraries, units, items, answers, mediaAssets, media] = await Promise.all([
    prisma.englishContentLibrary.count(),
    prisma.englishContentUnit.count(),
    prisma.englishContentItem.count(),
    prisma.englishContentAcceptedAnswer.count(),
    prisma.mediaAsset.count({ where: { englishContentMedia: { some: {} } } }),
    prisma.englishContentMedia.count()
  ]);
  return { answers, items, libraries, media, mediaAssets, units };
}

function assertCreatedCount(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`${label}写入数量不一致：期望 ${expected}，实际 ${actual}`);
  }
}

function assertTargetSummary(
  actual: TypingContentBootstrapPlan["summary"],
  expected: TypingContentBootstrapPlan["summary"]
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`生产同步后的数量不一致：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function assertProductionConfigCounts() {
  const libraryCount = typingLibraryConfigList.length;
  const unitCount = typingLibraryConfigList.reduce(
    (total, config) => total + config.expectedUnitCounts.length,
    0
  );
  const itemCount = typingLibraryConfigList.reduce(
    (total, config) => total + config.expectedUnitCounts.reduce((sum, count) => sum + count, 0),
    0
  );
  if (libraryCount !== 54 || unitCount !== 368 || itemCount !== 11_973) {
    throw new Error(
      `平台公共内容库配置基数异常：内容库 ${libraryCount}/54，单元 ${unitCount}/368，词条 ${itemCount}/11973`
    );
  }
}

function addSummaries(
  left: TypingContentBootstrapPlan["summary"],
  right: TypingContentBootstrapPlan["summary"]
) {
  return {
    answers: left.answers + right.answers,
    items: left.items + right.items,
    libraries: left.libraries + right.libraries,
    media: left.media + right.media,
    mediaAssets: left.mediaAssets + right.mediaAssets,
    units: left.units + right.units
  };
}

async function syncTypingContentSnapshot() {
  loadEnv({ path: resolve(process.cwd(), ".env") });
  loadEnv({ path: resolve(process.cwd(), "../../.env") });

  const apply = process.argv.includes("--apply");
  const collectionIndex = process.argv.indexOf("--collection");
  const collection = collectionIndex >= 0
    ? process.argv[collectionIndex + 1]?.trim().toLocaleLowerCase("en-GB")
    : null;
  if (collection !== null && collection !== "pep") {
    throw new Error("--collection 当前仅支持 pep");
  }
  const incremental = collection === "pep";
  const expectedLibraries = incremental ? pepTypingLibraryConfigList : typingLibraryConfigList;
  const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
  const targetDatabaseUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceDatabaseUrl) {
    throw new Error("SOURCE_DATABASE_URL 或 DATABASE_URL 未配置");
  }
  if (!targetDatabaseUrl) {
    throw new Error("TARGET_DATABASE_URL 未配置");
  }
  if (sourceDatabaseUrl === targetDatabaseUrl) {
    throw new Error("源数据库与目标数据库地址相同，拒绝同步");
  }

  const source = createClient(sourceDatabaseUrl);
  const target = createClient(targetDatabaseUrl);
  try {
    assertProductionConfigCounts();
    const expectedLibrarySlugs = expectedLibraries.map((config) => config.librarySlug);
    const sourceLibraries = await source.englishContentLibrary.findMany({
      where: {
        status: "PUBLISHED",
        slug: { in: expectedLibrarySlugs }
      },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      include: sourceLibraryInclude
    });
    const textbookSlugs = sourceLibraries
      .map((library) => library.sourceTextbook?.slug)
      .filter((slug): slug is string => Boolean(slug));
    const [targetLibraryCount, targetLibraryEntries, targetTextbooks, targetSummary] = await Promise.all([
      target.englishContentLibrary.count(),
      target.englishContentLibrary.findMany({ select: { slug: true } }),
      target.learningMaterialTextbook.findMany({
        where: { slug: { in: textbookSlugs } },
        select: { id: true, slug: true }
      }),
      readTargetSummary(target)
    ]);
    if (incremental) {
      assertPepIncrementTargetBaseline(targetSummary);
    }
    const plan = incremental
      ? buildTypingContentIncrementPlan({
        createId: deterministicAssetId,
        expectedLibraries,
        sourceLibraries,
        targetLibrarySlugs: targetLibraryEntries.map((library) => library.slug),
        targetTextbooks
      })
      : buildTypingContentBootstrapPlan({
        createId: deterministicAssetId,
        expectedLibraries,
        sourceLibraries,
        targetLibraryCount,
        targetTextbooks
      });

    console.log(`同步计划：${JSON.stringify(plan.summary)}`);
    if (!apply) {
      console.log("当前为 dry-run，未写入生产数据库；确认后添加 --apply。");
      return;
    }

    const actual = await target.$transaction(async (transaction) => {
      const currentSummary = await readTargetSummary(transaction);
      if (incremental) {
        assertTargetSummary(currentSummary, targetSummary);
        const currentSelectedCount = await transaction.englishContentLibrary.count({
          where: { slug: { in: expectedLibrarySlugs } }
        });
        if (currentSelectedCount !== 0) {
          throw new Error(`生产库已有 ${currentSelectedCount} 个 PEP 内容库，同步期间状态已变化`);
        }
      } else if (currentSummary.libraries !== 0) {
        throw new Error(`生产内容库不是空库（已有 ${currentSummary.libraries} 个），同步期间状态已变化`);
      }
      const assetIds = plan.mediaAssets.map((asset) => asset.id);
      const collidingAssetCount = await transaction.mediaAsset.count({
        where: { id: { in: assetIds } }
      });
      if (collidingAssetCount > 0) {
        throw new Error(`生产媒体资源存在 ${collidingAssetCount} 个 ID 冲突，拒绝同步`);
      }

      const createdAssets = await transaction.mediaAsset.createMany({ data: plan.mediaAssets });
      assertCreatedCount("媒体资源", createdAssets.count, plan.mediaAssets.length);
      const createdLibraries = await transaction.englishContentLibrary.createMany({ data: plan.libraries });
      assertCreatedCount("内容库", createdLibraries.count, plan.libraries.length);
      const createdUnits = await transaction.englishContentUnit.createMany({ data: plan.units });
      assertCreatedCount("单元", createdUnits.count, plan.units.length);
      let createdItems = 0;
      for (const data of batches(plan.items)) {
        createdItems += (await transaction.englishContentItem.createMany({ data })).count;
      }
      assertCreatedCount("词条", createdItems, plan.items.length);
      let createdAnswers = 0;
      for (const data of batches(plan.answers)) {
        createdAnswers += (await transaction.englishContentAcceptedAnswer.createMany({ data })).count;
      }
      assertCreatedCount("可接受答案", createdAnswers, plan.answers.length);
      let createdMedia = 0;
      for (const data of batches(plan.media)) {
        createdMedia += (await transaction.englishContentMedia.createMany({ data })).count;
      }
      assertCreatedCount("媒体记录", createdMedia, plan.media.length);

      const transactionSummary = await readTargetSummary(transaction);
      assertTargetSummary(
        transactionSummary,
        incremental ? addSummaries(targetSummary, plan.summary) : plan.summary
      );
      return transactionSummary;
    }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: 300_000 });
    console.log(`同步完成并通过数量校验：${JSON.stringify(actual)}`);
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

if (process.argv[1]?.endsWith("sync-typing-content-snapshot.ts")) {
  syncTypingContentSnapshot().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "打字内容库快照同步失败");
    process.exitCode = 1;
  });
}
