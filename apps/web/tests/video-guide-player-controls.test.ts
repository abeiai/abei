import assert from "node:assert/strict";
import test from "node:test";

import * as playerControls from "../src/lib/video-guide-player-controls";

test("findSubtitleLoopRange returns the active sentence range", () => {
  assert.deepEqual(
    playerControls.findSubtitleLoopRange(
      [
        { hint: "", id: "s1", text: "First sentence.", startSeconds: 0, endSeconds: 2.4, timeRange: "00:00 - 00:02" },
        { hint: "", id: "s2", text: "Second sentence.", startSeconds: 2.4, endSeconds: 5.8, timeRange: "00:02 - 00:06" }
      ],
      3.2
    ),
    { endSeconds: 5.8, startSeconds: 2.4 }
  );
});

test("subtitle style options keep one shared size and three visual treatments", () => {
  assert.deepEqual(
    playerControls.subtitleStyleOptions.map((option) => ({
      label: option.label,
      value: option.value
    })),
    [
      { label: "白字黑描边", value: "WHITE_OUTLINE" },
      { label: "黄字黑描边", value: "YELLOW_OUTLINE" },
      { label: "灰底白字", value: "GRAY_BOX" }
    ]
  );
});

test("subtitle variants share the gray-box typography", () => {
  const getSubtitleTypographyClassName = (playerControls as Record<string, unknown>).getSubtitleTypographyClassName;

  assert.equal(typeof getSubtitleTypographyClassName, "function");

  for (const isFullscreen of [false, true]) {
    const getTypography = getSubtitleTypographyClassName as (
      style: playerControls.VideoGuideSubtitleStyle,
      isFullscreen: boolean
    ) => string;
    const grayBoxTypography = getTypography("GRAY_BOX", isFullscreen);

    assert.equal(getTypography("WHITE_OUTLINE", isFullscreen), grayBoxTypography);
    assert.equal(getTypography("YELLOW_OUTLINE", isFullscreen), grayBoxTypography);
  }
});

test("fullscreen subtitle typography scales with both viewport dimensions", () => {
  const className = playerControls.getSubtitleTypographyClassName("GRAY_BOX", true);

  assert.match(className, /text-\[clamp\(1\.5rem,min\(3\.2vw,5\.5vh\),4\.5rem\)\]/);
  assert.doesNotMatch(className, /sm:text-/);
});

test("fullscreen orientation follows the video aspect ratio", () => {
  assert.equal(
    playerControls.getVideoGuideFullscreenOrientation({
      videoHeight: 1080,
      videoWidth: 1920,
      viewportHeight: 844,
      viewportWidth: 390
    }),
    "landscape"
  );
  assert.equal(
    playerControls.getVideoGuideFullscreenOrientation({
      videoHeight: 1920,
      videoWidth: 1080,
      viewportHeight: 390,
      viewportWidth: 844
    }),
    "portrait"
  );
});

test("square or unloaded video keeps the current screen orientation", () => {
  assert.equal(
    playerControls.getVideoGuideFullscreenOrientation({
      videoHeight: 0,
      videoWidth: 0,
      viewportHeight: 844,
      viewportWidth: 390
    }),
    "portrait"
  );
  assert.equal(
    playerControls.getVideoGuideFullscreenOrientation({
      videoHeight: 1080,
      videoWidth: 1080,
      viewportHeight: 390,
      viewportWidth: 844
    }),
    "landscape"
  );
});

test("object-contain insets describe the real rendered video area", () => {
  const getObjectContainInsets = (playerControls as Record<string, unknown>).getObjectContainInsets;

  assert.equal(typeof getObjectContainInsets, "function");

  const calculateInsets = getObjectContainInsets as (
    containerWidth: number,
    containerHeight: number,
    mediaWidth: number,
    mediaHeight: number
  ) => { bottom: number; left: number; right: number; top: number };

  assert.deepEqual(calculateInsets(1920, 1200, 1920, 1080), {
    bottom: 60,
    left: 0,
    right: 0,
    top: 60
  });
  assert.deepEqual(calculateInsets(1600, 900, 1200, 900), {
    bottom: 0,
    left: 200,
    right: 200,
    top: 0
  });
});

