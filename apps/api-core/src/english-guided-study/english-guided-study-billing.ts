import { createHash } from "node:crypto";

import type { EnglishStudyExplanationMode } from "./english-guided-study-segmentation.js";

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

export function englishGuidedStudyMaterialBillingItems(
  sourceText: string,
  scene: "ENGLISH" | "GUSHIWEN" | "DAODU" = "ENGLISH"
): EnglishGuidedStudyBillingItem[] {
  const characterCount = sourceText.trim().length;
  const estimatedCredits =
    envNonNegativeInt("ENGLISH_GUIDED_STUDY_CONTENT_BASE_CREDITS", 30) +
    Math.ceil(characterCount / 1_000) *
      envNonNegativeInt("ENGLISH_GUIDED_STUDY_CONTENT_CREDITS_PER_1000_CHARS", 6);

  return [
    {
      code: "ENGLISH_GUIDED_STUDY_CONTENT",
      name: scene === "DAODU"
        ? "开卷导读文稿生成"
        : scene === "GUSHIWEN"
          ? "古诗文带学讲稿生成"
          : "英文带学讲稿生成",
      description: scene === "DAODU"
        ? `分析 ${characterCount.toLocaleString("zh-CN")} 个阅读字符，生成适配学段年级的整体导读文稿。`
        : scene === "GUSHIWEN"
          ? `分析 ${characterCount.toLocaleString("zh-CN")} 个原文字符，生成适配学段年级的古诗文带学文稿。`
          : `分析 ${characterCount.toLocaleString("zh-CN")} 个原文字符，生成适配英语水平的带学文稿。`,
      estimatedCredits
    }
  ];
}

export function englishGuidedStudyAudioBillingItems(
  narrationTexts: string | readonly string[],
  scene: "ENGLISH" | "GUSHIWEN" | "DAODU" = "ENGLISH"
): EnglishGuidedStudyBillingItem[] {
  const characterCount = ttsCharacterCount(narrationTexts);
  const estimatedCredits =
    envNonNegativeInt("ENGLISH_GUIDED_STUDY_TTS_BASE_CREDITS", 20) +
    Math.ceil(characterCount / 1_000) *
      envNonNegativeInt("ENGLISH_GUIDED_STUDY_TTS_CREDITS_PER_1000_CHARS", 8);

  return [
    {
      code: "ENGLISH_GUIDED_STUDY_TTS",
      name: scene === "DAODU"
        ? "开卷导读讲解音频"
        : scene === "GUSHIWEN"
          ? "古诗文带学语音讲解"
          : "英文带学语音讲解",
      description: scene === "DAODU"
        ? `按 ${characterCount.toLocaleString("zh-CN")} 个实际合成字符分段生成导读讲解音频。`
        : `整理讲解节点，并按 ${characterCount.toLocaleString("zh-CN")} 个实际合成字符生成逐节点语音。`,
      estimatedCredits
    }
  ];
}

export function englishGuidedStudyReadAlongBillingItems(sourceTexts: readonly string[]): EnglishGuidedStudyBillingItem[] {
  const characterCount = ttsCharacterCount(sourceTexts);
  const estimatedCredits =
    envNonNegativeInt("ENGLISH_GUIDED_STUDY_TTS_BASE_CREDITS", 20) +
    Math.ceil(characterCount / 1_000) *
      envNonNegativeInt("ENGLISH_GUIDED_STUDY_TTS_CREDITS_PER_1000_CHARS", 8);

  return [
    {
      code: "ENGLISH_GUIDED_STUDY_TTS",
      name: "全文诵读音频",
      description: `按标题、作者和正文共 ${characterCount.toLocaleString("zh-CN")} 个实际合成字符逐段生成全文诵读，并生成同步字幕。`,
      estimatedCredits
    }
  ];
}

export function englishGuidedStudyReadAlongUploadBillingItems(durationMs: number): EnglishGuidedStudyBillingItem[] {
  const billableMinutes = readAlongUploadBillableMinutes(durationMs);
  const durationSeconds = Math.max(1, Math.ceil(durationMs / 1_000));
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const durationLabel = [
    minutes > 0 ? `${minutes} 分` : "",
    seconds > 0 ? `${seconds} 秒` : ""
  ].filter(Boolean).join(" ");

  return [
    {
      code: "ENGLISH_GUIDED_STUDY_ASR",
      name: "上传音频识别与时间轴生成",
      description: `音频时长 ${durationLabel}，按 ${billableMinutes} 分钟计费，每分钟 2 点。`,
      estimatedCredits: billableMinutes * 2
    }
  ];
}

