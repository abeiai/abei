export type VideoGuideOperation = "SUBTITLE" | "NARRATION" | "NARRATION_TTS" | "PRACTICE";
export type VideoGuideOperationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type VideoGuideMediaUploadProgressStatus = "RUNNING" | "SUCCEEDED" | "FAILED";
export type VideoGuideOperationProgressKey =
  | "subtitleGenerationProgress"
  | "narrationGenerationProgress"
  | "narrationTtsGenerationProgress"
  | "practiceGenerationProgress";

export interface VideoGuideOperationProgress {
  version: 1;
  operation: VideoGuideOperation;
  status: VideoGuideOperationStatus;
  phase: string;
  completed: number;
  total: number;
  percent: number;
  message: string;
  canLeave: true;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface VideoGuideMediaUploadProgress {
  uploadId: string;
  status: VideoGuideMediaUploadProgressStatus;
  stage: string;
  percent: number;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
}

interface StoredVideoGuideMediaUploadProgress extends VideoGuideMediaUploadProgress {
  userId: string;
}

export class VideoGuideMediaUploadProgressStore {
  private readonly entries = new Map<string, StoredVideoGuideMediaUploadProgress>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(input?: { now?: () => number; ttlMs?: number }) {
    this.now = input?.now ?? Date.now;
    this.ttlMs = input?.ttlMs ?? 2 * 60 * 60 * 1_000;
  }

  begin(userId: string, uploadId: string) {
    const now = new Date(this.now()).toISOString();
    const progress: StoredVideoGuideMediaUploadProgress = {
      uploadId,
      userId,
      status: "RUNNING",
      stage: "PREPARING",
      percent: 0,
      errorMessage: null,
      startedAt: now,
      updatedAt: now
    };

    this.entries.set(uploadId, progress);
    this.pruneExpired();

    return this.publicProgress(progress);
  }

  update(userId: string, uploadId: string, input: { percent: number; stage: string }) {
    const current = this.activeEntry(userId, uploadId);

    if (!current || current.status !== "RUNNING") {
      return null;
    }

    const progress: StoredVideoGuideMediaUploadProgress = {
      ...current,
      stage: input.stage,
      percent: Math.max(current.percent, Math.min(99, Math.max(0, Math.round(input.percent)))),
      updatedAt: new Date(this.now()).toISOString()
    };

    this.entries.set(uploadId, progress);
    return this.publicProgress(progress);
  }

  complete(userId: string, uploadId: string) {
    return this.finish(userId, uploadId, "SUCCEEDED", null);
  }

  fail(userId: string, uploadId: string, errorMessage: string) {
    return this.finish(userId, uploadId, "FAILED", errorMessage);
  }

  get(userId: string, uploadId: string) {
    const progress = this.activeEntry(userId, uploadId);

    return progress ? this.publicProgress(progress) : null;
  }

  private finish(
    userId: string,
    uploadId: string,
    status: Exclude<VideoGuideMediaUploadProgressStatus, "RUNNING">,
    errorMessage: string | null
  ) {
    const current = this.activeEntry(userId, uploadId);

    if (!current) {
      return null;
    }

    const progress: StoredVideoGuideMediaUploadProgress = {
      ...current,
      status,
      stage: status === "SUCCEEDED" ? "COMPLETED" : "FAILED",
      percent: status === "SUCCEEDED" ? 100 : current.percent,
      errorMessage,
      updatedAt: new Date(this.now()).toISOString()
    };

    this.entries.set(uploadId, progress);
    return this.publicProgress(progress);
  }

  private activeEntry(userId: string, uploadId: string) {
    const progress = this.entries.get(uploadId);

    if (!progress || progress.userId !== userId) {
      return null;
    }

    if (this.now() - Date.parse(progress.updatedAt) > this.ttlMs) {
      this.entries.delete(uploadId);
      return null;
    }

    return progress;
  }

  private pruneExpired() {
    const now = this.now();

    for (const [uploadId, progress] of this.entries) {
      if (now - Date.parse(progress.updatedAt) > this.ttlMs) {
        this.entries.delete(uploadId);
      }
    }
  }

