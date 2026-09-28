import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackFlashcardDeck,
  parseGeneratedFlashcardDeck,
  type FlashcardGenerationInput
} from "../src/learning-flashcards/learning-flashcards-generator.js";

const baseInput: FlashcardGenerationInput = {
  title: "译林版英语 七年级上册",
  sourceText: "Unit 1 This is me. be good at means 擅长. classmate means 同班同学.",
  strategy: "SUBJECT_KNOWLEDGE",
  detailRequest: "需要背诵的部分",
  cardTypes: ["meaning", "spelling", "example"],
  targetCardCount: 6
};

test("解析 AI 闪卡 JSON 并规范化知识地图和卡片", () => {
  const deck = parseGeneratedFlashcardDeck(
    JSON.stringify({
      summary: "围绕 Unit 1 生成词汇和例句卡。",
      knowledgeMap: [
        {
          title: "Unit 1 核心词汇",
          description: "自我介绍相关表达",
          priority: 90
        }
      ],
      cards: [
        {
          type: "词义卡",
          front: "be good at",
          back: "擅长。at 后接名词或动名词。",
          source: "Unit 1 Reading",
          tags: ["词组", "背诵"]
        }
      ]
    }),
    baseInput
  );

  assert.equal(deck.title, "译林版英语 七年级上册");
  assert.equal(deck.summary, "围绕 Unit 1 生成词汇和例句卡。");
  assert.equal(deck.knowledgeMap.length, 1);
  assert.equal(deck.knowledgeMap[0]?.priority, 90);
  assert.equal(deck.cards.length, 1);
  assert.equal(deck.cards[0]?.front, "be good at");
  assert.deepEqual(deck.cards[0]?.tags, ["词组", "背诵"]);
});

test("AI 输出不可解析时生成可保存的 fallback 闪卡组", () => {
  const deck = parseGeneratedFlashcardDeck("不是 JSON 的模型输出", baseInput);
  const fallback = buildFallbackFlashcardDeck(baseInput);

  assert.equal(deck.title, fallback.title);
  assert.equal(deck.cards.length, fallback.cards.length);
  assert.ok(deck.cards.length > 0);
  assert.ok(deck.knowledgeMap.length > 0);
  assert.match(deck.cards[0]?.front ?? "", /Unit 1|be good at|classmate/);
});
