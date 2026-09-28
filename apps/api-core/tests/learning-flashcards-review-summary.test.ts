import assert from "node:assert/strict";
import test from "node:test";

import { LearningFlashcardsService } from "../src/learning-flashcards/learning-flashcards.service.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};

type ReviewSummary = {
  blurry: number;
  hard: number;
  mastered: number;
};

interface LearningFlashcardsServiceProbe {
  toDeck(deck: ReturnType<typeof createDeckFixture>): {
    cards: Array<{
      reviewSummary: ReviewSummary;
    }>;
    reviewSummary: ReviewSummary;
  };
}

test("闪卡复习统计只按每张卡最新一次反馈计数", () => {
  const service = new LearningFlashcardsService(
    {} as ConstructorParameters<typeof LearningFlashcardsService>[0],
    courseReviewService as ConstructorParameters<typeof LearningFlashcardsService>[1]
  ) as unknown as LearningFlashcardsServiceProbe;

  const deck = service.toDeck(createDeckFixture());

  assert.deepEqual(deck.reviewSummary, {
    hard: 1,
    blurry: 0,
    mastered: 1
  });
  assert.deepEqual(
    deck.cards.map((card) => card.reviewSummary),
    [
      { hard: 1, blurry: 0, mastered: 0 },
      { hard: 0, blurry: 0, mastered: 1 }
    ]
  );
});

function createDeckFixture() {
  const early = new Date("2026-07-08T08:00:00.000Z");
  const late = new Date("2026-07-08T09:00:00.000Z");

  return {
    id: "deck-1",
    userId: "user-1",
    title: "测试卡组",
    sourceType: "IMPORT" as const,
    sourceName: "导入材料",
    sourceText: "",
    textbookId: null,
    textbookRange: null,
    textbook: null,
    detailRequest: "",
    strategy: "SUBJECT_KNOWLEDGE" as const,
    cardTypes: ["meaning"],
    targetCardCount: 2,
    summary: "测试",
    knowledgeMap: [],
    status: "READY" as const,
    aiTaskId: null,
    aiTask: null,
    providerName: null,
    modelName: null,
    errorMessage: null,
    createdAt: early,
    updatedAt: late,
    cards: [
      {
        id: "card-1",
        deckId: "deck-1",
        type: "词义卡",
        front: "alpha",
        back: "A",
        source: null,
        tags: [],
        sortOrder: 0,
        createdAt: early,
        updatedAt: late,
        reviews: [
          { grade: "MASTERED" as const, createdAt: early },
          { grade: "HARD" as const, createdAt: late }
        ]
      },
      {
        id: "card-2",
        deckId: "deck-1",
        type: "词义卡",
        front: "beta",
        back: "B",
        source: null,
        tags: [],
        sortOrder: 1,
        createdAt: early,
        updatedAt: late,
        reviews: [
          { grade: "BLURRY" as const, createdAt: early },
          { grade: "MASTERED" as const, createdAt: late }
        ]
      }
    ],
    reviews: [
      { cardId: "card-1", grade: "MASTERED" as const, createdAt: early },
      { cardId: "card-1", grade: "HARD" as const, createdAt: late },
      { cardId: "card-2", grade: "BLURRY" as const, createdAt: early },
      { cardId: "card-2", grade: "MASTERED" as const, createdAt: late }
    ]
  };
}
