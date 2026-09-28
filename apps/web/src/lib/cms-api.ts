"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface CmsCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    articles: number;
  };
}

export interface CmsArticle {
  id: string;
  categoryId: string;
  coverMediaId: string | null;
  title: string;
  slug: string;
  summary: string | null;
  coverImage: string | null;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: CmsCategory;
  categories?: CmsCategory[];
  coverMedia?: {
    id: string;
    url: string;
    originalName: string;
  } | null;
  tags?: CmsTag[];
}

export interface CmsPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CmsTag {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    articleTags: number;
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

async function apiFetch<TData>(
  path: string,
  init: RequestInit = {},
  options: { admin?: boolean } = {}
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

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export async function getPublicArticles() {
  return apiFetch<CmsArticle[]>("/public/articles");
}

export async function getPublicArticle(slug: string) {
  return apiFetch<CmsArticle>(`/public/articles/${slug}`);
}

export async function getPublicPage(slug: string) {
  return apiFetch<CmsPage>(`/public/pages/${slug}`);
}

export async function getPublicPages() {
  return apiFetch<CmsPage[]>("/public/pages");
}

export async function getAdminCategories() {
  return apiFetch<CmsCategory[]>("/cms/categories", {}, { admin: true });
}

export async function getAdminArticles() {
  return apiFetch<CmsArticle[]>("/cms/articles", {}, { admin: true });
}

export async function getAdminArticlePreview(id: string) {
  return apiFetch<CmsArticle>(`/cms/articles/${id}/preview`, {}, { admin: true });
}

export async function getAdminPages() {
  return apiFetch<CmsPage[]>("/cms/pages", {}, { admin: true });
}

export async function getAdminPagePreview(id: string) {
  const pages = await getAdminPages();
  const page = pages.find((item) => item.id === id);

  if (!page) {
    throw new Error("单页不存在");
  }

  return page;
}

export async function getAdminTags() {
  return apiFetch<CmsTag[]>("/cms/tags", {}, { admin: true });
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optionalText(formData: FormData, name: string) {
  const value = text(formData, name);

  return value || undefined;
}

function nullableText(formData: FormData, name: string) {
  const value = text(formData, name);

  return value || null;
}

function numberValue(formData: FormData, name: string) {
  const value = Number(formData.get(name) ?? 0);

  return Number.isFinite(value) ? value : 0;
}

function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function multiText(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

async function adminRequest(path: string, method: string, body?: Record<string, unknown>) {
  return apiFetch(path, {
    method,
    body: body ? JSON.stringify(body) : undefined
  }, { admin: true });
}

function revalidateCmsPaths() {
  revalidatePath("/");
  revalidatePath("/articles");
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");
  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/articles");
  revalidatePath("/admin/pages");
  revalidatePath("/admin/tags");
  revalidatePath("/admin/media");
}

function articleBody(formData: FormData) {
  const categoryIds = multiText(formData, "categoryIds");
  const fallbackCategoryId = text(formData, "categoryId");

  return {
    categoryId: categoryIds[0] ?? fallbackCategoryId,
    categoryIds,
    coverMediaId: nullableText(formData, "coverMediaId"),
    title: text(formData, "title"),
    slug: text(formData, "slug"),
    summary: nullableText(formData, "summary"),
    coverImage: nullableText(formData, "coverImage"),
    content: text(formData, "content"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    seoKeywords: nullableText(formData, "seoKeywords"),
    canonicalUrl: nullableText(formData, "canonicalUrl"),
    noIndex: checkboxValue(formData, "noIndex"),
    ogTitle: nullableText(formData, "ogTitle"),
    ogDescription: nullableText(formData, "ogDescription"),
    ogImage: nullableText(formData, "ogImage"),
    scheduledAt: nullableText(formData, "scheduledAt"),
    publishedAt: nullableText(formData, "publishedAt"),
    tagSlugs: multiText(formData, "tagSlugs"),
    status: text(formData, "status") || "DRAFT"
  };
}

function pageBody(formData: FormData) {
  return {
    title: text(formData, "title"),
    slug: text(formData, "slug"),
    content: text(formData, "content"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    seoKeywords: nullableText(formData, "seoKeywords"),
    canonicalUrl: nullableText(formData, "canonicalUrl"),
    noIndex: checkboxValue(formData, "noIndex"),
    ogTitle: nullableText(formData, "ogTitle"),
    ogDescription: nullableText(formData, "ogDescription"),
    ogImage: nullableText(formData, "ogImage"),
    scheduledAt: nullableText(formData, "scheduledAt"),
    status: text(formData, "status") || "DRAFT"
  };
}

function safeReturnTo(formData: FormData, fallback: "/admin/articles" | "/admin/pages") {
  const returnTo = text(formData, "returnTo");

  if (returnTo === fallback || returnTo.startsWith(`${fallback}?`)) {
    return returnTo;
  }

  return fallback;
}

export async function createCategoryAction(formData: FormData) {
  await adminRequest("/cms/categories", "POST", {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    description: optionalText(formData, "description"),
    sortOrder: numberValue(formData, "sortOrder"),
    isVisible: formData.get("isVisible") === "on"
  });
  revalidateCmsPaths();
}

export async function updateCategoryAction(formData: FormData) {
  const id = text(formData, "id");
  await adminRequest(`/cms/categories/${id}`, "PATCH", {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    description: optionalText(formData, "description"),
    sortOrder: numberValue(formData, "sortOrder"),
    isVisible: formData.get("isVisible") === "on"
  });
  revalidateCmsPaths();
}

export async function deleteCategoryAction(formData: FormData) {
  await adminRequest(`/cms/categories/${text(formData, "id")}`, "DELETE");
  revalidateCmsPaths();
}

export async function createArticleAction(formData: FormData) {
  await adminRequest("/cms/articles", "POST", articleBody(formData));
  revalidateCmsPaths();
  redirect(safeReturnTo(formData, "/admin/articles"));
}

export async function updateArticleAction(formData: FormData) {
  const id = text(formData, "id");
  await adminRequest(`/cms/articles/${id}`, "PATCH", articleBody(formData));
  revalidateCmsPaths();
  revalidatePath(`/articles/${text(formData, "slug")}`);
  revalidatePath(`/admin/articles/${id}/preview`);
  redirect(safeReturnTo(formData, "/admin/articles"));
}

export async function deleteArticleAction(formData: FormData) {
  await adminRequest(`/cms/articles/${text(formData, "id")}`, "DELETE");
  revalidateCmsPaths();
}

export async function publishArticleAction(formData: FormData) {
  await adminRequest(`/cms/articles/${text(formData, "id")}/publish`, "POST");
  revalidateCmsPaths();
  revalidatePath(`/articles/${text(formData, "slug")}`);
}

export async function archiveArticleAction(formData: FormData) {
  await adminRequest(`/cms/articles/${text(formData, "id")}/archive`, "POST");
  revalidateCmsPaths();
  revalidatePath(`/articles/${text(formData, "slug")}`);
}

export async function createPageAction(formData: FormData) {
  await adminRequest("/cms/pages", "POST", pageBody(formData));
  revalidateCmsPaths();
  redirect(safeReturnTo(formData, "/admin/pages"));
}

export async function updatePageAction(formData: FormData) {
  const id = text(formData, "id");
  await adminRequest(`/cms/pages/${id}`, "PATCH", pageBody(formData));
  revalidateCmsPaths();
  revalidatePath(`/pages/${text(formData, "slug")}`);
  redirect(safeReturnTo(formData, "/admin/pages"));
}

export async function deletePageAction(formData: FormData) {
  await adminRequest(`/cms/pages/${text(formData, "id")}`, "DELETE");
  revalidateCmsPaths();
}

export async function publishPageAction(formData: FormData) {
  await adminRequest(`/cms/pages/${text(formData, "id")}/publish`, "POST");
  revalidateCmsPaths();
  revalidatePath(`/pages/${text(formData, "slug")}`);
}

export async function archivePageAction(formData: FormData) {
  await adminRequest(`/cms/pages/${text(formData, "id")}/archive`, "POST");
  revalidateCmsPaths();
  revalidatePath(`/pages/${text(formData, "slug")}`);
}

export async function createTagAction(formData: FormData) {
  await adminRequest("/cms/tags", "POST", {
    name: text(formData, "name"),
    slug: text(formData, "slug")
  });
  revalidateCmsPaths();
}

export async function updateTagAction(formData: FormData) {
  const id = text(formData, "id");
  await adminRequest(`/cms/tags/${id}`, "PATCH", {
    name: text(formData, "name"),
    slug: text(formData, "slug")
  });
  revalidateCmsPaths();
}

export async function deleteTagAction(formData: FormData) {
  await adminRequest(`/cms/tags/${text(formData, "id")}`, "DELETE");
  revalidateCmsPaths();
}

export async function publishDueContentAction() {
  await adminRequest("/cms/scheduled/publish-due", "POST");
  revalidateCmsPaths();
}
