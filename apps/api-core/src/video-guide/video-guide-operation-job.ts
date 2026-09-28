import type {
  VideoGuideOperation,
  VideoGuideOperationProgress
} from "./video-guide-operation-progress.js";

export type VideoGuideOperationJobKey =
  | "subtitleGenerationJob"
  | "narrationGenerationJob"
  | "narrationTtsGenerationJob"
  | "practiceGenerationJob";

export interface VideoGuideOperationJob<TInput = unknown> {
  version: 1;
  jobId: string;
  attemptId: string | null;
  operation: VideoGuideOperation;
  operationKey: string;
  estimatedCredits: number;
  input: TInput;
  createdAt: string;
}

export function createVideoGuideOperationJob<TInput>(input: {
  operation: VideoGuideOperation;
  jobId: string;
  operationKey: string;
  estimatedCredits: number;
  input: TInput;
  now: string;
}): VideoGuideOperationJob<TInput> {
  return {
    version: 1,
    jobId: input.jobId,
    attemptId: null,
    operation: input.operation,
    operationKey: input.operationKey,
    estimatedCredits: Math.max(0, Math.floor(input.estimatedCredits)),
    input: input.input,
    createdAt: input.now
  };
}

export function mergeVideoGuideOperationJobContent(
  contentValue: unknown,
  key: VideoGuideOperationJobKey,
  job: VideoGuideOperationJob
): Record<string, unknown> {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    [key]: job
  };
}

export function videoGuideOperationJobFromValue<TInput = unknown>(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    typeof value.jobId !== "string" ||
    !value.jobId ||
    !isOperation(value.operation) ||
    typeof value.operationKey !== "string" ||
    !value.operationKey ||
    typeof value.estimatedCredits !== "number" ||
    !Number.isFinite(value.estimatedCredits) ||
    typeof value.createdAt !== "string" ||
    !(value.attemptId === undefined || value.attemptId === null || typeof value.attemptId === "string") ||
    !("input" in value)
  ) {
    return null;
  }

  return {
    ...value,
    attemptId: typeof value.attemptId === "string" ? value.attemptId : null
  } as unknown as VideoGuideOperationJob<TInput>;
}

export function leaseVideoGuideOperationJob<TInput>(
  job: VideoGuideOperationJob<TInput>,
  attemptId: string
): VideoGuideOperationJob<TInput> {
  return {
    ...job,
    attemptId
  };
}

export function videoGuideOperationAttemptMatches(
  jobValue: unknown,
  jobId: string,
  attemptId: string
) {
  const job = videoGuideOperationJobFromValue(jobValue);

  return Boolean(job && job.jobId === jobId && job.attemptId === attemptId);
}

export function shouldRecoverVideoGuideOperation(
  progress: VideoGuideOperationProgress,
  now: string,
  staleAfterMs: number
) {
  if (progress.status === "QUEUED") {
    return true;
  }

  if (progress.status !== "RUNNING") {
    return false;
  }

  const updatedAt = Date.parse(progress.updatedAt);
  const nowTime = Date.parse(now);

  return (
    Number.isFinite(updatedAt) &&
    Number.isFinite(nowTime) &&
    nowTime - updatedAt >= Math.max(1, staleAfterMs)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperation(value: unknown): value is VideoGuideOperation {
  return (
    value === "SUBTITLE" ||
    value === "NARRATION" ||
    value === "NARRATION_TTS" ||
    value === "PRACTICE"
  );
}
