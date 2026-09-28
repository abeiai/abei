export interface VideoGuideSubtitleCheckpoint {
  version: 1;
  jobId: string;
  asrObjectKey: string | null;
  asrReusable: boolean;
  asrMediaName: string | null;
  asrMediaMimeType: string | null;
  asrMediaSizeBytes: number | null;
  providerTaskId: string | null;
  providerStatus: string | null;
  modelInstanceId: string | null;
  providerInstanceId: string | null;
  modelName: string | null;
  requestId: string | null;
  submittedAt: string | null;
  lastPolledAt: string | null;
  pollAttempts: number;
  transientFailures: number;
  createdAt: string;
  updatedAt: string;
}

export function createVideoGuideSubtitleCheckpoint(input: {
  jobId: string;
  now: string;
}): VideoGuideSubtitleCheckpoint {
  return {
    version: 1,
    jobId: input.jobId,
    asrObjectKey: null,
    asrReusable: false,
    asrMediaName: null,
    asrMediaMimeType: null,
    asrMediaSizeBytes: null,
    providerTaskId: null,
    providerStatus: null,
    modelInstanceId: null,
    providerInstanceId: null,
    modelName: null,
    requestId: null,
    submittedAt: null,
    lastPolledAt: null,
    pollAttempts: 0,
    transientFailures: 0,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function mergeVideoGuideSubtitleCheckpointContent(
  contentValue: unknown,
  checkpoint: VideoGuideSubtitleCheckpoint | null
): Record<string, unknown> {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    subtitleGenerationCheckpoint: checkpoint
  };
}

export function videoGuideSubtitleCheckpointFromValue(
  value: unknown,
  jobId: string
): VideoGuideSubtitleCheckpoint | null {
  if (!isRecord(value) || value.version !== 1 || value.jobId !== jobId) {
    return null;
  }

  if (
    !nullableString(value.asrObjectKey) ||
    (value.asrReusable !== undefined && typeof value.asrReusable !== "boolean") ||
    !nullableString(value.asrMediaName) ||
    !nullableString(value.asrMediaMimeType) ||
    !nullableNumber(value.asrMediaSizeBytes) ||
    !nullableString(value.providerTaskId) ||
    !nullableString(value.providerStatus) ||
    !nullableString(value.modelInstanceId) ||
    !nullableString(value.providerInstanceId) ||
    !nullableString(value.modelName) ||
    !nullableString(value.requestId) ||
    !nullableString(value.submittedAt) ||
    !nullableString(value.lastPolledAt) ||
    !nonNegativeInteger(value.pollAttempts) ||
    !nonNegativeInteger(value.transientFailures) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    ...value,
    asrReusable: value.asrReusable === true
  } as unknown as VideoGuideSubtitleCheckpoint;
}

export function shouldSubmitVideoGuideSubtitleTask(checkpoint: VideoGuideSubtitleCheckpoint | null) {
  return !checkpoint?.providerTaskId;
}

export function shouldCleanupVideoGuideSubtitleAsrObject(
  checkpoint: VideoGuideSubtitleCheckpoint,
  operationCommitted: boolean
) {
  return operationCommitted && Boolean(checkpoint.asrObjectKey) && !checkpoint.asrReusable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function nullableNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
