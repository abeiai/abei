import type { RepeatLine } from "@/lib/video-guide-data";

export type VideoGuideLoopMode = "NONE" | "SENTENCE" | "MEDIA";
export type VideoGuideNavigationAction = "PREVIOUS" | "NEXT";
export type VideoGuideFullscreenOrientation = "landscape" | "portrait";
export type VideoGuideSubtitleStyle = "WHITE_OUTLINE" | "YELLOW_OUTLINE" | "GRAY_BOX";

export interface VideoViewportInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface SubtitleNavigationState {
  currentIndex: number;
  nextIndex: number | null;
  previousIndex: number | null;
}

interface TimedNarrationNode {
  endSeconds?: number;
  startSeconds?: number;
  timeRange?: string;
  type: string;
}

export const subtitleStyleOptions: Array<{
  label: string;
  value: VideoGuideSubtitleStyle;
}> = [
  { label: "白字黑描边", value: "WHITE_OUTLINE" },
  { label: "黄字黑描边", value: "YELLOW_OUTLINE" },
  { label: "灰底白字", value: "GRAY_BOX" }
];

export function getCaptionPlacement(controlsVisible: boolean) {
  return controlsVisible ? "ABOVE_CONTROLS" : "BOTTOM";
}

export function getVideoGuideFullscreenOrientation(input: {
  videoHeight: number;
  videoWidth: number;
  viewportHeight?: number;
  viewportWidth?: number;
}): VideoGuideFullscreenOrientation {
  if (input.videoWidth > 0 && input.videoHeight > 0 && input.videoWidth !== input.videoHeight) {
    return input.videoWidth > input.videoHeight ? "landscape" : "portrait";
  }

  return (input.viewportWidth ?? 0) >= (input.viewportHeight ?? 0) ? "landscape" : "portrait";
}

export async function lockVideoGuideScreenOrientation(orientation: VideoGuideFullscreenOrientation) {
  if (typeof screen === "undefined") {
    return false;
  }

  const orientationController = screen.orientation as ScreenOrientation & {
    lock?: (value: VideoGuideFullscreenOrientation) => Promise<void>;
  };

  if (typeof orientationController?.lock !== "function") {
    return false;
  }

  try {
    await orientationController.lock(orientation);
    return true;
  } catch {
    return false;
  }
}

export function unlockVideoGuideScreenOrientation() {
  if (typeof screen === "undefined") {
    return;
  }

  const orientationController = screen.orientation as ScreenOrientation & {
    unlock?: () => void;
  };

  try {
    orientationController?.unlock?.();
  } catch {
    // 部分移动浏览器会在退出全屏时自行解除方向锁定。
  }
}

export function getPointerNavigationZone(
  offsetX: number,
  playerWidth: number
): VideoGuideNavigationAction | null {
  if (!Number.isFinite(offsetX) || !Number.isFinite(playerWidth) || playerWidth <= 0 || offsetX < 0 || offsetX > playerWidth) {
    return null;
  }

  if (offsetX <= playerWidth / 3) {
    return "PREVIOUS";
  }

  if (offsetX >= (playerWidth * 2) / 3) {
    return "NEXT";
  }

  return null;
}

export function getSwipeNavigationAction(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  playerWidth: number
): VideoGuideNavigationAction | null {
  if (![startX, startY, endX, endY, playerWidth].every(Number.isFinite) || playerWidth <= 0) {
    return null;
  }

  const horizontalDistance = endX - startX;
  const verticalDistance = endY - startY;
  const minimumDistance = Math.max(48, Math.min(playerWidth * 0.12, 96));

  if (
    Math.abs(horizontalDistance) < minimumDistance ||
    Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.2
  ) {
    return null;
  }

  return horizontalDistance > 0 ? "PREVIOUS" : "NEXT";
}

export function getSubtitleNavigationState(
  lines: RepeatLine[],
  currentTime: number
): SubtitleNavigationState {
  const timedLines = lines.flatMap((line, index) => {
    const startSeconds = line.startSeconds ?? parseRangeBoundary(line.timeRange, 0);

    if (!line.text.trim() || typeof startSeconds !== "number") {
      return [];
    }

    return [{ index, startSeconds }];
  });

  if (!Number.isFinite(currentTime) || timedLines.length === 0) {
    return { currentIndex: -1, nextIndex: null, previousIndex: null };
  }

  let currentPosition = 0;

  for (let index = 0; index < timedLines.length; index += 1) {
    if (timedLines[index].startSeconds > currentTime) {
      break;
    }

    currentPosition = index;
  }

  return {
    currentIndex: timedLines[currentPosition].index,
    nextIndex: timedLines[currentPosition + 1]?.index ?? null,
    previousIndex: timedLines[currentPosition - 1]?.index ?? null
  };
}

