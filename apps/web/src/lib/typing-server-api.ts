import "server-only";

import { cookies } from "next/headers";

import type {
  ApiResponse,
  TypingHistory,
  TypingLibrary,
  TypingLibraryList,
  TypingReviewList,
  TypingReviewSummary
} from "@/lib/typing-api";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function cookieHeader() {
  const store = await cookies();
  return store.getAll().map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`).join("; ");
}

async function serverTypingFetch<TData>(path: string, authenticated = false) {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/typing/${path.replace(/^\/+/, "")}`, {
      headers: authenticated ? { Cookie: await cookieHeader() } : undefined,
      cache: "no-store"
    });
  } catch {
    throw new Error("打字记词服务暂不可用");
  }
  const payload = (await response.json()) as ApiResponse<TData>;
  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }
  return payload.data;
}

export function getTypingLibraries(query = "") {
  return serverTypingFetch<TypingLibraryList>(`libraries${query ? `?${query}` : ""}`);
}

export function getTypingLibrary(id: string) {
  return serverTypingFetch<TypingLibrary>(`libraries/${encodeURIComponent(id)}`);
}

export function getTypingReviewSummary() {
  return serverTypingFetch<TypingReviewSummary>("reviews/summary", true);
}

export function getTypingReviews(query = "") {
  return serverTypingFetch<TypingReviewList>(`reviews${query ? `?${query}` : ""}`, true);
}

export function getTypingHistory() {
  return serverTypingFetch<TypingHistory>("history", true);
}