test("caption placement follows the custom control visibility", () => {
  const getCaptionPlacement = (playerControls as Record<string, unknown>).getCaptionPlacement;

  assert.equal(typeof getCaptionPlacement, "function");
  assert.equal((getCaptionPlacement as (controlsVisible: boolean) => string)(true), "ABOVE_CONTROLS");
  assert.equal((getCaptionPlacement as (controlsVisible: boolean) => string)(false), "BOTTOM");
});

test("pointer navigation uses the left and right thirds of the player", () => {
  const getPointerNavigationZone = (playerControls as Record<string, unknown>).getPointerNavigationZone;

  assert.equal(typeof getPointerNavigationZone, "function");

  const getZone = getPointerNavigationZone as (offsetX: number, playerWidth: number) => string | null;

  assert.equal(getZone(200, 900), "PREVIOUS");
  assert.equal(getZone(450, 900), null);
  assert.equal(getZone(700, 900), "NEXT");
  assert.equal(getZone(-1, 900), null);
});

test("horizontal touch swipes map to sentence navigation without stealing vertical scroll", () => {
  const getSwipeNavigationAction = (playerControls as Record<string, unknown>).getSwipeNavigationAction;

  assert.equal(typeof getSwipeNavigationAction, "function");

  const getAction = getSwipeNavigationAction as (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    playerWidth: number
  ) => string | null;

  assert.equal(getAction(80, 120, 180, 125, 390), "PREVIOUS");
  assert.equal(getAction(260, 120, 150, 125, 390), "NEXT");
  assert.equal(getAction(100, 100, 132, 102, 390), null);
  assert.equal(getAction(100, 100, 150, 230, 390), null);
});

test("autonomous viewing resolves previous and next subtitle sentences from media time", () => {
  const getSubtitleNavigationState = (playerControls as Record<string, unknown>).getSubtitleNavigationState;

  assert.equal(typeof getSubtitleNavigationState, "function");

  const getState = getSubtitleNavigationState as (
    lines: Array<{
      endSeconds?: number;
      hint: string;
      id: string;
      startSeconds?: number;
      text: string;
      timeRange: string;
    }>,
    currentTime: number
  ) => { currentIndex: number; nextIndex: number | null; previousIndex: number | null };
  const lines = [
    { hint: "", id: "s1", text: "First sentence.", startSeconds: 0, endSeconds: 2.4, timeRange: "00:00 - 00:02" },
    { hint: "", id: "empty", text: "", timeRange: "" },
    { hint: "", id: "s2", text: "Second sentence.", startSeconds: 2.8, endSeconds: 5.8, timeRange: "00:03 - 00:06" },
    { hint: "", id: "s3", text: "Third sentence.", startSeconds: 6.2, endSeconds: 9, timeRange: "00:06 - 00:09" }
  ];

  assert.deepEqual(getState(lines, 3.2), {
    currentIndex: 2,
    nextIndex: 3,
    previousIndex: 0
  });
  assert.deepEqual(getState(lines, 6), {
    currentIndex: 2,
    nextIndex: 3,
    previousIndex: 0
  });
  assert.deepEqual(getState(lines, 0.4), {
    currentIndex: 0,
    nextIndex: 2,
    previousIndex: null
  });
});

test("interactive guide resolves a progress seek to the corresponding sentence node", () => {
  const findSentenceIndex = (playerControls as Record<string, unknown>)
    .findNarrationSentenceIndexAtMediaTime;

  assert.equal(typeof findSentenceIndex, "function");

  const resolveIndex = findSentenceIndex as (
    nodes: Array<{
      endSeconds?: number;
      startSeconds?: number;
      timeRange?: string;
      type: "INTRO" | "SENTENCE" | "SUMMARY";
    }>,
    currentTime: number
  ) => number | null;
  const nodes = [
    { type: "INTRO" as const },
    { type: "SENTENCE" as const, startSeconds: 1, endSeconds: 3.2, timeRange: "00:01 - 00:03" },
    { type: "SENTENCE" as const, startSeconds: 3.8, endSeconds: 6.4, timeRange: "00:04 - 00:06" },
    { type: "SENTENCE" as const, startSeconds: 7, endSeconds: 9.5, timeRange: "00:07 - 00:10" },
    { type: "SUMMARY" as const }
  ];

  assert.equal(resolveIndex(nodes, 2.1), 1);
  assert.equal(resolveIndex(nodes, 3.5), 1);
  assert.equal(resolveIndex(nodes, 5), 2);
  assert.equal(resolveIndex(nodes, 0), 1);
  assert.equal(resolveIndex(nodes, 12), 3);
  assert.equal(resolveIndex(nodes, Number.NaN), null);
});