export function findNarrationSentenceIndexAtMediaTime(
  nodes: TimedNarrationNode[],
  currentTime: number
) {
  if (!Number.isFinite(currentTime)) {
    return null;
  }

  const timedSentences = nodes.flatMap((node, index) => {
    if (node.type !== "SENTENCE") {
      return [];
    }

    const startSeconds = node.startSeconds ?? parseRangeBoundary(node.timeRange, 0);

    if (typeof startSeconds !== "number") {
      return [];
    }

    return [{ index, startSeconds }];
  });

  if (timedSentences.length === 0) {
    return null;
  }

  let matchedIndex = timedSentences[0].index;

  for (const sentence of timedSentences) {
    if (sentence.startSeconds > currentTime) {
      break;
    }

    matchedIndex = sentence.index;
  }

  return matchedIndex;
}

export function resolveProgressDisplayTime(input: {
  currentDisplayTime: number;
  isSeeking: boolean;
  mediaTime: number;
}) {
  return input.isSeeking ? input.currentDisplayTime : input.mediaTime;
}

export function resolveCommittedProgressSeekTime(input: {
  controlTime: number;
  lastInputTime: number | null;
}) {
  return typeof input.lastInputTime === "number" && Number.isFinite(input.lastInputTime)
    ? input.lastInputTime
    : input.controlTime;
}

export function shouldFallbackNarrationAudio(input: {
  errorCode: number | null;
  pending: boolean;
  readyState: number;
}) {
  return input.pending && (input.errorCode !== null || input.readyState < 2);
}

export function shouldPauseRefreshedVideoFrame(input: {
  cancelled: boolean;
  ownsRefreshState: boolean;
  videoMuted: boolean;
}) {
  return input.ownsRefreshState && !input.cancelled && input.videoMuted;
}

export function isLatestMediaSeekRequest(requestVersion: number, latestVersion: number) {
  return requestVersion === latestVersion;
}

export function shouldDispatchMediaSeekImmediately(input: {
  playAfterSeek?: boolean;
  userInitiated: boolean;
}) {
  return input.userInitiated && input.playAfterSeek === true;
}

export function getSubtitleTypographyClassName(
  _style: VideoGuideSubtitleStyle,
  isFullscreen: boolean
) {
  const sizeClassName = isFullscreen
    ? "text-[clamp(1.5rem,min(3.2vw,5.5vh),4.5rem)]"
    : "text-[clamp(0.95rem,4vw,1.45rem)] sm:text-2xl xl:text-3xl";

  return `max-w-[94%] text-center font-sans font-extrabold leading-[1.15] ${sizeClassName}`;
}

export function getObjectContainInsets(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): VideoViewportInsets {
  if (
    ![containerWidth, containerHeight, mediaWidth, mediaHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return { bottom: 0, left: 0, right: 0, top: 0 };
  }

  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  const horizontalInset = Math.max(0, (containerWidth - mediaWidth * scale) / 2);
  const verticalInset = Math.max(0, (containerHeight - mediaHeight * scale) / 2);

  return {
    bottom: verticalInset,
    left: horizontalInset,
    right: horizontalInset,
    top: verticalInset
  };
}

export function findSubtitleLoopRange(lines: RepeatLine[], currentTime: number) {
  const activeLine = lines.find((line) => {
    const startSeconds = line.startSeconds ?? parseRangeBoundary(line.timeRange, 0);
    const endSeconds = line.endSeconds ?? parseRangeBoundary(line.timeRange, 1);

    return (
      typeof startSeconds === "number" &&
      typeof endSeconds === "number" &&
      currentTime >= startSeconds &&
      currentTime < endSeconds
    );
  });

  if (!activeLine) {
    return null;
  }

  const startSeconds = activeLine.startSeconds ?? parseRangeBoundary(activeLine.timeRange, 0);
  const endSeconds = activeLine.endSeconds ?? parseRangeBoundary(activeLine.timeRange, 1);

  if (typeof startSeconds !== "number" || typeof endSeconds !== "number") {
    return null;
  }

  return { endSeconds, startSeconds };
}

function parseRangeBoundary(value: string | undefined, boundaryIndex: number) {
  const matches = [...(value?.matchAll(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?/g) ?? [])];
  const match = matches[boundaryIndex];

  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number((match[4] ?? "0").padEnd(3, "0"));

  if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}
