export type VideoGuidePartKey =
  | "AUTONOMOUS"
  | "GUIDED"
  | "HIGHLIGHTS"
  | "PRACTICE"
  | "READ_ALONG";

const videoGuideParts: VideoGuidePartKey[] = [
  "AUTONOMOUS",
  "GUIDED",
  "HIGHLIGHTS",
  "PRACTICE",
  "READ_ALONG"
];

export function videoGuidePartKey(stageIndex: number): VideoGuidePartKey {
  const partKey = videoGuideParts[stageIndex];
  if (!partKey) {
    throw new RangeError("视频导学阶段不存在");
  }
  return partKey;
}

export function flushVideoPlaybackRange(
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
  return {
    startSeconds: previousSeconds,
    endSeconds: currentSeconds
  };
}
