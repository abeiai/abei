export type GuidedStudyView = "demonstration" | "guided" | "practice" | "readAlong";
export type GuidedStudyPartKey =
  | "DEMONSTRATION"
  | "GUIDED"
  | "PRACTICE"
  | "READ_ALONG";

export interface GuidedNodePosition {
  restored: boolean;
  index: number;
}

const partByView: Record<GuidedStudyView, GuidedStudyPartKey> = {
  demonstration: "DEMONSTRATION",
  guided: "GUIDED",
  practice: "PRACTICE",
  readAlong: "READ_ALONG"
};

export function guidedStudyPartKey(view: GuidedStudyView) {
  return partByView[view];
}

export function completedGuidedNodeIds(
  previous: GuidedNodePosition,
  current: GuidedNodePosition,
  validIds: string[]
) {
  if (
    previous.restored
    || current.restored
    || !Number.isInteger(previous.index)
    || !Number.isInteger(current.index)
    || current.index <= previous.index
  ) {
    return [];
  }
  const start = Math.max(0, previous.index + 1);
  const end = Math.min(current.index + 1, validIds.length);
  return validIds.slice(start, end);
}

export function flushGuidedStudyPlaybackRange(
  previousSeconds: number,
  currentSeconds: number,
  playing: boolean
) {
  const elapsed = currentSeconds - previousSeconds;
  if (
    !playing
    || !Number.isFinite(previousSeconds)
    || !Number.isFinite(currentSeconds)
    || previousSeconds < 0
    || elapsed <= 0
    || elapsed > 15
  ) {
    return null;
  }
  return { startSeconds: previousSeconds, endSeconds: currentSeconds };
}