test("media playback cannot overwrite the visible progress while the user is seeking", () => {
  const resolveDisplayTime = (playerControls as Record<string, unknown>)
    .resolveProgressDisplayTime;

  assert.equal(typeof resolveDisplayTime, "function");

  const resolve = resolveDisplayTime as (input: {
    currentDisplayTime: number;
    isSeeking: boolean;
    mediaTime: number;
  }) => number;

  assert.equal(resolve({ currentDisplayTime: 428, isSeeking: true, mediaTime: 126 }), 428);
  assert.equal(resolve({ currentDisplayTime: 428, isSeeking: false, mediaTime: 126 }), 126);
});

test("progress seek commits the last user input instead of a rerendered control value", () => {
  const resolveCommitTime = (playerControls as Record<string, unknown>)
    .resolveCommittedProgressSeekTime;

  assert.equal(typeof resolveCommitTime, "function");

  const resolve = resolveCommitTime as (input: {
    controlTime: number;
    lastInputTime: number | null;
  }) => number;

  assert.equal(resolve({ controlTime: 7.3, lastInputTime: 839 }), 839);
  assert.equal(resolve({ controlTime: 7.3, lastInputTime: null }), 7.3);
});

test("narration audio falls back only when a pending source cannot load", () => {
  const shouldFallbackNarrationAudio = (playerControls as Record<string, unknown>).shouldFallbackNarrationAudio;

  assert.equal(typeof shouldFallbackNarrationAudio, "function");

  const shouldFallback = shouldFallbackNarrationAudio as (input: {
    errorCode: number | null;
    pending: boolean;
    readyState: number;
  }) => boolean;

  assert.equal(shouldFallback({ errorCode: 4, pending: true, readyState: 0 }), true);
  assert.equal(shouldFallback({ errorCode: null, pending: true, readyState: 0 }), true);
  assert.equal(shouldFallback({ errorCode: null, pending: true, readyState: 3 }), false);
  assert.equal(shouldFallback({ errorCode: 4, pending: false, readyState: 0 }), false);
});

test("a stale paused-frame refresh cannot pause newly started playback", () => {
  const shouldPauseRefreshedVideoFrame = (playerControls as Record<string, unknown>).shouldPauseRefreshedVideoFrame;

  assert.equal(typeof shouldPauseRefreshedVideoFrame, "function");

  const shouldPause = shouldPauseRefreshedVideoFrame as (input: {
    cancelled: boolean;
    ownsRefreshState: boolean;
    videoMuted: boolean;
  }) => boolean;

  assert.equal(shouldPause({ cancelled: false, ownsRefreshState: true, videoMuted: true }), true);
  assert.equal(shouldPause({ cancelled: true, ownsRefreshState: true, videoMuted: true }), false);
  assert.equal(shouldPause({ cancelled: false, ownsRefreshState: true, videoMuted: false }), false);
  assert.equal(shouldPause({ cancelled: false, ownsRefreshState: false, videoMuted: true }), false);
});

test("only the latest media seek request may finish playback state changes", () => {
  const isLatestMediaSeekRequest = (playerControls as Record<string, unknown>).isLatestMediaSeekRequest;

  assert.equal(typeof isLatestMediaSeekRequest, "function");

  const isLatest = isLatestMediaSeekRequest as (requestVersion: number, latestVersion: number) => boolean;

  assert.equal(isLatest(4, 4), true);
  assert.equal(isLatest(3, 4), false);
});

test("user initiated narration playback dispatches the media seek immediately", () => {
  const shouldDispatchMediaSeekImmediately = (playerControls as Record<string, unknown>)
    .shouldDispatchMediaSeekImmediately;

  assert.equal(typeof shouldDispatchMediaSeekImmediately, "function");

  const shouldDispatch = shouldDispatchMediaSeekImmediately as (input: {
    playAfterSeek?: boolean;
    userInitiated: boolean;
  }) => boolean;

  assert.equal(shouldDispatch({ playAfterSeek: true, userInitiated: true }), true);
  assert.equal(shouldDispatch({ playAfterSeek: false, userInitiated: true }), false);
  assert.equal(shouldDispatch({ playAfterSeek: true, userInitiated: false }), false);
});
