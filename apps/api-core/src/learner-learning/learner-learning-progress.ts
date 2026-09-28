import type { LearningMaterialType } from "./learner-learning.types.js";

export interface PlaybackRange {
  startSeconds: number;
  endSeconds: number;
}

export interface PartProgressResult {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
}

export interface MaterialProgressResult {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
}

const coverageCompletionPercent = 80;

export function mergePlaybackRanges(
  current: PlaybackRange[],
  incoming: PlaybackRange[]
): PlaybackRange[] {
  const normalized = [...current, ...incoming]
    .flatMap((range) => {
      const startSeconds = Math.max(0, Number(range.startSeconds));
      const endSeconds = Math.max(0, Number(range.endSeconds));
      return Number.isFinite(startSeconds) &&
        Number.isFinite(endSeconds) &&
        endSeconds > startSeconds
        ? [{ startSeconds, endSeconds }]
        : [];
    })
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds ||
        left.endSeconds - right.endSeconds
    );

  const merged: PlaybackRange[] = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (!previous || range.startSeconds > previous.endSeconds) {
      merged.push({ ...range });
    } else {
      previous.endSeconds = Math.max(previous.endSeconds, range.endSeconds);
    }
  }
  return merged;
}

export function coveragePercent(ranges: PlaybackRange[], durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const clipped = ranges.map((range) => ({
    startSeconds: Math.min(durationSeconds, Math.max(0, range.startSeconds)),
    endSeconds: Math.min(durationSeconds, Math.max(0, range.endSeconds))
  }));
  const coveredSeconds = mergePlaybackRanges([], clipped).reduce(
    (total, range) => total + range.endSeconds - range.startSeconds,
    0
  );
  return Math.min(100, Math.round((coveredSeconds / durationSeconds) * 100));
}

export function mergeStableIds(
  current: string[],
  incoming: string[],
  allowed: Iterable<string>
) {
  const allowedSet = new Set(allowed);
  return [...new Set([...current, ...incoming].filter((id) => allowedSet.has(id)))].sort();
}

export function evaluatePartProgress(input: {
  kind: "COVERAGE" | "PRACTICE" | "FLASHCARD_ROUND" | "NODES" | "READ_ALONG";
  completed: number;
  total: number;
}): PartProgressResult {
  const total = Math.max(0, Math.floor(input.total));
  const completed = Math.min(total, Math.max(0, Math.floor(input.completed)));
  if (total === 0 || completed === 0) {
    return { status: "NOT_STARTED", progressPercent: 0 };
  }
  const progressPercent = Math.min(100, Math.round((completed / total) * 100));
  const isComplete =
    input.kind === "COVERAGE"
      ? progressPercent >= coverageCompletionPercent
      : completed >= total;
  return {
    status: isComplete ? "COMPLETED" : "IN_PROGRESS",
    progressPercent: isComplete && input.kind === "COVERAGE" ? 100 : progressPercent
  };
}

export function evaluateMaterialProgress(
  parts: PartProgressResult[]
): MaterialProgressResult {
  if (parts.length === 0) {
    return { status: "NOT_STARTED", progressPercent: 0 };
  }
  const progressPercent = Math.round(
    parts.reduce((total, part) => total + part.progressPercent, 0) / parts.length
  );
  return {
    status: parts.every((part) => part.status === "COMPLETED")
      ? "COMPLETED"
      : parts.some((part) => part.progressPercent > 0)
        ? "IN_PROGRESS"
        : "NOT_STARTED",
    progressPercent
  };
}

export function materialProgressKey(
  learnerId: string,
  materialType: LearningMaterialType,
  materialId: string,
  contentVersion: string
) {
  return JSON.stringify([learnerId, materialType, materialId, contentVersion]);
}

export function learningSecondsForPlayback(input: {
  wallClockSeconds: number;
  playbackRate: number;
}) {
  if (!Number.isFinite(input.playbackRate) || input.playbackRate <= 0) return 0;
  return Math.max(0, Math.floor(input.wallClockSeconds));
}
