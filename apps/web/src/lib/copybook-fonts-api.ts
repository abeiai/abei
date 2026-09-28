"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface CopybookFont {
  id: string;
  name: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  storageProvider: "LOCAL" | "S3";
  suitableTemplates: string[];
  sortOrder: number;
  createdByAdminId: string | null;
  createdByAdmin: {
    id: string;
    email: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
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
  headers.set("Cookie", await getCookieHeader());

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

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

export async function getAdminCopybookFonts() {
  return apiFetch<CopybookFont[]>("/admin/fonts");
}

export async function createCopybookFontAction(formData: FormData) {
  await apiFetch<CopybookFont>("/admin/fonts", {
    body: formData,
    method: "POST"
  });
  revalidateFontPaths();
}

export async function updateCopybookFontAction(formData: FormData) {
  const id = text(formData, "id");

  if (!id) {
    throw new Error("字体不存在");
  }

  removeEmptyFileField(formData);

  await apiFetch<CopybookFont>(`/admin/fonts/${id}`, {
    body: formData,
    method: "PATCH"
  });
  revalidateFontPaths();
}

export async function deleteCopybookFontAction(formData: FormData) {
  const id = text(formData, "id");

  if (!id) {
    throw new Error("字体不存在");
  }

  await apiFetch<Record<string, never>>(`/admin/fonts/${id}`, {
    method: "DELETE"
  });
  revalidateFontPaths();
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function removeEmptyFileField(formData: FormData) {
  const file = formData.get("file");

  if (isEmptyFileField(file)) {
    formData.delete("file");
  }
}

function isEmptyFileField(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const file = value as { name?: unknown; size?: unknown };

  return Number(file.size) === 0;
}

function revalidateFontPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fonts");
}
