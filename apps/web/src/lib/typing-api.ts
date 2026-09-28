export interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

export interface TypingLibrarySummary {
  id: string;
  slug: string;
  title: string;
  libraryType: "WORDLIST" | "ARTICLE";
  language: string;
  contentVersion: string | null;
  stage: "PRIMARY" | "JUNIOR_HIGH" | "SENIOR_HIGH" | "UNIVERSITY" | "OTHER" | null;
  version: string | null;
  grade: string | null;
  volume: "FIRST_VOLUME" | "SECOND_VOLUME" | "FULL_VOLUME" | null;
  publisher: string | null;
  coverUrl: string | null;
  unitCount: number;
  itemCount: number;
}

export interface TypingLibrary extends TypingLibrarySummary {
  description: string | null;
  units: Array<{
    id: string;
    code: string;
    title: string;
    itemCount: number;
    mediaStatus: string;
  }>;
}

export function typingVolumeLabel(volume: TypingLibrarySummary["volume"]) {
  return ({
    FIRST_VOLUME: "上册",
    SECOND_VOLUME: "下册",
    FULL_VOLUME: "全一册"
  } as Record<string, string>)[volume ?? ""] ?? "全册";
}

export interface TypingLibraryList {
  items: TypingLibrarySummary[];
  filters: {
    types: string[];
    stages: string[];
    versions: string[];
    grades: string[];
    volumes: string[];
  };
}

export type TypingQuestionSlot =
  | { kind: "WORD"; length: number }
  | { kind: "PUNCTUATION"; text: string };

export interface TypingQuestion {
  id: string;
  version: string;
  prompt: string;
  imageUrl: string | null;
  audioUrl: string | null;
  audioUrls?: Record<string, string>;
  requiresAnswer: boolean;
  slots: TypingQuestionSlot[];
  hint?:
    | { level: 1; words: Array<{ tokenIndex: number; initial: string; length: number }> }
    | { level: 2; tokenIndex: number; word: string };
  explanation?: {
    text: string;
    britishPhonetic: string | null;
    partOfSpeech: string | null;
    translation: string | null;
    tokens: Array<{ kind: "WORD" | "PUNCTUATION"; text: string; length: number }>;
  };
}

export interface TypingSession {
  id: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  scope: "UNIT" | "NEW" | "DUE_REVIEW" | "MIXED";
  library: { id: string; title: string; sourceHash: string | null };
  unit: { id: string; code: string; title: string } | null;
  currentIndex: number;
  totalItems: number;
  progressPercent: number;
  correctCount: number;
  wrongCount: number;
  hintedCount: number;
  activeSeconds: number;
  startedAt: string;
  completedAt: string | null;
  question: TypingQuestion | null;
  nextMedia?: { id: string; imageUrl: string | null; audioUrls: Record<string, string> } | null;
}

export interface TypingAttemptResult {
  correct: boolean;
  result: Array<{
    tokenIndex: number;
    status: string;
    charErrors: number[];
    characterErrors?: Array<{
      type: "SUBSTITUTION" | "MISSING" | "EXTRA" | "CASE";
      expectedIndex: number;
      actualIndex: number;
    }>;
  }>;
  nextHintLevel: number | null;
  session: TypingSession;
}

export interface TypingReviewSummary {
  dueToday: number;
  dueTomorrow: number;
  mastered: number;
  total: number;
}

export interface TypingReviewList {
  items: Array<{
    id: string;
    state: string;
    stage: number;
    dueAt: string | null;
    totalAttempts: number;
    totalCorrect: number;
    lapseCount: number;
    hintCount: number;
    item: {
      id: string;
      text: string;
      translation: string | null;
      britishPhonetic: string | null;
      unit: {
        id: string;
        title: string;
        library: { id: string; title: string };
      };
    };
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface TypingHistory {
  summary: { sessionCount: number; attemptCount: number; durationMs: number };
  sessions: Array<{
    id: string;
    status: string;
    correctCount: number;
    wrongCount: number;
    hintedCount: number;
    targetItemCount: number;
    startedAt: string;
    completedAt: string | null;
    library: { id: string; title: string };
    unit: { id: string; title: string } | null;
  }>;
}

export interface TypingPreferences {
  accent: "UK" | "US";
  autoPlayAudio: boolean;
  replayAfterCorrect: boolean;
  showImage: boolean;
  feedbackSoundEnabled: boolean;
  soundVolume: number;
  inputStyle: "UNDERLINE" | "BOX";
}

export class TypingApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function typingApiFetch<TData>(
  path: string,
  init: RequestInit = {},
  allowNull = false
) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/typing/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  let payload: ApiResponse<TData>;
  try {
    payload = (await response.json()) as ApiResponse<TData>;
  } catch {
    throw new TypingApiError("打字记词服务暂不可用", 50301, response.status);
  }
  if (!response.ok || payload.code !== 0 || (payload.data === null && !allowNull)) {
    throw new TypingApiError(payload.message || "请求失败", payload.code, response.status);
  }
  return payload.data as TData;
}

export function createTypingSession(input: {
  libraryId: string;
  unitId?: string;
  scope: "UNIT" | "NEW" | "DUE_REVIEW" | "MIXED";
  targetItemCount: 0 | 10 | 20 | 30;
  clientSessionKey: string;
  abandonExisting?: boolean;
}) {
  return typingApiFetch<TypingSession>("sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getActiveTypingSession() {
  return typingApiFetch<TypingSession | null>("sessions/active", {}, true);
}

export function getTypingSession(id: string) {
  return typingApiFetch<TypingSession>(`sessions/${encodeURIComponent(id)}`);
}

export function submitTypingAttempt(id: string, input: {
  clientAttemptId: string;
  answer: string;
  durationMs: number;
  audioReplayCount?: number;
}) {
  return typingApiFetch<TypingAttemptResult>(`sessions/${encodeURIComponent(id)}/attempts`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function requestTypingHint(id: string) {
  return typingApiFetch<TypingSession>(`sessions/${encodeURIComponent(id)}/hints`, {
    method: "POST",
    body: "{}"
  });
}

export function advanceTypingSession(id: string) {
  return typingApiFetch<TypingSession>(`sessions/${encodeURIComponent(id)}/next`, {
    method: "POST",
    body: "{}"
  });
}

export function pauseTypingSession(id: string, activeSeconds: number) {
  return typingApiFetch<TypingSession>(`sessions/${encodeURIComponent(id)}/pause`, {
    method: "POST",
    body: JSON.stringify({ activeSeconds })
  });
}

export function resumeTypingSession(id: string) {
  return typingApiFetch<TypingSession>(`sessions/${encodeURIComponent(id)}/resume`, {
    method: "POST",
    body: "{}"
  });
}

export function finishTypingSession(id: string, activeSeconds: number) {
  return typingApiFetch<TypingSession>(`sessions/${encodeURIComponent(id)}/finish`, {
    method: "POST",
    body: JSON.stringify({ activeSeconds })
  });
}

export function createTypingReviewSession(input: {
  libraryId?: string;
  targetItemCount: 10 | 20 | 30;
  clientSessionKey: string;
  abandonExisting?: boolean;
}) {
  return typingApiFetch<TypingSession>("reviews/sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function resetTypingReview(itemId: string) {
  return typingApiFetch<{ reset: boolean }>(`reviews/${encodeURIComponent(itemId)}/reset`, {
    method: "POST",
    body: JSON.stringify({ confirm: true })
  });
}

export function updateTypingPreferences(input: Partial<TypingPreferences>) {
  return typingApiFetch<TypingPreferences>("preferences", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
