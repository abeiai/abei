"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export type AudioOperationType = "TTS" | "VOICE_CLONE" | "VOICE_DESIGN";

export interface AudioUsageSummary {
  requestCount: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  ttsCount: number;
  voiceCloneCount: number;
  voiceDesignCount: number;
  characterCount: number;
  audioDurationMs: number;
  consumedCredits: number;
  estimatedCost: number;
  avgLatencyMs: number;
}

export interface AudioUsageGroup extends AudioUsageSummary {
  id: string;
  name: string;
}

export interface AudioUsageLog {
  id: string;
  taskId: string;
  userId: string;
  user: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  provider: string;
  model: string;
  operationType: AudioOperationType;
  operationTypeName: string;
  voiceAssetId: string | null;
  voiceName: string;
  taskStatus: string;
  taskStatusName: string;
  characterCount: number;
  audioDurationMs: number | null;
  usageCount: number;
  latencyMs: number | null;
  success: boolean;
  estimatedCost: number;
  consumedCredits: number;
  providerRequestId: string | null;
  createdAt: string;
}

export interface AudioUsageDashboard {
  filters: {
    from: string;
    to: string;
    operationType: string;
    model: string;
  };
  total: AudioUsageSummary;
  today: AudioUsageSummary;
  trend: Array<{ date: string } & AudioUsageSummary>;
  byOperation: AudioUsageGroup[];
  byModel: AudioUsageGroup[];
  byUser: AudioUsageGroup[];
  byVoice: AudioUsageGroup[];
  byStatus: AudioUsageGroup[];
  recentLogs: AudioUsageLog[];
  operationTypes: Array<{
    id: AudioOperationType;
    name: string;
  }>;
  models: Array<{
    id: string;
    name: string;
  }>;
  updatedAt: string;
}

export interface AudioSafetySettings {
  cloneReviewRequired: boolean;
  designReviewRequired: boolean;
  userPublicVoiceEnabled: boolean;
  cloneDefaultVisibility: "PRIVATE" | "PUBLIC" | "ADMIN_ONLY";
  designDefaultVisibility: "PRIVATE" | "PUBLIC" | "ADMIN_ONLY";
  safetyNotice: string;
  cloneConsentText: string;
  downloadNotice: string;
}

