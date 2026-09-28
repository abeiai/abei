"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export type ContentModuleType = "SLIDESHOW" | "IMAGE_CARD_LIST" | "SPLIT_IMAGE_TEXT";
export type ContentModuleLinkType = "NONE" | "CATEGORY" | "PAGE" | "ARTICLE" | "EXTERNAL";

export interface ContentModuleItem {
  id: string;
  moduleId: string;
  title: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  linkType: ContentModuleLinkType | string | null;
  linkTarget: string | null;
  resolvedHref?: string;
  config: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentModule {
  id: string;
  name: string;
  slug: string;
  type: ContentModuleType;
  description: string | null;
  settings: Record<string, unknown>;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: ContentModuleItem[];
  _count?: {
    items: number;
  };
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

export async function getAdminContentModules(type?: ContentModuleType) {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";

  return apiFetch<ContentModule[]>(`/content-modules${query}`);
}

export async function getAdminContentModule(id: string) {
  return apiFetch<ContentModule>(`/content-modules/${id}`);
}

export async function deleteContentModuleAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (id) {
    await apiFetch(`/content-modules/${id}`, {
      method: "DELETE"
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  redirect("/admin/modules");
}
