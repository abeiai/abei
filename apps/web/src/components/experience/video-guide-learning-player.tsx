"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent
} from "react";
import { createPortal } from "react-dom";
import {
  BookOpenText,
  Captions,
  CaptionsOff,
  ChevronLeft,
  ChevronRight,
  Film,
  ListChecks,
  Maximize2,
  Mic2,
  Minimize2,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Volume2,
  VolumeX,
  type LucideIcon
} from "lucide-react";

import { ActionToast, type ActionToastState } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  publishLearningContext,
  publishLearningEvent
} from "@/components/learning/learner-learning-provider";
import {
  defaultVideoGuideContent,
  defaultVideoGuideLesson,
  type GuideQuestion,
  type GuideWord,
  type NarrationOverlay,
  type NarrationTimelineNode,
  type RepeatLine,
  type StoredVideoGuideLesson,
  type TeacherSegment,
  type VideoGuideLessonContent
} from "@/lib/video-guide-data";
import {
  findNarrationSentenceIndexAtMediaTime,
  findSubtitleLoopRange,
  getCaptionPlacement,
  getObjectContainInsets,
  getPointerNavigationZone,
  getSubtitleNavigationState,
  getSwipeNavigationAction,
  getSubtitleTypographyClassName,
  getVideoGuideFullscreenOrientation,
  isLatestMediaSeekRequest,
  lockVideoGuideScreenOrientation,
  resolveCommittedProgressSeekTime,
  resolveProgressDisplayTime,
  shouldDispatchMediaSeekImmediately,
  shouldFallbackNarrationAudio,
  shouldPauseRefreshedVideoFrame,
  subtitleStyleOptions,
  unlockVideoGuideScreenOrientation,
  type VideoGuideFullscreenOrientation,
  type VideoGuideLoopMode,
  type VideoGuideNavigationAction,
  type VideoGuideSubtitleStyle,
  type VideoViewportInsets
} from "@/lib/video-guide-player-controls";
import {
  flushVideoPlaybackRange,
  videoGuidePartKey
} from "@/lib/video-guide-learning-tracking";
import { cn } from "@/lib/utils";
import { publicR2CdnUrl } from "@/lib/public-r2-cdn";

type RepeatMode = "逐句跟读" | "整体跟读";

const playbackRateOptions = [0.5, 0.75, 1, 1.25, 1.5] as const;
const repeatModeOptions: RepeatMode[] = ["逐句跟读", "整体跟读"];
const stageIcons: LucideIcon[] = [Film, Captions, BookOpenText, ListChecks, Mic2];
const repeatFollowDelayMs = 3000;
const progressSeekKeyboardKeys = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
const videoGuideLectureControlEventName = "video-guide-lecture-control";
const videoGuideMediaSeekEventName = "video-guide-media-seek";
const mediaSeekRequestVersions = new WeakMap<HTMLMediaElement, number>();
const videoFrameRefreshStates = new WeakMap<HTMLVideoElement, VideoFrameRefreshState>();

interface RecordedClip {
  createdAt: number;
  durationSeconds: number;
  url: string;
}

interface MediaSeekTarget {
  caption: string;
  id: string;
  pauseAtSeconds?: number;
  playAfterSeek?: boolean;
  seconds: number;
}

type LectureControlAction = "next" | "pause" | "previous" | "seek" | "toggle";

interface LectureControlEventDetail {
  action?: LectureControlAction;
  playAfterSeek?: boolean;
  seconds?: number;
}

interface VideoFrameRefreshState {
  cancelled: boolean;
  muted: boolean;
  pending: number;
  volume: number;
}

export function VideoGuideLearningPlayer({
  courseId,
  courseRevisionItemId,
  initialContent,
  initialLesson,
  learningMaterialId,
  lessonId
}: {
  courseId?: string;
  courseRevisionItemId?: string;
  initialContent?: VideoGuideLessonContent | null;
  initialLesson?: StoredVideoGuideLesson | null;
  learningMaterialId: string;
  lessonId: string;
}) {
  const router = useRouter();
  const [lesson, setLesson] = useState<StoredVideoGuideLesson>(() => initialLesson ?? defaultVideoGuideLesson(lessonId));
  const [lessonContent, setLessonContent] = useState<VideoGuideLessonContent | null>(() => initialContent ?? null);
  const content = lessonContent ?? defaultVideoGuideContent;
  const stageNames = content.stageNames.length >= stageIcons.length ? content.stageNames.slice(0, stageIcons.length) : defaultVideoGuideContent.stageNames;
  const words = content.words.length > 0 ? content.words : defaultVideoGuideContent.words;
  const segments = content.teacherSegments.length > 0 ? content.teacherSegments : defaultVideoGuideContent.teacherSegments;
  const narrationTimeline = useMemo(() => buildPlaybackNarrationTimeline(content), [content]);
  const questions = content.questions;
  const lines = content.repeatLines.length > 0 ? content.repeatLines : defaultVideoGuideContent.repeatLines;
  const [activeStage, setActiveStage] = useState(0);
  const [cueIndex, setCueIndex] = useState(0);
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0);
  const [mediaSeekTarget, setMediaSeekTarget] = useState<MediaSeekTarget | null>(null);
  const [teacherIndex, setTeacherIndex] = useState(0);
  const [narrationOverlay, setNarrationOverlay] = useState<NarrationOverlay | null>(null);
  const [playVideoBeforeNarration, setPlayVideoBeforeNarration] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showAutonomousSubtitle, setShowAutonomousSubtitle] = useState(false);
  const [showInteractiveSubtitle, setShowInteractiveSubtitle] = useState(true);
  const [showRepeatSubtitle, setShowRepeatSubtitle] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("逐句跟读");
  const recordEvaluationEnabled = false;
  const [repeatLineIndex, setRepeatLineIndex] = useState(0);
  const [interactiveGuidePlaying, setInteractiveGuidePlaying] = useState(false);
  const [recordedLineIds, setRecordedLineIds] = useState<Record<string, boolean>>({});
  const [toastState, setToastState] = useState<ActionToastState>({});
  const [visualViewportOffsetTop, setVisualViewportOffsetTop] = useState(0);
  const teacherSegment = segments[teacherIndex] ?? segments[0] ?? defaultVideoGuideContent.teacherSegments[0];
  const narrationNode = narrationTimeline[teacherIndex] ?? narrationTimeline[0] ?? null;
  const repeatLine = lines[repeatLineIndex] ?? lines[0] ?? defaultVideoGuideContent.repeatLines[0];
  const autonomousSubtitle = useMemo(
    () => subtitleForMediaTime(lines, mediaCurrentTime),
    [lines, mediaCurrentTime]
  );
  const autonomousNavigationState = useMemo(
    () => getSubtitleNavigationState(lines, mediaCurrentTime),
    [lines, mediaCurrentTime]
  );
  const answeredCount = Object.keys(answers).length;
  const correctCount = useMemo(
    () => questions.filter((question) => answers[question.id] === question.answer).length,
    [answers, questions]
  );
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;
  const learningContext = useMemo(
    () => ({
      isLearning: true,
      ...(courseId ? { courseId } : {}),
      ...(courseRevisionItemId ? { courseRevisionItemId } : {}),
      materialType: "VIDEO_GUIDE" as const,
      materialId: learningMaterialId
    }),
    [courseId, courseRevisionItemId, learningMaterialId]
  );

  useEffect(() => {
    setLesson(initialLesson ?? defaultVideoGuideLesson(lessonId));
    setLessonContent(initialContent ?? null);
  }, [initialContent, initialLesson, lessonId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      publishLearningContext({
        ...learningContext,
        partKey: videoGuidePartKey(activeStage)
      });
    });
    return () => window.clearTimeout(timer);
  }, [activeStage, learningContext]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      publishLearningEvent({ type: "MATERIAL_STARTED", partKey: "AUTONOMOUS" });
    });
    return () => {
      window.clearTimeout(timer);
      publishLearningContext({ isLearning: false });
    };
  }, [learningMaterialId]);

  useEffect(() => {
    const word = content.words[cueIndex];
    if (activeStage !== 2 || !word) return;
    const timer = window.setTimeout(() => {
      publishLearningEvent({
        type: "NODE_LEARNED",
        partKey: "HIGHLIGHTS",
        itemId: word.id
      });
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [activeStage, content.words, cueIndex]);

  useEffect(() => {
    if (activeStage === 1) {
      if (narrationNode) {
        return;
      }

      const target = mediaSeekTargetForSegment(teacherSegment, teacherIndex);

      if (target) {
        setMediaSeekTarget(target);
      }
    }

  }, [activeStage, narrationNode, teacherIndex, teacherSegment]);

  useEffect(() => {
    if (activeStage !== 1) {
      setNarrationOverlay(null);
    }
  }, [activeStage]);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return;
    }

    let animationFrame = 0;
    const syncOffset = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nextOffset = Math.max(0, Math.round(viewport.offsetTop));
        setVisualViewportOffsetTop((currentOffset) => (currentOffset === nextOffset ? currentOffset : nextOffset));
      });
    };

    syncOffset();
    viewport.addEventListener("resize", syncOffset);
    viewport.addEventListener("scroll", syncOffset);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      viewport.removeEventListener("resize", syncOffset);
      viewport.removeEventListener("scroll", syncOffset);
    };
  }, []);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastState({
        message: "学习页面链接已复制",
        status: "success",
        submittedAt: Date.now()
      });
    } catch {
      setToastState({
        message: "浏览器暂不允许复制，请手动复制链接",
        status: "error",
        submittedAt: Date.now()
      });
    }
  }

  function goNextStage() {
    setActiveStage((stage) => Math.min(stage + 1, stageNames.length - 1));
  }

  function selectWordCue(index: number) {
    const word = words[index];

    if (!word) {
      return;
    }

    setCueIndex(index);

    const target = mediaSeekTargetForWord(word, index);

    if (target) {
      setMediaSeekTarget(target);
    }
  }

  function selectTeacherSegment(index: number) {
    const segment = segments[index];

    if (!segment) {
      return;
    }

    setTeacherIndex(index);

    const target = mediaSeekTargetForSegment(segment, index);

    if (target) {
      setMediaSeekTarget(target);
    }
  }

  function selectRepeatLine(index: number) {
    const line = lines[index];

    if (!line) {
      return;
    }

    setRepeatLineIndex(index);

    const target = mediaSeekTargetForRepeatLine(line, index);

    if (target) {
      setMediaSeekTarget(target);
      emitMediaSeekTarget(target);
    }
  }

  function selectAutonomousLine(index: number) {
    const line = lines[index];

    if (!line) {
      return;
    }

    const target = mediaSeekTargetForAutonomousLine(line, index);

    if (target) {
      setMediaSeekTarget(target);
    }
  }

  function dispatchLectureControl(action: LectureControlAction, seconds?: number, playAfterSeek?: boolean) {
    window.dispatchEvent(
      new CustomEvent(videoGuideLectureControlEventName, {
        detail: { action, playAfterSeek, seconds }
      })
    );
  }

  function goPreviousMediaStep() {
    if (activeStage === 0 && autonomousNavigationState.previousIndex !== null) {
      selectAutonomousLine(autonomousNavigationState.previousIndex);
      return;
    }

    if (activeStage === 1) {
      dispatchLectureControl("previous");
      return;
    }

    if (activeStage === 2) {
      selectWordCue(Math.max(cueIndex - 1, 0));
      return;
    }

    if (activeStage === 4) {
      selectRepeatLine(Math.max(repeatLineIndex - 1, 0));
    }
  }

  function goNextMediaStep() {
    if (activeStage === 0 && autonomousNavigationState.nextIndex !== null) {
      selectAutonomousLine(autonomousNavigationState.nextIndex);
      return;
    }

    if (activeStage === 1) {
      dispatchLectureControl("next");
      return;
    }

    if (activeStage === 2) {
      selectWordCue(Math.min(cueIndex + 1, words.length - 1));
      return;
    }

    if (activeStage === 4) {
      selectRepeatLine(Math.min(repeatLineIndex + 1, lines.length - 1));
    }
  }

  const canGoPreviousMediaStep =
    activeStage === 0
      ? autonomousNavigationState.previousIndex !== null
      : activeStage === 1
        ? teacherIndex > 0
        : activeStage === 2
          ? cueIndex > 0
          : activeStage === 4
            ? repeatLineIndex > 0
            : false;
  const canGoNextMediaStep =
    activeStage === 0
      ? autonomousNavigationState.nextIndex !== null
      : activeStage === 1
        ? teacherIndex < narrationTimeline.length - 1
        : activeStage === 2
          ? cueIndex < words.length - 1
          : activeStage === 4
            ? repeatLineIndex < lines.length - 1
            : false;

  return (
    <section
      className="box-border flex w-full flex-col gap-4 overflow-x-clip px-3 py-4 sm:gap-6 sm:px-5 sm:py-6"
      style={
        {
          "--video-guide-viewport-offset-top": `${visualViewportOffsetTop}px`
        } as CSSProperties
      }
    >
      <ActionToast state={toastState} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-normal md:text-2xl">{lesson.title}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.back()} variant="outline">
            <ChevronLeft data-icon="inline-start" />
            返回
          </Button>
          <Button onClick={copyShareUrl} variant="outline">
            <Share2 />
            分享
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <div className="sticky top-[max(4.5rem,var(--video-guide-viewport-offset-top,0px))] z-40 min-w-0 self-start bg-background pb-2 lg:top-20 lg:bg-transparent lg:pb-0">
          <StudyMediaPanel
            activeStage={activeStage}
            autonomousSubtitle={autonomousSubtitle}
            canGoNext={canGoNextMediaStep}
            canGoPrevious={canGoPreviousMediaStep}
            isLecturePlaying={interactiveGuidePlaying}
            mediaType={lesson.mediaType}
            mediaUrl={lesson.mediaUrl}
            onNext={goNextMediaStep}
            onMediaTimeUpdate={setMediaCurrentTime}
            onPlaybackRange={(startSeconds, endSeconds, mediaDurationSeconds) => {
              publishLearningEvent({
                type: "MEDIA_PROGRESS",
                partKey: "AUTONOMOUS",
                startSeconds,
                endSeconds,
                mediaDurationSeconds
              });
            }}
            onProgressSeek={(seconds, playAfterSeek) => {
              if (activeStage === 1) {
                dispatchLectureControl("seek", seconds, playAfterSeek);
              }
            }}
            onProgressSeekStart={() => {
              if (activeStage === 1) {
                dispatchLectureControl("pause");
              }
            }}
            onPrevious={goPreviousMediaStep}
            onToggleLecturePlayback={() => dispatchLectureControl("toggle")}
            playbackRate={playbackRate}
            repeatLine={repeatLine}
            repeatLines={lines}
            seekTarget={mediaSeekTarget}
            showAutonomousSubtitle={showAutonomousSubtitle}
            showInteractiveSubtitle={showInteractiveSubtitle}
            showRepeatSubtitle={showRepeatSubtitle}
            narrationNode={narrationNode}
            narrationOverlay={narrationOverlay}
            setShowAutonomousSubtitle={setShowAutonomousSubtitle}
            setShowInteractiveSubtitle={setShowInteractiveSubtitle}
            setShowRepeatSubtitle={setShowRepeatSubtitle}
            setPlaybackRate={setPlaybackRate}
            teacherSegment={teacherSegment}
            vocabularyWord={words[cueIndex] ?? words[0] ?? null}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
            <StageTabs
              activeStage={activeStage}
              onChange={setActiveStage}
              stageNames={stageNames}
            />
            {activeStage === 0 ? (
              <StageOne
                onNext={goNextStage}
                onPlaybackRateChange={setPlaybackRate}
                onSubtitleVisibilityChange={setShowAutonomousSubtitle}
                playbackRate={playbackRate}
                showAutonomousSubtitle={showAutonomousSubtitle}
              />
            ) : null}
            {activeStage === 1 ? (
              <StageInteractiveGuide
                onNext={goNextStage}
                mediaCurrentTime={mediaCurrentTime}
                narrationAudioTruncated={content.narrationAudioTruncated}
                narrationAudioUrl={content.narrationAudioUrl}
                narrationScript={content.narrationScript}
                narrationTimeline={narrationTimeline}
                onNodeLearned={(itemId) => {
                  publishLearningEvent({ type: "NODE_LEARNED", partKey: "GUIDED", itemId });
                }}
                onSelectSegment={selectTeacherSegment}
                onPlayingChange={setInteractiveGuidePlaying}
                onSetOverlay={setNarrationOverlay}
                onSubtitleVisibilityChange={setShowInteractiveSubtitle}
                playVideoBeforeNarration={playVideoBeforeNarration}
                segments={segments}
                setPlayVideoBeforeNarration={setPlayVideoBeforeNarration}
                setTeacherIndex={setTeacherIndex}
                setMediaSeekTarget={setMediaSeekTarget}
                showInteractiveSubtitle={showInteractiveSubtitle}
                teacherIndex={teacherIndex}
              />
            ) : null}
            {activeStage === 2 ? (
              <StageVocabularyCards
                onNext={goNextStage}
                onSelectWord={selectWordCue}
                wordIndex={cueIndex}
                words={words}
              />
            ) : null}
            {activeStage === 3 ? (
              <StagePractice
                answers={answers}
                correctCount={correctCount}
                onAnswer={(questionId, answer) => {
                  setAnswers((items) => ({ ...items, [questionId]: answer }));
                  publishLearningEvent({
                    type: "PRACTICE_SUBMITTED",
                    partKey: "PRACTICE",
                    itemId: questionId,
                    selectedIndex: answer
                  });
                }}
                onNext={goNextStage}
                answeredCount={answeredCount}
                questions={questions}
              />
            ) : null}
            {activeStage === 4 ? (
              <StageRepeatTraining
                lines={lines}
                recordedLineIds={recordedLineIds}
                recordEvaluationEnabled={recordEvaluationEnabled}
                repeatLineIndex={repeatLineIndex}
                repeatMode={repeatMode}
                onLineCompleted={(itemId) => {
                  if (!content.repeatLines.some((line) => line.id === itemId)) return;
                  publishLearningEvent({
                    type: "READ_ALONG_COMPLETED",
                    partKey: "READ_ALONG",
                    itemId
                  });
                }}
                onSelectLine={selectRepeatLine}
                setRecordedLineIds={setRecordedLineIds}
                setRepeatMode={setRepeatMode}
                setShowRepeatSubtitle={setShowRepeatSubtitle}
                showRepeatSubtitle={showRepeatSubtitle}
              />
            ) : null}
        </div>
      </div>
    </section>
  );
}

