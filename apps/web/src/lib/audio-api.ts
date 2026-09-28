import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAiTool, type HistoryProfileFilter } from "@/lib/ai-api";
import { findPublishedCosyVoiceV35Preset, getCosyVoiceV35Preset } from "@/lib/cosyvoice-v35-presets";
import type { DialogueInput, DialogueProject, DialogueQuote } from "@/lib/voice-dialogue";

export type { DialogueInput, DialogueProject, DialogueQuote } from "@/lib/voice-dialogue";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export type AudioTaskStatus =
  | "CREATED"
  | "RESERVED"
  | "UPLOADING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "COMPENSATED";

export interface AudioAsset {
  id: string;
  userId: string;
  type: "SOURCE_SAMPLE" | "PREVIEW" | "TTS_OUTPUT";
  typeName: string;
  storageProvider: "LOCAL" | "S3";
  url: string;
  objectKey: string;
  mimeType: string;
  durationMs: number | null;
  sizeBytes: number;
  sampleRate: number | null;
  channels: number | null;
  createdAt: string;
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

export interface VoiceAsset {
  id: string;
  userId?: string;
  provider?: string;
  providerVoiceId: string | null;
  name: string;
  type: "SYSTEM" | "CLONED" | "DESIGNED";
  typeName: string;
  targetModel: string;
  status: "CREATING" | "READY" | "FAILED" | "PENDING_REVIEW" | "DISABLED" | "DELETED" | "DRAFT" | "REJECTED";
  statusName: string;
  visibility: "PRIVATE" | "PUBLIC" | "ADMIN_ONLY";
  language: string | null;
  languages?: string[];
  accent?: string | null;
  gender?: "男声" | "女声" | null;
  description: string | null;
  trait?: string | null;
  scene?: string | null;
  age?: string | null;
  ageCategory?: "儿童" | "青年" | "中年" | "老年" | null;
  avatarUrl?: string | null;
  supportedModels?: string[];
  sourceModels?: string[];
  ssmlSupported?: boolean;
  instructSupported?: boolean;
  timestampSupported?: boolean;
  previewAudioUrl: string | null;
  sourceAudioAsset?: AudioAsset | null;
  previewAudioAsset?: AudioAsset | null;
  consent?: VoiceConsent | null;
  reviewNote?: string | null;
  disabledReason?: string | null;
  reviewedAt?: string | null;
  deletedAt?: string | null;
  isDefault?: boolean;
  isPlatform?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VoiceLibrary {
  systemVoices: VoiceAsset[];
  platformVoices: VoiceAsset[];
  customVoices: VoiceAsset[];
  defaultVoice: {
    voiceAssetId: string | null;
    systemVoiceId: string | null;
  };
}

export interface AudioModelOption {
  aliasKey: string;
  displayName: string;
  description: string | null;
  isConfigured: boolean;
  providerName: string | null;
  modelName: string | null;
  capabilityTags: string[];
  inputPrice: string;
  outputPrice: string;
  pricingMode: "TOKENS" | "TOKEN_CACHE" | "TOKEN_TIERED" | "REQUEST" | "CHARACTERS" | "IMAGES" | "SECONDS" | "VIDEO_SECONDS";
  pricingUnit: "K_TOKENS" | "M_TOKENS" | "REQUEST" | "CHARACTER" | "K_CHARACTERS" | "TEN_K_CHARACTERS" | "IMAGE" | "SECOND";
  pricingConfig: unknown;
  creditsPerCny: number;
  statusName: string;
}

export interface AudioTask {
  id: string;
  isVoiceExperience?: boolean;
  audioDialogueGenerationId?: string | null;
  dialogueBillingGeneration?: { id: string } | null;
  userId: string;
  type: "TTS" | "VOICE_CLONE" | "VOICE_DESIGN";
  typeName: string;
  status: AudioTaskStatus;
  statusName: string;
  provider: string;
  model: string;
  billingContext?: "PERSONAL" | "ORGANIZATION";
  organizationId?: string | null;
  organizationMemberId?: string | null;
  voiceAssetId: string | null;
  inputText: string | null;
  inputTextLength: number;
  sourceAudioAssetId: string | null;
  outputAudioAssetId: string | null;
  estimatedCredits: number;
  actualCredits: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestId: string | null;
  providerPayload: {
    source?: "TOOL" | "EXPERIENCE" | "VIDEO_GUIDE";
    audioUrl?: string;
    audioBase64?: string;
    audioMimeType?: string;
    previewAudioUrl?: string;
    raw?: {
      output?: {
        audio?: {
          url?: string;
        };
        url?: string;
      };
    };
    output?: {
      audio?: {
        url?: string;
      };
      url?: string;
    };
    [key: string]: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  voiceAsset: {
    id: string;
    name: string;
    providerVoiceId: string | null;
    targetModel: string;
    status: string;
    visibility: string;
    consent?: VoiceConsent | null;
  } | null;
  voiceConsent: VoiceConsent | null;
  sourceAudioAsset: AudioAsset | null;
  outputAudioAsset: AudioAsset | null;
  reservation: {
    id: string;
    amount: number;
    status: string;
    statusName: string;
    expiresAt: string;
  } | null;
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

async function apiUpload<TData>(path: string, formData: FormData) {
  const headers = new Headers();
  headers.set("Cookie", await getCookieHeader());

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData | null>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export async function getAudioModels() {
  return apiFetch<AudioModelOption[]>("/audio/models");
}

export async function getVoiceLibrary() {
  return apiFetch<VoiceLibrary>("/audio/voices");
}

export async function getAudioTasks(profile?: HistoryProfileFilter) {
  const query = profile ? `?profile=${encodeURIComponent(profile)}` : "";
  return apiFetch<AudioTask[]>(`/audio/tasks${query}`);
}

export async function getVoiceExperienceAudioTasks() {
  return apiFetch<AudioTask[]>("/audio/tasks?experience=voice");
}

export async function getAudioTask(id: string) {
  return apiFetch<AudioTask>(`/audio/tasks/${id}`);
}

export async function getVoiceDialogueProjects() {
  return apiFetch<DialogueProject[]>("/audio/dialogue/projects");
}

export async function getVoiceDialogueProject(id: string) {
  return apiFetch<DialogueProject>(`/audio/dialogue/projects/${encodeURIComponent(id)}`);
}

export async function quoteVoiceDialogue(input: DialogueInput) {
  return apiFetch<DialogueQuote>("/audio/dialogue/quotes", { method: "POST", body: JSON.stringify(input) });
}

export async function generateVoiceDialogue(quoteId: string) {
  return apiFetch<DialogueProject>("/audio/dialogue/generations", { method: "POST", body: JSON.stringify({ quoteId }) });
}

export async function mergeVoiceDialogue(id: string) {
  return apiFetch<DialogueProject>(`/audio/dialogue/projects/${encodeURIComponent(id)}/merge`, { method: "POST" });
}

export function isVoiceExperienceTask(task: Pick<AudioTask, "type" | "providerPayload" | "isVoiceExperience" | "audioDialogueGenerationId" | "dialogueBillingGeneration">) {
  if (task.audioDialogueGenerationId || task.dialogueBillingGeneration) return false;
  if (typeof task.isVoiceExperience === "boolean") {
    return task.isVoiceExperience;
  }

  const providerPayload = task.providerPayload;
  const belongsToAnotherExperience = Boolean(
    providerPayload && Object.prototype.hasOwnProperty.call(providerPayload, "videoGuidePersistence")
  );

  return task.type === "TTS" && providerPayload?.source === "EXPERIENCE" && !belongsToAnotherExperience;
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberValue(formData: FormData, name: string) {
  const value = Number(text(formData, name));

  return Number.isFinite(value) ? value : undefined;
}

function fieldText(formData: FormData, name: string) {
  return text(formData, `var_${name}`) || text(formData, name);
}

function fieldNumber(formData: FormData, name: string) {
  const value = Number(fieldText(formData, name));

  return Number.isFinite(value) ? value : undefined;
}

function fieldFile(formData: FormData, name: string) {
  const value = formData.get(`var_${name}`) ?? formData.get(name);

  return value instanceof File ? value : null;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "请求失败";

  if (message === "fetch failed" || message === "Failed to fetch") {
    return "服务暂时无法连接，请稍后重试";
  }

  return message;
}

function actionTarget(basePath: string, error: unknown) {
  const message = errorMessage(error);

  if (message.includes("登录")) {
    return `/login?next=${encodeURIComponent(basePath)}`;
  }

  return `${basePath}?error=${encodeURIComponent(message)}`;
}

function revalidateAudioPaths(extraPath?: string) {
  revalidatePath("/tools/text-to-speech");
  revalidatePath("/tools/voice-design");
  revalidatePath("/tools/voice-clone");
  if (extraPath) {
    revalidatePath(extraPath);
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/voices");
  revalidatePath("/dashboard/audio-tasks");
  revalidatePath("/dashboard/billing");
}

export async function createAudioToolTaskAction(formData: FormData) {
  "use server";

  const scenarioSlug = text(formData, "scenarioSlug");
  const basePath = `/tools/${scenarioSlug}`;
  let target: string;

  try {
    const tool = await getAiTool(scenarioSlug);
    const capabilities = tool.requiredCapabilities.map((item) => item.toUpperCase());
    const modelAlias = tool.defaultModelAlias ?? "";

    if (capabilities.includes("VOICE_CLONE")) {
      if (!["on", "true", "是"].includes(fieldText(formData, "consentAccepted"))) {
        throw new Error("请先勾选声音授权声明");
      }

      const upload = new FormData();
      const file = fieldFile(formData, "sourceAudio");
      if (file) {
        upload.set("file", file);
      }

      const asset = await apiUpload<AudioAsset>("/audio/assets/upload?type=SOURCE_SAMPLE", upload);
      const voice = await apiFetch<VoiceAsset>("/audio/tasks/voice-clone", {
        method: "POST",
        body: JSON.stringify({
          sourceAudioAssetId: asset.id,
          name: fieldText(formData, "name"),
          modelAlias: modelAlias || "voice-clone-default",
          language: "zh-CN",
          source: "TOOL",
          description: fieldText(formData, "description") || undefined,
          consentAccepted: true,
          consentStatement:
            fieldText(formData, "consentStatement") ||
            "我确认上传的音频为本人声音，或我已获得声音权利人的明确授权。我承诺不会将该音色用于冒充他人、诈骗、侵权、虚假宣传或其他违法违规用途。",
          consentType: fieldText(formData, "consentType") || "SELF_VOICE",
          ownerName: fieldText(formData, "ownerName") || undefined,
          ownerContact: fieldText(formData, "ownerContact") || undefined
        })
      });
      target = `${basePath}?voice=${voice.id}&${voice.status === "FAILED" ? "failed=1" : "created=1"}`;
    } else if (capabilities.includes("VOICE_DESIGN")) {
      const voice = await apiFetch<VoiceAsset>("/audio/tasks/voice-design", {
        method: "POST",
        body: JSON.stringify({
          prompt: fieldText(formData, "prompt") || fieldText(formData, "input"),
          previewText: fieldText(formData, "previewText") || undefined,
          name: fieldText(formData, "name"),
          modelAlias: modelAlias || "voice-design-default",
          language: "zh-CN",
          source: "TOOL"
        })
      });
      target = `${basePath}?voice=${voice.id}&${voice.status === "FAILED" ? "failed=1" : "created=1"}`;
    } else {
      const voiceValue = fieldText(formData, "voiceId");
      const voiceAssetId = voiceValue.startsWith("voice:") ? voiceValue.slice("voice:".length) : undefined;
      const voice = voiceValue.startsWith("system:") ? voiceValue.slice("system:".length) : undefined;
      const task = await apiFetch<AudioTask>("/audio/tasks/tts", {
        method: "POST",
        body: JSON.stringify({
          text: fieldText(formData, "text") || text(formData, "input"),
          scenarioId: tool.id,
          voiceAssetId,
          voice,
          modelAlias: modelAlias || "tts-default",
          source: "TOOL",
          speed: fieldNumber(formData, "speed"),
          pitch: fieldNumber(formData, "pitch"),
          volume: fieldNumber(formData, "volume"),
          format: fieldText(formData, "format") || "mp3",
          sampleRate: fieldNumber(formData, "sampleRate"),
          execute: true
        })
      });
      target = `${basePath}?audioTask=${task.id}&${task.status === "FAILED" ? "failed=1" : "created=1"}`;
    }
  } catch (error) {
    target = actionTarget(basePath, error);
  }

  revalidateAudioPaths(basePath);
  redirect(target);
}

export async function createTtsAudioTaskAction(formData: FormData) {
  "use server";

  const basePath = "/tools/text-to-speech";
  let target: string;

  try {
    const scenario = await getAiTool("article-to-speech");
    const task = await apiFetch<AudioTask>("/audio/tasks/tts", {
      method: "POST",
      body: JSON.stringify({
        text: text(formData, "text"),
        scenarioId: scenario.id,
        voiceAssetId: text(formData, "voiceAssetId") || undefined,
        voice: text(formData, "voice") || undefined,
        modelAlias: text(formData, "modelAlias") || "tts-default",
        source: "TOOL",
        speed: numberValue(formData, "speed"),
        pitch: numberValue(formData, "pitch"),
        volume: numberValue(formData, "volume"),
        format: text(formData, "format") || "mp3",
        sampleRate: numberValue(formData, "sampleRate"),
        execute: true
      })
    });
    target = `${basePath}?task=${task.id}&${task.status === "FAILED" ? "failed=1" : "created=1"}`;
  } catch (error) {
    target = actionTarget(basePath, error);
  }

  revalidateAudioPaths();
  redirect(target);
}

export async function createExperienceTtsAudioTaskAction(formData: FormData) {
  "use server";

  const basePath = "/voice";
  let target: string;

  try {
    const scenario = await getAiTool("article-to-speech");
    const voiceChoice = text(formData, "voiceChoice");
    const modelAlias = "tts-default";
    const billingContext = text(formData, "billingContext") === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL";
    const organizationId = text(formData, "organizationId");
    let voiceAssetId = voiceChoice.startsWith("voice:") ? voiceChoice.slice("voice:".length) : undefined;
    const voice = voiceChoice.startsWith("system:") ? voiceChoice.slice("system:".length) : undefined;

    if (!voiceAssetId && !voice && voiceChoice) {
      voiceAssetId = await resolveExperiencePresetVoice(voiceChoice, modelAlias);
    }

    const task = await apiFetch<AudioTask>("/audio/tasks/tts", {
      method: "POST",
      body: JSON.stringify({
        text: text(formData, "text"),
        scenarioId: scenario.id,
        voiceAssetId,
        voice,
        modelAlias,
        billingContext,
        ...(billingContext === "ORGANIZATION" && organizationId ? { organizationId } : {}),
        source: "EXPERIENCE",
        speed: numberValue(formData, "speed"),
        pitch: numberValue(formData, "pitch"),
        volume: numberValue(formData, "volume"),
        format: text(formData, "format") || "mp3",
        sampleRate: numberValue(formData, "sampleRate"),
        execute: true
      })
    });
    const voiceQuery = voiceChoice ? `&voice=${encodeURIComponent(voiceChoice)}` : "";
    target = `${basePath}?task=${task.id}&${task.status === "FAILED" ? "failed=1" : "created=1"}${voiceQuery}`;
  } catch (error) {
    target = actionTarget(basePath, error);
  }

  revalidateAudioPaths(basePath);
  redirect(target);
}

async function resolveExperiencePresetVoice(voiceChoice: string, modelAlias: string) {
  const preset = getCosyVoiceV35Preset(voiceChoice);

  if (!preset) {
    return undefined;
  }

  const [library, models] = await Promise.all([
    apiFetch<VoiceLibrary>("/audio/voices"),
    apiFetch<AudioModelOption[]>("/audio/models").catch(() => [])
  ]);
  const targetModel = models.find((model) => model.aliasKey === modelAlias)?.modelName ?? null;
  const platformVoice = findPublishedCosyVoiceV35Preset(preset, library.platformVoices, targetModel);

  if (platformVoice) {
    return platformVoice.id;
  }

  const existing = library.customVoices.find(
    (voice) =>
      voice.type === "DESIGNED" &&
      voice.status === "READY" &&
      voice.description === preset.prompt &&
      (!targetModel || voice.targetModel === targetModel)
  );

  if (existing) {
    return existing.id;
  }

  const created = await apiFetch<VoiceAsset>("/audio/tasks/voice-design", {
    method: "POST",
    body: JSON.stringify({
      prompt: preset.prompt,
      previewText: preset.previewText,
      name: preset.name,
      modelAlias,
      language: "zh-CN",
      source: "EXPERIENCE"
    })
  });

  if (created.status !== "READY") {
    throw new Error("官方预设音色已提交生成，但当前需要审核或仍在处理中，请稍后在我的音色中使用");
  }

  return created.id;
}

export async function createVoiceDesignAction(formData: FormData) {
  "use server";

  const basePath = "/tools/voice-design";
  let target: string;

  try {
    const voice = await apiFetch<VoiceAsset>("/audio/tasks/voice-design", {
      method: "POST",
      body: JSON.stringify({
        prompt: text(formData, "prompt"),
        previewText: text(formData, "previewText") || undefined,
        name: text(formData, "name"),
        modelAlias: text(formData, "modelAlias") || "voice-design-default",
        language: "zh-CN",
        source: "TOOL"
      })
    });
    target = `${basePath}?voice=${voice.id}&${voice.status === "FAILED" ? "failed=1" : "created=1"}`;
  } catch (error) {
    target = actionTarget(basePath, error);
  }

  revalidateAudioPaths();
  redirect(target);
}

export async function createVoiceCloneAction(formData: FormData) {
  "use server";

  const basePath = "/tools/voice-clone";
  let target: string;

  try {
    if (text(formData, "consentAccepted") !== "on") {
      throw new Error("请先勾选声音授权声明");
    }

    const upload = new FormData();
    const file = formData.get("file");
    if (file instanceof File) {
      upload.set("file", file);
    }

    const asset = await apiUpload<AudioAsset>("/audio/assets/upload?type=SOURCE_SAMPLE", upload);
    const voice = await apiFetch<VoiceAsset>("/audio/tasks/voice-clone", {
      method: "POST",
      body: JSON.stringify({
        sourceAudioAssetId: asset.id,
        name: text(formData, "name"),
        modelAlias: text(formData, "modelAlias") || "voice-clone-default",
        language: "zh-CN",
        source: "TOOL",
        description: text(formData, "description") || undefined,
        consentAccepted: true,
        consentStatement: text(formData, "consentStatement"),
        consentType: text(formData, "consentType") || "SELF_VOICE",
        ownerName: text(formData, "ownerName") || undefined,
        ownerContact: text(formData, "ownerContact") || undefined
      })
    });
    target = `${basePath}?voice=${voice.id}&${voice.status === "FAILED" ? "failed=1" : "created=1"}`;
  } catch (error) {
    target = actionTarget(basePath, error);
  }

  revalidateAudioPaths();
  redirect(target);
}

export async function updateVoiceAssetAction(formData: FormData) {
  "use server";

  const id = text(formData, "id");
  await apiFetch<VoiceAsset>(`/audio/voices/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: text(formData, "name")
    })
  });
  revalidateAudioPaths();
}

export async function deleteVoiceAssetAction(formData: FormData) {
  "use server";

  const id = text(formData, "id");
  await apiFetch(`/audio/voices/${id}`, {
    method: "DELETE"
  });
  revalidateAudioPaths();
}

export async function setDefaultVoiceAction(formData: FormData) {
  "use server";

  await apiFetch<VoiceLibrary>("/audio/voices/default", {
    method: "PATCH",
    body: JSON.stringify({
      voiceAssetId: text(formData, "voiceAssetId") || undefined,
      systemVoiceId: text(formData, "systemVoiceId") || undefined
    })
  });
  revalidateAudioPaths();
}

export function audioUrl(task: AudioTask) {
  const inlineAudio = task.providerPayload?.audioBase64?.trim();

  return (
    task.outputAudioAsset?.url ??
    task.providerPayload?.audioUrl ??
    task.providerPayload?.output?.audio?.url ??
    task.providerPayload?.output?.url ??
    task.providerPayload?.raw?.output?.audio?.url ??
    task.providerPayload?.raw?.output?.url ??
    (inlineAudio
      ? inlineAudio.startsWith("data:audio/")
        ? inlineAudio
        : `data:${task.providerPayload?.audioMimeType ?? "audio/mpeg"};base64,${inlineAudio}`
      : null) ??
    null
  );
}
