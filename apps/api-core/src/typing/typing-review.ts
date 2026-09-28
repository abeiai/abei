import type {
  TypingReviewSnapshot,
  TypingScheduleResult,
  TypingScheduleState
} from "./typing.types.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const intervalDaysByStage = new Map([
  [1, 1],
  [2, 3],
  [3, 7],
  [4, 15],
  [5, 30],
  [6, 60]
]);

export interface ScheduleTypingReviewInput {
  now: Date;
  current: TypingReviewSnapshot | null;
  correct: boolean;
  hintLevel: number;
  isDueReview: boolean;
}

export function scheduleTypingReview(input: ScheduleTypingReviewInput): TypingScheduleResult {
  const currentStage = clampStage(input.current?.stage ?? 0);

  if (input.hintLevel >= 3) {
    return result("RELEARNING", 0, input.now, null);
  }

  if (!input.correct) {
    const stage = input.isDueReview && input.current
      ? Math.max(0, currentStage - 2)
      : 0;
    return result("RELEARNING", stage, input.now, null);
  }

  if (input.hintLevel > 0 && input.current) {
    return result(stateForStage(currentStage, input.current.state), currentStage, dueForUnchanged(input), null);
  }

  if (!input.current || currentStage === 0) {
    return result("LEARNING", 1, addDays(input.now, 1), null);
  }

  if (!input.isDueReview) {
    return result(stateForStage(currentStage, input.current.state), currentStage, dueForUnchanged(input), null);
  }

  if (currentStage >= 6) {
    return result("MASTERED", 6, addDays(input.now, 90), input.now);
  }

  const nextStage = currentStage + 1;
  const state = nextStage >= 6 ? "MASTERED" : "REVIEW";
  return result(
    state,
    nextStage,
    addDays(input.now, intervalDaysByStage.get(nextStage) ?? 1),
    nextStage >= 6 ? input.now : null
  );
}

function result(
  state: TypingScheduleState,
  stage: number,
  dueAt: Date,
  masteredAt: Date | null
): TypingScheduleResult {
  return { state, stage, dueAt, masteredAt };
}

function dueForUnchanged(input: ScheduleTypingReviewInput) {
  return input.current?.dueAt ?? input.now;
}

function stateForStage(stage: number, current: TypingScheduleState): TypingScheduleState {
  if (stage >= 6) return "MASTERED";
  if (stage >= 2) return "REVIEW";
  if (current === "RELEARNING") return "RELEARNING";
  return "LEARNING";
}

function clampStage(value: number) {
  return Math.max(0, Math.min(6, Math.trunc(value)));
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * millisecondsPerDay);
}