export interface VoiceConsent {
  id: string;
  userId: string;
  voiceAssetId: string | null;
  sourceAudioAssetId: string | null;
  consentText: string;
  consentType: "SELF_VOICE" | "AUTHORIZED_VOICE";
  consentTypeName: string;
  ownerName: string | null;
  ownerContact: string | null;
  agreedAt: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminOperationLog {
  id: string;
  adminUserId: string | null;
  adminUser: {
    id: string;
    email: string;
    name: string;
  } | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  description: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminAudioAsset {
  id: string;
  userId: string;
  type: string;
  typeName: string;
  storageProvider: string;
  url: string | null;
  objectKey: string;
  mimeType: string;
  durationMs: number | null;
  sizeBytes: number;
  sampleRate: number | null;
  channels: number | null;
  createdAt: string;
}

export interface AdminVoiceAsset {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    nickname: string;
  };
  provider: string;
  providerVoiceId: string | null;
  name: string;
  type: "SYSTEM" | "CLONED" | "DESIGNED";
  typeName: string;
  targetModel: string;
  status: string;
  statusName: string;
  visibility: string;
  language: string | null;
  accent: string | null;
  gender: "男声" | "女声" | null;
  ageCategory: "儿童" | "青年" | "中年" | "老年" | null;
  avatarUrl: string | null;
  description: string | null;
  previewAudioUrl: string | null;
  sourceAudioAsset: AdminAudioAsset | null;
  sourceSampleFilePath: string | null;
  consent: VoiceConsent | null;
  reviewNote: string | null;
  disabledReason: string | null;
  reviewedAt: string | null;
  deletedAt: string | null;
  isPlatform: boolean;
  taskCount: number;
  recentTasks: Array<{
    id: string;
    type: string;
    typeName: string;
    status: string;
    statusName: string;
    createdAt: string;
  }>;
  recentUsageLogs: AudioUsageLog[];
  operationLogs?: AdminOperationLog[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminSystemVoiceAsset {
  id: string;
  providerVoiceId: string;
  name: string;
  type: "SYSTEM";
  typeName: string;
  targetModel: string;
  supportedModels: string[];
  sourceModels: string[];
  status: "READY" | "DISABLED";
  statusName: string;
  visibility: "PUBLIC";
  language: string;
  languages: string[];
  accent: string | null;
  gender: "男声" | "女声";
  description: string;
  trait: string;
  scene: string;
  age: string;
  ageCategory: "儿童" | "青年" | "中年" | "老年" | null;
  avatarUrl: string | null;
  ssmlSupported: boolean;
  instructSupported: boolean;
  timestampSupported: boolean;
  previewAudioUrl: string;
  disabledReason: string | null;
  isCustomized: boolean;
  updatedAt: string | null;
  modelHealth?: Array<{
    modelName: string;
    isAvailable: boolean;
    isEnabled: boolean;
    providerStatus: string | null;
    providerName: string | null;
    statusName: string;
    aliases: Array<{
      aliasKey: string;
      displayName: string;
    }>;
  }>;
  operationLogs?: AdminOperationLog[];
}

export interface ElevenLabsVoiceSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface AdminAudioModel {
  id: string;
  displayName: string;
  modelName: string;
  provider: string;
  providerName: string;
  providerDisplayName: string;
  providerStatus: string;
  baseUrl: string | null;
  webSocketUrl: string | null;
  region: string | null;
  hasCustomApiKey: boolean;
  apiKeyPreview: string;
  capabilityTags: string[];
  isEnabled: boolean;
  statusName: string;
  inputPrice: string;
  outputPrice: string;
  pricingMode: AudioModelPricingMode;
  pricingUnit: AudioModelPricingUnit;
  pricingConfig: unknown | null;
  aliases: Array<{
    id: string;
    aliasKey: string;
    displayName: string;
    description: string | null;
    updatedAt: string;
  }>;
  defaultPurposes: string[];
  supportsSpeechToText: boolean;
  supportsTts: boolean;
  supportsVoiceDesign: boolean;
  supportsVoiceClone: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AudioModelPricingMode = "TOKENS" | "REQUEST" | "CHARACTERS" | "IMAGES" | "SECONDS";
export type AudioModelPricingUnit =
  | "K_TOKENS"
  | "M_TOKENS"
  | "REQUEST"
  | "CHARACTER"
  | "K_CHARACTERS"
  | "TEN_K_CHARACTERS"
  | "IMAGE"
  | "SECOND";

export interface AudioModelDeleteCheck {
  modelInstanceId: string;
  canDelete: boolean;
  aliasKeys: string[];
  boundScenarios: Array<{
    name: string;
    slug: string;
    isEnabled: boolean;
    aliasKey: string | null;
  }>;
  message: string;
}

export interface AdminAudioTask {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  type: AudioOperationType;
  typeName: string;
  status: string;
  statusName: string;
  provider: string;
  model: string;
  providerInstanceId: string | null;
  modelInstanceId: string | null;
  voiceAssetId: string | null;
  inputText: string | null;
  inputTextLength: number;
  sourceAudioAssetId: string | null;
  sourceAudioAsset: AdminAudioAsset | null;
  sourceSampleFilePath: string | null;
  outputAudioAssetId: string | null;
  outputAudioAsset: AdminAudioAsset | null;
  estimatedCredits: number;
  actualCredits: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestId: string | null;
  providerPayload: unknown;
  voiceAsset: {
    id: string;
    name: string;
    providerVoiceId: string | null;
    targetModel: string;
    status: string;
    visibility: string;
    consent: VoiceConsent | null;
  } | null;
  voiceConsent: VoiceConsent | null;
  reservation: {
    id: string;
    amount: number;
    status: string;
    statusName: string;
    expiresAt: string;
  } | null;
  ledgerEntries: Array<{
    id: string;
    type: string;
    typeName: string;
    amount: number;
    balanceAfter: number;
    relatedTaskId: string | null;
    relatedAudioTaskId: string | null;
    relatedTaskType: string | null;
    operationType: AudioOperationType | null;
    operationTypeName: string | null;
    note: string | null;
    createdAt: string;
  }>;
  usageLogs: AudioUsageLog[];
  operationLogs?: AdminOperationLog[];
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
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

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberText(formData: FormData, name: string) {
  const value = text(formData, name);

  return value ? Number(value) : 0;
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function buildQuery(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export async function getAdminAudioModels() {
  return apiFetch<AdminAudioModel[]>("/admin/audio/models");
}

export async function getAdminAudioSafetySettings() {
  return apiFetch<AudioSafetySettings>("/admin/audio/safety-settings");
}

export async function getAdminVoiceAssets(filters: {
  keyword?: string;
  status?: string;
  language?: string;
  accent?: string;
  model?: string;
} = {}) {
  return apiFetch<AdminVoiceAsset[]>(`/admin/audio/voices${buildQuery(filters)}`);
}

export async function getAdminSystemVoiceAssets(filters: {
  keyword?: string;
  status?: string;
  language?: string;
  accent?: string;
  model?: string;
} = {}) {
  return apiFetch<AdminSystemVoiceAsset[]>(`/admin/audio/system-voices${buildQuery(filters)}`);
}

export async function getAdminSystemVoiceAsset(providerVoiceId: string) {
  return apiFetch<AdminSystemVoiceAsset>(`/admin/audio/system-voices/${providerVoiceId}`);
}

export async function getAdminVoiceAsset(id: string) {
  return apiFetch<AdminVoiceAsset>(`/admin/audio/voices/${id}`);
}

export async function createAdminPlatformVoiceAction(formData: FormData) {
  await apiFetch<AdminVoiceAsset>("/admin/audio/voices/platform", {
    method: "POST",
    body: JSON.stringify({
      type: text(formData, "type"),
      name: text(formData, "name"),
      providerVoiceId: text(formData, "providerVoiceId"),
      modelInstanceId: text(formData, "modelInstanceId"),
      language: text(formData, "language") || undefined,
      description: text(formData, "description") || undefined,
      previewAudioUrl: text(formData, "previewAudioUrl") || undefined
    })
  });

  revalidatePath("/admin/audio/voices");
  revalidatePath("/voice");
  revalidatePath("/dashboard/voices");
}

export async function createAdminPlatformVoiceDesignAction(formData: FormData) {
  const basePath = "/admin/audio/voices/platform-design";
  let target: string;

  try {
    const voice = await apiFetch<AdminVoiceAsset>("/admin/audio/voices/platform-design", {
      method: "POST",
      body: JSON.stringify({
        prompt: text(formData, "prompt"),
        previewText: text(formData, "previewText") || undefined,
        name: text(formData, "name") || "平台设计音色",
        modelAlias: text(formData, "modelAlias") || "voice-design-default",
        modelInstanceId: text(formData, "modelInstanceId") || undefined,
        language: text(formData, "language") || "zh-CN"
      })
    });

    target = `${basePath}?voice=${voice.id}&created=1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "平台音色生成失败";
    target = `${basePath}?error=${encodeURIComponent(message)}`;
  }

  revalidatePath("/admin/audio/voices");
  revalidatePath(basePath);
  revalidatePath("/voice");
  revalidatePath("/dashboard/voices");
  redirect(target);
}

export async function getAdminAudioTasks(filters: {
  user?: string;
  status?: string;
  type?: string;
  provider?: string;
  model?: string;
  startTime?: string;
  endTime?: string;
  page?: string;
  pageSize?: string;
}) {
  return apiFetch<AdminAudioTask[]>(`/admin/audio/tasks${buildQuery(filters)}`);
}

export async function getAdminAudioTask(id: string) {
  return apiFetch<AdminAudioTask>(`/admin/audio/tasks/${id}`);
}

export async function getAdminAudioUsageDashboard(filters: {
  from?: string;
  to?: string;
  operationType?: string;
  model?: string;
}) {
  return apiFetch<AudioUsageDashboard>(`/admin/audio/usage${buildQuery(filters)}`);
}

export async function updateAudioModelAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch<AdminAudioModel>(`/admin/audio/models/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      displayName: text(formData, "displayName"),
      modelName: text(formData, "modelName"),
      baseUrl: text(formData, "baseUrl"),
      webSocketUrl: text(formData, "webSocketUrl"),
      region: text(formData, "region"),
      apiKey: text(formData, "apiKey"),
      clearApiKey: checked(formData, "clearApiKey"),
      capabilityTags: text(formData, "capabilityTags").split(",").map((item) => item.trim()).filter(Boolean),
      inputPrice: numberText(formData, "inputPrice"),
      outputPrice: numberText(formData, "outputPrice"),
      pricingMode: text(formData, "pricingMode"),
      pricingUnit: text(formData, "pricingUnit"),
      isEnabled: checked(formData, "isEnabled"),
      aliasKey: text(formData, "aliasKey") || undefined,
      aliasDisplayName: text(formData, "aliasDisplayName") || undefined,
      aliasDescription: text(formData, "aliasDescription") || undefined
    })
  });

  revalidatePath("/admin/audio/models");
  revalidatePath("/admin/ai/providers");
}

export async function checkAudioModelDeleteAction(modelInstanceId: string) {
  return apiFetch<AudioModelDeleteCheck>(`/admin/audio/models/${modelInstanceId}/delete-check`);
}

export async function deleteAudioModelAction(modelInstanceId: string) {
  await apiFetch<{ deleted: boolean; modelInstanceId: string }>(`/admin/audio/models/${modelInstanceId}`, {
    method: "DELETE",
    body: JSON.stringify({})
  });

  revalidatePath("/admin/audio/models");
  revalidatePath("/admin/ai/providers");
  revalidatePath("/admin/audio/voices");
  revalidatePath("/admin/ai/model-aliases");
  revalidatePath("/admin/ai/config");

  return {
    deleted: true
  };
}

export async function reviewVoiceAssetAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch<AdminVoiceAsset>(`/admin/audio/voices/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({
      action: text(formData, "action"),
      reason: text(formData, "reason") || undefined
    })
  });

  revalidatePath("/admin/audio/safety");
  revalidatePath("/admin/audio/voices");
  revalidatePath(`/admin/audio/voices/${id}`);
}

export async function updateAdminPlatformVoiceAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch<AdminVoiceAsset>(`/admin/audio/voices/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name"),
      language: text(formData, "language") || undefined,
      accent: text(formData, "accent") || null,
      gender: text(formData, "gender") || undefined,
      ageCategory: text(formData, "ageCategory") || undefined
    })
  });

