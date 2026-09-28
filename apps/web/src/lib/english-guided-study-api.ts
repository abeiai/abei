import {
  isEnglishGuidedStudyMaterial,
  defaultEnglishStudyClosing,
  guidedStudySceneOf,
  parseEnglishGuidedStudyOperationProgress,
  parseEnglishGuidedStudyNarrationVoice,
  parseEnglishGuidedStudyReferenceMaterials,
  parseEnglishNarrationTimelineV2,
  parseEnglishReadAlongTrack,
  type EnglishGuidedStudyMaterial,
  type EnglishGuidedStudyAuthorIntroductionMode,
  type EnglishGuidedStudyReferenceMaterial,
  type EnglishStudyExplanationMode
} from "@/lib/english-guided-study-data";
import type { GuidedStudyScene } from "@/lib/english-guided-study-data";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

interface ApiEnglishGuidedStudyMaterial {
  id: string;
  userId: string;
  title: string;
  sourceType: "TEXT" | "IMAGE";
  sourceName: string | null;
  sourceText: string;
  levelStandardName: string;
  levelOptionLabel: string;
  aiLevel: string;
  summary: string;
  narration: string;
  audioUrl: string | null;
  audioTaskId: string | null;
  audioDurationSeconds: number;
  content: unknown;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiEnglishGuidedStudyMaterialHistoryPage {
  items: ApiEnglishGuidedStudyMaterial[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface EnglishGuidedStudyMaterialHistoryPage {
  items: EnglishGuidedStudyMaterial[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GenerateEnglishGuidedStudyMaterialInput {
  billingConfirmed?: boolean;
  billingRequestId?: string;
  billingRevision?: string;
  materialId?: string;
  title?: string;
  author?: string;
  authorIntroductionMode?: EnglishGuidedStudyAuthorIntroductionMode;
  sourceType: "TEXT" | "IMAGE";
  sourceName?: string | null;
  sourceText: string;
  referenceMaterials?: EnglishGuidedStudyReferenceMaterial[];
  levelStandardName: string;
  levelOptionLabel: string;
  aiLevel: string;
  explanationMode: EnglishStudyExplanationMode;
  modelInstanceId?: string;
  scene?: GuidedStudyScene;
  durationMinutes?: 1 | 3 | 5 | 8 | 10 | 15;
}

export interface ExtractEnglishGuidedStudyImageTextInput {
  imageName: string;
  imageMimeType: string;
  imageSizeBytes: number;
  imageDataUrl: string;
  modelInstanceId?: string;
  scene?: GuidedStudyScene;
}

export interface ExtractEnglishGuidedStudyImageTextResult {
  title: string | null;
  author: string | null;
  bodyText: string;
  ignoredContent: string[];
  imageName: string;
  aiTaskId: string;
  providerName: string | null;
  modelName: string | null;
}

export interface ExtractEnglishGuidedStudyReferenceDocumentsResult {
  documents: Array<EnglishGuidedStudyReferenceMaterial & { truncated: boolean }>;
  failures: Array<{
    name: string;
    message: string;
  }>;
}

export interface ExtractReadingGuideDocumentResult {
  document: EnglishGuidedStudyReferenceMaterial & { truncated: boolean };
}

export interface GenerateEnglishGuidedStudyAudioInput {
  billingConfirmed?: boolean;
  billingRequestId?: string;
  billingRevision?: string;
  speed?: number;
  voice?: string;
  voiceAssetId?: string;
}

export interface EnglishGuidedStudyBillingItem {
  code: "ENGLISH_GUIDED_STUDY_ASR" | "ENGLISH_GUIDED_STUDY_CONTENT" | "ENGLISH_GUIDED_STUDY_TTS";
  name: string;
  description: string;
  estimatedCredits: number;
}

export interface EnglishGuidedStudyBillingEstimate {
  availableCredits: number;
  enoughCredits: boolean;
  estimatedCredits: number;
  items: EnglishGuidedStudyBillingItem[];
  operation: "ENGLISH_GUIDED_STUDY_ASR" | "ENGLISH_GUIDED_STUDY_CONTENT" | "ENGLISH_GUIDED_STUDY_TTS";
  requestId: string;
  revision: string;
  title: string;
}

export interface UpdateEnglishGuidedStudyScriptInput {
  billingConfirmed?: boolean;
  billingRequestId?: string;
  billingRevision?: string;
  targetType: "INTRO" | "SENTENCE" | "SUMMARY";
  sentenceId?: string;
  originalScript: string;
  script: string;
}

export interface EstimateEnglishGuidedStudyReadAlongUploadInput {
  audioDurationMs: number;
  audioMimeType: string;
  audioName: string;
  audioSizeBytes: number;
}

export interface UpdateEnglishGuidedStudySourceInput {
  title?: string;
  author?: string;
  authorIntroductionMode: EnglishGuidedStudyAuthorIntroductionMode;
  sourceText: string;
}

export async function getUserEnglishGuidedStudyMaterials(scene?: GuidedStudyScene) {
  const query = scene ? `?scene=${encodeURIComponent(scene)}` : "";
  return apiFetch<ApiEnglishGuidedStudyMaterial[]>(`/api/english-guided-study/materials${query}`).then((items) =>
    items
      .map(toEnglishGuidedStudyMaterial)
      .filter((item): item is EnglishGuidedStudyMaterial => Boolean(item))
      .filter((item) => !scene || guidedStudySceneOf(item) === scene)
  );
}

export async function getUserEnglishGuidedStudyMaterialHistory(input: {
  page?: number;
  scene: GuidedStudyScene;
  search?: string;
}) {
  const query = new URLSearchParams({
    page: String(Math.max(1, Math.trunc(input.page ?? 1))),
    scene: input.scene
  });
  const search = input.search?.trim();

  if (search) {
    query.set("search", search);
  }

  const result = await apiFetch<ApiEnglishGuidedStudyMaterialHistoryPage>(
    `/api/english-guided-study/materials/history?${query.toString()}`
  );

  return {
    ...result,
    items: result.items
      .map(toEnglishGuidedStudyMaterial)
      .filter((item): item is EnglishGuidedStudyMaterial => Boolean(item))
      .filter((item) => guidedStudySceneOf(item) === input.scene)
  } satisfies EnglishGuidedStudyMaterialHistoryPage;
}

export async function getUserEnglishGuidedStudyMaterial(materialId: string) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}`
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("英文带学材料不存在");
  }

  return material;
}

export async function extractEnglishGuidedStudyImageText(input: ExtractEnglishGuidedStudyImageTextInput) {
  return apiFetch<ExtractEnglishGuidedStudyImageTextResult>("/api/english-guided-study/images/extract", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function extractEnglishGuidedStudyReferenceDocuments(files: File[], scene?: GuidedStudyScene) {
  const body = new FormData();

  files.forEach((file) => body.append("files", file));

  return apiFetch<ExtractEnglishGuidedStudyReferenceDocumentsResult>(
    `/api/english-guided-study/references/extract${scene ? `?scene=${encodeURIComponent(scene)}` : ""}`,
    {
      method: "POST",
      body
    }
  );
}

export function extractReadingGuideDocument(file: File) {
  const body = new FormData();
  body.append("file", file);

  return apiFetch<ExtractReadingGuideDocumentResult>(
    "/api/english-guided-study/documents/extract",
    { method: "POST", body }
  );
}

export async function generateEnglishGuidedStudyMaterial(input: GenerateEnglishGuidedStudyMaterialInput) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>("/api/english-guided-study/materials/generate", {
    method: "POST",
    body: JSON.stringify(input)
  });
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("英文带学材料生成失败");
  }

  return material;
}

export function estimateEnglishGuidedStudyMaterial(input: GenerateEnglishGuidedStudyMaterialInput) {
  return apiFetch<EnglishGuidedStudyBillingEstimate>(
    "/api/english-guided-study/materials/generate/estimate",
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export async function generateEnglishGuidedStudyAudio(
  materialId: string,
  input: GenerateEnglishGuidedStudyAudioInput = {}
) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/audio`,
    {
      method: "POST",
      body: JSON.stringify(englishGuidedStudyAudioRequest(input))
    }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("讲解音频生成失败");
  }

  return material;
}

export async function generateEnglishGuidedStudyPractice(
  materialId: string,
  input: { modelInstanceId?: string; questionCount?: 3 | 5 | 10 | 20 } = {}
) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/practice`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("练习生成失败");
  }

  return material;
}

export async function generateEnglishGuidedStudyReadAlong(
  materialId: string,
  input: GenerateEnglishGuidedStudyAudioInput = {}
) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/read-along`,
    {
      method: "POST",
      body: JSON.stringify(englishGuidedStudyAudioRequest(input))
    }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("跟读训练生成失败");
  }

