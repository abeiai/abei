import type { LearningFlashcardReviewGrade } from "./learning-flashcards-api";

export interface FlashcardRoundState {
  cardIds: string[];
  reviewedCardIds: string[];
  completed: boolean;
  counts: {
    blurry: number;
    hard: number;
    mastered: number;
  };
}

interface InternalFlashcardRoundState extends FlashcardRoundState {
  grades: Record<string, LearningFlashcardReviewGrade>;
}

export function createFlashcardRound(cardIds: string[]): FlashcardRoundState {
  return {
    cardIds: [...new Set(cardIds)],
    reviewedCardIds: [],
    completed: cardIds.length === 0,
    counts: { blurry: 0, hard: 0, mastered: 0 },
    grades: {}
  } as InternalFlashcardRoundState;
}

export function recordFlashcardGrade(
  state: FlashcardRoundState,
  cardId: string,
  grade: LearningFlashcardReviewGrade
): FlashcardRoundState {
  if (!state.cardIds.includes(cardId)) return state;
  const grades = {
    ...((state as InternalFlashcardRoundState).grades ?? {}),
    [cardId]: grade
  };
  const reviewedCardIds = state.cardIds.filter((id) => Boolean(grades[id]));
  const counts = { blurry: 0, hard: 0, mastered: 0 };
  for (const value of Object.values(grades)) {
    if (value === "BLURRY") counts.blurry += 1;
    else if (value === "HARD") counts.hard += 1;
    else if (value === "MASTERED") counts.mastered += 1;
  }
  return {
    cardIds: state.cardIds,
    reviewedCardIds,
    completed: reviewedCardIds.length === state.cardIds.length,
    counts,
    grades
  } as InternalFlashcardRoundState;
}
