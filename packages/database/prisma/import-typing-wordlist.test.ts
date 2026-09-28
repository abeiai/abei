import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTypingWordlistCounts,
  assertYilinGrade7AWordlistCounts,
  buildTypingWordlistImportPlan
} from "./import-typing-wordlist.js";
import type { ParsedTypingWordlist } from "./typing-wordlist-parser.js";

const parsed: ParsedTypingWordlist = {
  sourceHash: "a".repeat(64),
  units: [
    {
      code: "unit-01",
      items: [
        {
          britishPhonetic: "greit",
          isSpellingRequired: true,
          itemType: "WORD",
          normalizedText: "greet",
          partOfSpeech: "vt.",
          sourceOrder: 1,
          sourcePage: 7,
          sourceRaw: "greet /greit/vt.问候",
          text: "greet",
          translation: "问候"
        },
        {
          britishPhonetic: null,
          isSpellingRequired: true,
          itemType: "PHRASE",
          normalizedText: "go by",
          partOfSpeech: null,
          sourceOrder: 2,
          sourcePage: 7,
          sourceRaw: "go by 被称为",
          text: "go by",
          translation: "被称为"
        }
      ],
      number: 1,
      sourcePageEnd: 7,
      sourcePageStart: 7,
      title: "Unit 1"
    }
  ]
};

test("导入计划只关联唯一匹配的独立单词并保留教材中文释义", () => {
  const plan = buildTypingWordlistImportPlan(parsed, [
    {
      id: "dict-greet",
      normalizedWord: "greet",
      partOfSpeech: "verb",
      phonetic: "ɡriːt"
    },
    {
      id: "dict-go-by",
      normalizedWord: "go by",
      partOfSpeech: "phrase",
      phonetic: null
    }
  ]);

  assert.equal(plan.units[0]?.items[0]?.dictionaryEntryId, "dict-greet");
  assert.equal(plan.units[0]?.items[0]?.britishPhonetic, "ɡriːt");
  assert.equal(plan.units[0]?.items[0]?.translation, "问候");
  assert.equal(plan.units[0]?.items[1]?.dictionaryEntryId, null);
});

test("导入计划为每个项目创建主答案和两个平台媒体槽位", () => {
  const plan = buildTypingWordlistImportPlan(parsed, []);
  const item = plan.units[0]?.items[0];

  assert.deepEqual(item?.acceptedAnswers, [
    {
      answer: "greet",
      isPrimary: true,
      normalizedAnswer: "greet",
      sortOrder: 0
    }
  ]);
  assert.deepEqual(item?.media, [
    {
      generatorModel: "built-in",
      generatorProvider: "openai-imagegen",
      kind: "ILLUSTRATION",
      status: "PENDING",
      voice: null
    },
    {
      generatorModel: "cosyvoice-v3-flash",
      generatorProvider: "aliyun-dashscope",
      kind: "BRITISH_PRONUNCIATION",
      status: "PENDING",
      voice: "loongemily_v3"
    }
  ]);
});

test("图片专用导入计划不创建英式发音媒体槽位", () => {
  const plan = buildTypingWordlistImportPlan(parsed, [], { includeAudio: false });

  assert.deepEqual(plan.units[0]?.items[0]?.media, [
    {
      generatorModel: "built-in",
      generatorProvider: "openai-imagegen",
      kind: "ILLUSTRATION",
      status: "PENDING",
      voice: null
    }
  ]);
});

test("无媒体导入计划不创建图片或音频槽位", () => {
  const plan = buildTypingWordlistImportPlan(parsed, [], {
    includeAudio: false,
    includeIllustration: false
  });

  assert.deepEqual(plan.units[0]?.items[0]?.media, []);
});

test("译林七上计数断言拒绝遗漏或粘连词条", () => {
  const counts = [40, 46, 47, 52, 20, 87, 61, 57];
  const valid = {
    sourceHash: "b".repeat(64),
    units: counts.map((count, index) => ({
      code: `unit-${String(index + 1).padStart(2, "0")}`,
      items: Array.from({ length: count }, () => ({})),
      number: index + 1,
      sourcePageEnd: null,
      sourcePageStart: null,
      title: `Unit ${index + 1}`
    }))
  } as unknown as ParsedTypingWordlist;
  const missing = structuredClone(valid);
  missing.units[0]?.items.pop();

  assert.doesNotThrow(() => assertYilinGrade7AWordlistCounts(valid));
  assert.throws(
    () => assertYilinGrade7AWordlistCounts(missing),
    /词汇数量与已复核教材不一致/u
  );
});

test("通用计数断言同时校验单元编号和逐单元词条数", () => {
  const complete = {
    sourceHash: "c".repeat(64),
    units: [2, 1].map((count, index) => ({
      code: `unit-${String(index + 1).padStart(2, "0")}`,
      items: Array.from({ length: count }, () => ({})),
      number: index + 1,
      sourcePageEnd: null,
      sourcePageStart: null,
      title: `Unit ${index + 1}`
    }))
  } as unknown as ParsedTypingWordlist;
  const wrongNumber = structuredClone(complete);
  wrongNumber.units[1]!.number = 3;

  assert.doesNotThrow(() => assertTypingWordlistCounts(complete, [2, 1]));
  assert.throws(
    () => assertTypingWordlistCounts(wrongNumber, [2, 1]),
    /词汇数量与已复核教材不一致/u
  );
});