export function englishGuidedStudyReadAlongUploadBillingRevision(input: {
  audioDurationMs: number;
  audioMimeType: string;
  audioName: string;
  audioSizeBytes: number;
  billingRequestId: string;
  materialId: string;
}) {
  return billingRevision({
    billableMinutes: readAlongUploadBillableMinutes(input.audioDurationMs),
    billingRequestId: input.billingRequestId.trim(),
    creditsPerMinute: 2,
    materialId: input.materialId.trim()
  });
}

export function englishGuidedStudyMaterialBillingRevision(input: {
  aiLevel: string;
  author?: string | null;
  authorIntroductionMode?: "BRIEF" | "DETAILED" | "NONE";
  billingRequestId?: string | null;
  explanationMode: EnglishStudyExplanationMode;
  levelOptionLabel: string;
  levelStandardName: string;
  materialId?: string | null;
  modelInstanceId?: string | null;
  referenceMaterials?: Array<{
    id?: string | null;
    kind?: string | null;
    name?: string | null;
    content?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }> | null;
  sourceName?: string | null;
  sourceText: string;
  sourceType?: "TEXT" | "IMAGE";
  scene?: "ENGLISH" | "GUSHIWEN" | "DAODU";
  durationMinutes?: 1 | 3 | 5 | 8 | 10 | 15;
  title?: string | null;
}) {
  return billingRevision({
    aiLevel: input.aiLevel.trim(),
    author: input.author?.trim() || null,
    authorIntroductionMode: input.authorIntroductionMode ?? "BRIEF",
    billingRequestId: input.billingRequestId?.trim() || null,
    explanationMode: input.explanationMode,
    durationMinutes: input.durationMinutes ?? null,
    levelOptionLabel: input.levelOptionLabel.trim(),
    levelStandardName: input.levelStandardName.trim(),
    materialId: input.materialId?.trim() || null,
    modelInstanceId: input.modelInstanceId?.trim() || null,
    referenceMaterials: (input.referenceMaterials ?? []).map((item) => ({
      id: item.id?.trim() || null,
      kind: item.kind?.trim() || "TEXT",
      name: item.name?.trim() || null,
      content: item.content?.trim() || null,
      mimeType: item.mimeType?.trim() || null,
      sizeBytes: item.sizeBytes ?? null
    })),
    sourceName: input.sourceName?.trim() || null,
    sourceText: input.sourceText.trim(),
    sourceType: input.sourceType ?? "TEXT",
    scene: input.scene ?? "ENGLISH",
    title: input.title?.trim() || null
  });
}

export function englishGuidedStudyAudioBillingRevision(input: {
  billingRequestId?: string | null;
  format?: string | null;
  materialId: string;
  modelAlias?: string | null;
  narration: string | readonly string[];
  pitch?: number | null;
  sampleRate?: number | null;
  speed?: number | null;
  voice?: string | null;
  voiceAssetId?: string | null;
  volume?: number | null;
}) {
  return billingRevision({
    billingRequestId: input.billingRequestId?.trim() || null,
    format: input.format?.trim() || "mp3",
    materialId: input.materialId.trim(),
    modelAlias: input.modelAlias?.trim() || "tts-default",
    narration: typeof input.narration === "string"
      ? input.narration.trim()
      : input.narration,
    pitch: input.pitch ?? null,
    sampleRate: input.sampleRate ?? null,
    speed: input.speed ?? 1,
    voice: input.voice?.trim() || "longanyang",
    voiceAssetId: input.voiceAssetId?.trim() || null,
    volume: input.volume ?? null
  });
}

export function englishGuidedStudyReadAlongBillingRevision(
  input: Parameters<typeof englishGuidedStudyAudioBillingRevision>[0]
) {
  return englishGuidedStudyAudioBillingRevision(input);
}

function billingRevision(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ttsCharacterCount(texts: string | readonly string[]) {
  return (Array.isArray(texts) ? texts : [texts]).reduce(
    (total, text) => total + text.length,
    0
  );
}

function readAlongUploadBillableMinutes(durationMs: number) {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

function envNonNegativeInt(name: string, fallback: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.ceil(value);
}
