interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface PublicTextbookFilterOption {
  value: string;
  label: string;
}

export interface PublicTextbookListItem {
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
  sourceUrl: string | null;
  pdfUrl: string | null;
  backupPdfUrl: string | null;
  mdUrl: string | null;
  sortOrder: number;
  hasPdf: boolean;
  hasUploadedPdf: boolean;
  hasExternalPdf: boolean;
  hasBackupPdf: boolean;
  hasMarkdownContent: boolean;
  markdownConversionStatus: string;
  markdownConvertedAt: string | null;
  markdownPageCount: number | null;
  hasMd: boolean;
  hasUploadedMd: boolean;
  hasExternalMd: boolean;
  updatedAt: string;
}

export interface PublicTextbookListResult {
  filters: {
    educationTypes: PublicTextbookFilterOption[];
    subjects: PublicTextbookFilterOption[];
    versions: PublicTextbookFilterOption[];
    versionsBySubject?: Record<string, PublicTextbookFilterOption[]>;
    grades: PublicTextbookFilterOption[];
    volumes: PublicTextbookFilterOption[];
  };
  items: PublicTextbookListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PublicTextbookSitemapEntry {
  slug: string;
  updatedAt: string;
}

export interface PublicTextbookMarkdownResult {
  textbook: PublicTextbookListItem;
  markdownContent: string;
  markdownAssetBaseUrl: string | null;
  markdownConvertedAt: string | null;
  markdownPageCount: number | null;
  markdownConversionStatus: string;
}

export interface PublicTextbookQuery {
  educationType?: string;
  grade?: string;
  page?: string;
  pageSize?: string;
  q?: string;
  subject?: string;
  version?: string;
  volume?: string;
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

function getPublicApiBaseUrl() {
  return process.env.PUBLIC_API_BASE_URL ?? getApiBaseUrl();
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

export async function getPublicTextbooks(query: PublicTextbookQuery = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  const result = await apiFetch<PublicTextbookListResult>(`/public/textbooks${suffix}`);

  return {
    ...result,
    items: result.items.map(normalizeTextbookCoverUrl)
  };
}

export async function getPublicTextbookSitemapEntries() {
  return apiFetch<PublicTextbookSitemapEntry[]>("/public/textbooks/sitemap-entries");
}

export async function getPublicTextbook(slug: string) {
  const textbook = await apiFetch<PublicTextbookListItem>(`/public/textbooks/${encodeURIComponent(slug)}`);

  return normalizeTextbookCoverUrl(textbook);
}

export async function getPublicTextbookMarkdown(slug: string) {
  const result = await apiFetch<PublicTextbookMarkdownResult>(`/public/textbooks/${encodeURIComponent(slug)}/markdown`);
  const markdownAssetBaseUrl = getPublicTextbookMarkdownAssetBaseUrl(result.textbook.id, result.markdownAssetBaseUrl);

  return {
    ...result,
    textbook: normalizeTextbookCoverUrl(result.textbook),
    markdownAssetBaseUrl,
    markdownContent: normalizeTextbookMarkdownAssetUrls(
      result.markdownContent,
      result.textbook.id,
      result.markdownAssetBaseUrl,
      markdownAssetBaseUrl
    )
  };
}

export function getPublicTextbookDownloadUrl(id: string, format: "pdf") {
  return `${getPublicApiBaseUrl()}/public/textbooks/${id}/download/${format}`;
}

export function getPublicTextbookPdfDownloadUrl(textbook: Pick<PublicTextbookListItem, "pdfUrl">) {
  return textbook.pdfUrl;
}

export function getPublicTextbookBackupDownloadUrl(id: string) {
  return `${getPublicApiBaseUrl()}/public/textbooks/${encodeURIComponent(id)}/backup-pdf`;
}

export function getPublicTextbookCoverUrl(id: string) {
  return `${getPublicApiBaseUrl()}/public/textbooks/${encodeURIComponent(id)}/cover`;
}

function getPublicTextbookMarkdownAssetBaseUrl(id: string, markdownAssetBaseUrl?: null | string) {
  if (markdownAssetBaseUrl && isPublicRemoteUrl(markdownAssetBaseUrl)) {
    return markdownAssetBaseUrl.replace(/\/+$/, "");
  }

  return `${getPublicApiBaseUrl()}/public/textbooks/${encodeURIComponent(id)}/markdown-assets`;
}

export function getPublicTextbookMarkdownViewUrl(slug: string) {
  return `/textbook/markdown/${encodeURIComponent(slug)}`;
}

function normalizeTextbookCoverUrl(textbook: PublicTextbookListItem): PublicTextbookListItem {
  if (!textbook.coverUrl || !isPrivateTextbookCoverUrl(textbook.coverUrl)) {
    return textbook;
  }

  return {
    ...textbook,
    coverUrl: getPublicTextbookCoverUrl(textbook.id)
  };
}

function isPrivateTextbookCoverUrl(value: string) {
  try {
    const { hostname } = new URL(value);

    return hostname.endsWith(".r2.cloudflarestorage.com") || hostname === "r2.cloudflarestorage.com";
  } catch {
    return false;
  }
}

function isPublicRemoteUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.hostname.endsWith(".r2.cloudflarestorage.com") &&
      url.hostname !== "r2.cloudflarestorage.com" &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function normalizeTextbookMarkdownAssetUrls(
  markdownContent: string,
  textbookId: string,
  markdownAssetBaseUrl: string | null,
  publicMarkdownAssetBaseUrl: string
) {
  const privateMarkdownAssetBaseUrls = [
    markdownAssetBaseUrl,
    `/api/textbooks/${textbookId}/markdown-assets`,
    `/api/textbooks/${encodeURIComponent(textbookId)}/markdown-assets`,
    `/api/public/textbooks/${textbookId}/markdown-assets`,
    `/api/public/textbooks/${encodeURIComponent(textbookId)}/markdown-assets`
  ].filter((value): value is string => Boolean(value) && value !== publicMarkdownAssetBaseUrl);

  return Array.from(new Set(privateMarkdownAssetBaseUrls)).reduce(
    (content, privateMarkdownAssetBaseUrl) => content.split(privateMarkdownAssetBaseUrl).join(publicMarkdownAssetBaseUrl),
    markdownContent
  );
}
