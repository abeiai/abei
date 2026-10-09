"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import type { AiTask, AiToolCategory, AiToolInputSchema } from "@/lib/ai-api";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

class AiAdminApiError extends Error {
  constructor(message: string, readonly code: number, readonly status: number) {
    super(message);
  }
}

export interface AiModel {
  id: string;
  providerId: string;
  fallbackModelId: string | null;
  displayName: string;
  modelName: string;
  supportsStreaming: boolean;
  supportsVision: boolean;
  inputPrice: string;
  outputPrice: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiProvider {
  id: string;
  name: string;
  type: "OPENAI_COMPATIBLE";
  baseUrl: string;
  apiKeyPreview: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  models: AiModel[];
}

export type AiModelPricingMode =
  | "TOKENS"
  | "TOKEN_CACHE"
  | "TOKEN_TIERED"
  | "REQUEST"
  | "CHARACTERS"
  | "IMAGES"
  | "SECONDS"
  | "VIDEO_SECONDS";
export type AiModelPricingUnit =
  | "K_TOKENS"
  | "M_TOKENS"
  | "REQUEST"
  | "CHARACTER"
  | "K_CHARACTERS"
  | "TEN_K_CHARACTERS"
  | "IMAGE"
  | "SECOND";

export type AiModelPricingConfig =
  | {
      mode: "TOKENS";
      currency: "CNY";
      unit: "K_TOKENS" | "M_TOKENS";
      input: number;
      output: number;
      source?: string;
      note?: string;
    }
  | {
      mode: "TOKEN_CACHE";
      currency: "CNY";
      unit: "M_TOKENS";
      inputCacheHit: number;
      inputCacheMiss: number;
      output: number;
      discountWindows?: Array<{
        label: string;
        inputCacheHit: number;
        inputCacheMiss: number;
        output: number;
        timezone?: string;
        startTime?: string;
        endTime?: string;
      }>;
      source?: string;
      note?: string;
    }
  | {
      mode: "TOKEN_TIERED";
      currency: "CNY";
      unit: "M_TOKENS";
      tierBasis: "REQUEST_INPUT_TOKENS";
      tiers: Array<{
        label: string;
        minInputTokens: number;
        maxInputTokens: number | null;
        input: number;
        output: number;
        reasoningOutput?: number | null;
        inputCacheHit?: number | null;
        inputCacheHitExplicit?: number | null;
        inputCacheCreation?: number | null;
      }>;
      source?: string;
      note?: string;
    }
  | {
      mode: "IMAGES";
      currency: "CNY";
      unit: "IMAGE";
      input: number;
      output: number;
      source?: string;
      note?: string;
    }
  | {
      mode: "VIDEO_SECONDS";
      currency: "CNY";
      unit: "SECOND";
      billingBasis: "OUTPUT_SECONDS" | "INPUT_OUTPUT_SECONDS";
      variants: Array<{
        label: string;
        resolution: string;
        jobMode: "STANDARD" | "REALTIME" | "BATCH";
        taskType: "TEXT_TO_VIDEO" | "IMAGE_TO_VIDEO" | "REFERENCE_TO_VIDEO" | "VIDEO_EDIT" | "OTHER";
        withAudio: boolean;
        input: number;
        output: number;
        note?: string;
      }>;
      source?: string;
      note?: string;
    };

export interface AdminAiScenario {
  minimumMembershipRank?: number;
  membershipEarlyAccessUntil?: string | null;
  id: string;
  name: string;
  slug: string;
  description: string | null;
  toolCategoryId: string | null;
  toolCategory: AiToolCategory | null;
  promptTemplate: string;
  promptVariables: Array<{
    name: string;
    label: string;
    required: boolean;
    placeholder: string;
  }>;
  inputSchema: AiToolInputSchema | null;
  costCredits: number;
  isEnabled: boolean;
  defaultModelId: string | null;
  fallbackModelId: string | null;
  defaultModelAlias: string | null;
  fallbackModelAlias: string | null;
  requiredCapabilities: string[];
  sortOrder: number;
  isBuiltIn: boolean;
  templateVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiScenarioDeleteCheck {
  scenarioId: string;
  name: string;
  slug: string;
  isBuiltIn: boolean;
  canDelete: boolean;
  associations: {
    aiTasks: number;
    audioTasks: number;
    learnerAuthorizations: number;
    activityEvents: number;
    usageStats: number;
    learningTimeSlices: number;
    dailyLearningSummaries: number;
  };
  totalAssociations: number;
  message: string;
}

export interface AiToolTemplatePreview {
  valid: boolean;
  total: number;
  createCount: number;
  conflictCount: number;
  items: Array<{
    name: string;
    slug: string;
    categorySlug: string;
    action: "CREATE" | "CONFLICT";
    message: string;
  }>;
}

export interface AiToolTemplateImportResult {
  total: number;
  createdCount: number;
  skippedCount: number;
  items: Array<{
    name: string;
    slug: string;
    action: "CREATED" | "SKIPPED";
    message: string;
  }>;
}

export interface AiToolTemplateExport {
  version: string;
  exportedAt: string;
  templates: unknown[];
}

export interface AiModelPreset {
  id: string;
  providerPresetId: string;
  modelKey: string;
  displayName: string;
  providerModelName: string;
  capabilityTags: string[];
  contextWindow: number | null;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsEmbedding: boolean;
  supportsImageGeneration: boolean;
  supportsAudio: boolean;
  isDeprecated: boolean;
  deprecatedMessage: string | null;
  replacementModelKey: string | null;
  recommendedAlias: string | null;
  pricingConfig: AiModelPricingConfig | null;
}

export interface AiModelInstance {
  id: string;
  providerInstanceId: string;
  modelPresetId: string | null;
  displayName: string;
  providerModelName: string;
  baseUrl: string | null;
  webSocketUrl: string | null;
  region: string | null;
  hasCustomApiKey: boolean;
  apiKeyPreview: string;
  capabilityTags: string[];
  inputPrice: string;
  outputPrice: string;
  pricingMode: AiModelPricingMode;
  pricingUnit: AiModelPricingUnit;
  pricingConfig: AiModelPricingConfig | null;
  isEnabled: boolean;
  providerName: string | null;
  providerPresetName: string | null;
  aliases: Array<{
    aliasKey: string;
    displayName: string;
  }>;
}

export interface AiModelInstanceDeleteCheck {
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

export interface AiProviderPreset {
  id: string;
  providerKey: string;
  displayName: string;
  adapterType: "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI" | "CUSTOM_OPENAI_COMPATIBLE" | "DASHSCOPE_AUDIO" | "MINIMAX_AUDIO" | "MINIMAX_VIDEO";
  modality: "TEXT" | "AUDIO" | "MULTIMODAL";
  defaultBaseUrl: string;
  defaultWebSocketUrl: string | null;
  apiKeyEnvName: string;
  docsUrl: string | null;
  region: string | null;
  isBuiltIn: boolean;
  isEnabledByDefault: boolean;
  presetVersion: string;
  lastUpdatedAt: string;
  modelPresets: AiModelPreset[];
  instance: {
    id: string;
    providerPresetId: string;
    name: string;
    baseUrl: string;
    webSocketUrl: string | null;
    region: string | null;
    status: "DISABLED" | "ENABLED" | "TEST_FAILED";
    statusName: string;
    hasApiKey: boolean;
    apiKeyPreview: string;
    lastTestedAt: string | null;
    lastTestResult: {
      success?: boolean;
      message?: string;
    } | null;
    modelInstances: AiModelInstance[];
  } | null;
}

export interface AiModelAlias {
  id: string;
  aliasKey: string;
  displayName: string;
  description: string | null;
  modelInstanceId: string | null;
  statusName: string;
  modelInstance: {
    id: string;
    displayName: string;
    providerModelName: string;
    capabilityTags: string[];
    isEnabled: boolean;
    providerName: string;
    providerPresetName: string;
    providerStatus: string;
  } | null;
}

export interface AiModelAliasPayload {
  aliases: AiModelAlias[];
  modelInstances: AiModelInstance[];
}

export type AdminAiTask = AiTask & {
  user: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  aiProviderId: string | null;
  aiModelId: string | null;
  providerName: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  callLogs: Array<{
    id: string;
    provider: string;
    model: string;
    requestId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
    success: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  ledgerEntries: Array<{
    id: string;
    type: string;
    typeName: string;
    amount: number;
    balanceAfter: number;
    relatedOrderId: string | null;
    relatedTaskId: string | null;
    note: string | null;
    createdAt: string;
  }>;
};

export interface AdminAiTaskFilters {
  taskType?: string;
  provider?: string;
  model?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  user?: string;
  page?: string;
  pageSize?: string;
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
    throw new AiAdminApiError(payload.message || "请求失败", payload.code, response.status);
  }

  return payload.data;
}

async function modelMutationRequest(path: string, init: RequestInit): Promise<{ error: string | null }> {
  try {
    await apiFetch(path, init);
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof AiAdminApiError && error.code >= 40000 && error.code < 50000 && error.status < 500
        ? error.message
        : "模型操作失败，请稍后重试。"
    };
  }
}

function buildQuery(filters: AdminAiTaskFilters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export async function getAdminAiProviders() {
  return apiFetch<AiProvider[]>("/admin/ai-providers");
}

export async function getAdminAiProviderPresets() {
  return apiFetch<AiProviderPreset[]>("/admin/ai/providers");
}

export async function getAdminAiProviderPreset(id: string) {
  return apiFetch<AiProviderPreset>(`/admin/ai/providers/${id}`);
}

export async function createAiProviderPresetAction(formData: FormData) {
  await apiFetch<AiProviderPreset>("/admin/ai/providers", {
    method: "POST",
    body: JSON.stringify({
      providerKey: text(formData, "providerKey"),
      displayName: text(formData, "displayName"),
      adapterType: text(formData, "adapterType") || "CUSTOM_OPENAI_COMPATIBLE",
      modality: text(formData, "modality") || "TEXT",
      defaultBaseUrl: text(formData, "defaultBaseUrl"),
      defaultWebSocketUrl: text(formData, "defaultWebSocketUrl"),
      apiKeyEnvName: text(formData, "apiKeyEnvName"),
      docsUrl: text(formData, "docsUrl"),
      name: text(formData, "name") || text(formData, "displayName"),
      baseUrl: text(formData, "baseUrl") || text(formData, "defaultBaseUrl"),
      webSocketUrl: text(formData, "webSocketUrl") || text(formData, "defaultWebSocketUrl"),
      region: text(formData, "region"),
      apiKey: text(formData, "apiKey"),
      status: checked(formData, "isEnabled") ? "ENABLED" : "DISABLED"
    })
  });

  revalidatePath("/admin/ai/providers");
}

export async function getAdminAiModelAliases() {
  return apiFetch<AiModelAliasPayload>("/admin/ai/model-aliases");
}

export async function getAdminAiTasks(filters: AdminAiTaskFilters = {}) {
  return apiFetch<AdminAiTask[]>(`/admin/ai-tasks${buildQuery(filters)}`);
}

export async function getAdminAiTask(id: string) {
  return apiFetch<AdminAiTask>(`/admin/ai-tasks/${id}`);
}

export async function getAdminAiScenarios() {
  return apiFetch<AdminAiScenario[]>("/admin/ai-scenarios");
}

export async function getAdminAiToolCategories() {
  return apiFetch<AiToolCategory[]>("/admin/ai/tool-categories");
}

export async function exportAdminAiToolTemplates() {
  return apiFetch<AiToolTemplateExport>("/admin/ai/tool-templates/export");
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

function jsonText(formData: FormData, name: string) {
  const value = text(formData, name);

  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as unknown;
}

export async function createAiProviderAction(formData: FormData) {
  await apiFetch<AiProvider>("/admin/ai-providers", {
    method: "POST",
    body: JSON.stringify({
      name: text(formData, "name"),
      type: "OPENAI_COMPATIBLE",
      baseUrl: text(formData, "baseUrl"),
      apiKey: text(formData, "apiKey"),
      modelDisplayName: text(formData, "modelDisplayName"),
      modelName: text(formData, "modelName"),
      inputPrice: numberText(formData, "inputPrice"),
      outputPrice: numberText(formData, "outputPrice"),
      isEnabled: checked(formData, "isEnabled")
    })
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ai-providers");
}

export async function updateAiProviderAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch<AiProvider>(`/admin/ai-providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name"),
      baseUrl: text(formData, "baseUrl"),
      webSocketUrl: text(formData, "webSocketUrl"),
      region: text(formData, "region"),
      apiKey: text(formData, "apiKey"),
      modelId: text(formData, "modelId"),
      modelDisplayName: text(formData, "modelDisplayName"),
      modelName: text(formData, "modelName"),
      inputPrice: numberText(formData, "inputPrice"),
      outputPrice: numberText(formData, "outputPrice"),
      isEnabled: checked(formData, "isEnabled"),
      modelEnabled: checked(formData, "modelEnabled")
    })
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ai-providers");
  revalidatePath("/admin/ai-tasks");
}

export async function createAiModelAction(formData: FormData) {
  const providerId = text(formData, "providerId");
  await apiFetch<AiModel>(`/admin/ai-providers/${providerId}/models`, {
    method: "POST",
    body: JSON.stringify({
      displayName: text(formData, "displayName"),
      modelName: text(formData, "modelName"),
      inputPrice: numberText(formData, "inputPrice"),
      outputPrice: numberText(formData, "outputPrice"),
      supportsStreaming: checked(formData, "supportsStreaming"),
      supportsVision: checked(formData, "supportsVision"),
      isEnabled: checked(formData, "isEnabled"),
      fallbackModelId: text(formData, "fallbackModelId")
    })
  });

  revalidatePath("/admin/ai-providers");
  revalidatePath("/admin/ai-scenarios");
}

export async function updateAiProviderPresetAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch<AiProviderPreset>(`/admin/ai/providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(aiProviderPresetPayload(formData))
  });

  revalidatePath("/admin/ai/providers");
  revalidatePath(`/admin/ai/providers/${id}`);
  revalidatePath("/admin/ai/model-aliases");
  revalidatePath("/admin/audio/models");
}

export async function deleteAiProviderPresetAction(providerId: string) {
  await apiFetch<{ deleted: boolean; providerPresetId: string }>(`/admin/ai/providers/${providerId}`, {
    method: "DELETE",
    body: JSON.stringify({})
  });

  revalidatePath("/admin/ai/providers");
  revalidatePath("/admin/ai/config");
  revalidatePath("/admin/audio/models");
}

export async function testAiProviderPresetAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch<AiProviderPreset>(`/admin/ai/providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(aiProviderPresetPayload(formData))
  });
  await apiFetch<{ success: boolean; message: string }>(`/admin/ai/providers/${id}/test`, {
    method: "POST",
    body: JSON.stringify({})
  });

  revalidatePath("/admin/ai/providers");
  revalidatePath(`/admin/ai/providers/${id}`);
  revalidatePath("/admin/audio/models");
}

function aiProviderPresetPayload(formData: FormData) {
  return {
    name: text(formData, "name"),
    baseUrl: text(formData, "baseUrl"),
    webSocketUrl: text(formData, "webSocketUrl"),
    region: text(formData, "region"),
    apiKey: text(formData, "apiKey"),
    status: checked(formData, "isEnabled") ? "ENABLED" : "DISABLED"
  };
}

export async function enableAiModelPresetAction(formData: FormData) {
  const providerId = text(formData, "providerId");
  const modelPresetId = text(formData, "modelPresetId");
  const result = await modelMutationRequest(`/admin/ai/providers/${providerId}/model-presets/${modelPresetId}/enable`, {
    method: "POST",
    body: JSON.stringify({
      displayName: text(formData, "displayName"),
      providerModelName: text(formData, "providerModelName"),
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
      pricingConfig: jsonText(formData, "pricingConfig"),
      isEnabled: checked(formData, "isEnabled")
    })
  });

  if (result.error) return result;
  revalidatePath("/admin/ai/providers");
  revalidatePath(`/admin/ai/providers/${providerId}`);
  revalidatePath("/admin/ai/model-aliases");
  return result;
}

export async function createAiModelInstanceAction(formData: FormData) {
  const providerId = text(formData, "providerId");
  const result = await modelMutationRequest(`/admin/ai/providers/${providerId}/model-instances`, {
    method: "POST",
    body: JSON.stringify({
      displayName: text(formData, "displayName"),
      providerModelName: text(formData, "providerModelName"),
      baseUrl: text(formData, "baseUrl"),
      webSocketUrl: text(formData, "webSocketUrl"),
      region: text(formData, "region"),
      apiKey: text(formData, "apiKey"),
      capabilityTags: text(formData, "capabilityTags").split(",").map((item) => item.trim()).filter(Boolean),
      inputPrice: numberText(formData, "inputPrice"),
      outputPrice: numberText(formData, "outputPrice"),
      pricingMode: text(formData, "pricingMode"),
      pricingUnit: text(formData, "pricingUnit"),
      pricingConfig: jsonText(formData, "pricingConfig"),
      isEnabled: checked(formData, "isEnabled")
    })
  });

  if (result.error) return result;
  revalidatePath("/admin/ai/providers");
  revalidatePath(`/admin/ai/providers/${providerId}`);
  revalidatePath("/admin/ai/model-aliases");
  return result;
}

export async function updateAiModelInstanceAction(formData: FormData) {
  const id = text(formData, "id");
  const providerId = text(formData, "providerId");
  const result = await modelMutationRequest(`/admin/ai/providers/model-instances/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      displayName: text(formData, "displayName"),
      providerModelName: text(formData, "providerModelName"),
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
      pricingConfig: jsonText(formData, "pricingConfig"),
      isEnabled: checked(formData, "isEnabled")
    })
  });

