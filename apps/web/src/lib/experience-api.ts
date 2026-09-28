"use server";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface ExperienceChatModel {
  id: string;
  displayName: string;
  providerName: string;
  providerPresetName: string;
  modelName: string;
  capabilityTags: string[];
  aliases: Array<{
    aliasKey: string;
    displayName: string;
  }>;
  isMock: boolean;
}

export interface ExperienceImageModel {
  id: string;
  displayName: string;
  providerName: string;
  providerPresetName: string;
  providerKey?: string;
  modelName: string;
  capabilityTags: string[];
  aliases: Array<{
    aliasKey: string;
    displayName: string;
  }>;
  maxReferenceImages: number;
  maxOutputImages: number;
  isMock: boolean;
}

export interface ExperienceVideoModel {
  id: string;
  displayName: string;
  providerName: string;
  providerPresetName: string;
  modelName: string;
  capabilityTags: string[];
  aliases: Array<{
    aliasKey: string;
    displayName: string;
  }>;
  maxReferenceFiles: number;
  acceptedReferenceTypes: string[];
  supportedRatios: string[];
  defaultDuration: number;
  supportedDurations: number[];
  defaultResolution: string;
  supportedResolutions: string[];
  supportsPromptRewrite: boolean;
  isMock: boolean;
}

const fallbackChatModel: ExperienceChatModel = {
  id: "mock",
  displayName: "本地演示模型",
  providerName: "AI SaaS",
  providerPresetName: "内置体验",
  modelName: "mock-chat",
  capabilityTags: ["TEXT", "STREAMING"],
  aliases: [],
  isMock: true
};

const fallbackImageModels: ExperienceImageModel[] = [
  {
    id: "mock-image-lite",
    displayName: "图片 5.0 Lite",
    providerName: "AI SaaS",
    providerPresetName: "内置体验",
    modelName: "mock-image-lite",
    capabilityTags: ["IMAGE_GENERATION", "REFERENCE_IMAGE", "LOW_COST"],
    aliases: [
      {
        aliasKey: "image-generation",
        displayName: "图片生成模型"
      }
    ],
    maxReferenceImages: 3,
    maxOutputImages: 6,
    isMock: true
  },
  {
    id: "mock-image-pro",
    displayName: "图片 5.0 Pro",
    providerName: "AI SaaS",
    providerPresetName: "内置体验",
    modelName: "mock-image-pro",
    capabilityTags: ["IMAGE_GENERATION", "REFERENCE_IMAGE", "HIGH_QUALITY"],
    aliases: [],
    maxReferenceImages: 3,
    maxOutputImages: 6,
    isMock: true
  }
];

const fallbackVideoModels: ExperienceVideoModel[] = [
  {
    id: "mock-video-t2v",
    displayName: "视频 1.0 Lite",
    providerName: "AI SaaS",
    providerPresetName: "内置体验",
    modelName: "mock-video-t2v",
    capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO"],
    aliases: [
      {
        aliasKey: "video-generation",
        displayName: "视频生成模型"
      }
    ],
    maxReferenceFiles: 0,
    acceptedReferenceTypes: [],
    supportedRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    defaultDuration: 5,
    supportedDurations: [5, 10],
    defaultResolution: "高清 720P",
    supportedResolutions: ["高清 720P", "高清 1080P"],
    supportsPromptRewrite: false,
    isMock: true
  },
  {
    id: "mock-video-reference",
    displayName: "视频 1.0 Reference",
    providerName: "AI SaaS",
    providerPresetName: "内置体验",
    modelName: "mock-video-reference",
    capabilityTags: ["VIDEO_GENERATION", "REFERENCE_IMAGE", "REFERENCE_VIDEO"],
    aliases: [],
    maxReferenceFiles: 4,
    acceptedReferenceTypes: ["image/*", "video/*"],
    supportedRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    defaultDuration: 5,
    supportedDurations: [5, 10],
    defaultResolution: "高清 720P",
    supportedResolutions: ["高清 720P", "高清 1080P"],
    supportsPromptRewrite: false,
    isMock: true
  }
];

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function apiFetch<TData>(path: string) {
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

export async function getExperienceChatModels() {
  try {
    const models = await apiFetch<ExperienceChatModel[]>("/ai/chat/models");

    return models.length > 0 ? models : [fallbackChatModel];
  } catch {
    return [fallbackChatModel];
  }
}

export async function getExperienceImageModels() {
  try {
    const models = await apiFetch<ExperienceImageModel[]>("/ai/image/models");

    return models.length > 0 ? models : fallbackImageModels;
  } catch {
    return fallbackImageModels;
  }
}

export async function getExperienceVideoModels() {
  try {
    const models = await apiFetch<ExperienceVideoModel[]>("/ai/video/models");

    return models.length > 0 ? models : fallbackVideoModels;
  } catch {
    return fallbackVideoModels;
  }
}
