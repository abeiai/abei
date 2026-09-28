import { cookies } from "next/headers";

import type { HistoryProfileFilter } from "@/lib/ai-api";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface VideoGuideLesson {
  id: string;
  userId: string;
  title: string;
  mediaName: string;
  mediaType: "VIDEO" | "AUDIO";
  mediaMimeType: string | null;
  mediaSizeBytes: number;
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  subtitleName: string | null;
  subtitleFormat: "SRT" | "ASS" | null;
  subtitleSizeBytes: number | null;
  subtitleUrl: string | null;
  subtitleStorageKey: string | null;
  status: "DRAFT" | "QUEUED" | "GENERATING" | "SUCCEEDED" | "FAILED";
  statusName: string;
  shareToken: string;
  sharePath: string;
  content: unknown;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type PublicVideoGuideLesson = Pick<
  VideoGuideLesson,
  | "id"
  | "title"
  | "mediaName"
  | "mediaType"
  | "mediaMimeType"
  | "mediaUrl"
  | "subtitleName"
  | "subtitleFormat"
  | "subtitleUrl"
  | "shareToken"
  | "sharePath"
  | "content"
  | "createdAt"
>;

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function getCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

async function apiFetch<TData>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cookie", await getCookieHeader());

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

async function publicApiFetch<TData>(path: string) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData | null>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export async function getPublicVideoGuideLesson(shareToken: string) {
  return publicApiFetch<PublicVideoGuideLesson>(`/public/video-guide/lessons/${encodeURIComponent(shareToken)}`);
}

export async function getUserVideoGuideLessons(profile?: HistoryProfileFilter) {
  const query = profile ? `?profile=${encodeURIComponent(profile)}` : "";
  return apiFetch<VideoGuideLesson[]>(`/video-guide/lessons${query}`);
}
