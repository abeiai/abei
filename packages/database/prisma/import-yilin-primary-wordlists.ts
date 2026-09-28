import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../src/index.js";
import {
  applyTypingWordlistImportPlan,
  assertTypingWordlistCounts,
  buildTypingWordlistImportPlan
} from "./import-typing-wordlist.js";
import {
  applyTypingWordlistCorrections,
  parseTypingPrimaryAlphabeticalWordlist,
  parseTypingPrimaryWordlist,
  type ParsedTypingWordlist,
  type TypingWordlistCorrections
} from "./typing-wordlist-parser.js";
import {
  getYilinTypingLibraryConfig,
  yilinPrimaryTypingBookKeys,
  type YilinTypingBookKey
} from "./yilin-typing-library-config.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const primaryCorrections: Partial<Record<YilinTypingBookKey, TypingWordlistCorrections>> = {
  "3a": {
    append: [
      { items: [{ sourcePage: 10, text: "I", translation: "我" }], unitNumber: 1 },
      { items: [{ sourcePage: 37, text: "it", translation: "它" }], unitNumber: 4 },
      {
        items: [
          {
            sourcePage: 50,
            text: "cousin",
            translation: "堂兄（弟），堂姐（妹）；表兄（弟），表姐（妹）"
          },
          {
            sourcePage: 55,
            text: "it",
            translation: "（指婴儿，尤指性别不详者）它"
          }
        ],
        unitNumber: 6
      }
    ],
    replacements: [
      {
        items: [{ text: "Good afternoon.", translation: "下午好。" }],
        sourceOrder: 7,
        unitNumber: 1
      },
      {
        items: [{ text: "Here I am!", translation: "我在这里！" }],
        sourceOrder: 6,
        unitNumber: 3
      },
      {
        items: [{ text: "in", translation: "在……内，在……中" }],
        sourceOrder: 7,
        unitNumber: 3
      },
      {
        items: [{ text: "you", translation: "你，你们" }],
        sourceOrder: 17,
        unitNumber: 3
      },
      {
        items: [{ text: "baby", translation: "婴儿" }],
        sourceOrder: 2,
        unitNumber: 5
      },
      {
        items: [{ sourcePage: 59, text: "eight", translation: "八" }],
        sourceOrder: 3,
        unitNumber: 7
      },
      {
        items: [{ text: "How old are you?", translation: "你多大了？" }],
        sourceOrder: 14,
        unitNumber: 7
      },
      {
        items: [{ sourcePage: 59, text: "ten", translation: "十" }],
        sourceOrder: 24,
        unitNumber: 7
      },
      {
        items: [{ text: "child (pl. children)", translation: "儿童，小孩" }],
        sourceOrder: 1,
        unitNumber: 8
      },
      {
        items: [{ text: "Are you OK?", translation: "你没事吧？" }],
        sourceOrder: 3,
        unitNumber: 8
      },
      {
        items: [{ text: "dizzy", translation: "头晕目眩的，眩晕的" }],
        sourceOrder: 5,
        unitNumber: 8
      }
    ]
  },
  "3b": {
    replacements: [
      {
        items: [{ sourcePage: 63, text: "feed", translation: "给食物，喂养" }],
        sourceOrder: 11,
        unitNumber: 7
      },
      {
        items: [{ sourcePage: 63, text: "zoo", translation: "动物园" }],
        sourceOrder: 12,
        unitNumber: 7
      },
      {
        items: [
          { sourcePage: 66, text: "colour (AmE color)", translation: "颜色，色彩" },
          { sourcePage: 66, text: "yellow", translation: "黄色的" },
          { sourcePage: 66, text: "blue", translation: "蓝色的" },
          { sourcePage: 66, text: "red", translation: "红色的" },
          { sourcePage: 66, text: "orange", translation: "橙红色的，橘黄色的" },
          { isSpellingRequired: false, sourcePage: 68, text: "balloon", translation: "气球" },
          { sourcePage: 66, text: "pink", translation: "粉红色的" },
          { sourcePage: 68, text: "sure", translation: "（表示同意）当然" },
          { sourcePage: 67, text: "green", translation: "绿色的" },
          { isSpellingRequired: false, sourcePage: 70, text: "chameleon", translation: "变色龙" },
          { sourcePage: 67, text: "brown", translation: "棕色的" },
          { sourcePage: 70, text: "little", translation: "小的" },
          { sourcePage: 67, text: "black", translation: "黑色的" },
          { sourcePage: 70, text: "What colour is ...?", translation: "……是什么颜色的？" },
          { sourcePage: 67, text: "white", translation: "白色的" },
          { sourcePage: 68, text: "buy", translation: "买" },
          { sourcePage: 71, text: "How come?", translation: "怎么回事？" }
        ],
        sourceOrder: 1,
        unitNumber: 8
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        items: [],
        sourceOrder: index + 2,
        unitNumber: 8
      }))
    ]
  },
  "5a": {
    replacements: [
      {
        items: [{ text: "What's wrong with ...?", translation: "……怎么了？" }],
        sourceOrder: 26,
        unitNumber: 8
      },
      { items: [], sourceOrder: 27, unitNumber: 8 }
    ]
  },
  "5b": {
    replacements: [
      {
        items: [{
          text: "Double Ninth Festival (Chongyang Festival)",
          translation: "重阳节"
        }],
        sourceOrder: 19,
        unitNumber: 6
      },
      { items: [], sourceOrder: 20, unitNumber: 6 }
    ]
  },
  "6b": {
    replacements: [{ items: [], sourceOrder: 25, unitNumber: 1 }]
  }
};

