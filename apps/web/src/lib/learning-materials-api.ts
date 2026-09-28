import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface TextbookFilterOption {
  value: string;
  label: string;
}

export interface AdminTextbookListItem {
  id: string;
  slug: string;
  title: string;
  educationType: string;
  educationTypeName: string;
  subject: string;
  version: string;
  grade: string;
  volume: string;
  volumeName: string;
  curriculumStandardYear: string | null;
  editionYear: string | null;
  publisher: string | null;
  coverUrl: string | null;
  pdfUrl: string | null;
  mdUrl: string | null;
  sortOrder: number;
  hasPdf: boolean;
  hasUploadedPdf: boolean;
  hasExternalPdf: boolean;
  hasMd: boolean;
  hasUploadedMd: boolean;
  hasExternalMd: boolean;
  updatedAt: string;
}

export interface AdminTextbookListResult {
  filters: {
    educationTypes: TextbookFilterOption[];
    subjects: TextbookFilterOption[];
    versions: TextbookFilterOption[];
    grades: TextbookFilterOption[];
    volumes: TextbookFilterOption[];
  };
  items: AdminTextbookListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminTextbookQuery {
  educationType?: string;
  page?: string;
  subject?: string;
  version?: string;
  grade?: string;
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

function getPublicApiBaseUrl() {
  return process.env.PUBLIC_API_BASE_URL ?? getApiBaseUrl();
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

export async function getAdminTextbooks(query: AdminTextbookQuery = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  return apiFetch<AdminTextbookListResult>(`/admin/learning-materials/textbooks${suffix}`);
}

export function getAdminTextbookDownloadUrl(id: string, format: "pdf" | "md") {
  return `${getPublicApiBaseUrl()}/admin/learning-materials/textbooks/${id}/download/${format}`;
}
