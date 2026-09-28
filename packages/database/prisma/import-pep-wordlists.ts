import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../src/index.js";
import {
  getPepTypingLibraryConfig,
  pepTypingBookKeys,
  type PepTypingBookKey
} from "./pep-typing-library-config.js";
import {
  assertPepWordlistQuality,
  buildPepTypingWordlist
} from "./pep-typing-wordlist.js";
import {
  applyTypingWordlistImportPlan,
  assertTypingWordlistCounts,
  buildTypingWordlistImportPlan
} from "./import-typing-wordlist.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

async function importPepWordlists() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const bookKeys = selectedBookKeys(args);
  const prisma = getPrismaClient();

  try {
    for (const bookKey of bookKeys) {
      const libraryConfig = getPepTypingLibraryConfig(bookKey);
      const textbook = await prisma.learningMaterialTextbook.findUnique({
        where: { slug: libraryConfig.textbookSlug },
        select: { id: true, markdownContent: true, title: true }
      });
      if (!textbook?.markdownContent) {
        throw new Error(`未找到${libraryConfig.title.replace(/词汇$/u, "")}教材 Markdown`);
      }

      const parsed = buildPepTypingWordlist(textbook.markdownContent, libraryConfig);
      assertTypingWordlistCounts(parsed, libraryConfig.expectedUnitCounts);
      assertPepWordlistQuality(parsed, libraryConfig.title);
      const normalizedWords = [...new Set(parsed.units.flatMap((unit) => unit.items)
        .filter((item) => item.itemType === "WORD")
        .map((item) => item.normalizedText))];
      const dictionaryEntries = await prisma.dictionaryEntry.findMany({
        where: { normalizedWord: { in: normalizedWords } },
        select: { id: true, normalizedWord: true, partOfSpeech: true, phonetic: true }
      });
      const plan = buildTypingWordlistImportPlan(parsed, dictionaryEntries, { includeAudio: false });
      const total = plan.units.reduce((sum, unit) => sum + unit.items.length, 0);
      const dictionaryMatches = plan.units.reduce(
        (sum, unit) => sum + unit.items.filter((item) => item.dictionaryEntryId).length,
        0
      );

      console.log(`\n教材：${textbook.title}`);
      console.log(`内容库：${libraryConfig.title}`);
      console.log(`单元：${plan.units.length}；词条：${total}；唯一词典匹配：${dictionaryMatches}`);
      console.log(`单元计数：${plan.units.map((unit) => unit.items.length).join("/")}`);
      console.log(`来源哈希：${plan.sourceHash}`);

      if (!apply) {
        continue;
      }

      await prisma.$transaction(async (transaction) => {
        const existingLibrary = await transaction.englishContentLibrary.findUnique({
          where: { slug: libraryConfig.librarySlug },
          select: { id: true }
        });
        if (existingLibrary) {
          await transaction.englishContentAcceptedAnswer.deleteMany({
            where: { item: { unit: { libraryId: existingLibrary.id } } }
          });
        }
        await applyTypingWordlistImportPlan(transaction, {
          library: libraryConfig,
          plan,
          textbookId: textbook.id
        });
        const library = await transaction.englishContentLibrary.findUniqueOrThrow({
          where: { slug: libraryConfig.librarySlug },
          select: { id: true }
        });
        const unitRecords = await transaction.englishContentUnit.findMany({
          where: { libraryId: library.id },
          select: { code: true, id: true }
        });
        const plannedUnitCodes = new Set(plan.units.map((unit) => unit.code));
        for (const unit of plan.units) {
          const record = unitRecords.find((entry) => entry.code === unit.code);
          if (!record) {
            throw new Error(`${libraryConfig.title}缺少已导入单元 ${unit.code}`);
          }
          await transaction.englishContentItem.deleteMany({
            where: { unitId: record.id, sourceOrder: { gt: unit.items.length } }
          });
        }
        const obsoleteUnitIds = unitRecords
          .filter((unit) => !plannedUnitCodes.has(unit.code))
          .map((unit) => unit.id);
        if (obsoleteUnitIds.length > 0) {
          await transaction.englishContentUnit.deleteMany({ where: { id: { in: obsoleteUnitIds } } });
        }
        await transaction.englishContentMedia.deleteMany({
          where: {
            kind: "BRITISH_PRONUNCIATION",
            item: { unit: { libraryId: library.id } }
          }
        });
      }, { timeout: 120_000 });

      const library = await prisma.englishContentLibrary.findUniqueOrThrow({
        where: { slug: libraryConfig.librarySlug },
        select: { id: true, _count: { select: { units: true } } }
      });
      const [itemCount, audioCount] = await Promise.all([
        prisma.englishContentItem.count({ where: { unit: { libraryId: library.id } } }),
        prisma.englishContentMedia.count({
          where: { kind: "BRITISH_PRONUNCIATION", item: { unit: { libraryId: library.id } } }
        })
      ]);
      if (audioCount !== 0) {
        throw new Error(`${libraryConfig.title}仍存在 ${audioCount} 个音频媒体槽位`);
      }
      console.log(`导入完成：内容库 ${library.id}，${library._count.units} 个单元，${itemCount} 条词汇，音频 0。`);
    }

    if (!apply) {
      console.log("\n当前为 dry-run，未写入数据库；添加 --apply 后执行导入。");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function selectedBookKeys(args: string[]): readonly PepTypingBookKey[] {
  const index = args.indexOf("--book");
  const value = index >= 0 ? args[index + 1]?.trim().toLocaleLowerCase("en-GB") : "all";
  if (!value || value === "all") {
    return pepTypingBookKeys;
  }
  if (!pepTypingBookKeys.includes(value as PepTypingBookKey)) {
    throw new Error(`--book 仅支持 all、${pepTypingBookKeys.join("、")}`);
  }
  return [value as PepTypingBookKey];
}

if (process.argv[1]?.endsWith("import-pep-wordlists.ts")) {
  importPepWordlists().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "人教版（PEP）词汇导入失败");
    process.exitCode = 1;
  });
}
