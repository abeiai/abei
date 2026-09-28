interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface PublicDictionaryExchange {
  label: string;
  value: string;
}

export interface PublicDictionaryEntry {
  id: string;
  word: string;
  phonetic: string | null;
  definition: string | null;
  definitionLines: string[];
  translation: string | null;
  translationLines: string[];
  partOfSpeech: string | null;
  collins: number | null;
  oxford: boolean;
  tags: string[];
  bnc: number | null;
  frequency: number | null;
  exchanges: PublicDictionaryExchange[];
  detail: string | null;
  audio: string | null;
}

export interface PublicDictionarySearchResult {
  query: string;
  normalizedQuery: string;
  queryMode: "word" | "translation";
  totalEntries: number;
  exact: PublicDictionaryEntry | null;
  suggestions: PublicDictionaryEntry[];
  source: {
    name: string;
    repositoryUrl: string;
  };
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function apiFetch<TData>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData | null>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export async function searchPublicDictionary(query: string, limit = 8) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));

  return apiFetch<PublicDictionarySearchResult>(`/public/dict/search?${params.toString()}`);
}
