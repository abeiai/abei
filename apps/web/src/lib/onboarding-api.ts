"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface SetupStatus {
  isInitialized: boolean;
  completedAt: string | null;
  requiredReady: boolean;
  checks: Array<{
    key: string;
    label: string;
    state: "PASS" | "WARN" | "FAIL";
    required: boolean;
    message: string;
  }>;
  summary: {
    hasAdmin: boolean;
    hasSiteName: boolean;
    hasAiProvider: boolean;
    hasEnabledModel: boolean;
    hasDefaultModelAlias: boolean;
    hasPaymentConfig: boolean;
    hasBaseSeed: boolean;
    hasPresetTools: boolean;
  };
}

export interface EnvCheckItem {
  key: string;
  label: string;
  status: "已配置" | "未配置" | "连接正常" | "连接失败";
  detail: string;
}

export interface CurrentAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
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

async function apiFetch<TData>(path: string, init: RequestInit = {}, includeCookies = true) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (includeCookies) {
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

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

export async function getSetupStatus() {
  return apiFetch<SetupStatus>("/setup/status", {}, false);
}

export async function getCurrentAdminOrNull() {
  try {
    return await apiFetch<CurrentAdmin>("/admin-auth/me");
  } catch {
    return null;
  }
}

export async function getEnvCheckItems() {
  return apiFetch<EnvCheckItem[]>("/admin/system/env-check");
}

export async function createFirstAdminAction(formData: FormData) {
  await apiFetch<CurrentAdmin>(
    "/setup/admin",
    {
      method: "POST",
      body: JSON.stringify({
        email: text(formData, "email"),
        password: text(formData, "password"),
        name: text(formData, "name")
      })
    },
    false
  );

  revalidatePath("/admin/setup");
  redirect("/admin/login");
}

export async function updateSetupSiteAction(formData: FormData) {
  await apiFetch<SetupStatus>("/admin/setup/site", {
    method: "POST",
    body: JSON.stringify({
      siteName: text(formData, "siteName"),
      siteDescription: text(formData, "siteDescription"),
      siteUrl: text(formData, "siteUrl")
    })
  });

  revalidatePath("/admin/setup");
  revalidatePath("/admin/settings");
  redirect("/admin/setup?site=1");
}

export async function configureSetupProviderAction(formData: FormData) {
  const providerId = text(formData, "providerId");

  await apiFetch(`/admin/ai/providers/${providerId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name"),
      baseUrl: text(formData, "baseUrl"),
      apiKey: text(formData, "apiKey"),
      status: checked(formData, "isEnabled") ? "ENABLED" : "DISABLED"
    })
  });

  revalidatePath("/admin/setup");
  redirect("/admin/setup?provider=1");
}

export async function testSetupProviderAction(formData: FormData) {
  const providerId = text(formData, "providerId");
  const result = await apiFetch<{
    success: boolean;
    message: string;
  }>(`/admin/ai/providers/${providerId}/test`, {
    method: "POST",
    body: JSON.stringify({})
  });

  revalidatePath("/admin/setup");
  redirect(`/admin/setup?test=${encodeURIComponent(result.message)}`);
}

export async function enableSetupModelAction(formData: FormData) {
  const providerId = text(formData, "providerId");
  const modelPresetId = text(formData, "modelPresetId");

  await apiFetch(`/admin/ai/providers/${providerId}/model-presets/${modelPresetId}/enable`, {
    method: "POST",
    body: JSON.stringify({
      displayName: text(formData, "displayName"),
      providerModelName: text(formData, "providerModelName"),
      capabilityTags: text(formData, "capabilityTags")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      inputPrice: Number(text(formData, "inputPrice") || 0),
      outputPrice: Number(text(formData, "outputPrice") || 0),
      isEnabled: checked(formData, "isEnabled")
    })
  });

  revalidatePath("/admin/setup");
  redirect("/admin/setup?model=1");
}

export async function updateSetupDefaultAliasAction(formData: FormData) {
  await apiFetch("/admin/ai/model-aliases/default-chat", {
    method: "PATCH",
    body: JSON.stringify({
      modelInstanceId: text(formData, "modelInstanceId")
    })
  });

  revalidatePath("/admin/setup");
  redirect("/admin/setup?alias=1");
}

export async function enableSetupToolsAction() {
  await apiFetch("/admin/setup/tools", {
    method: "POST",
    body: JSON.stringify({})
  });

  revalidatePath("/admin/setup");
  revalidatePath("/tools");
  redirect("/admin/setup?tools=1");
}

export async function completeSetupAction(formData: FormData) {
  await apiFetch<SetupStatus>("/admin/setup/complete", {
    method: "POST",
    body: JSON.stringify({
      aiSkipped: checked(formData, "aiSkipped"),
      paymentSkipped: checked(formData, "paymentSkipped")
    })
  });

  revalidatePath("/admin");
  revalidatePath("/admin/setup");
  redirect("/admin");
}
