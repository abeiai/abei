export type EnglishGuidedStudyOperation = "CONTENT" | "PRACTICE" | "AUDIO" | "READ_ALOUD";
export type EnglishGuidedStudyOperationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type EnglishGuidedStudyProgressKey =
  | "contentGenerationProgress"
  | "practiceGenerationProgress"
  | "audioGenerationProgress"
  | "readAlongGenerationProgress";
export type EnglishGuidedStudyJobKey =
  | "contentGenerationJob"
  | "practiceGenerationJob"
  | "audioGenerationJob"
  | "readAlongGenerationJob";

export interface EnglishGuidedStudyOperationProgress {
  version: 1;
  operation: EnglishGuidedStudyOperation;
  status: EnglishGuidedStudyOperationStatus;
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

export interface EnglishGuidedStudyOperationJob<TInput = unknown> {
  version: 1;
  jobId: string;
  attemptId: string | null;
  operation: EnglishGuidedStudyOperation;
  operationKey: string;
  estimatedCredits: number;
  input: TInput;
  createdAt: string;
}

export function createEnglishGuidedStudyProgress(input: {
  operation: EnglishGuidedStudyOperation;
  phase: string;
  message: string;
  now: string;
  total?: number;
}): EnglishGuidedStudyOperationProgress {
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

export function updateEnglishGuidedStudyProgress(
  progress: EnglishGuidedStudyOperationProgress,
  patch: Partial<
    Pick<
      EnglishGuidedStudyOperationProgress,
      "completed" | "errorMessage" | "message" | "phase" | "status" | "total"
    >
  >,
  now: string
): EnglishGuidedStudyOperationProgress {
  const status = patch.status ?? progress.status;
  const total = patch.total === undefined ? progress.total : normalizedCount(patch.total);
  const requestedCompleted = patch.completed === undefined
    ? progress.completed
    : normalizedCount(patch.completed);
  const completed = status === "SUCCEEDED" && total > 0
    ? total
    : Math.min(requestedCompleted, total || requestedCompleted);
  const terminal = status === "SUCCEEDED" || status === "FAILED";

  return {
    ...progress,
    ...patch,
    status,
    completed,
    total,
    percent: status === "SUCCEEDED" ? 100 : progressPercent(completed, total),
    errorMessage: patch.errorMessage === undefined ? progress.errorMessage : patch.errorMessage,
    startedAt: progress.startedAt ?? (status === "RUNNING" || terminal ? now : null),
    finishedAt: terminal ? now : null,
    updatedAt: now
  };
}

export function failedEnglishGuidedStudyProgress(
  progressValue: unknown,
  input: {
    operation: EnglishGuidedStudyOperation;
    errorMessage: string;
    message: string;
    now: string;
  }
) {
  const current =
    englishGuidedStudyProgressFromValue(progressValue) ??
    createEnglishGuidedStudyProgress({
      operation: input.operation,
      phase: "FAILED",
      message: input.message,
      now: input.now
    });

  return updateEnglishGuidedStudyProgress(
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

export function createEnglishGuidedStudyJob<TInput>(input: {
  operation: EnglishGuidedStudyOperation;
  jobId: string;
  operationKey: string;
  estimatedCredits: number;
  input: TInput;
  now: string;
}): EnglishGuidedStudyOperationJob<TInput> {
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

export function mergeEnglishGuidedStudyOperationContent(
  contentValue: unknown,
  input: {
    job: EnglishGuidedStudyOperationJob;
    jobKey: EnglishGuidedStudyJobKey;
    progress: EnglishGuidedStudyOperationProgress;
    progressKey: EnglishGuidedStudyProgressKey;
  }
) {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    [input.jobKey]: input.job,
    [input.progressKey]: input.progress
  };
}

export function englishGuidedStudyProgressFromValue(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    !isOperation(value.operation) ||
    !isStatus(value.status) ||
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

  return value as unknown as EnglishGuidedStudyOperationProgress;
}

export function englishGuidedStudyJobFromValue<TInput = unknown>(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    typeof value.jobId !== "string" ||
    !value.jobId ||
    !(value.attemptId === undefined || value.attemptId === null || typeof value.attemptId === "string") ||
    !isOperation(value.operation) ||
    typeof value.operationKey !== "string" ||
    !value.operationKey ||
    typeof value.estimatedCredits !== "number" ||
    !Number.isFinite(value.estimatedCredits) ||
    typeof value.createdAt !== "string" ||
    !("input" in value)
  ) {
    return null;
  }

  return {
    ...value,
    attemptId: typeof value.attemptId === "string" ? value.attemptId : null
  } as unknown as EnglishGuidedStudyOperationJob<TInput>;
}

export function leaseEnglishGuidedStudyJob<TInput>(
  job: EnglishGuidedStudyOperationJob<TInput>,
  attemptId: string
) {
  return { ...job, attemptId };
}

export function englishGuidedStudyAttemptMatches(
  jobValue: unknown,
  jobId: string,
  attemptId: string
) {
  const job = englishGuidedStudyJobFromValue(jobValue);

  return Boolean(job && job.jobId === jobId && job.attemptId === attemptId);
}

export function isActiveEnglishGuidedStudyProgress(value: unknown) {
  const progress = englishGuidedStudyProgressFromValue(value);

  return progress?.status === "QUEUED" || progress?.status === "RUNNING";
}

export function shouldRecoverEnglishGuidedStudyOperation(
  progress: EnglishGuidedStudyOperationProgress,
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

function isOperation(value: unknown): value is EnglishGuidedStudyOperation {
  return value === "CONTENT" ||
    value === "PRACTICE" ||
    value === "AUDIO" ||
    value === "READ_ALOUD";
}

function isStatus(value: unknown): value is EnglishGuidedStudyOperationStatus {
  return value === "QUEUED" || value === "RUNNING" || value === "SUCCEEDED" || value === "FAILED";
}
