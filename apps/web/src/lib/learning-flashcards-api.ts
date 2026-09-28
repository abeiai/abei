import type { PublicTextbookListResult } from "@/lib/textbook-public-api";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

export type LearningFlashcardSourceType = "IMPORT" | "TEXTBOOK" | "UPLOAD";
export type LearningFlashcardStrategy = "DAILY_MEMORY" | "SCIENCE_POPULARIZATION" | "SUBJECT_KNOWLEDGE";
export type LearningFlashcardReviewGrade = "BLURRY" | "HARD" | "MASTERED";

export interface LearningFlashcardReviewSummary {
  blurry: number;
  hard: number;
  mastered: number;
}

export interface LearningFlashcardCard {
  id: string;
  deckId: string;
  type: string;
  front: string;
  back: string;
  source: string | null;
  tags: string[];
  sortOrder: number;
  reviewSummary: LearningFlashcardReviewSummary;
  createdAt: string;
  updatedAt: string;
}

export interface LearningFlashcardDeck {
  id: string;
  userId: string;
  title: string;
  sourceType: LearningFlashcardSourceType;
  sourceName: string;
  textbookId: string | null;
  textbookRange: string | null;
  textbook: {
    grade: string;
    id: string;
    markdownConversionStatus: string;
    markdownPageCount: number | null;
    publisher: string | null;
    slug: string;
    subject: string;
    title: string;
    version: string;
    volume: string;
  } | null;
  detailRequest: string | null;
  strategy: LearningFlashcardStrategy;
  cardTypes: string[];
  targetCardCount: number;
  summary: string;
  knowledgeMap: Array<{
    description?: string;
    priority?: number;
    title?: string;
  }>;
  status: "DRAFT" | "FAILED" | "GENERATING" | "READY";
  aiTask: {
    id: string;
    modelName: string | null;
    providerName: string | null;
    status: string;
  } | null;
  providerName: string | null;
  modelName: string | null;
  errorMessage: string | null;
  cards: LearningFlashcardCard[];
  reviewSummary: LearningFlashcardReviewSummary;
  createdAt: string;
  updatedAt: string;
}

type PublicLearningFlashcardCard = Omit<LearningFlashcardCard, "reviewSummary">;
type PublicLearningFlashcardDeck = Omit<
  LearningFlashcardDeck,
  | "aiTask"
  | "cards"
  | "detailRequest"
  | "errorMessage"
  | "modelName"
  | "providerName"
  | "reviewSummary"
  | "userId"
> & {
  cards: PublicLearningFlashcardCard[];
};

export interface GenerateLearningFlashcardDeckInput {
  cardTypes?: string[];
  detailRequest?: string;
  modelInstanceId?: string;
  sourceName?: string;
  sourceText?: string;
  sourceType: "TEXTBOOK" | "UPLOAD";
  strategy: LearningFlashcardStrategy;
  targetCardCount: number;
  textbookId?: string;
  textbookRange?: string;
}

export interface ImportLearningFlashcardDeckInput {
  importText: string;
  sourceName?: string;
  strategy?: LearningFlashcardStrategy;
  title: string;
}

async function apiFetch<TData>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export function listLearningFlashcardDecks() {
  return apiFetch<LearningFlashcardDeck[]>("/api/learning-flashcards/decks");
}

export async function getLearningFlashcardDeck(id: string) {
  const encodedId = encodeURIComponent(id);

  try {
    return await apiFetch<LearningFlashcardDeck>(`/api/learning-flashcards/decks/${encodedId}`);
  } catch {
    return getPublicLearningFlashcardDeck(id);
  }
}

export async function getPublicLearningFlashcardDeck(id: string) {
  const deck = await apiFetch<PublicLearningFlashcardDeck>(
    `/api/public/learning-flashcards/decks/${encodeURIComponent(id)}`
  );

  return normalizePublicLearningFlashcardDeck(deck);
}

function normalizePublicLearningFlashcardDeck(
  deck: PublicLearningFlashcardDeck
): LearningFlashcardDeck {
  const emptyReviewSummary = () => ({ blurry: 0, hard: 0, mastered: 0 });

  return {
    id: deck.id,
    userId: "",
    title: deck.title,
    sourceType: deck.sourceType,
    sourceName: deck.sourceName,
    textbookId: deck.textbookId,
    textbookRange: deck.textbookRange,
    textbook: deck.textbook,
    detailRequest: null,
    strategy: deck.strategy,
    cardTypes: deck.cardTypes,
    targetCardCount: deck.targetCardCount,
    summary: deck.summary,
    knowledgeMap: deck.knowledgeMap,
    status: deck.status,
    aiTask: null,
    providerName: null,
    modelName: null,
    errorMessage: null,
    cards: deck.cards.map((card) => ({
      id: card.id,
      deckId: card.deckId,
      type: card.type,
      front: card.front,
      back: card.back,
      source: card.source,
      tags: card.tags,
      sortOrder: card.sortOrder,
      reviewSummary: emptyReviewSummary(),
      createdAt: card.createdAt,
      updatedAt: card.updatedAt
    })),
    reviewSummary: emptyReviewSummary(),
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt
  };
}

export function generateLearningFlashcardDeck(input: GenerateLearningFlashcardDeckInput) {
  return apiFetch<LearningFlashcardDeck>("/api/learning-flashcards/decks/generate", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function importLearningFlashcardDeck(input: ImportLearningFlashcardDeckInput) {
  return apiFetch<LearningFlashcardDeck>("/api/learning-flashcards/decks/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateLearningFlashcard(
  cardId: string,
  input: Partial<Pick<LearningFlashcardCard, "back" | "front" | "source" | "tags" | "type">>
) {
  return apiFetch<LearningFlashcardCard>(`/api/learning-flashcards/cards/${encodeURIComponent(cardId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function reviewLearningFlashcard(cardId: string, grade: LearningFlashcardReviewGrade) {
  return apiFetch<{
    cardId: string;
    createdAt: string;
    deckId: string;
    grade: LearningFlashcardReviewGrade;
    id: string;
  }>(`/api/learning-flashcards/cards/${encodeURIComponent(cardId)}/review`, {
    method: "POST",
    body: JSON.stringify({ grade })
  });
}

export function listLearningFlashcardTextbooks(query: Record<string, string> = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value.trim()) {
      params.set(key, value.trim());
    }
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  return apiFetch<PublicTextbookListResult>(`/api/learning-flashcards/textbooks${suffix}`);
}
