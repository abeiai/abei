"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface SystemConfig {
  id: string;
  key: string;
  label: string;
  value: string;
  description: string | null;
  group: string;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuConfigActionState {
  message?: string;
  status?: "success" | "error";
  submittedAt?: number;
}

export interface ThemeTemplateActionState {
  message?: string;
  status?: "success" | "error";
  submittedAt?: number;
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

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function getAdminSystemConfigs() {
  return apiFetch<SystemConfig[]>("/system-config");
}

export async function getPublicSystemConfigs() {
  return publicApiFetch<SystemConfig[]>("/system-config/public");
}

export async function updateSystemConfigAction(formData: FormData) {
  await apiFetch<SystemConfig[]>("/system-config", {
    method: "PATCH",
    body: JSON.stringify({
      siteName: text(formData, "siteName"),
      siteLogo: text(formData, "siteLogo"),
      siteFavicon: text(formData, "siteFavicon"),
      themePrimaryColor: text(formData, "themePrimaryColor"),
      seoTitle: text(formData, "seoTitle"),
      seoDescription: text(formData, "seoDescription"),
      beianNo: text(formData, "beianNo"),
      copyrightText: text(formData, "copyrightText"),
      serviceQrCode: text(formData, "serviceQrCode"),
      defaultCreditExchangeRate: text(formData, "defaultCreditExchangeRate"),
      siteUrl: text(formData, "siteUrl"),
      analyticsCode: text(formData, "analyticsCode"),
      siteDescription: text(formData, "siteDescription"),
      apiBaseUrl: text(formData, "apiBaseUrl"),
      registrationStatus: text(formData, "registrationStatus"),
      mediaImageMaxSizeMb: text(formData, "mediaImageMaxSizeMb"),
      mediaAudioMaxSizeMb: text(formData, "mediaAudioMaxSizeMb"),
      mediaVideoMaxSizeMb: text(formData, "mediaVideoMaxSizeMb"),
      enterpriseAccountEnabled: text(formData, "enterpriseAccountEnabled")
    })
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");
}

export async function updateThemeTemplateAction(
  _prevState: ThemeTemplateActionState,
  formData: FormData
): Promise<ThemeTemplateActionState> {
  try {
    await apiFetch<SystemConfig[]>("/system-config", {
      method: "PATCH",
      body: JSON.stringify({
        activeThemeTemplate: text(formData, "activeThemeTemplate")
      })
    });

    revalidatePath("/admin");
    revalidatePath("/admin/themes");
    revalidatePath("/", "layout");
    revalidatePath("/");
    revalidatePath("/features");
    revalidatePath("/use-cases");
    revalidatePath("/pricing");
    revalidatePath("/articles");
    revalidatePath("/experience/chat");
    revalidatePath("/voice");
    revalidatePath("/experience/image");
    revalidatePath("/experience/video");

    return {
      status: "success",
      message: "主题模板切换成功",
      submittedAt: Date.now()
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error && error.message ? `主题模板切换失败：${error.message}` : "主题模板切换失败，请稍后重试",
      submittedAt: Date.now()
    };
  }
}

export async function updateMenuConfigAction(formData: FormData) {
  await apiFetch<SystemConfig[]>("/system-config", {
    method: "PATCH",
    body: JSON.stringify({
      siteMenus: text(formData, "siteMenus")
    })
  });

  revalidatePath("/admin");
  revalidatePath("/admin/menus");
  revalidatePath("/");
  revalidatePath("/features");
  revalidatePath("/use-cases");
  revalidatePath("/tools");
  revalidatePath("/pricing");
  revalidatePath("/articles");
}

export async function saveMenuConfigAction(
  _prevState: MenuConfigActionState,
  formData: FormData
): Promise<MenuConfigActionState> {
  const label = text(formData, "saveLabel") || "菜单";

  try {
    await updateMenuConfigAction(formData);

    return {
      status: "success",
      message: `${label}保存成功`,
      submittedAt: Date.now()
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error && error.message ? `${label}保存失败：${error.message}` : `${label}保存失败，请稍后重试`,
      submittedAt: Date.now()
    };
  }
}

export async function updateAiConfigAction(formData: FormData) {
  await apiFetch<SystemConfig[]>("/system-config", {
    method: "PATCH",
    body: JSON.stringify({
      aiSaveFullContent: text(formData, "aiSaveFullContent"),
      audioVoiceCloneReviewRequired: text(formData, "audioVoiceCloneReviewRequired"),
      audioVoiceDesignReviewRequired: text(formData, "audioVoiceDesignReviewRequired"),
      audioUserPublicVoiceEnabled: text(formData, "audioUserPublicVoiceEnabled"),
      audioCloneDefaultVisibility: text(formData, "audioCloneDefaultVisibility"),
      audioDesignDefaultVisibility: text(formData, "audioDesignDefaultVisibility"),
      audioSafetyNotice: text(formData, "audioSafetyNotice"),
      audioCloneConsentText: text(formData, "audioCloneConsentText"),
      audioDownloadNotice: text(formData, "audioDownloadNotice")
    })
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ai/config");
  revalidatePath("/tools/voice-clone");
  revalidatePath("/tools/voice-design");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/voices");
  revalidatePath("/dashboard/audio-tasks");
  revalidatePath("/admin/audio/safety");
}
