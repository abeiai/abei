import { createHash, randomUUID } from "node:crypto";

import type { Prisma } from "../src/index.js";

export type CetExamKey = "cet4" | "cet6";

export interface CetTypingLibraryConfig {
  description: string;
  examTag: CetExamKey;
  expectedTotal: number;
  expectedUnitCounts: readonly number[];
  librarySlug: string;
  sortOrder: number;
  title: string;
}

export interface CetDictionaryEntry {
  id: string;
  normalizedWord: string;
  partOfSpeech: string | null;
  phonetic: string | null;
  tag: string | null;
  translation: string | null;
  word: string;
}

export interface CetTypingWordlistItem {
  britishPhonetic: string | null;
  dictionaryEntryId: string;
  isSpellingRequired: true;
  itemType: "WORD";
  normalizedText: string;
  partOfSpeech: string | null;
  sourceOrder: number;
  sourcePage: null;
  sourceRaw: string;
  text: string;
  translation: string;
}

export interface CetTypingWordlistPlan {
  sourceHash: string;
  units: Array<{
    code: string;
    items: CetTypingWordlistItem[];
    number: number;
    sourcePageEnd: null;
    sourcePageStart: null;
    title: string;
  }>;
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ecdictPartOfSpeechValues = new Set([
  "a.", "abbr.", "adv.", "art.", "aux.", "conj.", "interj.", "n.", "num.",
  "pl.", "prep.", "pron.", "v.", "vi.", "vi.vt.", "vt.", "vt.vi."
]);

const cetTypingLibraryConfigs: Record<CetExamKey, CetTypingLibraryConfig> = {
  cet4: {
    description: "基于 ECDICT cet4 考试标签整理的全国大学英语四级考试完整词汇。",
    examTag: "cet4",
    expectedTotal: 5_139,
    expectedUnitCounts: [344, 290, 521, 294, 242, 239, 151, 177, 211, 38, 33, 175, 238, 110, 149, 394, 22, 288, 588, 269, 90, 82, 168, 1, 19, 6],
    librarySlug: "national-college-english-test-band-4",
    sortOrder: 53,
    title: "全国大学英语四级考试"
  },
  cet6: {
    description: "基于 ECDICT cet6 考试标签整理的全国大学英语六级考试完整词汇，保留与四级词汇的重叠部分。",
    examTag: "cet6",
    expectedTotal: 7_302,
    expectedUnitCounts: [483, 365, 736, 449, 352, 320, 205, 251, 340, 59, 41, 232, 360, 145, 200, 592, 33, 415, 842, 386, 122, 124, 211, 2, 26, 11],
    librarySlug: "national-college-english-test-band-6",
    sortOrder: 54,
    title: "全国大学英语六级考试"
  }
};

export function getCetTypingLibraryConfig(exam: CetExamKey) {
  return cetTypingLibraryConfigs[exam];
}

export function hasDictionaryExamTag(tag: string | null, examTag: CetExamKey) {
  return tag?.trim().split(/\s+/u).includes(examTag) ?? false;
}

export function buildCetTypingWordlist(
  dictionaryEntries: readonly CetDictionaryEntry[],
  config: CetTypingLibraryConfig
): CetTypingWordlistPlan {
  const matchingEntries = dictionaryEntries
    .filter((entry) => hasDictionaryExamTag(entry.tag, config.examTag))
    .map((entry) => {
      const translation = normalizeEcdictTranslation(entry.translation);
      return {
        ...entry,
        normalizedWord: entry.normalizedWord.trim().toLocaleLowerCase("en-GB"),
        partOfSpeech: entry.partOfSpeech?.trim() || inferEcdictPartOfSpeech(translation),
        phonetic: entry.phonetic?.trim() || null,
        tag: entry.tag?.trim() || null,
        translation,
        word: entry.word.trim()
      };
    })
    .sort(compareDictionaryEntries);

  assertCetEntries(matchingEntries, config);

  const entriesByLetter = new Map(alphabet.map((letter) => [letter, [] as typeof matchingEntries]));
  for (const entry of matchingEntries) {
    entriesByLetter.get(entry.normalizedWord[0]!.toUpperCase())!.push(entry);
  }

  const units = alphabet.map((letter, index) => ({
    code: `letter-${letter.toLocaleLowerCase("en-GB")}`,
    items: (entriesByLetter.get(letter) ?? []).map((entry, itemIndex) => ({
      britishPhonetic: entry.phonetic,
      dictionaryEntryId: entry.id,
      isSpellingRequired: true as const,
      itemType: "WORD" as const,
      normalizedText: entry.normalizedWord,
      partOfSpeech: entry.partOfSpeech,
      sourceOrder: itemIndex + 1,
      sourcePage: null,
      sourceRaw: `ECDICT:${entry.tag}`,
      text: entry.word,
      translation: entry.translation!
    })),
    number: index + 1,
    sourcePageEnd: null,
    sourcePageStart: null,
    title: letter
  }));
  const sourceHash = cetSourceHash(config.examTag, units);

  return { sourceHash, units };
}

export async function applyCetTypingLibraryImport(
  transaction: Prisma.TransactionClient,
  input: {
    config: CetTypingLibraryConfig;
    plan: CetTypingWordlistPlan;
  }
) {
  const existing = await transaction.englishContentLibrary.findUnique({
    where: { slug: input.config.librarySlug },
    select: { id: true, sourceHash: true }
  });

  if (existing) {
    if (existing.sourceHash !== input.plan.sourceHash) {
      throw new Error(`${input.config.title} 已存在且来源哈希不同，拒绝覆盖`);
    }
    await assertImportedLibraryIntegrity(transaction, existing.id, input);
    await transaction.englishContentLibrary.update({
      where: { id: existing.id },
      data: {
        description: input.config.description,
        educationStage: "UNIVERSITY",
        language: "en-GB",
        libraryType: "WORDLIST",
        sortOrder: input.config.sortOrder,
        sourceTextbookId: null,
        status: "PUBLISHED",
        title: input.config.title
      }
    });
    return existing.id;
  }

  const library = await transaction.englishContentLibrary.create({
    data: {
      description: input.config.description,
      educationStage: "UNIVERSITY",
      language: "en-GB",
      libraryType: "WORDLIST",
      slug: input.config.librarySlug,
      sortOrder: input.config.sortOrder,
      sourceHash: input.plan.sourceHash,
      sourceTextbookId: null,
      status: "PUBLISHED",
      title: input.config.title
    },
    select: { id: true }
  });
  const unitRows = input.plan.units.map((unit) => ({
    code: unit.code,
    id: randomUUID(),
    libraryId: library.id,
    mediaStatus: "PENDING" as const,
    sortOrder: unit.number,
    sourcePageEnd: unit.sourcePageEnd,
    sourcePageStart: unit.sourcePageStart,
    status: "PUBLISHED" as const,
    title: unit.title
  }));
  const unitIdByCode = new Map(unitRows.map((unit) => [unit.code, unit.id]));
  const itemRows = input.plan.units.flatMap((unit) => unit.items.map((item) => ({
    britishPhonetic: item.britishPhonetic,
    dictionaryEntryId: item.dictionaryEntryId,
    id: randomUUID(),
    isSpellingRequired: item.isSpellingRequired,
    itemType: item.itemType,
    normalizedText: item.normalizedText,
    partOfSpeech: item.partOfSpeech,
    reviewStatus: "VERIFIED" as const,
    sourceOrder: item.sourceOrder,
    sourcePage: item.sourcePage,
    sourceRaw: item.sourceRaw,
    text: item.text,
    translation: item.translation,
    unitId: unitIdByCode.get(unit.code)!
  })));
  const answerRows = itemRows.map((item) => ({
    answer: item.text,
    isPrimary: true,
    itemId: item.id,
    normalizedAnswer: item.normalizedText,
    sortOrder: 0
  }));

  await transaction.englishContentUnit.createMany({ data: unitRows });
  for (const rows of batches(itemRows)) {
    await transaction.englishContentItem.createMany({ data: rows });
  }
  for (const rows of batches(answerRows)) {
    await transaction.englishContentAcceptedAnswer.createMany({ data: rows });
  }
  await assertImportedLibraryIntegrity(transaction, library.id, input);
  return library.id;
}

function assertCetEntries(
  entries: Array<CetDictionaryEntry & { translation: string | null }>,
  config: CetTypingLibraryConfig
) {
  const invalid = entries.find((entry) => (
    !entry.word
    || !entry.translation
    || !/^[a-z]/u.test(entry.normalizedWord)
  ));
  if (invalid) {
    throw new Error(`${config.title} 存在缺失释义或无法按 A-Z 分组的词条：${invalid.word || invalid.id}`);
  }
  const distinctWords = new Set(entries.map((entry) => entry.normalizedWord));
  if (distinctWords.size !== entries.length) {
    throw new Error(`${config.title} 存在重复规范词形`);
  }
  const counts = alphabet.map((letter) => entries.filter(
    (entry) => entry.normalizedWord.startsWith(letter.toLocaleLowerCase("en-GB"))
  ).length);
  if (
    entries.length !== config.expectedTotal
    || counts.length !== config.expectedUnitCounts.length
    || counts.some((count, index) => count !== config.expectedUnitCounts[index])
  ) {
    throw new Error(
      `${config.title} 词汇数量不一致：期望 ${config.expectedTotal}（${config.expectedUnitCounts.join("/")}），实际 ${entries.length}（${counts.join("/")}）`
    );
  }
}

function compareDictionaryEntries(left: CetDictionaryEntry, right: CetDictionaryEntry) {
  if (left.normalizedWord !== right.normalizedWord) {
    return left.normalizedWord < right.normalizedWord ? -1 : 1;
  }
  if (left.word === right.word) return 0;
  return left.word < right.word ? -1 : 1;
}

function inferEcdictPartOfSpeech(translation: string | null) {
  if (!translation) return null;
  const values: string[] = [];
  for (const line of translation.split(/\r?\n/u)) {
    const value = line.trim().match(/^([a-z]+(?:\.[a-z]+)*)\./iu)?.[0]?.toLocaleLowerCase("en-GB");
    if (value && ecdictPartOfSpeechValues.has(value) && !values.includes(value)) values.push(value);
  }
  return values.length > 0 ? values.join(" / ") : null;
}

function normalizeEcdictTranslation(translation: string | null) {
  return translation?.replace(/\\r\\n|\\n|\\r/gu, "\n").trim() || null;
}

function hashableCetItem(item: CetTypingWordlistItem) {
  return {
    britishPhonetic: item.britishPhonetic,
    isSpellingRequired: item.isSpellingRequired,
    itemType: item.itemType,
    normalizedText: item.normalizedText,
    partOfSpeech: item.partOfSpeech,
    sourceOrder: item.sourceOrder,
    sourcePage: item.sourcePage,
    sourceRaw: item.sourceRaw,
    text: item.text,
    translation: item.translation
  };
}

function cetSourceHash(
  examTag: CetExamKey,
  units: Array<{ code: string; items: CetTypingWordlistItem[] }>
) {
  return createHash("sha256").update(JSON.stringify({
    examTag,
    units: units.map((unit) => ({
      code: unit.code,
      items: unit.items.map(hashableCetItem)
    }))
  })).digest("hex");
}

async function assertImportedLibraryIntegrity(
  transaction: Prisma.TransactionClient,
  libraryId: string,
  input: { config: CetTypingLibraryConfig; plan: CetTypingWordlistPlan }
) {
  const [databaseUnits, media] = await Promise.all([
    transaction.englishContentUnit.findMany({
      where: { libraryId },
      orderBy: { sortOrder: "asc" },
      select: {
        code: true,
        sortOrder: true,
        title: true,
        items: {
          orderBy: { sourceOrder: "asc" },
          select: {
            britishPhonetic: true,
            dictionaryEntryId: true,
            isSpellingRequired: true,
            itemType: true,
            normalizedText: true,
            partOfSpeech: true,
            sourceOrder: true,
            sourcePage: true,
            sourceRaw: true,
            text: true,
            translation: true,
            acceptedAnswers: {
              select: {
                answer: true,
                isPrimary: true,
                normalizedAnswer: true,
                sortOrder: true
              }
            }
          }
        }
      }
    }),
    transaction.englishContentMedia.count({ where: { item: { unit: { libraryId } } } })
  ]);
  if (databaseUnits.length !== input.plan.units.length || media !== 0) {
    throw new Error(`${input.config.title} 完整性校验失败：分组或媒体数量不一致`);
  }

  const actualHashUnits: Array<{ code: string; items: CetTypingWordlistItem[] }> = [];
  for (const [unitIndex, databaseUnit] of databaseUnits.entries()) {
    const plannedUnit = input.plan.units[unitIndex];
    if (
      !plannedUnit
      || databaseUnit.code !== plannedUnit.code
      || databaseUnit.title !== plannedUnit.title
      || databaseUnit.sortOrder !== plannedUnit.number
      || databaseUnit.items.length !== plannedUnit.items.length
    ) {
      throw new Error(`${input.config.title} 完整性校验失败：第 ${unitIndex + 1} 个分组不一致`);
    }

    const hashItems: CetTypingWordlistItem[] = [];
    for (const [itemIndex, databaseItem] of databaseUnit.items.entries()) {
      const plannedItem = plannedUnit.items[itemIndex];
      const answer = databaseItem.acceptedAnswers[0];
      if (
        !plannedItem
        || !databaseItem.dictionaryEntryId
        || databaseItem.dictionaryEntryId !== plannedItem.dictionaryEntryId
        || databaseItem.acceptedAnswers.length !== 1
        || answer?.answer !== plannedItem.text
        || answer?.normalizedAnswer !== plannedItem.normalizedText
        || !answer?.isPrimary
        || answer?.sortOrder !== 0
        || databaseItem.translation === null
        || databaseItem.sourcePage !== plannedItem.sourcePage
        || databaseItem.sourceRaw === null
        || databaseItem.itemType !== "WORD"
      ) {
        throw new Error(`${input.config.title} 完整性校验失败：${plannedUnit.title} 第 ${itemIndex + 1} 条不一致`);
      }
      hashItems.push({
        britishPhonetic: databaseItem.britishPhonetic,
        dictionaryEntryId: databaseItem.dictionaryEntryId,
        isSpellingRequired: databaseItem.isSpellingRequired as true,
        itemType: databaseItem.itemType,
        normalizedText: databaseItem.normalizedText,
        partOfSpeech: databaseItem.partOfSpeech,
        sourceOrder: databaseItem.sourceOrder,
        sourcePage: databaseItem.sourcePage,
        sourceRaw: databaseItem.sourceRaw,
        text: databaseItem.text,
        translation: databaseItem.translation
      });
    }
    actualHashUnits.push({ code: databaseUnit.code, items: hashItems });
  }
  if (cetSourceHash(input.config.examTag, actualHashUnits) !== input.plan.sourceHash) {
    throw new Error(`${input.config.title} 完整性校验失败：实际内容与来源哈希不一致`);
  }
}

function batches<T>(items: T[], size = 1_000) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => (
    items.slice(index * size, (index + 1) * size)
  ));
}