  revalidatePath("/admin/audio/voices");
  revalidatePath(`/admin/audio/voices/${id}`);
  revalidatePath("/dashboard/voices");
  revalidatePath("/voice");
  revalidatePath("/tools/text-to-speech");
}

export async function deleteAdminVoiceAssetAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch(`/admin/audio/voices/${id}`, {
    method: "DELETE",
    body: JSON.stringify({
      reason: text(formData, "reason"),
      confirm: checked(formData, "confirm")
    })
  });

  revalidatePath("/admin/audio/safety");
  revalidatePath("/admin/audio/voices");
  revalidatePath(`/admin/audio/voices/${id}`);
}

function revalidateVoiceAdminPaths(providerVoiceId?: string) {
  revalidatePath("/admin/audio/voices");
  if (providerVoiceId) {
    revalidatePath(`/admin/audio/voices/system/${providerVoiceId}/edit`);
  }
  revalidatePath("/dashboard/voices");
  revalidatePath("/voice");
  revalidatePath("/tools/text-to-speech");
}

export async function syncElevenLabsDefaultVoicesAction() {
  let target: string;

  try {
    const result = await apiFetch<ElevenLabsVoiceSyncResult>("/admin/audio/voices/sync-elevenlabs-defaults", {
      method: "POST",
      body: JSON.stringify({})
    });
    const params = new URLSearchParams({
      elevenlabsSync: "success",
      total: String(result.total),
      created: String(result.created),
      updated: String(result.updated),
      skipped: String(result.skipped)
    });
    target = `/admin/audio/voices?${params.toString()}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ElevenLabs 默认音色同步失败";
    const params = new URLSearchParams({ elevenlabsSync: "error", message });
    target = `/admin/audio/voices?${params.toString()}`;
  }

  revalidateVoiceAdminPaths();
  redirect(target);
}

export async function updateAdminSystemVoiceAction(formData: FormData) {
  const providerVoiceId = text(formData, "providerVoiceId");

  await apiFetch<AdminSystemVoiceAsset>(`/admin/audio/system-voices/${providerVoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name") || undefined,
      description: text(formData, "description") || undefined,
      trait: text(formData, "trait") || undefined,
      scene: text(formData, "scene") || undefined,
      language: text(formData, "language") || undefined,
      accent: text(formData, "accent") || null,
      gender: text(formData, "gender") || undefined,
      ageCategory: text(formData, "ageCategory") || undefined,
      status: text(formData, "status") || undefined,
      disabledReason: text(formData, "disabledReason") || undefined
    })
  });

  revalidateVoiceAdminPaths(providerVoiceId);

  const redirectTo = text(formData, "redirectTo");
  if (redirectTo) {
    redirect(redirectTo);
  }
}