  return material;
}

export function estimateEnglishGuidedStudyReadAlong(
  materialId: string,
  input: GenerateEnglishGuidedStudyAudioInput = {}
) {
  return apiFetch<EnglishGuidedStudyBillingEstimate>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/read-along/estimate`,
    {
      method: "POST",
      body: JSON.stringify(englishGuidedStudyAudioRequest(input))
    }
  );
}

export function estimateEnglishGuidedStudyReadAlongUpload(
  materialId: string,
  input: EstimateEnglishGuidedStudyReadAlongUploadInput
) {
  return apiFetch<EnglishGuidedStudyBillingEstimate>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/read-along/upload/estimate`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export async function uploadEnglishGuidedStudyReadAlong(
  materialId: string,
  file: File,
  billing: {
    billingRequestId: string;
    billingRevision: string;
  }
) {
  const body = new FormData();
  body.append("file", file);
  body.append("billingConfirmed", "true");
  body.append("billingRequestId", billing.billingRequestId);
  body.append("billingRevision", billing.billingRevision);
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/read-along/upload`,
    {
      method: "POST",
      body
    }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("跟读音频上传失败");
  }

  return material;
}

export function estimateEnglishGuidedStudyAudio(
  materialId: string,
  input: GenerateEnglishGuidedStudyAudioInput = {}
) {
  return apiFetch<EnglishGuidedStudyBillingEstimate>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/audio/estimate`,
    {
      method: "POST",
      body: JSON.stringify(englishGuidedStudyAudioRequest(input))
    }
  );
}