  private publicProgress(progress: StoredVideoGuideMediaUploadProgress): VideoGuideMediaUploadProgress {
    const { userId, ...value } = progress;

    void userId;

    return value;
  }
}

export function createVideoGuideOperationProgress(input: {
  operation: VideoGuideOperation;
  phase: string;
  message: string;
  now: string;
  total?: number;
}): VideoGuideOperationProgress {
  const total = normalizedCount(input.total);

  return {
    version: 1,
    operation: input.operation,
    status: "QUEUED",
    phase: input.phase,
    completed: 0,
    total,
    percent: 0,
    message: input.message,
    canLeave: true,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: input.now
  };
}

export function updateVideoGuideOperationProgress(
  progress: VideoGuideOperationProgress,
  patch: Partial<
    Pick<
      VideoGuideOperationProgress,
      "completed" | "errorMessage" | "message" | "percent" | "phase" | "status" | "total"
    >
  >,
  now: string
): VideoGuideOperationProgress {
  const status = patch.status ?? progress.status;
  const total = patch.total === undefined ? progress.total : normalizedCount(patch.total);
  const requestedCompleted = patch.completed === undefined ? progress.completed : normalizedCount(patch.completed);
  const completed = status === "SUCCEEDED" && total > 0 ? total : Math.min(requestedCompleted, total || requestedCompleted);
  const terminal = status === "SUCCEEDED" || status === "FAILED";
  const calculatedPercent = progressPercent(completed, total);
  const explicitPercent = patch.percent === undefined
    ? 0
    : Math.min(99, Math.max(0, Math.round(patch.percent)));
  const reportedPercent = Math.max(progress.percent, calculatedPercent, explicitPercent);

  return {
    ...progress,
    ...patch,
    status,
    completed,
    total,
    percent: status === "SUCCEEDED" ? 100 : reportedPercent,
    errorMessage: patch.errorMessage === undefined ? progress.errorMessage : patch.errorMessage,
    startedAt:
      progress.startedAt ?? (status === "RUNNING" || terminal ? now : null),
    finishedAt: terminal ? now : null,
    updatedAt: now
  };
}

export function failedVideoGuideOperationProgress(
  progressValue: unknown,
  input: {
    operation: VideoGuideOperation;
    errorMessage: string;
    message: string;
    now: string;
  }
) {
  const current =
    videoGuideOperationProgressFromValue(progressValue) ??
    createVideoGuideOperationProgress({
      operation: input.operation,
      phase: "FAILED",
      message: input.message,
      now: input.now
    });

  return updateVideoGuideOperationProgress(
    current,
    {
      status: "FAILED",
      phase: "FAILED",
      errorMessage: input.errorMessage,
      message: input.message
    },
    input.now
  );
}

export function mergeVideoGuideOperationProgressContent(
  contentValue: unknown,
  key: VideoGuideOperationProgressKey,
  progress: VideoGuideOperationProgress
): Record<string, unknown> {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    [key]: progress
  };
}

export function isActiveVideoGuideOperationProgress(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return value.status === "QUEUED" || value.status === "RUNNING";
}

export function videoGuideOperationProgressFromValue(value: unknown): VideoGuideOperationProgress | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    !isVideoGuideOperation(value.operation) ||
    !isVideoGuideOperationStatus(value.status) ||
    typeof value.phase !== "string" ||
    typeof value.completed !== "number" ||
    typeof value.total !== "number" ||
    typeof value.percent !== "number" ||
    typeof value.message !== "string" ||
    value.canLeave !== true ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return value as unknown as VideoGuideOperationProgress;
}

function normalizedCount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function progressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round((completed / total) * 100)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVideoGuideOperation(value: unknown): value is VideoGuideOperation {
  return (
    value === "SUBTITLE" ||
    value === "NARRATION" ||
    value === "NARRATION_TTS" ||
    value === "PRACTICE"
  );
}

function isVideoGuideOperationStatus(value: unknown): value is VideoGuideOperationStatus {
  return value === "QUEUED" || value === "RUNNING" || value === "SUCCEEDED" || value === "FAILED";
}
