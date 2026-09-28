export type TypingComparisonErrorType =
  | "SPELLING_ERROR"
  | "CASE_ERROR"
  | "PUNCTUATION_ERROR"
  | "WHITESPACE_ERROR"
  | "INCOMPLETE";

export type TypingCharacterErrorType = "SUBSTITUTION" | "MISSING" | "EXTRA" | "CASE";

export interface TypingCharacterError {
  type: TypingCharacterErrorType;
  expectedIndex: number;
  actualIndex: number;
}

export interface TypingTokenResult {
  tokenIndex: number;
  status: "CORRECT" | TypingComparisonErrorType;
  charErrors: number[];
  characterErrors: TypingCharacterError[];
}

export interface TypingAnswerComparison {
  correct: boolean;
  errorTypes: TypingComparisonErrorType[];
  firstErrorTokenIndex: number | null;
  tokenResults: TypingTokenResult[];
}

export type TypingScheduleState = "LEARNING" | "REVIEW" | "RELEARNING" | "MASTERED";

export interface TypingReviewSnapshot {
  state: TypingScheduleState;
  stage: number;
  dueAt: Date | null;
}

export interface TypingScheduleResult {
  state: TypingScheduleState;
  stage: number;
  dueAt: Date;
  masteredAt: Date | null;
}