  if (result.error) return result;
  revalidatePath("/admin/ai/providers");
  revalidatePath(`/admin/ai/providers/${providerId}`);
  revalidatePath("/admin/ai/model-aliases");
  return result;
}

export async function checkAiModelInstanceDeleteAction(modelInstanceId: string) {
  return apiFetch<AiModelInstanceDeleteCheck>(`/admin/ai/providers/model-instances/${modelInstanceId}/delete-check`);
}

export async function deleteAiModelInstanceAction(modelInstanceId: string, providerId: string) {
  await apiFetch<{ deleted: boolean; modelInstanceId: string }>(`/admin/ai/providers/model-instances/${modelInstanceId}`, {
    method: "DELETE",
    body: JSON.stringify({})
  });

  revalidatePath("/admin/ai/providers");
  revalidatePath(`/admin/ai/providers/${providerId}`);
  revalidatePath("/admin/ai/model-aliases");
  revalidatePath("/admin/ai/config");
  revalidatePath("/admin/ai-scenarios");

  return {
    deleted: true
  };
}

export async function updateAiModelAliasAction(formData: FormData) {
  const aliasKey = text(formData, "aliasKey");
  await apiFetch<AiModelAliasPayload>(`/admin/ai/model-aliases/${aliasKey}`, {
    method: "PATCH",
    body: JSON.stringify({
      modelInstanceId: text(formData, "modelInstanceId")
    })
  });

  revalidatePath("/admin/ai/model-aliases");
  revalidatePath("/admin/ai/config");
  revalidatePath("/admin/ai-scenarios");
}