export async function updateEnglishGuidedStudyScript(materialId: string, input: UpdateEnglishGuidedStudyScriptInput) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/script`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("带学文稿保存失败");
  }

  return material;
}

export function estimateEnglishGuidedStudyScriptUpdate(
  materialId: string,
  input: UpdateEnglishGuidedStudyScriptInput
) {
  return apiFetch<EnglishGuidedStudyBillingEstimate>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/script/estimate`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export async function updateEnglishGuidedStudySource(
  materialId: string,
  input: UpdateEnglishGuidedStudySourceInput
) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/source`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("学习内容保存失败");
  }

  return material;
}

export async function pinEnglishGuidedStudyMaterial(materialId: string) {
  const record = await apiFetch<ApiEnglishGuidedStudyMaterial>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}/pin`,
    { method: "PATCH", body: "{}" }
  );
  const material = toEnglishGuidedStudyMaterial(record);

  if (!material) {
    throw new Error("带学材料置顶失败");
  }

  return material;
}

export function deleteEnglishGuidedStudyMaterial(materialId: string) {
  return apiFetch<Record<string, never>>(
    `/api/english-guided-study/materials/${encodeURIComponent(materialId)}`,
    { method: "DELETE" }
  );
}

async function apiFetch<TData>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

function englishGuidedStudyAudioRequest(input: GenerateEnglishGuidedStudyAudioInput) {
  return {
    modelAlias: "tts-default",
    voice: input.voice ?? "longanyang",
    ...(input.voiceAssetId ? { voiceAssetId: input.voiceAssetId } : {}),
    speed: input.speed ?? 1,
    format: "mp3",
    ...(input.billingConfirmed === undefined ? {} : { billingConfirmed: input.billingConfirmed }),
    ...(input.billingRequestId ? { billingRequestId: input.billingRequestId } : {}),
    ...(input.billingRevision ? { billingRevision: input.billingRevision } : {})
  };
}

function toEnglishGuidedStudyMaterial(
  record: ApiEnglishGuidedStudyMaterial
): EnglishGuidedStudyMaterial | null {
  if (!isEnglishGuidedStudyMaterial(record.content)) {
    return null;
  }

  return {
    ...record.content,
    id: record.id,
    title: record.title,
    contentTitle: Object.prototype.hasOwnProperty.call(record.content, "contentTitle")
      ? typeof record.content.contentTitle === "string" ? record.content.contentTitle : null
      : null,
    author: typeof record.content.author === "string" ? record.content.author : null,
    authorIntroductionMode:
      record.content.authorIntroductionMode === "DETAILED" ||
      record.content.authorIntroductionMode === "NONE"
        ? record.content.authorIntroductionMode
        : "BRIEF",
    scene: record.content.scene === "DAODU"
      ? "DAODU"
      : record.content.scene === "GUSHIWEN"
        ? "GUSHIWEN"
        : "ENGLISH",
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    sourceText: record.sourceText,
    referenceMaterials: parseEnglishGuidedStudyReferenceMaterials(record.content.referenceMaterials),
    level: {
      standardName: record.levelStandardName,
      optionLabel: record.levelOptionLabel,
      aiLevel: record.aiLevel
    },
    summary: record.summary,
    closing: record.content.scene === "DAODU"
      ? ""
      : typeof record.content.closing === "string" && record.content.closing.trim()
        ? record.content.closing
        : defaultEnglishStudyClosing,
    durationMinutes: typeof record.content.durationMinutes === "number"
      ? record.content.durationMinutes
      : undefined,
    narration: record.narration,
    audioUrl: record.audioUrl,
    audioTaskId: record.audioTaskId,
    audioDurationSeconds: record.audioDurationSeconds,
    audioTimeline: Array.isArray(record.content.audioTimeline) ? record.content.audioTimeline : [],
    narrationTimelineV2: parseEnglishNarrationTimelineV2(record.content.narrationTimelineV2),
    narrationVoice: parseEnglishGuidedStudyNarrationVoice(record.content.narrationVoice),
    readAlong: parseEnglishReadAlongTrack(record.content.readAlong),
    contentGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      record.content.contentGenerationProgress,
      "CONTENT"
    ),
    practiceGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      record.content.practiceGenerationProgress,
      "PRACTICE"
    ),
    audioGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      record.content.audioGenerationProgress,
      "AUDIO"
    ),
    readAlongGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      record.content.readAlongGenerationProgress,
      "READ_ALOUD"
    ),
    pinnedAt: record.pinnedAt,
    createdAt: record.createdAt
  } satisfies EnglishGuidedStudyMaterial;
}
