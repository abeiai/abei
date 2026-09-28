const MIN_RECOGNITION_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_RECOGNITION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_RECOGNITION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const DEFAULT_RECOVERY_STALE_MS = 4 * 60 * 1000;
const MIN_RECOVERY_STALE_MS = 3 * 60 * 1000;
const MAX_RECOVERY_STALE_MS = 15 * 60 * 1000;
const ESTIMATED_ASR_AUDIO_BITRATE_BPS = 48_000;
const MIN_ESTIMATED_PROCESSING_MS = 5 * 60 * 1000;
const MAX_ESTIMATED_PROCESSING_MS = 60 * 60 * 1000;

export function resolveVideoGuideSubtitleRecognitionTimeoutMs(configured: unknown) {
  const value = Number(configured);

  if (!Number.isFinite(value) || value < MIN_RECOGNITION_TIMEOUT_MS) {
    return DEFAULT_RECOGNITION_TIMEOUT_MS;
  }

  return Math.min(Math.round(value), MAX_RECOGNITION_TIMEOUT_MS);
}

export function videoGuideSubtitleRecognitionDeadline(input: {
  now?: number;
  submittedAt: string | null;
  timeoutMs: number;
}) {
  const submittedTime = input.submittedAt ? Date.parse(input.submittedAt) : Number.NaN;
  const startedAt = Number.isFinite(submittedTime) ? submittedTime : (input.now ?? Date.now());

  return startedAt + input.timeoutMs;
}

export function videoGuideSubtitleRecognitionEstimatedPercent(input: {
  asrMediaSizeBytes: number | null;
  now?: number | string;
  submittedAt: string | null;
}) {
  const submittedTime = input.submittedAt ? Date.parse(input.submittedAt) : Number.NaN;
  const now = typeof input.now === "string" ? Date.parse(input.now) : (input.now ?? Date.now());

  if (!Number.isFinite(submittedTime) || !Number.isFinite(now) || now <= submittedTime) {
    return 50;
  }

  const audioSize = Math.max(0, input.asrMediaSizeBytes ?? 0);
  const estimatedAudioDurationMs = audioSize > 0
    ? (audioSize * 8 * 1000) / ESTIMATED_ASR_AUDIO_BITRATE_BPS
    : 10 * 60 * 1000;
  const estimatedProcessingMs = Math.min(
    MAX_ESTIMATED_PROCESSING_MS,
    Math.max(MIN_ESTIMATED_PROCESSING_MS, estimatedAudioDurationMs * 1.5)
  );
  const elapsedRatio = Math.min(1, Math.max(0, (now - submittedTime) / estimatedProcessingMs));

  return Math.min(82, 50 + Math.floor(elapsedRatio * 32));
}

export function resolveVideoGuideSubtitleRecoveryStaleMs(configuredSeconds: unknown) {
  const seconds = Number(configuredSeconds);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_RECOVERY_STALE_MS;
  }

  return Math.min(
    MAX_RECOVERY_STALE_MS,
    Math.max(MIN_RECOVERY_STALE_MS, Math.round(seconds * 1000))
  );
}
