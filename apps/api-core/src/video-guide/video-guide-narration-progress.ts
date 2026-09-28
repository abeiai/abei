import { persistedVideoGuideAudioFromPayload } from "../audio/video-guide-narration-storage.js";

export type NarrationAudioProgressStatus =
  | "PENDING"
  | "GENERATING"
  | "UPLOADING"
  | "VERIFYING"
  | "SUCCEEDED"
  | "FAILED";

export interface NarrationProgressDraft {
  id: string;
  type: "INTRO" | "SENTENCE" | "SUMMARY";
  sentenceId?: string;
}

export interface NarrationAudioProgressNode {
  nodeId: string;
  sentenceId: string | null;
  type: "INTRO" | "SENTENCE" | "SUMMARY";
  status: NarrationAudioProgressStatus;
  audioTaskId: string | null;
  audioAssetId: string | null;
  objectKey: string | null;
  audioUrl: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface NarrationAudioProgress {
  version: 1;
  generationId: string;
  total: number;
  completed: number;
  failed: number;
  currentNodeId: string | null;
  updatedAt: string;
  nodes: NarrationAudioProgressNode[];
}

export interface NarrationAudioProgressPatch {
  status: Exclude<NarrationAudioProgressStatus, "PENDING">;
  audioTaskId?: string | null;
  audioAssetId?: string | null;
  objectKey?: string | null;
  audioUrl?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface VerifiedNarrationAudio {
  audioTaskId: string;
  audioAssetId: string;
  url: string;
  objectKey: string;
  mimeType: "audio/mpeg";
  sizeBytes: number;
  sha256: string;
  durationMs?: number;
}

export class VideoGuideNarrationTaskError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "VideoGuideNarrationTaskError";
  }
}

const activeStatuses = new Set<NarrationAudioProgressStatus>(["GENERATING", "UPLOADING", "VERIFYING"]);
const legalTransitions = new Map<NarrationAudioProgressStatus, Set<NarrationAudioProgressStatus>>([
  ["PENDING", new Set(["GENERATING", "SUCCEEDED", "FAILED"])],
  ["GENERATING", new Set(["GENERATING", "UPLOADING", "FAILED"])],
  ["UPLOADING", new Set(["GENERATING", "UPLOADING", "VERIFYING", "FAILED"])],
  ["VERIFYING", new Set(["GENERATING", "VERIFYING", "SUCCEEDED", "FAILED"])],
  ["SUCCEEDED", new Set(["SUCCEEDED"])],
  ["FAILED", new Set(["FAILED"])]
]);

export function createNarrationAudioProgress(
  generationId: string,
  drafts: NarrationProgressDraft[],
  now: string
): NarrationAudioProgress {
  const normalizedGenerationId = generationId.trim();

  if (!normalizedGenerationId) {
    throw new VideoGuideNarrationTaskError("INVALID_GENERATION_ID", "导学语音生成批次标识不能为空");
  }

  const nodeIds = new Set<string>();
  const nodes = drafts.map((draft) => {
    const nodeId = draft.id.trim();

    if (!nodeId || nodeIds.has(nodeId)) {
      throw new VideoGuideNarrationTaskError("INVALID_NARRATION_NODE", "导学语音节点标识为空或重复");
    }

    nodeIds.add(nodeId);

    return {
      nodeId,
      sentenceId: draft.sentenceId?.trim() || null,
      type: draft.type,
      status: "PENDING" as const,
      audioTaskId: null,
      audioAssetId: null,
      objectKey: null,
      audioUrl: null,
      sizeBytes: null,
      sha256: null,
      durationMs: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: now
    };
  });

  return summarizeProgress({
    version: 1,
    generationId: normalizedGenerationId,
    total: nodes.length,
    completed: 0,
    failed: 0,
    currentNodeId: null,
    updatedAt: now,
    nodes
  });
}

export function mergeNarrationAudioProgressContent(
  contentValue: unknown,
  progress: NarrationAudioProgress
): Record<string, unknown> {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    narrationAudioProgress: progress
  };
}

export function mergeNarrationGenerationLeaseContent(
  contentValue: unknown,
  generationId: string
): Record<string, unknown> {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    narrationGenerationId: generationId
  };
}

export function narrationGenerationLeaseMatches(contentValue: unknown, generationId: string) {
  return isRecord(contentValue) && contentValue.narrationGenerationId === generationId;
}

