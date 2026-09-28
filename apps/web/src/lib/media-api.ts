"use server";

import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface MediaAsset {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  mediaType: MediaAssetType;
  sourceType: MediaAssetSource;
  storageProvider: "LOCAL" | "S3";
  createdByAdminId: string | null;
  createdByAdmin: {
    id: string;
    email: string;
    name: string;
  } | null;
  createdAt: string;
}

export type MediaAssetType = "IMAGE" | "AUDIO" | "VIDEO";
export type MediaAssetSource = "SYSTEM" | "USER_UPLOAD" | "AI_GENERATED" | "WEB_FETCHED";

interface MediaAssetFilters {
  mediaType?: MediaAssetType;
  sourceType?: MediaAssetSource;
  q?: string;
}

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

export async function getAdminMediaAssets(filters: MediaAssetFilters = {}) {
  const searchParams = new URLSearchParams();

  if (filters.mediaType) {
    searchParams.set("mediaType", filters.mediaType);
  }

  if (filters.sourceType) {
    searchParams.set("sourceType", filters.sourceType);
  }

  if (filters.q?.trim()) {
    searchParams.set("q", filters.q.trim());
  }

  const query = searchParams.toString();

  return apiFetch<MediaAsset[]>(`/media/admin/assets${query ? `?${query}` : ""}`);
}