export function parseYilinPrimaryWordlist(bookKey: YilinTypingBookKey, markdown: string) {
  const libraryConfig = getYilinTypingLibraryConfig(bookKey);
  let parsed: ParsedTypingWordlist;

  if (bookKey === "3a") {
    parsed = parseTypingPrimaryAlphabeticalWordlist(markdown, libraryConfig.unitStartPages);
  } else {
    parsed = parseTypingPrimaryWordlist(markdown, bookKey === "4b"
      ? { insertUnitBefore: ["season 季节"] }
      : {});
  }

  return applyTypingWordlistCorrections(parsed, primaryCorrections[bookKey] ?? {});
}

async function importYilinPrimaryWordlists() {
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

      const parsed = parseYilinPrimaryWordlist(bookKey, textbook.markdownContent);
      assertTypingWordlistCounts(parsed, libraryConfig.expectedUnitCounts);
      assertPrimaryWordlistQuality(parsed, libraryConfig.title);
      const normalizedWords = [...new Set(parsed.units.flatMap((unit) => unit.items)
        .filter((item) => item.itemType === "WORD")
        .map((item) => item.normalizedText))];
      const dictionaryEntries = await prisma.dictionaryEntry.findMany({
        where: { normalizedWord: { in: normalizedWords } },
        select: { id: true, normalizedWord: true, partOfSpeech: true, phonetic: true }
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

function assertPrimaryWordlistQuality(parsed: ParsedTypingWordlist, title: string) {
  const invalid = parsed.units.flatMap((unit) => unit.items.filter((item) => (
    !item.translation
    || !/[A-Za-z]/u.test(item.text)
    || /[α\p{Script=Han}]/u.test(item.text)
  )).map((item) => `Unit ${unit.number} #${item.sourceOrder} ${item.text}`));

  if (invalid.length > 0) {
    throw new Error(`${title}存在未清理词条：${invalid.join("；")}`);
  }
}

function selectedBookKeys(args: string[]): readonly YilinTypingBookKey[] {
  const index = args.indexOf("--book");
  const value = index >= 0 ? args[index + 1]?.trim().toLocaleLowerCase("en-GB") : "all";

  if (!value || value === "all") {
    return yilinPrimaryTypingBookKeys;
  }
  if (!yilinPrimaryTypingBookKeys.includes(value as typeof yilinPrimaryTypingBookKeys[number])) {
    throw new Error(`--book 仅支持 all、${yilinPrimaryTypingBookKeys.join("、")}`);
  }
  return [value as YilinTypingBookKey];
}

if (process.argv[1]?.endsWith("import-yilin-primary-wordlists.ts")) {
  importYilinPrimaryWordlists().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "译林版小学词汇导入失败");
    process.exitCode = 1;
  });
}