export async function toggleAdminSystemVoiceEnabledAction(formData: FormData) {
  const providerVoiceId = text(formData, "providerVoiceId");
  const nextStatus = text(formData, "nextStatus") || "READY";

  await apiFetch<AdminSystemVoiceAsset>(`/admin/audio/system-voices/${providerVoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: nextStatus,
      disabledReason: nextStatus === "DISABLED" ? "后台停用系统音色" : undefined
    })
  });

  revalidateVoiceAdminPaths(providerVoiceId);
}

export async function deleteAdminSystemVoiceAction(formData: FormData) {
  const providerVoiceId = text(formData, "providerVoiceId");

  await apiFetch<AdminSystemVoiceAsset>(`/admin/audio/system-voices/${providerVoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "DISABLED",
      disabledReason: "后台删除系统音色（从前台隐藏）"
    })
  });

  revalidateVoiceAdminPaths(providerVoiceId);
}

export async function toggleAdminUserVoiceEnabledAction(formData: FormData) {
  const id = text(formData, "id");
  const action = text(formData, "action") || "APPROVE";

  await apiFetch<AdminVoiceAsset>(`/admin/audio/voices/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({
      action,
      reason: action === "DISABLE" ? "后台停用音色" : undefined
    })
  });

  revalidatePath("/admin/audio/voices");
  revalidatePath(`/admin/audio/voices/${id}`);
  revalidatePath("/admin/audio/safety");
}

export async function deleteAdminUserVoiceQuickAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch(`/admin/audio/voices/${id}`, {
    method: "DELETE",
    body: JSON.stringify({
      reason: "后台删除音色",
      confirm: true
    })
  });

  revalidatePath("/admin/audio/voices");
  revalidatePath(`/admin/audio/voices/${id}`);
  revalidatePath("/admin/audio/safety");
}
