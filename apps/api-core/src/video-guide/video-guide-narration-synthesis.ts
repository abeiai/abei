import {
  VideoGuideNarrationTaskError,
  type NarrationAudioProgressPatch,
  type NarrationProgressDraft,
  type VerifiedNarrationAudio
} from "./video-guide-narration-progress.js";
import { mapWithConcurrency } from "./video-guide-narration-batches.js";

interface NarrationPersistenceStatusEvent {
  stage: "UPLOADING" | "VERIFYING";
  audioTaskId: string;
}

export interface NarrationSynthesisProgressEvent extends NarrationAudioProgressPatch {
  nodeId: string;
}

interface SynthesizeVideoGuideNarrationTimelineInput<TNode extends NarrationProgressDraft> {
  nodes: TNode[];
  concurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  beforeSynthesize?: (node: TNode) => Promise<void>;
  completed?: ReadonlyMap<string, VerifiedNarrationAudio>;
  recoverCompleted?: (node: TNode) => Promise<VerifiedNarrationAudio | null>;
  synthesize: (
    node: TNode,
    onPersistenceStatus: (event: NarrationPersistenceStatusEvent) => Promise<void>
  ) => Promise<unknown>;
  verifyTask: (task: unknown) => VerifiedNarrationAudio;
  onProgress: (event: NarrationSynthesisProgressEvent) => Promise<void>;
  onRetry?: (event: {
    nodeId: string;
    attempt: number;
    maxAttempts: number;
    errorCode: string;
    errorMessage: string;
  }) => Promise<void>;
}

export type SynthesizedVideoGuideNarrationNode<TNode> = TNode & {
  audioTaskId: string;
  audioAssetId: string;
  audioUrl: string;
  audioObjectKey: string;
  audioSizeBytes: number;
  audioSha256: string;
  durationMs?: number;
};

export function resolveVideoGuideNarrationVoiceSelection(value: string) {
  const selection = value.trim();

  if (selection.startsWith("voice:")) {
    return { voiceAssetId: selection.slice("voice:".length) };
  }

  return {
    voice: selection.startsWith("system:") ? selection.slice("system:".length) : selection
  };
}

export async function synthesizeVideoGuideNarrationTimeline<TNode extends NarrationProgressDraft>(
  input: SynthesizeVideoGuideNarrationTimelineInput<TNode>
): Promise<Array<SynthesizedVideoGuideNarrationNode<TNode>>> {
  const maxAttempts = boundedInteger(input.maxAttempts, 3, 1, 5);
  const retryDelayMs = boundedInteger(input.retryDelayMs, 1_000, 0, 30_000);
  let progressQueue = Promise.resolve();
  const reportProgress = (event: NarrationSynthesisProgressEvent) => {
    const pending = progressQueue.then(() => input.onProgress(event));

    progressQueue = pending.catch(() => undefined);
    return pending;
  };

  return mapWithConcurrency(input.nodes, input.concurrency ?? 1, async (node) => {
    const completed = input.completed?.get(node.id) ?? (await input.recoverCompleted?.(node));

    if (completed) {
      if (!input.completed?.has(node.id)) {
        await reportProgress(successProgressEvent(node.id, completed));
      }

      return synthesizedNode(node, completed);
    }

    let audioTaskId: string | null = null;
    let verified: VerifiedNarrationAudio | null = null;

    await reportProgress({
      nodeId: node.id,
      status: "GENERATING"
    });

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await input.beforeSynthesize?.(node);
          const task = await input.synthesize(node, async (event) => {
            audioTaskId = event.audioTaskId;
            await reportProgress({
              nodeId: node.id,
              status: event.stage,
              audioTaskId: event.audioTaskId
            });
          });
          audioTaskId = taskIdFromValue(task) || audioTaskId;
          verified = input.verifyTask(task);
          break;
        } catch (error) {
          if (attempt >= maxAttempts || !isRetryableNarrationFailure(error)) {
            throw error;
          }

          const failure = narrationFailure(error);

          await reportProgress({
            nodeId: node.id,
            status: "GENERATING",
            audioTaskId: null,
            errorCode: null,
            errorMessage: null
          });
          await input.onRetry?.({
            nodeId: node.id,
            attempt,
            maxAttempts,
            errorCode: failure.code,
            errorMessage: failure.message
          });
          await delay(resolveNarrationRetryDelayMs(error, attempt, retryDelayMs));
        }
      }
    } catch (error) {
      const failure = narrationFailure(error);

      await reportProgress({
          nodeId: node.id,
          status: "FAILED",
          audioTaskId,
          errorCode: failure.code,
          errorMessage: failure.message
        })
        .catch(() => undefined);

      throw error;
    }

    if (!verified) {
      throw new VideoGuideNarrationTaskError("AUDIO_TASK_INVALID", "导学语音任务结果无效");
    }

    await reportProgress(successProgressEvent(node.id, verified));
    return synthesizedNode(node, verified);
  });
}

