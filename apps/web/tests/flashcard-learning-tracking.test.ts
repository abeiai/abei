import assert from "node:assert/strict";
import test from "node:test";
import {
  createFlashcardRound,
  recordFlashcardGrade
} from "../src/lib/flashcard-learning-tracking.js";

test("每张卡完成一次等级反馈后完成一轮", () => {
  let state = createFlashcardRound(["card-1", "card-2"]);
  state = recordFlashcardGrade(state, "card-1", "HARD");
  assert.equal(state.completed, false);
  state = recordFlashcardGrade(state, "card-2", "MASTERED");
  assert.equal(state.completed, true);
  assert.deepEqual(state.counts, { blurry: 0, hard: 1, mastered: 1 });
});

test("同一张卡修改反馈不会重复计数且未知卡片被忽略", () => {
  let state = createFlashcardRound(["card-1"]);
  state = recordFlashcardGrade(state, "card-1", "HARD");
  state = recordFlashcardGrade(state, "card-1", "BLURRY");
  assert.deepEqual(state.counts, { blurry: 1, hard: 0, mastered: 0 });
  assert.equal(recordFlashcardGrade(state, "forged", "MASTERED"), state);
});
