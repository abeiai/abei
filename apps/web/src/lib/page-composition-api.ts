"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import type { CmsPage } from "@/lib/cms-api";
import type { ContentModule } from "@/lib/content-module-api";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export type PageCompositionTargetType = "HOME" | "PAGE";

export interface PageCompositionItem {
  id: string;
  compositionId: string;
  moduleId: string;
  sortOrder: number;
  module: ContentModule;
}

export interface PageComposition {
  id: string;
  targetKey: string;
  targetType: PageCompositionTargetType;
  pageId: string | null;
  title: string;
  isEnabled: boolean;
  showHeader: boolean;
  showFooter: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  page: CmsPage | null;
  items: PageCompositionItem[];
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

async function apiFetch<TData>(
  path: string,
  init: RequestInit = {},
  options: { admin?: boolean; allowNull?: boolean } = {}
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (options.admin) {
    headers.set("Cookie", await getCookieHeader());
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData | null>;

  if (!response.ok || payload.code !== 0 || (payload.data === null && !options.allowNull)) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export async function getAdminPageCompositions() {
  return apiFetch<PageComposition[]>("/page-compositions", {}, { admin: true });
}

export async function getAdminPageCompositionByTarget(targetType: PageCompositionTargetType, pageId?: string) {
  const query = new URLSearchParams({
    targetType
  });

  if (pageId) {
    query.set("pageId", pageId);
  }

  const composition = await apiFetch<PageComposition>(`/page-compositions/target?${query.toString()}`, {}, { admin: true });

  if (!composition) {
    throw new Error("页面编排不存在");
  }

  return composition;
}

export async function getPublicHomeComposition() {
  return apiFetch<PageComposition | null>("/public/page-compositions/home", {}, { allowNull: true });
}

export async function getPublicPageComposition(slug: string) {
  return apiFetch<PageComposition | null>(
    `/public/page-compositions/pages/${encodeURIComponent(slug)}`,
    {},
    { allowNull: true }
  );
}

export async function revalidateCompositionPaths() {
  revalidatePath("/");
  revalidatePath("/admin/page-compositions");
}
