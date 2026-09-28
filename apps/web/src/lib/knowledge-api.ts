"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: "PROCESSING" | "READY" | "FAILED";
  statusName: string;
  contentText: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  chunks: Array<{
    id: string;
    content: string;
    sortOrder: number;
  }>;
}

export interface KnowledgeBase {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  documents: KnowledgeDocument[];
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

export async function getKnowledgeBases() {
  return apiFetch<KnowledgeBase[]>("/knowledge-bases");
}

export async function getKnowledgeBase(id: string) {
  return apiFetch<KnowledgeBase>(`/knowledge-bases/${id}`);
}

export async function createKnowledgeBaseAction(formData: FormData) {
  const base = await apiFetch<KnowledgeBase>("/knowledge-bases", {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim()
    })
  });

  revalidatePath("/dashboard/knowledge");
  redirect(`/dashboard/knowledge?base=${base.id}`);
}

export async function uploadKnowledgeDocumentAction(formData: FormData) {
  const baseId = String(formData.get("baseId") ?? "").trim();
  const body = new FormData();
  const file = formData.get("file");

  if (file instanceof File) {
    body.set("file", file);
  }

  await apiFetch<KnowledgeDocument>(`/knowledge-bases/${baseId}/documents`, {
    method: "POST",
    body
  });

  revalidatePath("/dashboard/knowledge");
  redirect(`/dashboard/knowledge?base=${baseId}`);
}