export function updateNarrationAudioProgress(
  progress: NarrationAudioProgress,
  nodeId: string,
  patch: NarrationAudioProgressPatch,
  now: string
): NarrationAudioProgress {
  let matched = false;
  const nodes = progress.nodes.map((node) => {
    if (node.nodeId !== nodeId) {
      return node;
    }

    matched = true;
    assertLegalTransition(node.status, patch.status);

    return {
      ...node,
      ...definedPatch(patch),
      updatedAt: now
    };
  });

  if (!matched) {
    throw new VideoGuideNarrationTaskError("NARRATION_NODE_NOT_FOUND", "没有找到对应的导学语音节点");
  }

  return summarizeProgress({
    ...progress,
    updatedAt: now,
    nodes
  });
}

export function verifiedNarrationAudioFromTask(
  taskValue: unknown,
  expectedPrefix: string,
  expectedPublicBaseUrl: string
): VerifiedNarrationAudio {
  const task = isRecord(taskValue) ? taskValue : null;

  if (!task) {
    throw new VideoGuideNarrationTaskError("AUDIO_TASK_INVALID", "导学语音任务结果无效");
  }

  const taskId = stringValue(task.id);
  const errorCode = stringValue(task.errorCode) || "AUDIO_TASK_FAILED";
  const errorMessage = stringValue(task.errorMessage) || "导学语音任务未成功完成";

  if (task.status !== "SUCCEEDED") {
    throw new VideoGuideNarrationTaskError(errorCode, errorMessage);
  }

  const providerPayload = isRecord(task.providerPayload) ? task.providerPayload : {};
  const persisted = persistedVideoGuideAudioFromPayload(providerPayload);
  const asset = isRecord(task.outputAudioAsset) ? task.outputAudioAsset : null;

  if (!taskId || !persisted || !asset) {
    throw new VideoGuideNarrationTaskError("R2_VERIFY_FAILED", "导学语音缺少已校验的对象存储资产");
  }

  const assetId = stringValue(asset.id);
  const objectKey = stringValue(asset.objectKey);
  const url = stringValue(asset.url);
  const mimeType = stringValue(asset.mimeType).toLowerCase();
  const sizeBytes = positiveNumber(asset.sizeBytes);
  const normalizedPrefix = expectedPrefix.trim().replace(/^\/+/, "");
  const normalizedPublicBaseUrl = expectedPublicBaseUrl.trim().replace(/\/+$/, "");

  if (
    !assetId ||
    asset.storageProvider !== "S3" ||
    !normalizedPrefix ||
    !objectKey.startsWith(normalizedPrefix) ||
    !normalizedPublicBaseUrl ||
    !url.startsWith(`${normalizedPublicBaseUrl}/`) ||
    mimeType !== "audio/mpeg" ||
    sizeBytes <= 0 ||
    objectKey !== persisted.objectKey ||
    url !== persisted.url ||
    sizeBytes !== persisted.sizeBytes ||
    mimeType !== persisted.mimeType
  ) {
    throw new VideoGuideNarrationTaskError("R2_VERIFY_FAILED", "导学语音对象存储资产校验失败");
  }

  const durationMs =
    positiveNumber(asset.durationMs) ||
    positiveNumber(providerPayload.durationMs) ||
    positiveNumber(providerPayload.audioDurationMs);

  return {
    audioTaskId: taskId,
    audioAssetId: assetId,
    url,
    objectKey,
    mimeType: "audio/mpeg",
    sizeBytes,
    sha256: persisted.sha256,
    ...(durationMs > 0 ? { durationMs } : {})
  };
}

function definedPatch(patch: NarrationAudioProgressPatch) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as NarrationAudioProgressPatch;
}

function assertLegalTransition(from: NarrationAudioProgressStatus, to: NarrationAudioProgressStatus) {
  if (!legalTransitions.get(from)?.has(to)) {
    throw new VideoGuideNarrationTaskError(
      "INVALID_NARRATION_STATUS_TRANSITION",
      `导学语音状态不能从 ${from} 变更为 ${to}`
    );
  }
}

function summarizeProgress(progress: NarrationAudioProgress): NarrationAudioProgress {
  return {
    ...progress,
    total: progress.nodes.length,
    completed: progress.nodes.filter((node) => node.status === "SUCCEEDED").length,
    failed: progress.nodes.filter((node) => node.status === "FAILED").length,
    currentNodeId: progress.nodes.find((node) => activeStatuses.has(node.status))?.nodeId ?? null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
