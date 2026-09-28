import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../src/index.js";
import {
  applyCetTypingLibraryImport,
  buildCetTypingWordlist,
  getCetTypingLibraryConfig,
  hasDictionaryExamTag
} from "./cet-typing-wordlist.js";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const entries = [
  {
    id: "dict-ability",
    word: "ability",
    normalizedWord: "ability",
    phonetic: "əˈbɪləti",
    translation: "能力",
    partOfSpeech: "n.",
    tag: "cet4 cet6"
  },
  {
    id: "dict-zebra",
    word: "zebra",
    normalizedWord: "zebra",
    phonetic: "ˈzebrə",
    translation: "n. 斑马",
    partOfSpeech: null,
    tag: "cet6"
  },
  {
    id: "dict-false-positive",
    word: "falsepositive",
    normalizedWord: "falsepositive",
    phonetic: null,
    translation: "不应入库",
    partOfSpeech: null,
    tag: "notcet4"
  }
] as const;

test("考试标签按空格分词精确匹配", () => {
  assert.equal(hasDictionaryExamTag("zk cet4 cet6", "cet4"), true);
  assert.equal(hasDictionaryExamTag("notcet4 cet40", "cet4"), false);
  assert.equal(hasDictionaryExamTag(null, "cet4"), false);
});

test("ECDICT 字面换行中的多词性可完整保留", () => {
  const config = {
    ...getCetTypingLibraryConfig("cet4"),
    expectedTotal: 1,
    expectedUnitCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };
  const plan = buildCetTypingWordlist([{
    ...entries[0],
    partOfSpeech: null,
    tag: "cet4",
    translation: "vt. 放弃\\nn. 放任"
  }], config);

  assert.equal(plan.units[0]?.items[0]?.partOfSpeech, "vt. / n.");
  assert.equal(plan.units[0]?.items[0]?.translation, "vt. 放弃\nn. 放任");
});

test("CET 词汇按 A 到 Z 建立稳定分组并保留词典字段", () => {
  const config = {
    ...getCetTypingLibraryConfig("cet6"),
    expectedTotal: 2,
    expectedUnitCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
  };
  const plan = buildCetTypingWordlist([...entries].reverse(), config);
  const repeated = buildCetTypingWordlist(entries, config);

  assert.equal(plan.units.length, 26);
  assert.equal(plan.units[0]?.code, "letter-a");
  assert.equal(plan.units[0]?.title, "A");
  assert.equal(plan.units[25]?.code, "letter-z");
  assert.deepEqual(plan.units[0]?.items[0], {
    britishPhonetic: "əˈbɪləti",
    dictionaryEntryId: "dict-ability",
    isSpellingRequired: true,
    itemType: "WORD",
    normalizedText: "ability",
    partOfSpeech: "n.",
    sourceOrder: 1,
    sourcePage: null,
    sourceRaw: "ECDICT:cet4 cet6",
    text: "ability",
    translation: "能力"
  });
  assert.equal(plan.units[25]?.items[0]?.text, "zebra");
  assert.equal(plan.units[25]?.items[0]?.partOfSpeech, "n.");
  assert.equal(plan.sourceHash, repeated.sourceHash);
});

test("CET 词库配置固定使用完整四级和六级标签集合", () => {
  const cet4 = getCetTypingLibraryConfig("cet4");
  const cet6 = getCetTypingLibraryConfig("cet6");

  assert.equal(cet4.title, "全国大学英语四级考试");
  assert.equal(cet4.expectedTotal, 5_139);
  assert.equal(cet4.expectedUnitCounts.length, 26);
  assert.equal(cet6.title, "全国大学英语六级考试");
  assert.equal(cet6.expectedTotal, 7_302);
  assert.equal(cet6.expectedUnitCounts.length, 26);
});

test("CET 导入可重复执行且不创建任何媒体记录", async () => {
  const prisma = getPrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dictionaryEntries = await Promise.all([
    prisma.dictionaryEntry.create({
      data: {
        word: `ability-${suffix}`,
        normalizedWord: `ability-${suffix}`,
        phonetic: "əˈbɪləti",
        translation: "能力",
        partOfSpeech: "n.",
        tag: "cet4"
      }
    }),
    prisma.dictionaryEntry.create({
      data: {
        word: `zebra-${suffix}`,
        normalizedWord: `zebra-${suffix}`,
        phonetic: "ˈzebrə",
        translation: "斑马",
        partOfSpeech: "n.",
        tag: "cet4"
      }
    })
  ]);
  const config = {
    ...getCetTypingLibraryConfig("cet4"),
    librarySlug: `test-cet4-${suffix}`,
    expectedTotal: 2,
    expectedUnitCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
  };
  const plan = buildCetTypingWordlist(dictionaryEntries, config);

  try {
    await prisma.$transaction((transaction) =>
      applyCetTypingLibraryImport(transaction, { config, plan }));
    await prisma.$transaction((transaction) =>
      applyCetTypingLibraryImport(transaction, { config, plan }));

    const library = await prisma.englishContentLibrary.findUniqueOrThrow({
      where: { slug: config.librarySlug },
      include: { units: { include: { items: { include: { acceptedAnswers: true, media: true } } } } }
    });
    const items = library.units.flatMap((unit) => unit.items);
    assert.equal(library.educationStage, "UNIVERSITY");
    assert.equal(library.sourceTextbookId, null);
    assert.equal(library.units.length, 26);
    assert.equal(items.length, 2);
    assert.equal(items.flatMap((item) => item.acceptedAnswers).length, 2);
    assert.equal(items.flatMap((item) => item.media).length, 0);

    await prisma.englishContentItem.update({
      where: { id: items[0]!.id },
      data: { dictionaryEntryId: null }
    });
    await assert.rejects(
      prisma.$transaction((transaction) =>
        applyCetTypingLibraryImport(transaction, { config, plan })),
      /完整性校验失败/u
    );
  } finally {
    await prisma.englishContentLibrary.deleteMany({ where: { slug: config.librarySlug } });
    await prisma.dictionaryEntry.deleteMany({ where: { id: { in: dictionaryEntries.map((entry) => entry.id) } } });
  }
});
