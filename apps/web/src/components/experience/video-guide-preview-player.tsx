"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  CaptionsOff,
  Maximize2,
  Minimize2,
  MoreVertical,
  Pause,
  Play,
  Volume2,
  VolumeX
} from "lucide-react";

import {
  getCaptionPlacement,
  getObjectContainInsets,
  getSubtitleTypographyClassName,
  getVideoGuideFullscreenOrientation,
  lockVideoGuideScreenOrientation,
  subtitleStyleOptions,
  unlockVideoGuideScreenOrientation,
  type VideoGuideFullscreenOrientation,
  type VideoGuideLoopMode,
  type VideoGuideSubtitleStyle,
  type VideoViewportInsets
} from "@/lib/video-guide-player-controls";
import {
  findPreviewSubtitleCue,
  findPreviewSubtitleLoopRange,
  type PreviewSubtitleCue
} from "@/lib/video-guide-preview-player";
import { cn } from "@/lib/utils";

interface VideoGuidePreviewPlayerProps {
  cues: PreviewSubtitleCue[];
  mediaType: "VIDEO" | "AUDIO";
  mediaUrl: string;
}

const controlHideDelayMs = 2200;
const sentenceLoopToleranceSeconds = 0.06;

export function VideoGuidePreviewPlayer({ cues, mediaType, mediaUrl }: VideoGuidePreviewPlayerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const controlHideTimerRef = useRef<number | null>(null);
  const sentenceLoopRangeRef = useRef<{ endSeconds: number; startSeconds: number } | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(cues.length > 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreenOrientation, setFullscreenOrientation] = useState<VideoGuideFullscreenOrientation | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isControlVisible, setIsControlVisible] = useState(true);
  const [isMediaError, setIsMediaError] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [useFullscreenOrientationFallback, setUseFullscreenOrientationFallback] = useState(false);
  const [isVolumeControlOpen, setIsVolumeControlOpen] = useState(false);
  const [loopMode, setLoopMode] = useState<VideoGuideLoopMode>("NONE");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleStyle, setSubtitleStyle] = useState<VideoGuideSubtitleStyle>("WHITE_OUTLINE");
  const [videoViewportInsets, setVideoViewportInsets] = useState<VideoViewportInsets>({
    bottom: 0,
    left: 0,
    right: 0,
    top: 0
  });
  const [volume, setVolume] = useState(1);
  const isFullscreen = isBrowserFullscreen || isPseudoFullscreen;
  const customControlsVisible = isControlVisible || !isPlaying || isMoreMenuOpen || isVolumeControlOpen;
  const captionPlacement = getCaptionPlacement(customControlsVisible);
  const activeCue = captionsEnabled ? findPreviewSubtitleCue(cues, currentTime) : null;

  const clearControlHideTimer = useCallback(() => {
    if (controlHideTimerRef.current !== null) {
      window.clearTimeout(controlHideTimerRef.current);
      controlHideTimerRef.current = null;
    }
  }, []);

  const scheduleControlHide = useCallback(() => {
    clearControlHideTimer();

    if (!isPlaying || isMoreMenuOpen || isVolumeControlOpen) {
      return;
    }

    controlHideTimerRef.current = window.setTimeout(() => {
      setIsControlVisible(false);
    }, controlHideDelayMs);
  }, [clearControlHideTimer, isMoreMenuOpen, isPlaying, isVolumeControlOpen]);

  const revealControls = useCallback(() => {
    setIsControlVisible(true);
    scheduleControlHide();
  }, [scheduleControlHide]);

  const refreshVideoViewportInsets = useCallback((video: HTMLVideoElement | null) => {
    if (!video) {
      setVideoViewportInsets({ bottom: 0, left: 0, right: 0, top: 0 });
      return;
    }

    const nextInsets = getObjectContainInsets(
      video.clientWidth,
      video.clientHeight,
      video.videoWidth,
      video.videoHeight
    );

    setVideoViewportInsets(nextInsets);
  }, []);

  useEffect(() => {
    scheduleControlHide();

    return clearControlHideTimer;
  }, [clearControlHideTimer, scheduleControlHide]);

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement === panelRef.current;
      setIsBrowserFullscreen(active);

      if (!active && !isPseudoFullscreen) {
        setFullscreenOrientation(null);
        setUseFullscreenOrientationFallback(false);
        unlockVideoGuideScreenOrientation();
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isPseudoFullscreen]);

  useEffect(() => {
    if (!isPseudoFullscreen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isPseudoFullscreen]);

  useEffect(() => {
    setCaptionsEnabled(cues.length > 0);
    sentenceLoopRangeRef.current = null;
  }, [cues]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsMediaError(false);
    setIsPlaying(false);
    sentenceLoopRangeRef.current = null;
  }, [mediaUrl]);

  useEffect(() => {
    if (mediaType !== "VIDEO") {
      return;
    }

    const video = mediaRef.current instanceof HTMLVideoElement ? mediaRef.current : null;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => refreshVideoViewportInsets(video));

    if (video) {
      resizeObserver?.observe(video);
      refreshVideoViewportInsets(video);
    }

    return () => resizeObserver?.disconnect();
  }, [isFullscreen, mediaType, refreshVideoViewportInsets]);

  function updateMediaRef(node: HTMLMediaElement | null) {
    mediaRef.current = node;

    if (node) {
      node.muted = isMuted;
      node.playbackRate = playbackRate;
      node.volume = volume;
    }
  }

  async function togglePlayback() {
    const media = mediaRef.current;

    if (!media) {
      return;
    }

    if (!media.paused && !media.ended) {
      media.pause();
      return;
    }

    try {
      await media.play();
    } catch {
      setIsPlaying(false);
    }
  }

  function seekTo(seconds: number) {
    const media = mediaRef.current;

    if (!media || !Number.isFinite(seconds)) {
      return;
    }

    const nextTime = Math.min(Math.max(seconds, 0), Math.max(duration, 0));
    media.currentTime = nextTime;
    setCurrentTime(nextTime);
    sentenceLoopRangeRef.current = loopMode === "SENTENCE"
      ? findPreviewSubtitleLoopRange(cues, nextTime)
      : null;
  }

  function handleLoadedMetadata(media: HTMLMediaElement) {
    const nextDuration = Number.isFinite(media.duration) ? media.duration : 0;

    setDuration(nextDuration);
    setCurrentTime(media.currentTime);
    setIsMediaError(false);

    if (media instanceof HTMLVideoElement) {
      refreshVideoViewportInsets(media);
    }
  }

  function handleTimeUpdate(media: HTMLMediaElement) {
    const seconds = media.currentTime;

    if (loopMode === "SENTENCE") {
      const range = sentenceLoopRangeRef.current ?? findPreviewSubtitleLoopRange(cues, seconds);
      sentenceLoopRangeRef.current = range;

      if (range && seconds >= range.endSeconds - sentenceLoopToleranceSeconds) {
        media.currentTime = range.startSeconds;
        setCurrentTime(range.startSeconds);
        return;
      }
    }

    setCurrentTime(seconds);
  }

  function handleEnded(media: HTMLMediaElement) {
    if (loopMode === "MEDIA") {
      media.currentTime = 0;
      setCurrentTime(0);
      void media.play();
      return;
    }

    setIsPlaying(false);
    setCurrentTime(media.duration || 0);
  }

  function changeVolume(nextVolume: number) {
    const normalizedVolume = Math.min(Math.max(nextVolume, 0), 1);

    setVolume(normalizedVolume);
    setIsMuted(normalizedVolume === 0);

    if (mediaRef.current) {
      mediaRef.current.volume = normalizedVolume;
      mediaRef.current.muted = normalizedVolume === 0;
    }
  }

  function toggleMute() {
    const nextMuted = !isMuted;

    setIsMuted(nextMuted);

    if (mediaRef.current) {
      mediaRef.current.muted = nextMuted;
    }
  }

  function changePlaybackRate(rate: number) {
    setPlaybackRate(rate);

    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate;
    }
  }

  function changeLoopMode(mode: VideoGuideLoopMode) {
    setLoopMode(mode);
    sentenceLoopRangeRef.current = mode === "SENTENCE"
      ? findPreviewSubtitleLoopRange(cues, mediaRef.current?.currentTime ?? currentTime)
      : null;
  }

  async function enterFullscreen() {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const video = mediaType === "VIDEO" &&
      window.matchMedia("(pointer: coarse)").matches &&
      mediaRef.current instanceof HTMLVideoElement
      ? mediaRef.current
      : null;
    const orientation = video
      ? getVideoGuideFullscreenOrientation({
          videoHeight: video.videoHeight,
          videoWidth: video.videoWidth,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        })
      : null;

    setFullscreenOrientation(orientation);
    setUseFullscreenOrientationFallback(false);

    if (typeof panel.requestFullscreen !== "function") {
      setUseFullscreenOrientationFallback(Boolean(orientation));
      setIsPseudoFullscreen(true);
      return;
    }

    try {
      await panel.requestFullscreen();
      const orientationLocked = orientation
        ? await lockVideoGuideScreenOrientation(orientation)
        : true;
      setUseFullscreenOrientationFallback(!orientationLocked);
    } catch {
      setUseFullscreenOrientationFallback(Boolean(orientation));
      setIsPseudoFullscreen(true);
    }
  }

  async function exitFullscreen() {
    setIsPseudoFullscreen(false);
    setFullscreenOrientation(null);
    setUseFullscreenOrientationFallback(false);
    unlockVideoGuideScreenOrientation();

    if (document.fullscreenElement === panelRef.current && typeof document.exitFullscreen === "function") {
      try {
        await document.exitFullscreen();
      } catch {
        // 退出全屏被浏览器拒绝时保留当前状态。
      }
    }
  }

  function toggleFullscreen() {
    if (isFullscreen) {
      void exitFullscreen();
      return;
    }

    void enterFullscreen();
  }

  const player = (
    <div
      className={cn(
        "relative flex aspect-video w-full touch-pan-y items-center justify-center overflow-hidden bg-black text-white",
        isFullscreen && "fixed inset-0 z-[2147483646] h-[100dvh] w-screen",
        useFullscreenOrientationFallback && fullscreenOrientation === "landscape" && "video-guide-force-landscape",
        useFullscreenOrientationFallback && fullscreenOrientation === "portrait" && "video-guide-force-portrait"
      )}
      onClick={() => void togglePlayback()}
      onDoubleClick={toggleFullscreen}
      onFocus={revealControls}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
      ref={panelRef}
    >
      {mediaType === "VIDEO" ? (
        <video
          className="size-full bg-black object-contain"
          onEnded={(event) => handleEnded(event.currentTarget)}
          onError={() => setIsMediaError(true)}
          onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
          playsInline
          preload="metadata"
          ref={updateMediaRef}
          src={mediaUrl}
          webkit-playsinline="true"
          x5-playsinline="true"
          x5-video-player-fullscreen="false"
          x5-video-player-type="h5"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-white/10">
            <AudioLines className="size-8" />
          </div>
          <p className="text-sm font-medium">音频预览</p>
          <audio
            className="hidden"
            onEnded={(event) => handleEnded(event.currentTarget)}
            onError={() => setIsMediaError(true)}
            onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
            preload="metadata"
            ref={updateMediaRef}
            src={mediaUrl}
          />
        </div>
      )}

      {isMediaError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 px-6 text-center text-sm text-white/80">
          媒体暂时无法加载，请检查文件后重试
        </div>
      ) : null}

      {activeCue ? (
        <div
          className="pointer-events-none absolute z-20 flex justify-center px-2 transition-[bottom,left,right] duration-200 sm:px-6"
          style={{
            bottom:
              (mediaType === "VIDEO" ? videoViewportInsets.bottom : 0) +
              (captionPlacement === "ABOVE_CONTROLS" ? 92 : isFullscreen ? 24 : 16),
            left: (mediaType === "VIDEO" ? videoViewportInsets.left : 0) + (isFullscreen ? 24 : 12),
            right: (mediaType === "VIDEO" ? videoViewportInsets.right : 0) + (isFullscreen ? 24 : 12)
          }}
        >
          <p
            className={cn(
              getSubtitleTypographyClassName(subtitleStyle, isFullscreen),
              subtitleStyle === "YELLOW_OUTLINE" ? "text-yellow-300" : "text-white",
              subtitleStyle === "GRAY_BOX" && "rounded-md bg-black/65 px-3 py-1.5"
            )}
            style={
              subtitleStyle === "GRAY_BOX"
                ? undefined
                : {
                    textShadow:
                      "0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 3px 6px rgba(0,0,0,0.85)"
                  }
            }
          >
            {activeCue.text}
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-10 text-white transition-opacity duration-200 sm:px-4",
          customControlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {isMoreMenuOpen ? (
          <div className="absolute bottom-[68px] right-3 w-[min(290px,calc(100vw-24px))] rounded-lg border border-white/15 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur sm:right-4">
            <div className="flex items-center gap-2">
              <p className="w-14 shrink-0 text-xs text-white/60">播放速度</p>
              <div className="grid flex-1 grid-cols-6 gap-1">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    className={cn("h-8 rounded-md text-xs", playbackRate === rate ? "bg-white text-black" : "bg-white/10 hover:bg-white/15")}
                    key={rate}
                    onClick={() => changePlaybackRate(rate)}
                    type="button"
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
              <p className="w-14 shrink-0 text-xs text-white/60">循环方式</p>
              <div className="grid flex-1 grid-cols-3 gap-1">
                {(["NONE", "SENTENCE", "MEDIA"] as VideoGuideLoopMode[]).map((mode) => (
                  <button
                    className={cn("h-8 rounded-md text-xs", loopMode === mode ? "bg-white text-black" : "bg-white/10 hover:bg-white/15")}
                    key={mode}
                    onClick={() => changeLoopMode(mode)}
                    type="button"
                  >
                    {mode === "NONE" ? "不循环" : mode === "SENTENCE" ? "单句" : "整段"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
              <p className="w-14 shrink-0 text-xs text-white/60">字幕风格</p>
              <div className="grid flex-1 grid-cols-3 gap-1">
                {subtitleStyleOptions.map((option) => (
                  <button
                    className={cn(
                      "flex h-9 items-center justify-center rounded-md px-1 text-center text-[11px] leading-4 hover:bg-white/10",
                      subtitleStyle === option.value && "bg-white text-black hover:bg-white"
                    )}
                    key={option.value}
                    onClick={() => setSubtitleStyle(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <input
          aria-label="播放进度"
          className="mb-1.5 block h-1.5 w-full cursor-pointer accent-red-500"
          max={Math.max(duration, 0)}
          min={0}
          onChange={(event) => seekTo(Number(event.target.value))}
          onInput={(event) => seekTo(Number(event.currentTarget.value))}
          step={0.05}
          type="range"
          value={Math.min(currentTime, Math.max(duration, 0))}
        />

        <div className="flex h-10 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              aria-label={isPlaying ? "暂停" : "播放"}
              className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
              onClick={() => void togglePlayback()}
              type="button"
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <div className="relative flex items-center">
              <button
                aria-expanded={isVolumeControlOpen}
                aria-label={isVolumeControlOpen ? "收起音量调节" : "音量调节"}
                className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
                onClick={() => {
                  setIsVolumeControlOpen((value) => !value);
                  setIsControlVisible(true);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  toggleMute();
                }}
                type="button"
              >
                {isMuted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              <div
                className={cn(
                  "absolute bottom-11 left-0 z-10 overflow-hidden rounded-md bg-black/90 transition-[width,opacity] duration-200 sm:static sm:rounded-none sm:bg-transparent",
                  isVolumeControlOpen
                    ? "w-28 p-2 opacity-100 sm:w-20 sm:p-0"
                    : "pointer-events-none w-0 p-0 opacity-0"
                )}
              >
                <input
                  aria-label="音量"
                  className="block h-1 w-full cursor-pointer accent-white"
                  max={1}
                  min={0}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  step={0.05}
                  type="range"
                  value={isMuted ? 0 : volume}
                />
              </div>
            </div>
            <span className="whitespace-nowrap text-xs tabular-nums sm:text-sm">
              {formatMediaClock(currentTime)} / {duration > 0 ? formatMediaClock(duration) : "00:00"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <button
              aria-label={captionsEnabled ? "关闭字幕" : "打开字幕"}
              aria-pressed={captionsEnabled}
              className={cn("flex size-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35", captionsEnabled && "bg-white/15")}
              disabled={cues.length === 0}
              onClick={() => setCaptionsEnabled((value) => !value)}
              type="button"
            >
              {captionsEnabled ? <Captions className="size-5" /> : <CaptionsOff className="size-5" />}
            </button>
            <button
              aria-label={isFullscreen ? "退出全屏" : "全屏"}
              className="flex size-9 items-center justify-center rounded-full hover:bg-white/15"
              onClick={toggleFullscreen}
              type="button"
            >
              {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
            </button>
            <button
              aria-expanded={isMoreMenuOpen}
              aria-label="更多设置"
              className={cn("flex size-9 items-center justify-center rounded-full hover:bg-white/15", isMoreMenuOpen && "bg-white/15")}
              onClick={() => {
                setIsMoreMenuOpen((value) => !value);
                setIsControlVisible(true);
              }}
              type="button"
            >
              <MoreVertical className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return player;
}

function formatMediaClock(value: number) {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
