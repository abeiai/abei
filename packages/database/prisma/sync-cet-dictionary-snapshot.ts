import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { Prisma, PrismaClient } from "../generated/client/index.js";
import { mergeCetDictionarySnapshot, type CetDictionarySnapshotItem } from "./cet-dictionary-snapshot.js";
import {
  buildCetTypingWordlist,
  getCetTypingLibraryConfig,
  type CetExamKey
} from "./cet-typing-wordlist.js";

const exams: CetExamKey[] = ["cet4", "cet6"];
const expectedUnionCount = 7_396;

function createClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function batches<T>(records: readonly T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < records.length; index += size) {
    result.push(records.slice(index, index + size));
  }
  return result;
}

async function syncCetDictionarySnapshot() {
  loadEnv({ path: resolve(process.cwd(), ".env") });
  loadEnv({ path: resolve(process.cwd(), "../../.env") });

  const apply = process.argv.includes("--apply");
  const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
  const targetDatabaseUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceDatabaseUrl) throw new Error("SOURCE_DATABASE_URL 或 DATABASE_URL 未配置");
  if (!targetDatabaseUrl) throw new Error("TARGET_DATABASE_URL 未配置");
  if (sourceDatabaseUrl === targetDatabaseUrl) throw new Error("源数据库与目标数据库地址相同，拒绝同步");

  const source = createClient(sourceDatabaseUrl);
  const target = createClient(targetDatabaseUrl);
  try {
    const configs = exams.map(getCetTypingLibraryConfig);
    const libraries = await source.englishContentLibrary.findMany({
      where: { slug: { in: configs.map((config) => config.librarySlug) }, status: "PUBLISHED" },
      select: {
        slug: true,
        units: {
          orderBy: { sortOrder: "asc" },
          select: {
            code: true,
            items: {
              orderBy: { sourceOrder: "asc" },
              select: {
                britishPhonetic: true,
                normalizedText: true,
                partOfSpeech: true,
                sourceRaw: true,
                text: true,
                translation: true,
                _count: { select: { media: true } }
              }
            }
          }
        }
      }
    });
    if (libraries.length !== exams.length) throw new Error("源数据库缺少完整的 CET4/CET6 内容库快照");

    const itemsByExam = { cet4: [], cet6: [] } as Record<CetExamKey, CetDictionarySnapshotItem[]>;
    for (const exam of exams) {
      const config = getCetTypingLibraryConfig(exam);
      const library = libraries.find((entry) => entry.slug === config.librarySlug);
      if (!library || library.units.length !== 26) throw new Error(`${config.title} 源快照分组不完整`);
      library.units.forEach((unit, index) => {
        const expectedCode = `letter-${String.fromCharCode(97 + index)}`;
        if (unit.code !== expectedCode || unit.items.length !== config.expectedUnitCounts[index]) {
          throw new Error(`${config.title}/${expectedCode} 源快照数量不一致`);
        }
        for (const item of unit.items) {
          if (item._count.media !== 0) throw new Error(`${config.title}/${item.text} 不应包含媒体记录`);
          itemsByExam[exam].push({
            britishPhonetic: item.britishPhonetic,
            normalizedText: item.normalizedText,
            partOfSpeech: item.partOfSpeech,
            sourceRaw: item.sourceRaw,
            text: item.text,
            translation: item.translation
          });
        }
      });
    }

    const snapshot = mergeCetDictionarySnapshot(itemsByExam);
    if (snapshot.length !== expectedUnionCount) {
      throw new Error(`CET4/CET6 字典并集数量不一致：期望 ${expectedUnionCount}，实际 ${snapshot.length}`);
    }
    for (const exam of exams) {
      const config = getCetTypingLibraryConfig(exam);
      buildCetTypingWordlist(snapshot.map((entry) => ({ ...entry, id: `snapshot:${entry.normalizedWord}` })), config);
    }

    const [existingWords, existingLibraries] = await Promise.all([
      target.dictionaryEntry.count({ where: { word: { in: snapshot.map((entry) => entry.word) } } }),
      target.englishContentLibrary.count({ where: { slug: { in: configs.map((config) => config.librarySlug) } } })
    ]);
    console.log(
      `CET 字典同步计划：源词条 ${snapshot.length}，目标已存在同词形 ${existingWords}，待新建 ${snapshot.length - existingWords}，目标已有 CET 内容库 ${existingLibraries}。`
    );
    if (!apply) {
      console.log("当前为 dry-run，未写入目标数据库；确认后添加 --apply。");
      return;
    }

    await target.$transaction(async (transaction) => {
      for (const rows of batches(snapshot)) {
        const values = Prisma.join(rows.map((entry) => Prisma.sql`(
          ${randomUUID()}, ${entry.word}, ${entry.normalizedWord}, ${entry.phonetic},
          ${entry.translation}, ${entry.partOfSpeech}, ${entry.tag}
        )`));
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "dictionary_entries"
            ("id", "word", "normalized_word", "phonetic", "translation", "part_of_speech", "tag")
          VALUES ${values}
          ON CONFLICT ("word") DO UPDATE SET
            "normalized_word" = EXCLUDED."normalized_word",
            "phonetic" = EXCLUDED."phonetic",
            "translation" = EXCLUDED."translation",
            "part_of_speech" = EXCLUDED."part_of_speech",
            "tag" = EXCLUDED."tag",
            "updated_at" = CURRENT_TIMESTAMP
        `);
      }
    }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: 300_000 });

    for (const exam of exams) {
      const config = getCetTypingLibraryConfig(exam);
      const candidates = await target.dictionaryEntry.findMany({
        where: { tag: { contains: exam } },
        select: {
          id: true,
          normalizedWord: true,
          partOfSpeech: true,
          phonetic: true,
          tag: true,
          translation: true,
          word: true
        }
      });
      const plan = buildCetTypingWordlist(candidates, config);
      console.log(`${config.title} 字典同步完成并通过校验：${plan.units.reduce((sum, unit) => sum + unit.items.length, 0)} 条。`);
    }
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

if (process.argv[1]?.endsWith("sync-cet-dictionary-snapshot.ts")) {
  syncCetDictionarySnapshot().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "CET 字典快照同步失败");
    process.exitCode = 1;
  });
}
