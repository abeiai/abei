import assert from "node:assert/strict";
import test from "node:test";

import { LearningFlashcardsService } from "../src/learning-flashcards/learning-flashcards.service.js";

function publicDeckServiceFixture(options: { approvedHash: string | null; status: "PENDING" | "REJECTED" }) {
  const deck = {
    id: "deck-1",
    userId: "owner-private-value",
    title: "公开课程闪卡",
    sourceType: "UPLOAD",
    sourceName: "课程材料",
    sourceText: "source",
    textbookId: null,
    textbookRange: null,
    textbook: null,
    detailRequest: "private generation prompt",
    strategy: "SUBJECT_KNOWLEDGE",
    cardTypes: ["meaning"],
    targetCardCount: 1,
    summary: "summary",
    knowledgeMap: [],
    status: "READY",
    aiTaskId: "private-ai-task-id",
    aiTask: {
      id: "private-ai-task-id",
      status: "SUCCEEDED",
      providerName: "private-task-provider",
      modelName: "private-task-model"
    },
    providerName: "private-provider",
    modelName: "private-model",
    errorMessage: "private-error",
    cards: [
      {
        id: "card-1",
        deckId: "deck-1",
        type: "meaning",
        front: "Hello",
        back: "你好",
        source: "课程材料",
        tags: ["greeting"],
        sortOrder: 0,
        reviews: [
          {
            cardId: "card-1",
            grade: "MASTERED",
            createdAt: new Date("2026-07-02T00:00:00.000Z")
          }
        ],
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z")
      }
    ],
    reviews: [
      {
        cardId: "card-1",
        grade: "MASTERED",
        createdAt: new Date("2026-07-02T00:00:00.000Z")
      }
    ],
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const prisma = {
    courseMaterialPublication: {
      findFirst: async (input: {
        where: { approvedHash: { not: null }; learningFlashcardDeckId: string };
      }) => {
        assert.deepEqual(input.where, {
          approvedHash: { not: null },
          learningFlashcardDeckId: "deck-1"
        });

        return options.approvedHash
          ? {
              approvedHash: options.approvedHash,
              status: options.status,
              learningFlashcardDeck: deck
            }
          : null;
      }
    }
  };
  const service = new LearningFlashcardsService(
    {} as never,
    { recordMaterialChange: async () => undefined } as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  return service;
}

test("至少审核通过过一次的课程闪卡允许匿名读取", async () => {
  const service = publicDeckServiceFixture({ approvedHash: "approved-hash", status: "PENDING" });
  const deck = await service.getPublicCourseDeck("deck-1");
  assert.equal(deck.id, "deck-1");
});

test("匿名闪卡响应使用明确公开投影并移除归属、AI 与复习数据", async () => {
  const service = publicDeckServiceFixture({ approvedHash: "approved-hash", status: "PENDING" });
  const deck = await service.getPublicCourseDeck("deck-1");
  const response = JSON.parse(JSON.stringify(deck)) as Record<string, unknown>;
  const serialized = JSON.stringify(response);

  for (const key of [
    "userId",
    "detailRequest",
    "aiTask",
    "providerName",
    "modelName",
    "errorMessage",
    "reviewSummary",
    "reviews"
  ]) {
    assert.equal(key in response, false, `公开卡组不应包含 ${key}`);
  }
  assert.doesNotMatch(
    serialized,
    /owner-private-value|private generation prompt|private-ai-task-id|private-provider|private-model|private-error|MASTERED/
  );

  const cards = response.cards as Array<Record<string, unknown>>;
  assert.deepEqual(cards, [
    {
      id: "card-1",
      deckId: "deck-1",
      type: "meaning",
      front: "Hello",
      back: "你好",
      source: "课程材料",
      tags: ["greeting"],
      sortOrder: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);
});

test("审核被拒后仍保留已通过闪卡的匿名学习地址", async () => {
  const service = publicDeckServiceFixture({ approvedHash: "approved-hash", status: "REJECTED" });
  const deck = await service.getPublicCourseDeck("deck-1");
  assert.equal(deck.id, "deck-1");
});

test("从未随课程审核通过的闪卡不允许匿名读取", async () => {
  const service = publicDeckServiceFixture({ approvedHash: null, status: "PENDING" });
  await assert.rejects(() => service.getPublicCourseDeck("deck-1"), /闪卡组不存在或尚未公开/);
});