function successProgressEvent(
  nodeId: string,
  verified: VerifiedNarrationAudio
): NarrationSynthesisProgressEvent {
  return {
    nodeId,
    status: "SUCCEEDED",
    audioTaskId: verified.audioTaskId,
    audioAssetId: verified.audioAssetId,
    objectKey: verified.objectKey,
    audioUrl: verified.url,
    sizeBytes: verified.sizeBytes,
    sha256: verified.sha256,
    durationMs: verified.durationMs ?? null,
    errorCode: null,
    errorMessage: null
  };
}

function synthesizedNode<TNode extends NarrationProgressDraft>(
  node: TNode,
  verified: VerifiedNarrationAudio
): SynthesizedVideoGuideNarrationNode<TNode> {
  return {
    ...node,
    audioTaskId: verified.audioTaskId,
    audioAssetId: verified.audioAssetId,
    audioUrl: verified.url,
    audioObjectKey: verified.objectKey,
    audioSizeBytes: verified.sizeBytes,
    audioSha256: verified.sha256,
    ...(verified.durationMs ? { durationMs: verified.durationMs } : {})
  };
}

function narrationFailure(error: unknown) {
  if (error instanceof VideoGuideNarrationTaskError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  if (isRecord(error)) {
    return {
      code: stringValue(error.code) || "NARRATION_AUDIO_FAILED",
      message: stringValue(error.message) || "导学语音生成失败，请稍后重试"
    };
  }

  return {
    code: "NARRATION_AUDIO_FAILED",
    message: "导学语音生成失败，请稍后重试"
  };
}

function taskIdFromValue(value: unknown) {
  return isRecord(value) ? stringValue(value.id) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRetryableNarrationFailure(error: unknown) {
  const failure = narrationFailure(error);
  const code = failure.code.toUpperCase();
  const message = failure.message.toUpperCase();

  return (
    code === "AUDIO_PROVIDER_FAILED" ||
    code === "PROVIDER_TIMEOUT" ||
    code === "PROVIDER_NETWORK_ERROR" ||
    code === "R2_UPLOAD_FAILED" ||
    code === "R2_VERIFY_FAILED" ||
    code === "TTS_OUTPUT_DOWNLOAD_FAILED" ||
    code.includes("HTTP_429") ||
    code.includes("HTTP_500") ||
    code.includes("HTTP_502") ||
    code.includes("HTTP_503") ||
    code.includes("THROTTL") ||
    code.includes("RATE_LIMIT") ||
    isNarrationRateLimitFailure(error) ||
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|SOCKET HANG UP|NETWORK|TIMEOUT|超时|连接重置/.test(
      message
    )
  );
}

export function resolveNarrationRetryDelayMs(
  error: unknown,
  attempt: number,
  baseDelayMs: number
) {
  if (baseDelayMs <= 0) {
    return 0;
  }

  const initialDelayMs = isNarrationRateLimitFailure(error)
    ? Math.max(baseDelayMs, 20_000)
    : baseDelayMs;

  return Math.min(60_000, initialDelayMs * 2 ** Math.max(0, attempt - 1));
}

function isNarrationRateLimitFailure(error: unknown) {
  const failure = narrationFailure(error);
  const code = failure.code.toUpperCase();
  const message = failure.message.toUpperCase();

  return (
    code === "MINIMAX_STATUS_1002" ||
    code.includes("RATE_LIMIT") ||
    code.includes("THROTTL") ||
    /RATE[ _-]?LIMIT|EXCEEDED\s*\(RPM\)|\bRPM\b/.test(message)
  );
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.round(parsed)))
    : fallback;
}

function delay(milliseconds: number) {
  return milliseconds > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}
