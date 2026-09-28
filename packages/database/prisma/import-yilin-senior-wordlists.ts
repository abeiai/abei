import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../src/index.js";
import {
  applyTypingWordlistImportPlan,
  assertTypingWordlistCounts,
  buildTypingWordlistImportPlan
} from "./import-typing-wordlist.js";
import { buildSeniorTypingWordlist } from "./senior-typing-wordlist.js";
import {
  yilinSeniorTypingCorrections,
  type YilinSeniorTypingBookKey
} from "./yilin-senior-typing-corrections.js";
import {
  getYilinTypingLibraryConfig,
  yilinSeniorTypingBookKeys
} from "./yilin-typing-library-config.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

async function importYilinSeniorWordlists() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const bookKeys = selectedBookKeys(args);
  const prisma = getPrismaClient();

  try {
    for (const bookKey of bookKeys) {
      const libraryConfig = getYilinTypingLibraryConfig(bookKey);
      const textbook = await prisma.learningMaterialTextbook.findUnique({
        where: { slug: libraryConfig.textbookSlug },
        select: { id: true, markdownContent: true, title: true }
      });

      if (!textbook?.markdownContent) {
        throw new Error(`未找到${libraryConfig.title.replace(/词汇$/u, "")}教材 Markdown`);
      }

      const parsed = buildSeniorTypingWordlist(
        textbook.markdownContent,
        yilinSeniorTypingCorrections[bookKey]
      );
      assertTypingWordlistCounts(parsed, libraryConfig.expectedUnitCounts);
      const normalizedWords = [...new Set(
        parsed.units.flatMap((unit) => unit.items)
          .filter((item) => item.itemType === "WORD")
          .map((item) => item.normalizedText)
      )];
      const dictionaryEntries = await prisma.dictionaryEntry.findMany({
        where: { normalizedWord: { in: normalizedWords } },
        select: {
          id: true,
          normalizedWord: true,
          partOfSpeech: true,
          phonetic: true
        }
      });
      const plan = buildTypingWordlistImportPlan(parsed, dictionaryEntries);
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

      await prisma.$transaction(
        async (transaction) => applyTypingWordlistImportPlan(transaction, {
          library: libraryConfig,
          plan,
          textbookId: textbook.id
        }),
        { timeout: 120_000 }
      );

      const library = await prisma.englishContentLibrary.findUniqueOrThrow({
        where: { slug: libraryConfig.librarySlug },
        select: { id: true, _count: { select: { units: true } } }
      });
      const itemCount = await prisma.englishContentItem.count({
        where: { unit: { libraryId: library.id } }
      });

      console.log(`导入完成：内容库 ${library.id}，${library._count.units} 个单元，${itemCount} 条词汇。`);
    }

    if (!apply) {
      console.log("\n当前为 dry-run，未写入数据库；添加 --apply 后执行导入。");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function selectedBookKeys(args: string[]): readonly YilinSeniorTypingBookKey[] {
  const index = args.indexOf("--book");
  const value = index >= 0 ? args[index + 1]?.trim().toLocaleLowerCase("en-GB") : "all";

  if (!value || value === "all") {
    return yilinSeniorTypingBookKeys;
  }
  if (!yilinSeniorTypingBookKeys.includes(value as YilinSeniorTypingBookKey)) {
    throw new Error(`--book 仅支持 all、${yilinSeniorTypingBookKeys.join("、")}`);
  }

  return [value as YilinSeniorTypingBookKey];
}

if (process.argv[1]?.endsWith("import-yilin-senior-wordlists.ts")) {
  importYilinSeniorWordlists().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "译林版高中词汇导入失败");
    process.exitCode = 1;
  });
}