export async function updateAiScenarioAction(formData: FormData) {
  const id = text(formData, "id");
  const inputSchema = jsonText(formData, "inputSchema");
  const promptVariables = text(formData, "promptVariables")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, label, required = "true", placeholder = ""] = line.split("|").map((item) => item.trim());

      return {
        name,
        label: label || name,
        required: required !== "false",
        placeholder
      };
    });

  await apiFetch<AdminAiScenario>(`/admin/ai-scenarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name"),
      description: text(formData, "description"),
      promptTemplate: text(formData, "promptTemplate"),
      promptVariables,
      inputSchema,
      costCredits: numberText(formData, "costCredits"),
      isEnabled: checked(formData, "isEnabled"),
      toolCategoryId: text(formData, "toolCategoryId"),
      sortOrder: numberText(formData, "sortOrder"),
      templateVersion: text(formData, "templateVersion"),
      defaultModelId: text(formData, "defaultModelId"),
      fallbackModelId: text(formData, "fallbackModelId"),
      defaultModelAlias: text(formData, "defaultModelAlias"),
      fallbackModelAlias: text(formData, "fallbackModelAlias"),
      requiredCapabilities: text(formData, "requiredCapabilities")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    })
  });

  revalidateAiScenarioPaths();
}

export async function updateAiScenarioPromptAction(formData: FormData) {
  const id = text(formData, "id");
  const promptVariables = text(formData, "promptVariables")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, label, required = "true", placeholder = ""] = line.split("|").map((item) => item.trim());

      return {
        name,
        label: label || name,
        required: required !== "false",
        placeholder
      };
    });

  await apiFetch<AdminAiScenario>(`/admin/ai-scenarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      promptTemplate: text(formData, "promptTemplate"),
      inputSchema: jsonText(formData, "inputSchema"),
      promptVariables
    })
  });

  revalidateAiScenarioPaths();
}

