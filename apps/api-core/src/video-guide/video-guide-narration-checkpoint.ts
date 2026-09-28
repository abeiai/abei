import { createHash } from "node:crypto";

import type {
  VideoGuideNarrationDraftChunk,
  VideoGuideNarrationDraftNode
} from "./video-guide-generation-state.js";

export interface NarrationGenerationMetadata {
  modelName: string | null;
  providerName: string | null;
  taskId: string;
}

export interface NarrationGenerationCheckpoint {
  version: 1;
  sourceHash: string;
  batchSize: number;
  totalBatches: number;
  nodes: VideoGuideNarrationDraftNode[];
  metadata: NarrationGenerationMetadata | null;
  updatedAt: string;
}

export interface NarrationGenerationSourceCue {
  sentenceId?: string;
  text: string;
  timeRange?: string;
  startSeconds?: number;
  endSeconds?: number;
}

export function narrationGenerationSourceHash(
  mediaTitle: string,
  cues: NarrationGenerationSourceCue[]
) {
  const payload = {
    mediaTitle,
    cues: cues.map((cue) => ({
      sentenceId: cue.sentenceId ?? null,
      text: cue.text,
      timeRange: cue.timeRange ?? null,
      startSeconds: cue.startSeconds ?? null,
      endSeconds: cue.endSeconds ?? null
    }))
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function narrationGenerationCheckpointFromContent(
  contentValue: unknown,
  sourceHash: string
): NarrationGenerationCheckpoint | null {
  if (!isRecord(contentValue)) {
    return null;
  }

  const checkpoint = contentValue.narrationGenerationCheckpoint;

  return isNarrationGenerationCheckpoint(checkpoint) && checkpoint.sourceHash === sourceHash
    ? checkpoint
    : null;
}

export function mergeNarrationGenerationCheckpoint(
  checkpoint: NarrationGenerationCheckpoint | null,
  input: {
    sourceHash: string;
    batchSize: number;
    totalBatches: number;
    nodes: VideoGuideNarrationDraftNode[];
    metadata?: NarrationGenerationMetadata;
    now: string;
  }
): NarrationGenerationCheckpoint {
  assertValidCheckpointMergeInput(input);

  const reusable =
    checkpoint?.sourceHash === input.sourceHash &&
    checkpoint.batchSize === input.batchSize &&
    checkpoint.totalBatches === input.totalBatches
      ? checkpoint
      : null;
  const nodesById = new Map((reusable?.nodes ?? []).map((node) => [node.id, node]));

  input.nodes.forEach((node) => nodesById.set(node.id, node));

  return {
    version: 1,
    sourceHash: input.sourceHash,
    batchSize: input.batchSize,
    totalBatches: input.totalBatches,
    nodes: [...nodesById.values()],
    metadata: reusable?.metadata ?? input.metadata ?? null,
    updatedAt: input.now
  };
}

function assertValidCheckpointMergeInput(input: {
  sourceHash: string;
  batchSize: number;
  totalBatches: number;
  nodes: VideoGuideNarrationDraftNode[];
  metadata?: NarrationGenerationMetadata;
  now: string;
}) {
  if (input.batchSize !== 4) {
    throw new Error("导学文案检查点批次大小必须固定为 4");
  }

  if (!isPositiveInteger(input.totalBatches)) {
    throw new Error("导学文案检查点总批次数无效");
  }

  if (!isValidCheckpointNodes(input.nodes)) {
    throw new Error("导学文案检查点节点结构无效");
  }

  if (!input.sourceHash || !input.now || (input.metadata && !isNarrationGenerationMetadata(input.metadata))) {
    throw new Error("导学文案检查点元数据无效");
  }
}

export function mergeNarrationGenerationCheckpointContent(
  contentValue: unknown,
  checkpoint: NarrationGenerationCheckpoint
) {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    narrationGenerationCheckpoint: checkpoint
  };
}

function isNarrationGenerationCheckpoint(value: unknown): value is NarrationGenerationCheckpoint {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.sourceHash === "string" &&
    value.sourceHash.length > 0 &&
    value.batchSize === 4 &&
    isPositiveInteger(value.totalBatches) &&
    Array.isArray(value.nodes) &&
    isValidCheckpointNodes(value.nodes) &&
    (value.metadata === null || isNarrationGenerationMetadata(value.metadata)) &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0
  );
}

function isNarrationDraftNode(value: unknown): value is VideoGuideNarrationDraftNode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.type === "INTRO" || value.type === "SENTENCE" || value.type === "SUMMARY") &&
    typeof value.title === "string" &&
    typeof value.script === "string" &&
    value.script.trim().length > 0 &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isNarrationDraftChunk)
  );
}

function isNarrationDraftChunk(value: unknown): value is VideoGuideNarrationDraftChunk {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.type === "string" &&
    value.type.length > 0 &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    (value.overlay === undefined || value.overlay === null || isNarrationDraftOverlay(value.overlay))
  );
}

function isNarrationDraftOverlay(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    (value.subText === undefined || typeof value.subText === "string")
  );
}

function isValidCheckpointNodes(nodes: unknown[]) {
  const ids = new Set<string>();

  for (const node of nodes) {
    if (!isNarrationDraftNode(node) || !node.id.trim() || ids.has(node.id)) {
      return false;
    }

    ids.add(node.id);

    if (node.type === "INTRO" && node.id !== "intro") {
      return false;
    }

    if (node.type === "SUMMARY" && node.id !== "summary") {
      return false;
    }

    if (
      node.type === "SENTENCE" &&
      (typeof node.sentenceId !== "string" || !node.sentenceId.trim() || node.id !== node.sentenceId)
    ) {
      return false;
    }
  }

  return true;
}

function isNarrationGenerationMetadata(value: unknown): value is NarrationGenerationMetadata {
  return (
    isRecord(value) &&
    (typeof value.modelName === "string" || value.modelName === null) &&
    (typeof value.providerName === "string" || value.providerName === null) &&
    typeof value.taskId === "string" &&
    value.taskId.length > 0
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
