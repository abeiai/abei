import assert from "node:assert/strict";
import test from "node:test";

import { scheduleTypingReview } from "../src/typing/typing-review.js";

const now = new Date("2026-08-27T08:00:00.000Z");

test("新内容首次无提示答对进入阶段 1 并在一天后到期", () => {
  assert.deepEqual(scheduleTypingReview({ now, current: null, correct: true, hintLevel: 0, isDueReview: false }), {
    state: "LEARNING",
    stage: 1,
    dueAt: new Date("2026-08-28T08:00:00.000Z"),
    masteredAt: null
  });
});

test("首次答错进入阶段 0 且本轮立即需要重学", () => {
  assert.deepEqual(scheduleTypingReview({ now, current: null, correct: false, hintLevel: 0, isDueReview: false }), {
    state: "RELEARNING",
    stage: 0,
    dueAt: now,
    masteredAt: null
  });
});

test("到期复习答错后退两级而答对前进一级", () => {
  const current = { state: "REVIEW" as const, stage: 4, dueAt: new Date("2026-08-26T08:00:00.000Z") };
  assert.equal(scheduleTypingReview({ now, current, correct: false, hintLevel: 0, isDueReview: true }).stage, 2);
  const correct = scheduleTypingReview({ now, current, correct: true, hintLevel: 0, isDueReview: true });
  assert.equal(correct.stage, 5);
  assert.equal(correct.state, "REVIEW");
  assert.equal(correct.dueAt.toISOString(), "2026-09-26T08:00:00.000Z");
});

test("提示阻止阶段前进且答案提示退回阶段 0", () => {
  const current = { state: "REVIEW" as const, stage: 3, dueAt: now };
  assert.equal(scheduleTypingReview({ now, current, correct: true, hintLevel: 1, isDueReview: true }).stage, 3);
  const answerHint = scheduleTypingReview({ now, current, correct: true, hintLevel: 3, isDueReview: true });
  assert.equal(answerHint.stage, 0);
  assert.equal(answerHint.state, "RELEARNING");
});

test("阶段 6 答对保持掌握并把抽查顺延 90 天", () => {
  const result = scheduleTypingReview({
    now,
    current: { state: "MASTERED", stage: 6, dueAt: now },
    correct: true,
    hintLevel: 0,
    isDueReview: true
  });
  assert.equal(result.stage, 6);
  assert.equal(result.state, "MASTERED");
  assert.equal(result.dueAt.toISOString(), "2026-11-25T08:00:00.000Z");
  assert.equal(result.masteredAt?.toISOString(), now.toISOString());
});