export async function updateAiScenarioModelAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch<AdminAiScenario>(`/admin/ai-scenarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      minimumMembershipRank: numberText(formData, "minimumMembershipRank"),
      membershipEarlyAccessUntil: text(formData, "membershipEarlyAccessUntil") ? new Date(`${text(formData, "membershipEarlyAccessUntil")}:00+08:00`).toISOString() : null,
      name: text(formData, "name"),
      description: text(formData, "description"),
      costCredits: numberText(formData, "costCredits"),
      defaultModelAlias: text(formData, "defaultModelAlias"),
      fallbackModelAlias: text(formData, "fallbackModelAlias"),
      requiredCapabilities: text(formData, "requiredCapabilities")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      templateVersion: text(formData, "templateVersion"),
      defaultModelId: text(formData, "defaultModelId"),
      fallbackModelId: text(formData, "fallbackModelId")
    })
  });

  revalidateAiScenarioPaths();
}

export async function updateAiScenarioSortAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch<AdminAiScenario>(`/admin/ai-scenarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      sortOrder: numberText(formData, "sortOrder")
    })
  });

  revalidateAiScenarioPaths();
}

export async function updateAiScenarioEnabledAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch<AdminAiScenario>(`/admin/ai-scenarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      isEnabled: text(formData, "isEnabled") === "true"
    })
  });

  revalidateAiScenarioPaths();
}

export async function checkAiScenarioDeleteAction(scenarioId: string) {
  try {
    return {
      ok: true as const,
      data: await apiFetch<AiScenarioDeleteCheck>(`/admin/ai-scenarios/${scenarioId}/delete-check`)
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "场景关联检查失败"
    };
  }
}

export async function deleteAiScenarioAction(scenarioId: string) {
  try {
    const result = await apiFetch<{ deleted: boolean; scenarioId: string; name: string; slug: string }>(
      `/admin/ai-scenarios/${scenarioId}`,
      {
        method: "DELETE",
        body: JSON.stringify({})
      }
    );

    revalidateAiScenarioPaths();

    return {
      ok: true as const,
      data: result
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "删除场景失败"
    };
  }
}

function revalidateAiScenarioPaths() {
  revalidatePath("/admin/ai-scenarios");
  revalidatePath("/admin/ai/tool-categories");
  revalidatePath("/admin/ai/tool-templates");
  revalidatePath("/tools");
}

export async function createAiToolCategoryAction(formData: FormData) {
  await apiFetch<AiToolCategory>("/admin/ai/tool-categories", {
    method: "POST",
    body: JSON.stringify({
      name: text(formData, "name"),
      slug: text(formData, "slug"),
      description: text(formData, "description"),
      sortOrder: numberText(formData, "sortOrder"),
      isVisible: checked(formData, "isVisible")
    })
  });

  revalidatePath("/admin/ai/tool-categories");
  revalidatePath("/admin/ai-scenarios");
  revalidatePath("/tools");
}

export async function updateAiToolCategoryAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch<AiToolCategory>(`/admin/ai/tool-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name"),
      slug: text(formData, "slug"),
      description: text(formData, "description"),
      sortOrder: numberText(formData, "sortOrder"),
      isVisible: checked(formData, "isVisible")
    })
  });

  revalidatePath("/admin/ai/tool-categories");
  revalidatePath("/admin/ai-scenarios");
  revalidatePath("/tools");
}

export async function previewAiToolTemplateImportAction(formData: FormData) {
  const payload = jsonText(formData, "payload");

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("请填写合法的工具模板 JSON。");
  }

  return apiFetch<AiToolTemplatePreview>("/admin/ai/tool-templates/import/preview", {
    method: "POST",
    body: JSON.stringify({
      payload
    })
  });
}

export async function importAiToolTemplateAction(formData: FormData) {
  const payload = jsonText(formData, "payload");

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("请填写合法的工具模板 JSON。");
  }

  const result = await apiFetch<AiToolTemplateImportResult>("/admin/ai/tool-templates/import", {
    method: "POST",
    body: JSON.stringify({
      payload,
      skipConflicts: checked(formData, "skipConflicts")
    })
  });

  revalidatePath("/admin/ai/tool-templates");
  revalidatePath("/admin/ai-scenarios");
  revalidatePath("/tools");

  return result;
}