function StudyMediaPanel({
  activeStage,
  autonomousSubtitle,
  canGoNext,
  canGoPrevious,
  isLecturePlaying,
  mediaType,
  mediaUrl,
  narrationNode,
  narrationOverlay,
  onNext,
  onMediaTimeUpdate,
  onPlaybackRange,
  onProgressSeek,
  onProgressSeekStart,
  onPrevious,
  onToggleLecturePlayback,
  playbackRate,
  repeatLine,
  repeatLines,
  seekTarget,
  showAutonomousSubtitle,
  showInteractiveSubtitle,
  showRepeatSubtitle,
  setShowAutonomousSubtitle,
  setShowInteractiveSubtitle,
  setShowRepeatSubtitle,
  setPlaybackRate,
  teacherSegment,
  vocabularyWord
}: {
  activeStage: number;
  autonomousSubtitle: string;
  canGoNext: boolean;
  canGoPrevious: boolean;
  isLecturePlaying: boolean;
  mediaType?: "VIDEO" | "AUDIO";
  mediaUrl?: string | null;
  narrationNode: NarrationTimelineNode | null;
  narrationOverlay: NarrationOverlay | null;
  onNext: () => void;
  onMediaTimeUpdate: (seconds: number) => void;
  onPlaybackRange: (
    startSeconds: number,
    endSeconds: number,
    mediaDurationSeconds: number
  ) => void;
  onProgressSeek: (seconds: number, playAfterSeek: boolean) => void;
  onProgressSeekStart: () => void;
  onPrevious: () => void;
  onToggleLecturePlayback: () => void;
  playbackRate: number;
  repeatLine: RepeatLine;
  repeatLines: RepeatLine[];
  seekTarget: MediaSeekTarget | null;
  showAutonomousSubtitle: boolean;
  showInteractiveSubtitle: boolean;
  showRepeatSubtitle: boolean;
  setShowAutonomousSubtitle: Dispatch<SetStateAction<boolean>>;
  setShowInteractiveSubtitle: Dispatch<SetStateAction<boolean>>;
  setShowRepeatSubtitle: Dispatch<SetStateAction<boolean>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  teacherSegment: TeacherSegment;
  vocabularyWord: GuideWord | null;
}) {
  const normalizedMediaType = mediaType ?? mediaTypeFromUrl(mediaUrl);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controlHideTimerRef = useRef<number | null>(null);
  const lastEventSeekIdRef = useRef<string | null>(null);
  const pauseAtSecondsRef = useRef<number | null>(null);
  const playbackRangeStartRef = useRef<number | null>(null);
  const playbackRangeEndRef = useRef<number | null>(null);
  const progressSeekActiveRef = useRef(false);
  const progressSeekValueRef = useRef<number | null>(null);
  const progressSeekWasPlayingRef = useRef(false);
  const suppressVideoClickUntilRef = useRef(0);
  const touchGestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isControlVisible, setIsControlVisible] = useState(true);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [fullscreenOrientation, setFullscreenOrientation] = useState<VideoGuideFullscreenOrientation | null>(null);
  const [useFullscreenOrientationFallback, setUseFullscreenOrientationFallback] = useState(false);
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isVolumeControlOpen, setIsVolumeControlOpen] = useState(false);
  const [loopMode, setLoopMode] = useState<VideoGuideLoopMode>("NONE");
  const [pointerNavigationZone, setPointerNavigationZone] = useState<VideoGuideNavigationAction | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<VideoGuideSubtitleStyle>("WHITE_OUTLINE");
  const [videoViewportInsets, setVideoViewportInsets] = useState<VideoViewportInsets>({
    bottom: 0,
    left: 0,
    right: 0,
    top: 0
  });
  const [volume, setVolume] = useState(1);
  const isFullscreen = isBrowserFullscreen || isPseudoFullscreen;
  const captionText = activeStage === 2
    ? autonomousSubtitle || vocabularyWord?.subtitle || ""
    : captionForStage(activeStage, {
        autonomousSubtitle,
        narrationNode,
        repeatLine,
        showAutonomousSubtitle,
        showInteractiveSubtitle,
        showRepeatSubtitle,
        teacherSegment
      });
  const showCaption = Boolean(captionText);
  const captionsEnabled =
    activeStage === 0
      ? showAutonomousSubtitle
      : activeStage === 1
        ? showInteractiveSubtitle
        : activeStage === 2
          ? true
        : activeStage === 4
          ? showRepeatSubtitle
          : false;
  const canToggleCaption = activeStage === 0 || activeStage === 1 || activeStage === 4;
  const durationLabel = duration > 0 ? formatMediaClock(duration) : mediaUrl ? "未知时长" : "05:00";
  const effectiveNarrationOverlay =
    activeStage === 1 && isFullscreen ? narrationOverlay ?? firstOverlayForNarrationNode(narrationNode) : narrationOverlay;
  const playbackActive = activeStage === 1 ? isLecturePlaying : isMediaPlaying;
  const customControlsVisible = isControlVisible || !playbackActive || isMoreMenuOpen || isVolumeControlOpen;
  const captionPlacement = getCaptionPlacement(customControlsVisible);
  const sentenceNavigationEnabled = activeStage === 0 || activeStage === 1 || activeStage === 2 || activeStage === 4;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        flushTrackedPlayback(getMediaElement());
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    return () => flushTrackedPlayback(getMediaElement());
  }, [activeStage]);

  const refreshVideoViewportInsets = useCallback((video: HTMLVideoElement | null = videoRef.current) => {
    if (!video) {
      return;
    }

    const nextInsets = getObjectContainInsets(
      video.clientWidth,
      video.clientHeight,
      video.videoWidth,
      video.videoHeight
    );

    setVideoViewportInsets((currentInsets) =>
      currentInsets.bottom === nextInsets.bottom &&
      currentInsets.left === nextInsets.left &&
      currentInsets.right === nextInsets.right &&
      currentInsets.top === nextInsets.top
        ? currentInsets
        : nextInsets
    );
  }, []);

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

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isPseudoFullscreen]);

  useEffect(() => {
    if (!isPseudoFullscreen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPseudoFullscreen(false);
        setFullscreenOrientation(null);
        setUseFullscreenOrientationFallback(false);
        unlockVideoGuideScreenOrientation();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPseudoFullscreen]);

  useEffect(() => {
    return () => {
      if (controlHideTimerRef.current !== null) {
        window.clearTimeout(controlHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    revealControls();
  }, [isMoreMenuOpen, isVolumeControlOpen, playbackActive]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }

    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || normalizedMediaType !== "VIDEO") {
      return;
    }

    refreshVideoViewportInsets(video);

    const resizeObserver = new ResizeObserver(() => refreshVideoViewportInsets(video));
    resizeObserver.observe(video);

    return () => resizeObserver.disconnect();
  }, [isFullscreen, mediaUrl, normalizedMediaType, refreshVideoViewportInsets]);

  useEffect(() => {
    function handleMediaSeekEvent(event: Event) {
      const detail = (event as CustomEvent<Partial<MediaSeekTarget>>).detail;

      if (!detail || typeof detail.seconds !== "number") {
        return;
      }

      const media = videoRef.current ?? audioRef.current;

      if (!media) {
        return;
      }

      lastEventSeekIdRef.current = typeof detail.id === "string" ? detail.id : null;
      applyMediaSeekTarget(media, detail);
    }

    window.addEventListener(videoGuideMediaSeekEventName, handleMediaSeekEvent);

    return () => {
      window.removeEventListener(videoGuideMediaSeekEventName, handleMediaSeekEvent);
    };
  }, [onMediaTimeUpdate]);

  useEffect(() => {
    if (!seekTarget) {
      return;
    }

    const media = videoRef.current ?? audioRef.current;

    if (!media) {
      return;
    }

    if (seekTarget.id && lastEventSeekIdRef.current === seekTarget.id) {
      lastEventSeekIdRef.current = null;
      return;
    }

    applyMediaSeekTarget(media, seekTarget);
  }, [onMediaTimeUpdate, seekTarget]);

  function applyMediaSeekTarget(media: HTMLMediaElement, target: Partial<MediaSeekTarget>) {
    pauseAtSecondsRef.current =
      target.playAfterSeek && typeof target.pauseAtSeconds === "number" ? target.pauseAtSeconds : null;

    seekMedia(media, target.seconds ?? 0, onMediaTimeUpdate, setDisplayTime, {
      playAfterSeek: target.playAfterSeek
    });
  }

  function handleMediaTimeUpdate(element: HTMLMediaElement) {
    setDisplayTime((currentTime) =>
      resolveProgressDisplayTime({
        currentDisplayTime: currentTime,
        isSeeking: progressSeekActiveRef.current,
        mediaTime: element.currentTime
      })
    );
    setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    onMediaTimeUpdate(element.currentTime);
    trackPlayback(element);

    if (pauseAtSecondsRef.current !== null && element.currentTime >= pauseAtSecondsRef.current - 0.05) {
      element.pause();
      element.currentTime = pauseAtSecondsRef.current;
      pauseAtSecondsRef.current = null;
      setDisplayTime(element.currentTime);
      onMediaTimeUpdate(element.currentTime);
      return;
    }

    if (loopMode === "SENTENCE") {
      const range = findSubtitleLoopRange(repeatLines, Math.max(0, element.currentTime - 0.08));

      if (range && element.currentTime >= range.endSeconds - 0.05) {
        element.currentTime = range.startSeconds;
        setDisplayTime(range.startSeconds);
        onMediaTimeUpdate(range.startSeconds);
        void element.play().catch(() => undefined);
      }
    }
  }

  function handleMediaMetadata(element: HTMLMediaElement) {
    setDisplayTime(element.currentTime);
    setDuration(Number.isFinite(element.duration) ? element.duration : 0);

    if (element instanceof HTMLVideoElement) {
      refreshVideoViewportInsets(element);
    }

    if (seekTarget) {
      applyMediaSeekTarget(element, seekTarget);
    }
  }

  function getMediaElement() {
    return videoRef.current ?? audioRef.current;
  }

  function revealControls() {
    setIsControlVisible(true);

    if (controlHideTimerRef.current !== null) {
      window.clearTimeout(controlHideTimerRef.current);
    }

    if (playbackActive && !isMoreMenuOpen && !isVolumeControlOpen) {
      controlHideTimerRef.current = window.setTimeout(() => {
        setIsControlVisible(false);
      }, 2600);
    }
  }

  function handleMediaEnded(element: HTMLMediaElement) {
    flushTrackedPlayback(element);
    if (loopMode === "MEDIA") {
      element.currentTime = 0;
      setDisplayTime(0);
      onMediaTimeUpdate(0);
      void element.play().catch(() => undefined);
      return;
    }

    setIsMediaPlaying(false);
    setIsControlVisible(true);
  }

  function handleMediaPlay(element: HTMLMediaElement) {
    setIsMediaPlaying(true);
    if (activeStage === 0) {
      playbackRangeStartRef.current = element.currentTime;
      playbackRangeEndRef.current = element.currentTime;
    }
  }

  function handleMediaPause(element: HTMLMediaElement) {
    flushTrackedPlayback(element);
    setIsMediaPlaying(false);
  }

  function trackPlayback(element: HTMLMediaElement) {
    if (activeStage !== 0 || element.paused) return;
    const current = element.currentTime;
    const previous = playbackRangeEndRef.current;
    if (previous !== null && (current < previous || current - previous > 2)) {
      flushTrackedPlayback(element, previous);
      playbackRangeStartRef.current = current;
    } else if (playbackRangeStartRef.current === null) {
      playbackRangeStartRef.current = current;
    }
    playbackRangeEndRef.current = current;
    if (current - (playbackRangeStartRef.current ?? current) >= 5) {
      flushTrackedPlayback(element, current);
      playbackRangeStartRef.current = current;
      playbackRangeEndRef.current = current;
    }
  }

  function flushTrackedPlayback(element: HTMLMediaElement | null, endSeconds?: number) {
    const startSeconds = playbackRangeStartRef.current;
    const finalSeconds = endSeconds ?? playbackRangeEndRef.current;
    playbackRangeStartRef.current = null;
    playbackRangeEndRef.current = null;
    if (!element || startSeconds === null || finalSeconds === null) return;
    const range = flushVideoPlaybackRange(startSeconds, finalSeconds, true);
    const mediaDurationSeconds = Number.isFinite(element.duration) ? element.duration : 0;
    if (range && mediaDurationSeconds > 0) {
      onPlaybackRange(range.startSeconds, range.endSeconds, mediaDurationSeconds);
    }
  }

  function seekFromProgress(value: number) {
    const media = getMediaElement();

    if (!media || duration <= 0) {
      return;
    }

    pauseAtSecondsRef.current = null;
    media.currentTime = value;
    setDisplayTime(value);
    onMediaTimeUpdate(value);
    revealControls();
  }

  function beginProgressSeek() {
    if (progressSeekActiveRef.current) {
      return;
    }

    progressSeekActiveRef.current = true;
    progressSeekValueRef.current = displayTime;
    progressSeekWasPlayingRef.current = isLecturePlaying;
    pauseAtSecondsRef.current = null;

    if (activeStage === 1) {
      getMediaElement()?.pause();
      onProgressSeekStart();
    }
  }

  function commitProgressSeek(value: number) {
    const committedValue = resolveCommittedProgressSeekTime({
      controlTime: value,
      lastInputTime: progressSeekValueRef.current
    });

    progressSeekActiveRef.current = false;
    progressSeekValueRef.current = null;
    seekFromProgress(committedValue);
    onProgressSeek(committedValue, progressSeekWasPlayingRef.current);
    progressSeekWasPlayingRef.current = false;
  }

  function changeVolume(nextVolume: number) {
    const media = getMediaElement();

    if (!media) {
      return;
    }

    media.volume = nextVolume;
    media.muted = nextVolume === 0;
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    revealControls();
  }

  function changePlaybackRate(nextRate: number) {
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }

    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }

    setPlaybackRate(nextRate);
    setIsMoreMenuOpen(false);
    revealControls();
  }

  function handlePlayerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    revealControls();

    if (event.pointerType !== "mouse" || !sentenceNavigationEnabled) {
      setPointerNavigationZone(null);
      return;
    }

    const playerRect = event.currentTarget.getBoundingClientRect();
    setPointerNavigationZone(getPointerNavigationZone(event.clientX - playerRect.left, playerRect.width));
  }

  function handlePlayerTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    revealControls();
    setPointerNavigationZone(null);

    const target = event.target as HTMLElement;
    const touch = event.touches[0];

    if (!touch || target.closest("button, input, a, [role='button']")) {
      touchGestureStartRef.current = null;
      return;
    }

    touchGestureStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handlePlayerTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const startPoint = touchGestureStartRef.current;
    const touch = event.changedTouches[0];
    touchGestureStartRef.current = null;

    if (!startPoint || !touch || !sentenceNavigationEnabled) {
      return;
    }

    const action = getSwipeNavigationAction(
      startPoint.x,
      startPoint.y,
      touch.clientX,
      touch.clientY,
      event.currentTarget.clientWidth
    );

    if (!action) {
      return;
    }

    suppressVideoClickUntilRef.current = Date.now() + 650;

    if (action === "PREVIOUS" && canGoPrevious) {
      onPrevious();
    }

    if (action === "NEXT" && canGoNext) {
      onNext();
    }
  }

  function handleVideoClick() {
    if (Date.now() < suppressVideoClickUntilRef.current) {
      return;
    }

    togglePlayback();
  }

  function togglePlayback() {
    if (activeStage === 1) {
      onToggleLecturePlayback();
      return;
    }

    const media = getMediaElement();

    if (!media) {
      return;
    }

    if (media.paused) {
      playMediaWithSound(media);
      return;
    }

    media.pause();
  }

  function toggleCaption() {
    if (activeStage === 0) {
      setShowAutonomousSubtitle((value) => !value);
      return;
    }

    if (activeStage === 1) {
      setShowInteractiveSubtitle((value) => !value);
      return;
    }

    if (activeStage === 4) {
      setShowRepeatSubtitle((value) => !value);
    }
  }

  async function enterFullscreen() {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const video = videoRef.current;
    const orientation = normalizedMediaType === "VIDEO" && isCoarsePointerDevice()
      ? getVideoGuideFullscreenOrientation({
          videoHeight: video?.videoHeight ?? 0,
          videoWidth: video?.videoWidth ?? 0,
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
        // 浏览器拒绝退出全屏时保持当前展示，不影响播放。
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

  const mediaPanel = (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-border bg-foreground text-background shadow-sm",
        isFullscreen && "fixed inset-0 z-[2147483646] flex h-[100dvh] w-screen flex-col rounded-none border-0 bg-black shadow-none",
        useFullscreenOrientationFallback && fullscreenOrientation === "landscape" && "video-guide-force-landscape",
        useFullscreenOrientationFallback && fullscreenOrientation === "portrait" && "video-guide-force-portrait"
      )}
      ref={panelRef}
    >
      <div
        className={cn(
          "relative flex touch-pan-y items-center justify-center bg-black",
          isFullscreen ? "min-h-0 flex-1" : "aspect-video min-h-[180px] sm:min-h-[220px]"
        )}
        onPointerLeave={() => setPointerNavigationZone(null)}
        onPointerMove={handlePlayerPointerMove}
        onTouchCancel={() => {
          touchGestureStartRef.current = null;
        }}
        onTouchEnd={handlePlayerTouchEnd}
        onTouchStart={handlePlayerTouchStart}
      >
        {mediaUrl && normalizedMediaType === "VIDEO" ? (
          <video
            className="relative z-0 size-full bg-black object-contain"
            onClick={handleVideoClick}
            onEnded={(event) => handleMediaEnded(event.currentTarget)}
            onLoadedMetadata={(event) => handleMediaMetadata(event.currentTarget)}
            onPause={(event) => handleMediaPause(event.currentTarget)}
            onPlay={(event) => handleMediaPlay(event.currentTarget)}
            onSeeking={(event) => flushTrackedPlayback(event.currentTarget)}
            onTimeUpdate={(event) => handleMediaTimeUpdate(event.currentTarget)}
            playsInline
            preload="metadata"
            ref={videoRef}
            src={mediaUrl}
            webkit-playsinline="true"
            x5-playsinline="true"
            x5-video-player-fullscreen="false"
            x5-video-player-type="h5"
          />
        ) : null}

        {mediaUrl && normalizedMediaType === "AUDIO" ? (
          <div
            className="relative z-10 flex size-full flex-col items-center justify-center gap-5 px-6 pb-16 text-center"
            onClick={handleVideoClick}
          >
            <div className="flex size-16 items-center justify-center rounded-full bg-background/10">
              <Volume2 className="size-8" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-background">音频学习播放区</p>
              <p className="text-xs text-background/60">{mediaStageLabel(activeStage)}</p>
            </div>
            <audio
              className="hidden"
              onEnded={(event) => handleMediaEnded(event.currentTarget)}
              onLoadedMetadata={(event) => handleMediaMetadata(event.currentTarget)}
              onPause={(event) => handleMediaPause(event.currentTarget)}
              onPlay={(event) => handleMediaPlay(event.currentTarget)}
              onSeeking={(event) => flushTrackedPlayback(event.currentTarget)}
              onTimeUpdate={(event) => handleMediaTimeUpdate(event.currentTarget)}
              preload="metadata"
              ref={audioRef}
              src={publicR2CdnUrl(mediaUrl)}
            />
          </div>
        ) : null}

        {!mediaUrl ? (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
            <div className="relative flex flex-col items-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-background/10">
                <Play className="size-8" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-background">学习媒体播放区</p>
                <p className="text-xs text-background/60">{mediaStageLabel(activeStage)}</p>
              </div>
            </div>
          </>
        ) : null}

        {mediaUrl && normalizedMediaType === "VIDEO" && activeStage !== 2 ? (
          <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-black/60 px-2.5 py-1.5 text-[11px] text-white sm:left-4 sm:top-4 sm:px-3 sm:py-2 sm:text-xs">
            {mediaStageLabel(activeStage)}
          </div>
        ) : null}

        {mediaUrl && activeStage === 2 && vocabularyWord ? (
          <div
            className="pointer-events-none absolute z-20 max-w-[min(72%,420px)] rounded-md bg-background/95 px-4 py-3 text-foreground shadow-lg backdrop-blur-sm"
            style={{
              left: normalizedMediaType === "VIDEO" ? videoViewportInsets.left + (isFullscreen ? 24 : 12) : 12,
              top: normalizedMediaType === "VIDEO" ? videoViewportInsets.top + (isFullscreen ? 24 : 12) : 12
            }}
          >
            <p className="break-words text-xl font-semibold leading-tight">{vocabularyWord.word}</p>
            {guideWordPhonetic(vocabularyWord) ? (
              <p className="mt-1 text-xs text-muted-foreground">{guideWordPhonetic(vocabularyWord)}</p>
            ) : null}
            <p className="mt-1 text-sm leading-5">{vocabularyWord.meaning}</p>
          </div>
        ) : null}

        {activeStage === 1 && effectiveNarrationOverlay ? (
          <div
            className={cn(
              "pointer-events-none absolute left-3 top-12 z-20 max-w-[78%] rounded-md bg-background px-3 py-2 text-foreground shadow-lg sm:left-5 sm:top-5 sm:px-5 sm:py-3",
              isFullscreen && "max-w-[min(80vw,720px)]"
            )}
          >
            <p className="text-xs text-muted-foreground">老师正在讲</p>
            <p className="break-words text-lg font-semibold leading-tight sm:text-2xl lg:text-3xl">{effectiveNarrationOverlay.text}</p>
            {effectiveNarrationOverlay.subText ? <p className="mt-1 text-xs leading-5 sm:text-sm">{effectiveNarrationOverlay.subText}</p> : null}
          </div>
        ) : null}

        {showCaption ? (
          <div
            className="pointer-events-none absolute z-20 flex justify-center px-2 transition-[bottom,left,right] duration-200 sm:px-6"
            style={{
              bottom:
                (normalizedMediaType === "VIDEO" ? videoViewportInsets.bottom : 0) +
                (captionPlacement === "ABOVE_CONTROLS" ? 92 : isFullscreen ? 24 : 16),
              left: (normalizedMediaType === "VIDEO" ? videoViewportInsets.left : 0) + (isFullscreen ? 24 : 12),
              right: (normalizedMediaType === "VIDEO" ? videoViewportInsets.right : 0) + (isFullscreen ? 24 : 12)
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
              {captionText}
            </p>
          </div>
        ) : null}

        {mediaUrl && sentenceNavigationEnabled ? (
          <>
            <button
              aria-label="上一句"
              className={cn(
                "absolute top-1/2 z-30 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition-[opacity,background-color,transform] hover:scale-105 hover:bg-black/80 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 sm:size-12",
                pointerNavigationZone === "PREVIOUS" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              )}
              disabled={!canGoPrevious}
              onClick={(event) => {
                event.stopPropagation();
                onPrevious();
              }}
              style={{ left: (normalizedMediaType === "VIDEO" ? videoViewportInsets.left : 0) + (isFullscreen ? 24 : 12) }}
              title="上一句"
              type="button"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              aria-label="下一句"
              className={cn(
                "absolute top-1/2 z-30 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition-[opacity,background-color,transform] hover:scale-105 hover:bg-black/80 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 sm:size-12",
                pointerNavigationZone === "NEXT" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              )}
              disabled={!canGoNext}
              onClick={(event) => {
                event.stopPropagation();
                onNext();
              }}
              style={{ right: (normalizedMediaType === "VIDEO" ? videoViewportInsets.right : 0) + (isFullscreen ? 24 : 12) }}
              title="下一句"
              type="button"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}

        {mediaUrl ? (
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-10 text-white transition-opacity duration-200 sm:px-4",
              customControlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            onClick={(event) => event.stopPropagation()}
            onFocus={revealControls}
          >
            {isMoreMenuOpen ? (
              <div className="absolute bottom-[68px] right-3 w-[min(290px,calc(100vw-24px))] rounded-lg border border-white/15 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur sm:right-4">
                <div className="flex items-center gap-2">
                  <p className="w-14 shrink-0 text-xs text-white/60">播放速度</p>
                  <div className="grid flex-1 grid-cols-6 gap-1">
                    {playbackRateOptions.map((rate) => (
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
                        onClick={() => setLoopMode(mode)}
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
                        <span>{option.label}</span>
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
              onInput={(event) => {
                const seconds = Number(event.currentTarget.value);

                progressSeekValueRef.current = seconds;
                seekFromProgress(seconds);
              }}
              onKeyDown={(event) => {
                if (progressSeekKeyboardKeys.has(event.key)) {
                  beginProgressSeek();
                }
              }}
              onKeyUp={(event) => {
                if (progressSeekKeyboardKeys.has(event.key)) {
                  commitProgressSeek(Number(event.currentTarget.value));
                }
              }}
              onPointerCancel={() => {
                progressSeekActiveRef.current = false;
                progressSeekValueRef.current = null;
              }}
              onPointerDown={beginProgressSeek}
              onPointerUp={(event) => commitProgressSeek(Number(event.currentTarget.value))}
              step={0.05}
              type="range"
              value={Math.min(displayTime, Math.max(duration, 0))}
            />

            <div className="flex h-10 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  aria-label={playbackActive ? "暂停" : "播放"}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
                  onClick={togglePlayback}
                  type="button"
                >
                  {playbackActive ? <Pause className="size-5" /> : <Play className="size-5" />}
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
                  {formatMediaClock(displayTime)} / {durationLabel}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <button
                  aria-label={captionsEnabled ? "关闭字幕" : "打开字幕"}
                  aria-pressed={captionsEnabled}
                  className={cn("flex size-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35", captionsEnabled && "bg-white/15")}
                  disabled={!canToggleCaption}
                  onClick={toggleCaption}
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
        ) : null}
      </div>
    </div>
  );

  return isPseudoFullscreen && typeof document !== "undefined"
    ? createPortal(mediaPanel, document.body)
    : mediaPanel;
}

function StageTabs({
  activeStage,
  onChange,
  stageNames
}: {
  activeStage: number;
  onChange: (stage: number) => void;
  stageNames: string[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-1 gap-y-3 rounded-md border border-border bg-card px-2 py-4">
      {stageNames.map((name, index) => {
        const Icon = stageIcons[index] ?? Film;
        const active = index === activeStage;
        const middleIndex = Math.floor(stageNames.length / 2);
        const tooltipAlignment =
          stageNames.length % 2 === 1 && index === middleIndex
            ? "left-1/2 -translate-x-1/2"
            : index >= middleIndex
              ? "right-0"
              : "left-0";

        return (
          <div className="group relative flex min-w-max flex-[1_1_4.25rem] justify-center" key={`${index}-${name}`}>
            <button
              aria-label={`${name}：${stageDescription(index)}`}
              className={cn(
                "flex min-w-max flex-col items-center gap-1.5 rounded-md px-0.5 py-1 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onChange(index)}
              type="button"
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors sm:size-11 xl:size-12",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background group-hover:border-foreground group-hover:bg-secondary"
                )}
              >
                <Icon className="size-5 shrink-0 xl:size-6" />
              </span>
              <span className="whitespace-nowrap">{name}</span>
            </button>
            <div
              className={cn(
                "pointer-events-none invisible absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
                tooltipAlignment
              )}
            >
              {stageDescription(index)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageOne({
  onNext,
  onPlaybackRateChange,
  onSubtitleVisibilityChange,
  playbackRate,
  showAutonomousSubtitle
}: {
  onNext: () => void;
  onPlaybackRateChange: (value: number) => void;
  onSubtitleVisibilityChange: (value: boolean) => void;
  playbackRate: number;
  showAutonomousSubtitle: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-md border border-border bg-background p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">字幕</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "显示字幕", value: true },
              { label: "隐藏字幕", value: false }
            ].map((option) => (
              <button
                className={cn(
                  "h-10 rounded-md border px-3 text-sm transition-colors",
                  showAutonomousSubtitle === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-secondary"
                )}
                key={option.label}
                onClick={() => onSubtitleVisibilityChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">语速</span>
          <div className="grid grid-cols-5 gap-2">
            {playbackRateOptions.map((rate) => (
              <button
                className={cn(
                  "h-10 rounded-md border px-2 text-sm transition-colors",
                  playbackRate === rate
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-secondary"
                )}
                key={rate}
                onClick={() => onPlaybackRateChange(rate)}
                type="button"
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>
      </div>
      <Button className="w-fit" onClick={onNext}>
        进入互动讲解
      </Button>
    </div>
  );
}

function StageVocabularyCards({
  onNext,
  onSelectWord,
  wordIndex,
  words
}: {
  onNext: () => void;
  onSelectWord: (index: number) => void;
  wordIndex: number;
  words: GuideWord[];
}) {
  const activeWord = words[wordIndex] ?? words[0];
  const hasPrevious = wordIndex > 0;
  const hasNext = wordIndex < words.length - 1;

  if (!activeWord) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            暂未提取到讲解词语，可以直接进入随堂练习。
          </p>
        </div>
        <Button className="w-fit" onClick={onNext}>
          进入随堂练习
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-border bg-background p-4">
        <p className="font-medium">词语卡片</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          这里复习互动讲解里讲过的单词或短语。每张卡片只看一个重点表达，把它和刚才的句子、画面重新连起来。
        </p>
      </div>
      <div className="rounded-md border border-border bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline">
            {wordIndex + 1}/{words.length}
          </Badge>
          <span className="text-sm text-muted-foreground">{activeWord.appearsAt}</span>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-2xl font-semibold tracking-normal sm:text-4xl">{activeWord.word}</p>
          {guideWordPhonetic(activeWord) ? (
            <p className="text-sm text-muted-foreground">{guideWordPhonetic(activeWord)}</p>
          ) : null}
          <p className="text-base leading-7 sm:text-lg sm:leading-8">{activeWord.meaning}</p>
          <p className="text-sm leading-6 text-muted-foreground">{activeWord.note}</p>
          {activeWord.subtitle ? (
            <div className="mt-2 rounded-md border border-border bg-secondary/50 p-3 text-sm leading-6">
              {activeWord.subtitle}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={!hasPrevious} onClick={() => onSelectWord(wordIndex - 1)} variant="outline">
            上一张
          </Button>
          <Button disabled={!hasNext} onClick={() => onSelectWord(wordIndex + 1)} variant="outline">
            下一张
          </Button>
          <Button onClick={onNext}>
            进入随堂练习
          </Button>
        </div>
      </div>
      {words.length > 1 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {words.map((word, index) => (
            <button
              className={cn(
                "rounded-md border p-3 text-left text-sm transition-colors",
                index === wordIndex ? "border-foreground bg-foreground text-background" : "border-border bg-background"
              )}
              key={word.id}
              onClick={() => onSelectWord(index)}
              type="button"
            >
              <span className="font-medium">{word.word}</span>
              <span className={cn("mt-1 block truncate", index === wordIndex ? "text-background/70" : "text-muted-foreground")}>
                {word.meaning}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StageInteractiveGuide({
  mediaCurrentTime,
  narrationAudioTruncated,
  narrationAudioUrl,
  narrationScript,
  narrationTimeline,
  onNext,
  onNodeLearned,
  onPlayingChange,
  onSelectSegment,
  onSetOverlay,
  onSubtitleVisibilityChange,
  playVideoBeforeNarration,
  segments,
  setPlayVideoBeforeNarration,
  setTeacherIndex,
  setMediaSeekTarget,
  showInteractiveSubtitle,
  teacherIndex
}: {
  mediaCurrentTime: number;
  narrationAudioTruncated?: boolean;
  narrationAudioUrl?: string | null;
  narrationScript?: string;
  narrationTimeline: NarrationTimelineNode[];
  onNext: () => void;
  onNodeLearned: (itemId: string) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSelectSegment: (index: number) => void;
  onSetOverlay: (overlay: NarrationOverlay | null) => void;
  onSubtitleVisibilityChange: (value: boolean) => void;
  playVideoBeforeNarration: boolean;
  segments: TeacherSegment[];
  setPlayVideoBeforeNarration: Dispatch<SetStateAction<boolean>>;
  setTeacherIndex: (index: number) => void;
  setMediaSeekTarget: (target: MediaSeekTarget | null) => void;
  showInteractiveSubtitle: boolean;
  teacherIndex: number;
}) {
  const timeline = narrationTimeline.length > 0 ? narrationTimeline : buildLegacyNarrationTimeline(segments, narrationAudioUrl, narrationScript);
  const node = timeline[teacherIndex] ?? timeline[0] ?? null;
  const generatedAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioLoadTimerRef = useRef<number | null>(null);
  const audioFallbackNodeIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const advancingAudioRef = useRef(false);
  const handledAudioEndRef = useRef(false);
  const manualAudioPauseRef = useRef(false);
  const pendingAudioPlayRef = useRef(false);
  const videoSegmentCompletedRef = useRef(false);
  const [phase, setPhase] = useState<"IDLE" | "VIDEO" | "AUDIO">("IDLE");
  const [isPlaying, setIsPlaying] = useState(false);
  const [failedAudioNodeId, setFailedAudioNodeId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      clearAudioLoadTimer();
      clearFallbackTimer();
      stopTeacherSpeech();
      onSetOverlay(null);
    };
  }, [onSetOverlay]);

  useEffect(() => {
    clearAudioLoadTimer();
    setFailedAudioNodeId(null);
    audioFallbackNodeIdRef.current = null;
    onSetOverlay(null);
  }, [onSetOverlay, teacherIndex]);

  useEffect(() => {
    if (isPlaying || !node || node.type !== "SENTENCE") {
      return;
    }

    const target = mediaSeekTargetForNarrationNode(node, teacherIndex, { playAfterSeek: false });

    if (target) {
      setMediaSeekTarget(target);
    }
  }, [isPlaying, node, setMediaSeekTarget, teacherIndex]);

  useEffect(() => {
    if (!isPlaying || phase !== "IDLE" || !node) {
      return;
    }

    if (node.type === "SENTENCE") {
      const target = mediaSeekTargetForNarrationNode(node, teacherIndex, { playAfterSeek: playVideoBeforeNarration });

      if (target) {
        setMediaSeekTarget(target);
      }

      if (playVideoBeforeNarration && typeof node.startSeconds === "number" && typeof node.endSeconds === "number") {
        videoSegmentCompletedRef.current = false;
        setPhase("VIDEO");
        return;
      }
    }

    playNodeAudio(node);
  }, [isPlaying, node, phase, playVideoBeforeNarration, setMediaSeekTarget, teacherIndex]);

  useEffect(() => {
    if (!isPlaying || phase !== "VIDEO" || !node || typeof node.endSeconds !== "number") {
      return;
    }

    if (!videoSegmentCompletedRef.current && mediaCurrentTime >= node.endSeconds - 0.08) {
      videoSegmentCompletedRef.current = true;
      playNodeAudio(node, { syncAudioSrc: true });
    }
  }, [isPlaying, mediaCurrentTime, node, phase]);

  useEffect(() => {
    onPlayingChange(isPlaying);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    return () => {
      onPlayingChange(false);
    };
  }, [onPlayingChange]);

  useEffect(() => {
    function handleLectureControlEvent(event: Event) {
      const detail = (event as CustomEvent<LectureControlEventDetail>).detail;
      const action = detail?.action;

      if (action === "previous") {
        selectRelativeNode(-1);
        return;
      }

      if (action === "next") {
        selectRelativeNode(1);
        return;
      }

      if (action === "seek" && typeof detail.seconds === "number") {
        const targetIndex = findNarrationSentenceIndexAtMediaTime(timeline, detail.seconds);

        if (targetIndex !== null) {
          if (detail.playAfterSeek) {
            playFromNode(targetIndex);
          } else {
            pauseLecture();
            setTeacherIndex(targetIndex);
          }
        }

        return;
      }

      if (action === "pause") {
        pauseLecture();
        return;
      }

      if (action === "toggle") {
        if (isPlaying) {
          pauseLecture();
          return;
        }

        playLecture();
      }
    }

    window.addEventListener(videoGuideLectureControlEventName, handleLectureControlEvent);

    return () => {
      window.removeEventListener(videoGuideLectureControlEventName, handleLectureControlEvent);
    };
  }, [isPlaying, teacherIndex, timeline]);

  useEffect(() => {
    if (!isPlaying || phase !== "AUDIO" || !node || (node.audioUrl && failedAudioNodeId !== node.id)) {
      return;
    }

    speakTeacherExplanation(node.script);
    fallbackTimerRef.current = window.setTimeout(() => {
      advanceAfterNode();
    }, estimateTeacherSegmentDuration(node.script));

    return () => {
      clearFallbackTimer();
      stopTeacherSpeech();
    };
  }, [failedAudioNodeId, isPlaying, node, onSetOverlay, phase]);

  useEffect(() => {
    clearAudioLoadTimer();

    if (!isPlaying || phase !== "AUDIO" || !node?.audioUrl || failedAudioNodeId === node.id) {
      return;
    }

    audioLoadTimerRef.current = window.setTimeout(() => {
      const audio = generatedAudioRef.current;

      if (
        !audio ||
        shouldFallbackNarrationAudio({
          errorCode: audio.error?.code ?? null,
          pending: pendingAudioPlayRef.current || audio.paused,
          readyState: audio.readyState
        })
      ) {
        activateNarrationAudioFallback(node);
      }
    }, 4000);

    return clearAudioLoadTimer;
  }, [failedAudioNodeId, isPlaying, node, phase]);

  function clearAudioLoadTimer() {
    if (audioLoadTimerRef.current !== null) {
      window.clearTimeout(audioLoadTimerRef.current);
      audioLoadTimerRef.current = null;
    }
  }

  function clearFallbackTimer() {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function playNodeAudio(
    currentNode: NarrationTimelineNode,
    options?: {
      syncAudioSrc?: boolean;
    }
  ) {
    clearAudioLoadTimer();
    clearFallbackTimer();
    stopTeacherSpeech();
    audioFallbackNodeIdRef.current = null;
    setFailedAudioNodeId(null);
    handledAudioEndRef.current = false;
    manualAudioPauseRef.current = false;
    setPhase("AUDIO");
    onSetOverlay(null);

    if (!currentNode.audioUrl) {
      advancingAudioRef.current = false;
      return;
    }

    const audio = generatedAudioRef.current;

    if (!audio) {
      return;
    }

    if (options?.syncAudioSrc) {
      advancingAudioRef.current = true;
      pendingAudioPlayRef.current = true;
      audio.autoplay = true;
      audio.src = publicR2CdnUrl(currentNode.audioUrl);
      audio.load();
    }

    try {
      audio.currentTime = 0;
    } catch {
      // 新音频元数据尚未就绪时 currentTime 可能暂时不可写，直接播放即可。
    }

    requestGeneratedAudioPlay(audio);
  }

  function requestGeneratedAudioPlay(audio: HTMLAudioElement) {
    pendingAudioPlayRef.current = true;

    void audio
      .play()
      .then(() => {
        clearAudioLoadTimer();
        pendingAudioPlayRef.current = false;
        advancingAudioRef.current = false;
      })
      .catch(() => {
        // load/src 切换可能会打断第一次 play，等 canplay 后继续尝试。
      });
  }

  function activateNarrationAudioFallback(currentNode: NarrationTimelineNode) {
    if (audioFallbackNodeIdRef.current === currentNode.id) {
      return;
    }

    audioFallbackNodeIdRef.current = currentNode.id;
    clearAudioLoadTimer();
    pendingAudioPlayRef.current = false;
    advancingAudioRef.current = true;
    generatedAudioRef.current?.pause();
    setFailedAudioNodeId(currentNode.id);
  }

  function beginNodePlayback(
    index: number,
    options?: {
      syncAudioSrc?: boolean;
      userInitiated?: boolean;
    }
  ) {
    const currentNode = timeline[index];

    if (!currentNode) {
      return;
    }

    videoSegmentCompletedRef.current = false;

    if (currentNode.type === "SENTENCE") {
      const target = mediaSeekTargetForNarrationNode(currentNode, index, { playAfterSeek: playVideoBeforeNarration });

      if (target) {
        setMediaSeekTarget(target);

        if (
          shouldDispatchMediaSeekImmediately({
            playAfterSeek: target.playAfterSeek,
            userInitiated: options?.userInitiated === true
          })
        ) {
          emitMediaSeekTarget(target);
        }
      }

      if (playVideoBeforeNarration && typeof currentNode.startSeconds === "number" && typeof currentNode.endSeconds === "number") {
        setPhase("VIDEO");
        return;
      }
    }

    playNodeAudio(currentNode, options);
  }

  function advanceAfterNode() {
    advancingAudioRef.current = true;
    clearFallbackTimer();
    stopTeacherSpeech();
    onSetOverlay(null);
    if (node) {
      onNodeLearned(node.id);
    }

    if (teacherIndex < timeline.length - 1) {
      const nextIndex = teacherIndex + 1;

      setIsPlaying(true);
      setTeacherIndex(nextIndex);
      beginNodePlayback(nextIndex, { syncAudioSrc: true });
      return;
    }

    setIsPlaying(false);
    setPhase("IDLE");
  }

  function handleAudioFinished() {
    if (handledAudioEndRef.current) {
      return;
    }

    handledAudioEndRef.current = true;
    advanceAfterNode();
  }

  function playLecture() {
    if (!node) {
      return;
    }

    setIsPlaying(true);
    beginNodePlayback(teacherIndex, { syncAudioSrc: true, userInitiated: true });
  }

  function pauseLecture() {
    setIsPlaying(false);
    setPhase("IDLE");
    clearAudioLoadTimer();
    clearFallbackTimer();
    advancingAudioRef.current = true;
    manualAudioPauseRef.current = true;
    pendingAudioPlayRef.current = false;
    if (generatedAudioRef.current) {
      generatedAudioRef.current.autoplay = false;
    }
    generatedAudioRef.current?.pause();
    stopTeacherSpeech();
    onSetOverlay(null);
  }

  function restartLecture() {
    clearFallbackTimer();
    stopTeacherSpeech();
    onSetOverlay(null);
    setTeacherIndex(0);
    setIsPlaying(true);
    beginNodePlayback(0, { syncAudioSrc: true, userInitiated: true });
  }

  function playFromNode(index: number) {
    const selectedNode = timeline[index];

    if (!selectedNode) {
      return;
    }

    clearFallbackTimer();
    advancingAudioRef.current = true;
    manualAudioPauseRef.current = false;
    pendingAudioPlayRef.current = false;
    generatedAudioRef.current?.pause();
    stopTeacherSpeech();
    onSetOverlay(null);
    setTeacherIndex(index);
    setIsPlaying(true);
    beginNodePlayback(index, { syncAudioSrc: true, userInitiated: true });
  }

  function selectNode(index: number) {
    const selectedNode = timeline[index];

    if (!selectedNode) {
      return;
    }

    const target = mediaSeekTargetForNarrationNode(selectedNode, index, { playAfterSeek: false });

    if (target) {
      setMediaSeekTarget(target);
    } else if (index < segments.length) {
      onSelectSegment(index);
    }

    playFromNode(index);
  }

  function selectRelativeNode(delta: number) {
    selectNode(Math.min(Math.max(teacherIndex + delta, 0), timeline.length - 1));
  }

  function changePlayVideoBeforeNarration(nextValue: boolean) {
    if (nextValue === playVideoBeforeNarration) {
      return;
    }

    pauseLecture();
    setPlayVideoBeforeNarration(nextValue);

    if (node?.type === "SENTENCE") {
      const target = mediaSeekTargetForNarrationNode(node, teacherIndex, { playAfterSeek: false });

      if (target) {
        setMediaSeekTarget(target);
      }
    }
  }

  function handleAudioTimeUpdate(audio: HTMLAudioElement) {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

    if (node) {
      onSetOverlay(overlayForNarrationAudioTime(node, audio.currentTime, duration));
    }

    if (phase === "AUDIO" && isPlaying && isAudioAtNaturalEnd(audio)) {
      handleAudioFinished();
    }
  }

  if (!node) {
    return (
      <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
        当前课件还没有可播放的串讲时间线。
      </div>
    );
  }

  const learningOverlays = learningOverlaysForNarrationNode(node);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-md border border-border bg-background p-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">字幕</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "显示字幕", value: true },
              { label: "隐藏字幕", value: false }
            ].map((option) => (
              <button
                className={cn(
                  "h-10 rounded-md border px-3 text-sm transition-colors",
                  showInteractiveSubtitle === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-secondary"
                )}
                key={option.label}
                onClick={() => onSubtitleVisibilityChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">讲解形式</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "先放原句", value: true },
              { label: "只放讲解", value: false }
            ].map((option) => (
              <button
                className={cn(
                  "h-10 rounded-md border px-3 text-sm transition-colors",
                  playVideoBeforeNarration === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-secondary"
                )}
                key={option.label}
                onClick={() => changePlayVideoBeforeNarration(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sticky top-[calc(max(4.5rem,var(--video-guide-viewport-offset-top,0px))+0.5rem+max(180px,calc(56.25vw-0.84375rem)))] z-30 max-h-[calc(100dvh-max(4.5rem,var(--video-guide-viewport-offset-top,0px))-0.5rem-max(180px,calc(56.25vw-0.84375rem)))] overflow-y-auto rounded-md border border-border bg-background p-4 shadow-sm sm:top-[calc(max(4.5rem,var(--video-guide-viewport-offset-top,0px))+0.5rem+max(220px,calc(56.25vw-1.40625rem)))] sm:max-h-[calc(100dvh-max(4.5rem,var(--video-guide-viewport-offset-top,0px))-0.5rem-max(220px,calc(56.25vw-1.40625rem)))] lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
        <div className="flex items-center gap-2">
          <Button
            className="min-w-0 flex-1 px-2 sm:flex-none sm:px-4"
            disabled={teacherIndex <= 0}
            onClick={() => selectRelativeNode(-1)}
            variant="outline"
          >
            <ChevronLeft data-icon="inline-start" />
            上一句
          </Button>
          <Button
            className="min-w-0 flex-1 px-2 sm:flex-none sm:px-4"
            disabled={teacherIndex >= timeline.length - 1}
            onClick={() => selectRelativeNode(1)}
            variant="outline"
          >
            下一句
            <ChevronRight data-icon="inline-end" />
          </Button>
          {isPlaying ? (
            <Button
              aria-label="暂停讲解"
              className="h-10 w-10 shrink-0 px-0 sm:ml-auto sm:h-9 sm:w-auto sm:px-4"
              onClick={pauseLecture}
              title="暂停讲解"
              variant="outline"
            >
              <Pause />
              <span className="sr-only sm:not-sr-only">暂停讲解</span>
            </Button>
          ) : (
            <Button
              aria-label="播放讲解"
              className="h-10 w-10 shrink-0 px-0 sm:ml-auto sm:h-9 sm:w-auto sm:px-4"
              onClick={playLecture}
              title="播放讲解"
              variant="outline"
            >
              <Play />
              <span className="sr-only sm:not-sr-only">播放讲解</span>
            </Button>
          )}
          <Button
            aria-label="从头开始"
            className="h-10 w-10 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-4"
            onClick={restartLecture}
            title="从头开始"
            variant="outline"
          >
            <RotateCcw />
            <span className="sr-only sm:not-sr-only">从头开始</span>
          </Button>
        </div>
        {node.audioUrl ? (
          <>
            <audio
              autoPlay={isPlaying && phase === "AUDIO"}
              className="hidden"
              onCanPlay={(event) => {
                if (pendingAudioPlayRef.current && isPlaying && phase === "AUDIO") {
                  requestGeneratedAudioPlay(event.currentTarget);
                }
              }}
              onEnded={handleAudioFinished}
              onError={() => activateNarrationAudioFallback(node)}
              onPause={(event) => {
                if (manualAudioPauseRef.current) {
                  manualAudioPauseRef.current = false;
                  return;
                }

                if (phase === "AUDIO" && !advancingAudioRef.current && !isAudioAtNaturalEnd(event.currentTarget)) {
                  setIsPlaying(false);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onTimeUpdate={(event) => handleAudioTimeUpdate(event.currentTarget)}
              ref={generatedAudioRef}
              src={node.audioUrl ? publicR2CdnUrl(node.audioUrl) : undefined}
            />
            {narrationAudioTruncated ? (
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                串讲文稿较长，当前音频已按单句节点生成，完整文稿仍保留在课件内容中。
              </p>
            ) : null}
          </>
        ) : null}
        {node.type === "SENTENCE" && node.subtitle ? (
          <div className="mt-4 rounded-md bg-secondary p-3">
            <p className="text-base leading-7">{node.subtitle}</p>
          </div>
        ) : null}
        <p className="mt-4 text-sm leading-6">{node.script}</p>
        {learningOverlays.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {learningOverlays.map((overlay) => (
              <Badge key={normalizeLearningOverlayKey(overlay.text)} variant="secondary">
                {overlay.text}{overlay.subText ? ` · ${overlay.subText}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3">
        {timeline.map((item, index) => (
          <button
            className={cn(
              "rounded-md border p-4 text-left text-sm transition-colors",
              index === teacherIndex ? "border-foreground bg-foreground text-background" : "border-border bg-background"
            )}
            key={item.id}
            onClick={() => selectNode(index)}
            type="button"
          >
            <span className="font-medium">{item.type === "SENTENCE" ? item.timeRange : item.title}</span>
            <span className={cn("mt-1 block leading-6", index === teacherIndex ? "text-background/75" : "text-muted-foreground")}>
              {item.subtitle ?? item.script}
            </span>
          </button>
        ))}
      </div>
      <Button className="w-fit" onClick={onNext}>
        进入词语巩固
      </Button>
    </div>
  );
}

function StagePractice({
  answeredCount,
  answers,
  correctCount,
  onAnswer,
  onNext,
  questions
}: {
  answeredCount: number;
  answers: Record<string, number>;
  correctCount: number;
  onAnswer: (questionId: string, answer: number) => void;
  onNext: () => void;
  questions: GuideQuestion[];
}) {
  const allAnswered = answeredCount >= questions.length;
  const wrongQuestions = questions.filter((question) => {
    const selectedAnswer = answers[question.id];

    return typeof selectedAnswer === "number" && selectedAnswer !== question.answer;
  });
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  if (questions.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-medium">暂未生成随堂练习</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            这份课件已经有导学文案，但还没有单独生成随堂练习。可以先进入跟读训练，或让家长回到生成页点击生成随堂练习。
          </p>
        </div>
        <Button className="w-fit" onClick={onNext}>
          进入跟读训练
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-border bg-background p-4">
        <p className="font-medium">已作答 {answeredCount}/{questions.length} 题，当前正确 {correctCount} 题</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          选择后会立即看到反馈。答错时会显示进一步讲解，帮助孩子回到内容逻辑。
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {questions.map((question, questionIndex) => {
          const selectedAnswer = answers[question.id];
          const hasAnswered = typeof selectedAnswer === "number";
          const isCorrect = selectedAnswer === question.answer;

          return (
            <div className="rounded-md border border-border bg-background p-4" key={question.id}>
              <p className="font-medium">{questionIndex + 1}. {question.question}</p>
              <div className="mt-3 grid gap-2">
                {question.options.map((option, optionIndex) => {
                  const selected = selectedAnswer === optionIndex;
                  const correct = question.answer === optionIndex;

                  return (
                    <button
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        selected && correct ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "",
                        selected && !correct ? "border-red-300 bg-red-50 text-red-700" : "",
                        !selected && hasAnswered && correct ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "",
                        !selected && !correct ? "border-border bg-card hover:bg-secondary" : ""
                      )}
                      key={`${question.id}-${optionIndex}`}
                      onClick={() => onAnswer(question.id, optionIndex)}
                      type="button"
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {hasAnswered ? (
                <div className={cn("mt-3 rounded-md px-3 py-2 text-sm", isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
                  {isCorrect ? "答对了。" : "这题需要再看一下。"} {question.explanation}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {allAnswered ? (
        <div className="rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="font-medium">答题总结</p>
              <p className="text-sm text-muted-foreground">
                得分 {score} 分，答对 {correctCount}/{questions.length} 题
              </p>
            </div>
            <Badge variant={wrongQuestions.length === 0 ? "secondary" : "outline"}>
              {wrongQuestions.length === 0 ? "全部答对" : `${wrongQuestions.length} 道错题`}
            </Badge>
          </div>

          {wrongQuestions.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm font-medium">错题复盘</p>
              {wrongQuestions.map((question, index) => {
                const selectedAnswer = answers[question.id];
                const selectedOption = typeof selectedAnswer === "number" ? question.options[selectedAnswer] : "未选择";
                const correctOption = question.options[question.answer] ?? "";

                return (
                  <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800" key={`wrong-${question.id}`}>
                    <p className="font-medium">{index + 1}. {question.question}</p>
                    <p className="mt-2">你的答案：{selectedOption}</p>
                    <p>正确答案：{correctOption}</p>
                    <p className="mt-2 leading-6">
                      老师讲解：{buildWrongAnswerReview(question, selectedOption, correctOption)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
              这轮掌握得很好。可以直接进入跟读训练，把理解转成听说能力。
            </div>
          )}
        </div>
      ) : null}
      <Button className="w-fit" onClick={onNext}>
        进入跟读训练
      </Button>
    </div>
  );
}

function RepeatSettingsPanel({
  onRepeatModeChange,
  onSubtitleVisibilityChange,
  repeatMode,
  showRepeatSubtitle
}: {
  onRepeatModeChange: (value: RepeatMode) => void;
  onSubtitleVisibilityChange: (value: boolean) => void;
  repeatMode: RepeatMode;
  showRepeatSubtitle: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-background p-4 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-medium">字幕</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "显示字幕", value: true },
            { label: "隐藏字幕", value: false }
          ].map((option) => (
            <button
              className={cn(
                "h-10 rounded-md border px-3 text-sm transition-colors",
                showRepeatSubtitle === option.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:bg-secondary"
              )}
              key={option.label}
              onClick={() => onSubtitleVisibilityChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-medium">跟读方式</span>
        <div className="grid grid-cols-2 gap-2">
          {repeatModeOptions.map((option) => (
            <button
              className={cn(
                "h-10 rounded-md border px-3 text-sm transition-colors",
                repeatMode === option ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-secondary"
              )}
              key={option}
              onClick={() => onRepeatModeChange(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StageRepeatTraining({
  lines,
  onLineCompleted,
  onSelectLine,
  recordEvaluationEnabled,
  recordedLineIds,
  repeatLineIndex,
  repeatMode,
  setRecordedLineIds,
  setRepeatMode,
  setShowRepeatSubtitle,
  showRepeatSubtitle
}: {
  lines: RepeatLine[];
  onLineCompleted: (itemId: string) => void;
  onSelectLine: (index: number) => void;
  recordEvaluationEnabled: boolean;
  recordedLineIds: Record<string, boolean>;
  repeatLineIndex: number;
  repeatMode: RepeatMode;
  setRecordedLineIds: Dispatch<SetStateAction<Record<string, boolean>>>;
  setRepeatMode: (value: RepeatMode) => void;
  setShowRepeatSubtitle: (value: boolean) => void;
  showRepeatSubtitle: boolean;
}) {
  const currentLine = lines[repeatLineIndex] ?? lines[0] ?? null;
  const previousLine = repeatLineIndex > 0 ? lines[repeatLineIndex - 1] ?? null : null;
  const nextLine = repeatLineIndex + 1 < lines.length ? lines[repeatLineIndex + 1] : null;
  const shouldHideUpcomingSubtitles = !showRepeatSubtitle;
  const [recordedClips, setRecordedClips] = useState<Record<string, RecordedClip>>({});
  const [repeatAnalyses, setRepeatAnalyses] = useState<Record<string, string>>({});
  const [repeatFocusStarted, setRepeatFocusStarted] = useState(false);
  const [isOverallRunning, setIsOverallRunning] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
  const autoRunningRef = useRef(false);
  const autoTimerRef = useRef<number | null>(null);
  const clipUrlsRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const overallLineIndexRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const repeatFocusRef = useRef<HTMLDivElement | null>(null);
  const suppressNextRecordingAdvanceRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      clearAutoTimer();
      autoRunningRef.current = false;
      overallLineIndexRef.current = null;
      suppressNextRecordingAdvanceRef.current = true;
      stopActiveRecording();
      clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      clipUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!repeatFocusStarted) {
      return;
    }

    scrollRepeatFocus();
  }, [repeatFocusStarted, repeatLineIndex]);

  function clearAutoTimer() {
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }

  function activateRepeatFocus() {
    setRepeatFocusStarted(true);
    scrollRepeatFocus();
  }

  function scrollRepeatFocus() {
    window.setTimeout(() => {
      repeatFocusRef.current?.scrollIntoView({
        behavior: "smooth",
        block: window.matchMedia("(min-width: 1024px)").matches ? "start" : "end"
      });
    }, 80);
  }

  function selectLine(index: number) {
    if (autoRunningRef.current) {
      stopOverallRepeat();
    }

    activateRepeatFocus();
    onSelectLine(index);
  }

  function skipToNextRepeatLine() {
    jumpToRepeatLine(repeatLineIndex + 1);
  }

  function jumpToRepeatLine(index: number) {
    if (index < 0 || index >= lines.length) {
      return;
    }

    suppressNextRecordingAdvanceRef.current = Boolean(mediaRecorderRef.current);
    stopActiveRecording();
    setRecordingLineId(null);
    clearAutoTimer();
    activateRepeatFocus();

    if (autoRunningRef.current) {
      runOverallLine(index);
      return;
    }

    onSelectLine(index);
  }

  function completeRepeatLine(line: RepeatLine, index: number, options?: { advance?: boolean; durationSeconds?: number }) {
    setRecordedLineIds((items) => ({
      ...items,
      [line.id]: true
    }));
    onLineCompleted(line.id);

    if (recordEvaluationEnabled) {
      setRepeatAnalyses((items) => ({
        ...items,
        [line.id]: buildRepeatEvaluationText(line, options?.durationSeconds)
      }));
    }

    if (options?.advance ?? true) {
      const nextIndex = index + 1;

      if (nextIndex < lines.length) {
        onSelectLine(nextIndex);
      }
    }
  }

  function handleRepeatLine(line: RepeatLine, index: number) {
    if (isOverallRunning) {
      return;
    }

    if (repeatMode === "整体跟读") {
      startOverallRepeatFromIndex(index);
      return;
    }

    activateRepeatFocus();
    onSelectLine(index);

    if (recordEvaluationEnabled) {
      void startRecording(line, index);
      return;
    }

    completeRepeatLine(line, index);
  }

  function startOverallRepeat() {
    startOverallRepeatFromIndex(repeatLineIndex);
  }

  function startOverallRepeatFromIndex(index: number) {
    if (lines.length === 0) {
      return;
    }

    const startIndex = Math.min(Math.max(index, 0), lines.length - 1);

    activateRepeatFocus();
    clearAutoTimer();
    autoRunningRef.current = true;
    setIsOverallRunning(true);
    runOverallLine(startIndex);
  }

  function stopOverallRepeat() {
    const recorder = mediaRecorderRef.current;

    suppressNextRecordingAdvanceRef.current = Boolean(recorder && recorder.state !== "inactive");
    autoRunningRef.current = false;
    overallLineIndexRef.current = null;
    setIsOverallRunning(false);
    clearAutoTimer();
    stopRecording();
  }

  function runOverallLine(index: number) {
    const line = lines[index];

    if (!line) {
      autoRunningRef.current = false;
      overallLineIndexRef.current = null;
      setIsOverallRunning(false);
      return;
    }

    activateRepeatFocus();
    overallLineIndexRef.current = index;
    onSelectLine(index);

    if (recordEvaluationEnabled) {
      void startRecording(line, index, { autoStop: true });
      return;
    }

    clearAutoTimer();
    autoTimerRef.current = window.setTimeout(() => {
      advanceOverallRepeatLine(line, index);
    }, getRepeatLineAutoAdvanceMs(line));
  }

  function advanceOverallRepeatLine(line: RepeatLine, index: number) {
    if (!autoRunningRef.current || overallLineIndexRef.current !== index) {
      return;
    }

    completeRepeatLine(line, index, { advance: false });
    runOverallLine(index + 1);
  }

  async function startRecording(line: RepeatLine, index: number, options?: { autoStop?: boolean }) {
    const lineId = line.id;

    if (recordingLineId && recordingLineId !== lineId) {
      return;
    }

    setRecordingError("");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecordingError("当前浏览器不支持录音，请换用新版浏览器。");
      return;
    }

    try {
      stopActiveRecording();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      suppressNextRecordingAdvanceRef.current = false;
      setRecordingLineId(lineId);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearAutoTimer();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;

        if (chunks.length === 0) {
          setRecordingLineId(null);
          suppressNextRecordingAdvanceRef.current = false;
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));

        clipUrlsRef.current.push(url);
        setRecordedClips((items) => {
          const existing = items[lineId];

          if (existing) {
            URL.revokeObjectURL(existing.url);
          }

          return {
            ...items,
            [lineId]: {
              createdAt: Date.now(),
              durationSeconds,
              url
            }
          };
        });
        setRecordingLineId(null);
        handleRecordingFinished(durationSeconds);
      };

      recorder.start();
    } catch {
      setRecordingLineId(null);
      setRecordingError("无法打开麦克风，请检查浏览器权限后重试。");
      stopActiveRecording();
      autoRunningRef.current = false;
      setIsOverallRunning(false);
      return;
    }

    if (options?.autoStop) {
      clearAutoTimer();
      autoTimerRef.current = window.setTimeout(() => {
        stopRecording();
      }, getRepeatLineAutoAdvanceMs(line));
    }

    function handleRecordingFinished(durationSeconds: number) {
      const suppressAdvance = suppressNextRecordingAdvanceRef.current;
      suppressNextRecordingAdvanceRef.current = false;

      completeRepeatLine(line, index, {
        advance: !autoRunningRef.current && !suppressAdvance,
        durationSeconds
      });

      if (autoRunningRef.current && !suppressAdvance) {
        autoTimerRef.current = window.setTimeout(() => {
          runOverallLine(index + 1);
        }, 350);
      }
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    setRecordingLineId(null);
  }

  function stopActiveRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function renderRepeatSettingsPanel() {
    return (
      <RepeatSettingsPanel
        onRepeatModeChange={(option) => {
          stopOverallRepeat();
          setRepeatMode(option);
        }}
        onSubtitleVisibilityChange={setShowRepeatSubtitle}
        repeatMode={repeatMode}
        showRepeatSubtitle={showRepeatSubtitle}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {renderRepeatSettingsPanel()}
      {currentLine ? (
        <div
          className="sticky top-[calc(max(4.5rem,var(--video-guide-viewport-offset-top,0px))+0.5rem+max(180px,calc(56.25vw-0.84375rem)))] z-30 max-h-[calc(100dvh-max(4.5rem,var(--video-guide-viewport-offset-top,0px))-0.5rem-max(180px,calc(56.25vw-0.84375rem)))] overflow-y-auto rounded-md border border-foreground bg-background p-4 shadow-sm sm:top-[calc(max(4.5rem,var(--video-guide-viewport-offset-top,0px))+0.5rem+max(220px,calc(56.25vw-1.40625rem)))] sm:max-h-[calc(100dvh-max(4.5rem,var(--video-guide-viewport-offset-top,0px))-0.5rem-max(220px,calc(56.25vw-1.40625rem)))] lg:top-20 lg:max-h-[calc(100dvh-6rem)]"
          ref={repeatFocusRef}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 text-sm font-medium">
              {repeatMode} · 第 {repeatLineIndex + 1}/{lines.length} 句
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                className="h-8 px-2"
                disabled={!previousLine}
                onClick={() => jumpToRepeatLine(repeatLineIndex - 1)}
                size="sm"
                variant="outline"
              >
                <ChevronLeft />
                上一句
              </Button>
              <Button
                className="h-8 px-2"
                disabled={!nextLine}
                onClick={() => jumpToRepeatLine(repeatLineIndex + 1)}
                size="sm"
                variant="outline"
              >
                下一句
                <ChevronRight />
              </Button>
            </div>
          </div>
          {repeatMode === "整体跟读" || recordingLineId === currentLine.id ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {repeatMode === "整体跟读" ? (
                isOverallRunning ? (
                  <Button onClick={stopOverallRepeat} variant="outline">
                    <Pause data-icon="inline-start" />
                    停止整体跟读
                  </Button>
                ) : (
                  <Button onClick={startOverallRepeat} variant="outline">
                    <Play data-icon="inline-start" />
                    开始整体跟读
                  </Button>
                )
              ) : null}
              {recordingLineId === currentLine.id ? <Badge variant="outline">录音中</Badge> : null}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3">
            <RepeatFocusLine
              emptyText="还没有上一句"
              label="上一句"
              line={previousLine}
              muted
              onSelect={() => jumpToRepeatLine(repeatLineIndex - 1)}
            />
            <RepeatFocusLine
              hiddenText="字幕已隐藏，先听完这一句。"
              label="当前句"
              line={currentLine}
              onSelect={nextLine ? skipToNextRepeatLine : undefined}
              showText={!shouldHideUpcomingSubtitles}
            />
            <RepeatFocusLine
              emptyText="已经是最后一句"
              hiddenText="字幕已隐藏，跟读到这一句后显示。"
              label="下一句"
              line={nextLine}
              muted
              onSelect={() => jumpToRepeatLine(repeatLineIndex + 1)}
              showText={!shouldHideUpcomingSubtitles}
            />
          </div>
        </div>
      ) : null}
      {recordingError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {recordingError}
        </div>
      ) : null}
      <div className="grid gap-3">
        {lines.map((line, index) => {
          const clip = recordedClips[line.id];
          const recorded = recordedLineIds[line.id];
          const recording = recordingLineId === line.id;
          const otherLineRecording = Boolean(recordingLineId && recordingLineId !== line.id);
          const selected = repeatLineIndex === index;
          const showLineText = showRepeatSubtitle || index < repeatLineIndex;
          const analysis = repeatAnalyses[line.id];

          return (
            <div
              className={cn(
                "rounded-md border bg-background p-4 transition-colors",
                selected ? "border-foreground shadow-sm" : "border-border"
              )}
              key={line.id}
            >
              <button
                className="flex w-full flex-col gap-2 text-left"
                onClick={() => selectLine(index)}
                onPointerDown={() => selectLine(index)}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">{line.timeRange}</p>
                  {selected ? <Badge variant="secondary">当前字幕</Badge> : null}
                  {recording ? <Badge variant="outline">录音中</Badge> : null}
                  {recorded && !recording ? <Badge variant="secondary">已跟读</Badge> : null}
                </div>
                {showLineText ? (
                  <p className="font-medium leading-6">{line.text}</p>
                ) : (
                  <p className="font-medium leading-6 text-muted-foreground">字幕已隐藏，跟读到这一句后显示。</p>
                )}
              </button>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {recording ? (
                  <Button onClick={stopRecording} variant="outline">
                    <Pause data-icon="inline-start" />
                    停止录音
                  </Button>
                ) : recordEvaluationEnabled || repeatMode === "整体跟读" ? (
                  <Button
                    aria-label={repeatMode === "整体跟读" ? "从此句开始跟读" : undefined}
                    className={repeatMode === "整体跟读" ? "h-9 w-9 px-0" : undefined}
                    disabled={otherLineRecording || isOverallRunning}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRepeatLine(line, index);
                    }}
                    variant="outline"
                  >
                    {recordEvaluationEnabled ? <Mic2 /> : <Play />}
                    {recordEvaluationEnabled
                      ? recorded
                        ? "重新录音跟读"
                        : "开始录音跟读"
                      : null}
                  </Button>
                ) : null}
                {clip ? (
                  <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <audio className="w-full sm:max-w-72" controls src={clip.url} />
                    <span className="shrink-0 text-xs text-muted-foreground">{clip.durationSeconds} 秒</span>
                  </span>
                ) : recorded ? (
                  <span className="text-sm text-muted-foreground">跟读记录已保存</span>
                ) : null}
              </div>
              {analysis ? (
                <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
                  {analysis}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RepeatFocusLine({
  emptyText = "暂无内容",
  label,
  line,
  muted = false,
  onSelect,
  hiddenText = "字幕已隐藏。",
  showText = true
}: {
  emptyText?: string;
  hiddenText?: string;
  label: string;
  line: RepeatLine | null;
  muted?: boolean;
  onSelect?: () => void;
  showText?: boolean;
}) {
  if (!line) {
    return (
      <div className="rounded-md border border-dashed border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
        <span className="font-medium">{label}</span>
        <p className="mt-1">{emptyText}</p>
      </div>
    );
  }

  const interactive = Boolean(onSelect);

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        muted ? "border-border bg-secondary text-muted-foreground" : "border-foreground bg-foreground text-background",
        interactive ? "cursor-pointer transition-colors hover:border-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!onSelect || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }

        event.preventDefault();
        onSelect();
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        <span className={cn("text-xs", muted ? "text-muted-foreground" : "text-background/70")}>{line.timeRange}</span>
      </div>
      {showText ? (
        <p className="mt-1 leading-6">{line.text}</p>
      ) : (
        <p className={cn("mt-1 leading-6", muted ? "text-muted-foreground" : "text-background/75")}>{hiddenText}</p>
      )}
    </div>
  );
}

function getRepeatLineAutoAdvanceMs(line: RepeatLine) {
  if (
    typeof line.startSeconds === "number" &&
    typeof line.endSeconds === "number" &&
    line.endSeconds > line.startSeconds
  ) {
    return (line.endSeconds - line.startSeconds) * 1000 + repeatFollowDelayMs;
  }

  return Math.max(1_500, line.text.length * 95) + repeatFollowDelayMs;
}

function buildRepeatEvaluationText(line: RepeatLine, durationSeconds?: number) {
  const durationText = durationSeconds ? `本次录音约 ${durationSeconds} 秒。` : "";
  const focus = line.text.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");

  return `AI 评价预览：${durationText}后续付费功能会分析这句的发音、重音和停顿；当前建议先对齐 “${focus || line.text}” 的节奏。`;
}

function stageDescription(stage: number) {
  const descriptions = [
    "自主观看或收听，默认不显示字幕，也可以临时打开字幕。",
    "用老师串讲节奏同步字幕和暂停点，帮助理解结构。",
    "复习互动讲解中讲过的单词或短语。",
    "完成十道和词语、内容有关的选择题。",
    "按字幕句子逐句或整体跟读。"
  ];

  return descriptions[stage] ?? descriptions[0];
}

function buildPlaybackNarrationTimeline(content: VideoGuideLessonContent): NarrationTimelineNode[] {
  if (content.narrationTimeline && content.narrationTimeline.length > 0) {
    return content.narrationTimeline;
  }

  return buildLegacyNarrationTimeline(content.teacherSegments, content.narrationAudioUrl, content.narrationScript);
}

function buildLegacyNarrationTimeline(
  segments: TeacherSegment[],
  narrationAudioUrl?: string | null,
  narrationScript?: string
): NarrationTimelineNode[] {
  const items = segments.length > 0 ? segments : defaultVideoGuideContent.teacherSegments;

  return items.map((segment, index) => ({
    id: segment.id,
    type: "SENTENCE" as const,
    title: `讲解 ${index + 1}`,
    sentenceId: segment.id,
    timeRange: segment.timeRange,
    ...(typeof segment.startSeconds === "number" ? { startSeconds: segment.startSeconds } : {}),
    ...(typeof segment.endSeconds === "number" ? { endSeconds: segment.endSeconds } : {}),
    subtitle: segment.subtitle,
    script: segment.explanation,
    audioUrl: index === 0 ? narrationAudioUrl ?? null : null,
    chunks: [
      {
        id: `${segment.id}-c1`,
        type: "meaning",
        text: segment.explanation,
        overlay: null
      }
    ],
    ...(index === 0 && narrationScript ? { script: segment.explanation } : {})
  }));
}

function firstOverlayForNarrationNode(node: NarrationTimelineNode | null) {
  return node?.chunks.find((chunk) => chunk.overlay)?.overlay ?? null;
}

function learningOverlaysForNarrationNode(node: NarrationTimelineNode) {
  const subtitle = normalizeLearningOverlayKey(node.subtitle ?? "");
  const overlays = new Map<string, NarrationOverlay>();

  node.chunks.forEach((chunk) => {
    if (chunk.overlay) {
      const key = normalizeLearningOverlayKey(chunk.overlay.text);

      if (key && !overlays.has(key)) {
        overlays.set(key, chunk.overlay);
      }

      return;
    }

    if (chunk.type.toLowerCase() === "translation" || !subtitle) {
      return;
    }

    for (const match of chunk.text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?(?:\s+[A-Za-z]+(?:['’][A-Za-z]+)?){0,7}/g)) {
      const text = match[0]?.trim() ?? "";
      const key = normalizeLearningOverlayKey(text);

      if (!key || !containsLearningOverlayPhrase(subtitle, key) || overlays.has(key)) {
        continue;
      }

      overlays.set(key, { text });
    }
  });

  return Array.from(overlays.values());
}

function containsLearningOverlayPhrase(normalizedSubtitle: string, normalizedPhrase: string) {
  return ` ${normalizedSubtitle} `.includes(` ${normalizedPhrase} `);
}

function normalizeLearningOverlayKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlayForNarrationAudioTime(node: NarrationTimelineNode, currentTime: number, duration: number) {
  const chunks = node.chunks.length > 0 ? node.chunks : [{ id: `${node.id}-script`, type: "meaning", text: node.script, overlay: null }];

  if (duration <= 0) {
    return null;
  }

  const totalWeight = chunks.reduce((sum, chunk) => sum + Math.max(chunk.text.length, 20), 0);
  let cursor = 0;

  for (const chunk of chunks) {
    const chunkDuration = duration * (Math.max(chunk.text.length, 20) / totalWeight);
    const end = cursor + chunkDuration;

    if (currentTime <= end) {
      return chunk.overlay ?? null;
    }

    cursor = end;
  }

  return chunks[chunks.length - 1]?.overlay ?? null;
}

function isAudioAtNaturalEnd(audio: HTMLAudioElement) {
  if (audio.ended) {
    return true;
  }

  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

  return duration > 0 && audio.currentTime >= duration - 0.25;
}

function guideWordPhonetic(word: GuideWord) {
  const phonetic = word.phonetic.trim();

  return phonetic === "跟读时重点模仿" || phonetic === "待生成音标" ? "" : phonetic;
}

function captionForStage(
  stage: number,
  {
    autonomousSubtitle,
    narrationNode,
    repeatLine,
    showAutonomousSubtitle,
    showInteractiveSubtitle,
    showRepeatSubtitle,
    teacherSegment
  }: {
    autonomousSubtitle: string;
    narrationNode: NarrationTimelineNode | null;
    repeatLine: RepeatLine;
    showAutonomousSubtitle: boolean;
    showInteractiveSubtitle: boolean;
    showRepeatSubtitle: boolean;
    teacherSegment: TeacherSegment;
  }
) {
  if (stage === 0 && showAutonomousSubtitle) {
    return autonomousSubtitle;
  }

  if (stage === 1 && showInteractiveSubtitle) {
    return narrationNode?.subtitle ?? teacherSegment.subtitle;
  }

  if (stage === 4 && showRepeatSubtitle) {
    return repeatLine.text;
  }

  return "";
}

function seekMedia(
  media: HTMLMediaElement,
  seconds: number,
  onMediaTimeUpdate: (seconds: number) => void,
  setDisplayTime: (seconds: number) => void,
  options?: {
    playAfterSeek?: boolean;
  }
) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return;
  }

  try {
    const requestVersion = (mediaSeekRequestVersions.get(media) ?? 0) + 1;
    mediaSeekRequestVersions.set(media, requestVersion);

    if (!options?.playAfterSeek) {
      media.pause();
    }

    const targetSeconds = clampMediaSeekTime(media, seconds);

    let settled = false;
    const finishSeek = () => {
      if (settled) {
        return;
      }

      settled = true;
      media.removeEventListener("seeked", finishSeek);

      if (!isLatestMediaSeekRequest(requestVersion, mediaSeekRequestVersions.get(media) ?? 0)) {
        return;
      }

      const currentTime = Number.isFinite(media.currentTime) ? media.currentTime : targetSeconds;

      setDisplayTime(currentTime);
      onMediaTimeUpdate(currentTime);

      if (options?.playAfterSeek) {
        return;
      }

      refreshPausedVideoFrame(media);
    };

    media.addEventListener("seeked", finishSeek);
    media.currentTime = targetSeconds;
    setDisplayTime(targetSeconds);
    onMediaTimeUpdate(targetSeconds);

    if (options?.playAfterSeek) {
      playMediaWithSound(media);
    }

    window.setTimeout(finishSeek, 900);
  } catch {
    // 媒体元数据未就绪时忽略定位失败，加载完成后会再次尝试。
  }
}

function clampMediaSeekTime(media: HTMLMediaElement, seconds: number) {
  if (!Number.isFinite(media.duration) || media.duration <= 0) {
    return seconds;
  }

  return Math.min(seconds, Math.max(media.duration - 0.05, 0));
}

function playMediaWithSound(media: HTMLMediaElement) {
  if (media instanceof HTMLVideoElement) {
    const refreshState = videoFrameRefreshStates.get(media);

    if (refreshState) {
      refreshState.cancelled = true;
      videoFrameRefreshStates.delete(media);
    }
  }

  media.muted = false;

  if (media.volume === 0) {
    media.volume = 1;
  }

  const playPromise = media.play();

  if (playPromise && typeof playPromise.catch === "function") {
    void playPromise.catch(() => {
      // 浏览器拒绝后续有声自动播放时静音续播，避免学习流程卡死。
      media.muted = true;

      const mutedPlayPromise = media.play();

      if (mutedPlayPromise && typeof mutedPlayPromise.then === "function") {
        void mutedPlayPromise
          .then(() => undefined)
          .catch(() => {
            media.muted = false;
          });
      }
    });
  }
}

function refreshPausedVideoFrame(media: HTMLMediaElement) {
  if (!(media instanceof HTMLVideoElement)) {
    return;
  }

  if (isCoarsePointerDevice()) {
    return;
  }

  const video = media;
  const refreshState = videoFrameRefreshStates.get(video) ?? {
    cancelled: false,
    muted: video.muted,
    pending: 0,
    volume: video.volume
  };
  refreshState.pending += 1;
  videoFrameRefreshStates.set(video, refreshState);

  const finishRefresh = createVideoFrameRefreshFinish(video, refreshState);

  video.muted = true;
  window.setTimeout(finishRefresh, 700);

  const playPromise = video.play();

  if (playPromise && typeof playPromise.then === "function") {
    void playPromise
      .then(() => pauseVideoAfterNextFrame(video, finishRefresh))
      .catch(finishRefresh);
    return;
  }

  pauseVideoAfterNextFrame(video, finishRefresh);
}

function pauseVideoAfterNextFrame(video: HTMLVideoElement, finishRefresh: () => void) {
  const requestFrame = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    }
  ).requestVideoFrameCallback;

  if (typeof requestFrame === "function") {
    requestFrame.call(video, finishRefresh);
    window.setTimeout(finishRefresh, 180);
    return;
  }

  window.setTimeout(finishRefresh, 90);
}

function isCoarsePointerDevice() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function createVideoFrameRefreshFinish(video: HTMLVideoElement, refreshState: VideoFrameRefreshState) {
  let refreshed = false;

  return () => {
    if (refreshed) {
      return;
    }

    refreshed = true;
    refreshState.pending = Math.max(refreshState.pending - 1, 0);

    if (
      !shouldPauseRefreshedVideoFrame({
        cancelled: refreshState.cancelled,
        ownsRefreshState: videoFrameRefreshStates.get(video) === refreshState,
        videoMuted: video.muted
      })
    ) {
      if (refreshState.pending === 0 && videoFrameRefreshStates.get(video) === refreshState) {
        videoFrameRefreshStates.delete(video);
      }

      return;
    }

    video.pause();

    if (refreshState.pending > 0) {
      return;
    }

    video.muted = refreshState.muted;
    video.volume = refreshState.volume;
    if (videoFrameRefreshStates.get(video) === refreshState) {
      videoFrameRefreshStates.delete(video);
    }
  };
}

function mediaSeekTargetForWord(word: GuideWord, index: number): MediaSeekTarget | null {
  const seconds = word.appearsAtSeconds ?? parseMediaTimeToSeconds(word.appearsAt);

  if (seconds === null || seconds === undefined) {
    return null;
  }

  return {
    caption: word.subtitle ?? `${word.word} · ${word.meaning}`,
    id: `word-${word.id}-${index}-${seconds}`,
    seconds
  };
}

function mediaSeekTargetForSegment(segment: TeacherSegment, index: number): MediaSeekTarget | null {
  const seconds = segment.startSeconds ?? parseMediaTimeToSeconds(segment.timeRange);

  if (seconds === null || seconds === undefined) {
    return null;
  }

  return {
    caption: segment.subtitle,
    id: `segment-${segment.id}-${index}-${seconds}`,
    seconds
  };
}

function mediaSeekTargetForNarrationNode(
  node: NarrationTimelineNode,
  index: number,
  options?: {
    playAfterSeek?: boolean;
  }
): MediaSeekTarget | null {
  if (node.type !== "SENTENCE") {
    return null;
  }

  const seconds = node.startSeconds ?? parseMediaTimeToSeconds(node.timeRange ?? "");

  if (seconds === null || seconds === undefined) {
    return null;
  }

  return {
    caption: node.subtitle ?? node.title,
    id: `narration-${node.id}-${index}-${seconds}`,
    pauseAtSeconds:
      options?.playAfterSeek !== false && typeof node.endSeconds === "number" && node.endSeconds > seconds ? node.endSeconds : undefined,
    playAfterSeek: options?.playAfterSeek !== false,
    seconds
  };
}

function mediaSeekTargetForRepeatLine(line: RepeatLine, index: number): MediaSeekTarget | null {
  const seconds = line.startSeconds ?? parseMediaTimeToSeconds(line.timeRange);

  if (seconds === null || seconds === undefined) {
    return null;
  }

  return {
    caption: line.text,
    id: `repeat-${line.id}-${index}-${seconds}`,
    pauseAtSeconds:
      typeof line.endSeconds === "number" && line.endSeconds > seconds ? line.endSeconds : undefined,
    playAfterSeek: true,
    seconds
  };
}

function mediaSeekTargetForAutonomousLine(line: RepeatLine, index: number): MediaSeekTarget | null {
  const seconds = line.startSeconds ?? parseMediaTimeToSeconds(line.timeRange);

  if (seconds === null || seconds === undefined) {
    return null;
  }

  return {
    caption: line.text,
    id: `autonomous-${line.id}-${index}-${seconds}`,
    playAfterSeek: true,
    seconds
  };
}

function emitMediaSeekTarget(target: MediaSeekTarget) {
  window.dispatchEvent(
    new CustomEvent(videoGuideMediaSeekEventName, {
      detail: target
    })
  );
}

function mediaStageLabel(stage: number) {
  if (stage === 0) {
    return "自主视听";
  }

  if (stage === 1) {
    return "互动讲解";
  }

  if (stage === 2) {
    return "词语巩固";
  }

  if (stage === 4) {
    return "跟读训练";
  }

  return "学习内容区";
}

function buildWrongAnswerReview(question: GuideQuestion, selectedOption: string, correctOption: string) {
  const selected = selectedOption || "未选择";
  const correct = correctOption || "正确选项";

  return `这题不要只看选项表面意思。你选了“${selected}”，但题干真正考的是内容中的关键词或逻辑关系，所以应该选“${correct}”。${question.explanation} 建议回到互动讲解或词语巩固阶段，把题干里的关键词重新对应到原文语境里。`;
}

function subtitleForMediaTime(lines: RepeatLine[], seconds: number) {
  if (!Number.isFinite(seconds) || lines.length === 0) {
    return "";
  }

  const activeLine = lines.find((line) => {
    if (typeof line.startSeconds !== "number" || typeof line.endSeconds !== "number") {
      return false;
    }

    return seconds >= line.startSeconds && seconds <= line.endSeconds;
  });

  return activeLine?.text ?? "";
}

function mediaTypeFromUrl(value: string | null | undefined): "VIDEO" | "AUDIO" | undefined {
  const extension = value?.split("?")[0]?.toLowerCase().split(".").pop();

  if (!extension) {
    return undefined;
  }

  if (["mp4", "mov", "webm", "m4v", "mkv"].includes(extension)) {
    return "VIDEO";
  }

  if (["mp3", "m4a", "wav", "aac", "ogg", "flac"].includes(extension)) {
    return "AUDIO";
  }

  return undefined;
}

function parseMediaTimeToSeconds(value: string | undefined) {
  const match = value?.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function formatMediaClock(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function estimateTeacherSegmentDuration(value: string) {
  return Math.min(14_000, Math.max(4_800, value.length * 115));
}

function speakTeacherExplanation(value: string) {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "zh-CN";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function stopTeacherSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
