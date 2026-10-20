"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Film,
  GitCompareArrows,
  History,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PlayCircle,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";

import { VoicePicker } from "@/components/audio/voice-picker";
import { ActionToast, type ActionToastState } from "@/components/ui/action-toast";
import { VideoGuidePreviewPlayer } from "@/components/experience/video-guide-preview-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  hasActiveVideoGuideGeneration,
  isCompletedVideoGuideLesson,
  mergeStoredVideoGuideLessons,
  parseVideoGuideLessonContent,
  preferredActiveVideoGuideLesson,
  reconcileStoredVideoGuideLessons,
  reusableVideoGuideLessonId,
  sortStoredVideoGuideLessonsForEntry,
  upsertStoredVideoGuideLesson,
  videoGuideLessonBelongsToUser,
  videoGuideLessonForUser,
  videoGuideLessonsForUser,
  videoGuideScriptReady,
  videoGuideLessonIdsToRefresh,
  videoGuideStorageKeyForUser,
  videoGuideStorageMatchesAuthOwner,
  type StoredVideoGuideLesson,
  type VideoGuideOperationProgress
} from "@/lib/video-guide-data";
import type { PublicUser } from "@/lib/auth-actions";
import { learningBillingConsumptionLabel } from "@/lib/learning-billing-copy";
import {
  publicAuthSessionStorageKey,
  shouldReloadForPublicAuthChange
} from "@/lib/public-auth-session";
import {
  createNarrationEditorState,
  moveNarrationEditor,
  narrationEditorSavePayload,
  NarrationEditorValidationError,
  updateNarrationEditorScript,
  type NarrationEditorState
} from "@/lib/video-guide-narration-editor";
import { cn } from "@/lib/utils";
import {
  createToolCreatorId,
  mediaTutorCreatorPath
} from "@/lib/tool-creator-routes";
import { supportsVoicePickerLanguages, type VoicePickerOption } from "@/lib/voice-picker";
import {
  buildVideoGuideVoiceOptions,
  downloadSubtitleText,
  estimateMediaConversionRemainingMinutes,
  resolveOperationUiProgress,
  resolveVideoGuideVoiceSelection,
  resolveSubtitleWorkflowSource,
  resolveSubtitleDownloadText,
  resolveVideoGuideWorkflowLesson,
  subtitleDownloadFilename
} from "@/lib/video-guide-console-actions";
import {
  compareSubtitleRows,
  type SubtitleComparisonDifference
} from "@/lib/video-guide-subtitle-comparison";

const maxVideoMediaBytes = 500 * 1024 * 1024;
const maxAudioMediaBytes = 100 * 1024 * 1024;
const maxSubtitleBytes = 20 * 1024 * 1024;
const maxBackendSubtitleTextLength = 200_000;
const pendingLessonRefreshIntervalMs = 2000;
const defaultVideoGuideNarrationVoice = "longxiaoxia_v3";
const workflowActionButtonClassName =
  "min-w-28 border-border bg-background text-foreground shadow-none transition-colors hover:border-primary/40 hover:bg-secondary hover:text-primary disabled:pointer-events-auto disabled:border-border disabled:bg-secondary/45 disabled:text-muted-foreground disabled:opacity-100 disabled:hover:border-border disabled:hover:bg-secondary/70 disabled:hover:text-muted-foreground";

type GenerationStatus = "idle" | "queued" | "generating" | "completed";
type MediaKind = "video" | "audio";
type MediaTransferStage = "idle" | "preparing" | "uploading" | "converting" | "completed";
type ApiVideoGuideLessonStatus = "DRAFT" | "QUEUED" | "GENERATING" | "SUCCEEDED" | "FAILED";

interface SubtitleCue {
  endSeconds?: number;
  startSeconds?: number;
  text: string;
  timeRange: string;
}

interface UploadedVideoGuideMedia {
  assetId?: string;
  assetRefId?: string;
  filename: string;
  originalName: string;
  mediaType: "VIDEO" | "AUDIO";
  mimeType: string;
  reused?: boolean;
  size: number;
  url: string;
}

interface UploadedVideoGuideSubtitle {
  assetId?: string;
  assetRefId?: string;
  filename: string;
  originalName: string;
  subtitleFormat: "SRT" | "ASS";
  mimeType: string;
  reused?: boolean;
  size: number;
  url: string;
}

interface VideoGuideMediaUploadProgress {
  errorMessage: string | null;
  percent: number;
  stage: string;
  startedAt: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  updatedAt: string;
  uploadId: string;
}

interface VideoGuideSystemVoice {
  accent?: string | null;
  ageCategory?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  gender?: string | null;
  instructSupported?: boolean;
  language?: string | null;
  languages?: string[];
  name: string;
  id?: string;
  previewAudioUrl?: string | null;
  providerVoiceId: string;
  scene?: string | null;
  ssmlSupported?: boolean;
  status?: string;
  timestampSupported?: boolean;
  trait?: string | null;
  targetModel?: string;
  type?: string;
  typeName?: string;
}

interface VideoGuideVoiceLibrary {
  defaultVoice?: {
    systemVoiceId?: string | null;
    voiceAssetId?: string | null;
  };
  customVoices?: VideoGuideSystemVoice[];
  platformVoices?: VideoGuideSystemVoice[];
  systemVoices: VideoGuideSystemVoice[];
}

interface VideoGuideBillingItem {
  code: string;
  description: string;
  estimatedCredits: number;
  name: string;
}

interface VideoGuideBillingEstimate {
  availableCredits: number;
  enoughCredits: boolean;
  estimatedCredits: number;
  items: VideoGuideBillingItem[];
  operation:
    | "VIDEO_GUIDE_SUBTITLE"
    | "VIDEO_GUIDE_LESSON"
    | "VIDEO_GUIDE_NARRATION_TTS"
    | "VIDEO_GUIDE_PRACTICE";
  revision?: string;
  title: string;
}

type BillingDialogState =
  | {
      action: "subtitle";
      estimate: VideoGuideBillingEstimate;
      isSubmitting: boolean;
      lesson?: StoredVideoGuideLesson | null;
      mediaFile: MediaFileState;
    }
  | {
      action: "lesson";
      estimate: VideoGuideBillingEstimate;
      isSubmitting: boolean;
      lesson: StoredVideoGuideLesson | null;
      mediaFile: MediaFileState;
      subtitleFile: SubtitleFileState;
    }
  | {
      action: "narrationAudio";
      estimate: VideoGuideBillingEstimate;
      isSubmitting: boolean;
      lesson: StoredVideoGuideLesson;
      narrationVoice: string;
    }
  | {
      action: "narrationScript";
      billingRequestId: string;
      estimate: VideoGuideBillingEstimate;
      isSubmitting: boolean;
      lesson: StoredVideoGuideLesson;
      requestBody: ReturnType<typeof narrationEditorSavePayload>;
    }
  | {
      action: "practice";
      estimate: VideoGuideBillingEstimate;
      isSubmitting: boolean;
      lesson: StoredVideoGuideLesson;
    }
  | null;

interface MediaFileState {
  file?: File;
  kind: MediaKind;
  name: string;
  objectUrl: string;
  size: number;
  type: string;
  upload?: UploadedVideoGuideMedia | null;
  uploadStatus: "local" | "uploading" | "uploaded" | "failed";
}

interface SubtitleFileState {
  extension: ".srt" | ".ass";
  file?: File;
  name: string;
  size: number;
  text: string;
  upload?: UploadedVideoGuideSubtitle | null;
  uploadStatus: "local" | "uploading" | "uploaded" | "failed";
}

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

interface VideoGuideUploadCheckResponse {
  exists: boolean;
  media?: UploadedVideoGuideMedia;
  subtitle?: UploadedVideoGuideSubtitle;
}

interface ApiVideoGuideLesson {
  id: string;
  userId: string;
  title: string;
  mediaName: string;
  mediaType?: "VIDEO" | "AUDIO";
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  mediaStorageKey?: string | null;
  mediaUrl?: string | null;
  subtitleName?: string | null;
  subtitleFormat?: "SRT" | "ASS" | null;
  subtitleSizeBytes?: number | null;
  subtitleStorageKey?: string | null;
  subtitleUrl?: string | null;
  status: ApiVideoGuideLessonStatus;
  statusName: string;
  shareToken: string;
  content?: unknown;
  errorMessage?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

interface EditableSubtitleRow {
  dialoguePrefix?: string;
  key: string;
  label: string;
  lineIndex?: number;
  prefixLines?: string[];
  text: string;
  timeRange: string;
}

type SubtitleEditorState =
  | {
      extension: ".srt";
      rows: EditableSubtitleRow[];
    }
  | {
      extension: ".ass";
      rows: EditableSubtitleRow[];
      sourceLines: string[];
    };

interface SubtitleComparisonState {
  differences: Array<SubtitleComparisonDifference & {
    resolution: "pending" | "recognized" | "reference";
  }>;
  mode: "input" | "review";
  sourceText: string;
}

export function VideoGuideConsole({
  creatorId,
  currentUser
}: {
  creatorId?: string;
  currentUser: PublicUser | null;
}) {
  const router = useRouter();
  const historyStorageKey = videoGuideStorageKeyForUser(currentUser?.id);
  const [mediaFile, setMediaFile] = useState<MediaFileState | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<SubtitleFileState | null>(null);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [, setStatusText] = useState("等待上传学习素材");
  const [generatedLesson, setGeneratedLesson] = useState<StoredVideoGuideLesson | null>(null);
  const [workingLesson, setWorkingLesson] = useState<StoredVideoGuideLesson | null>(null);
  const [storedLessons, setStoredLessons] = useState<StoredVideoGuideLesson[]>([]);
  const [subtitleGenerationStatus, setSubtitleGenerationStatus] = useState<"idle" | "generating">("idle");
  const [practiceGenerationStatus, setPracticeGenerationStatus] = useState<"idle" | "generating">("idle");
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [mediaTransferStage, setMediaTransferStage] = useState<MediaTransferStage>("idle");
  const [mediaConversionEtaMinutes, setMediaConversionEtaMinutes] = useState<number | null>(null);
  const [subtitleUploadProgress, setSubtitleUploadProgress] = useState(0);
  const [subtitleGenerationProgress, setSubtitleGenerationProgress] = useState(0);
  const [narrationTtsGenerationProgress, setNarrationTtsGenerationProgress] = useState(0);
  const [practiceGenerationProgress, setPracticeGenerationProgress] = useState(0);
  const [subtitleEditor, setSubtitleEditor] = useState<SubtitleEditorState | null>(null);
  const [subtitleComparison, setSubtitleComparison] = useState<SubtitleComparisonState | null>(null);
  const [isSavingSubtitleEdit, setIsSavingSubtitleEdit] = useState(false);
  const [narrationEditor, setNarrationEditor] = useState<NarrationEditorState | null>(null);
  const [isSavingNarrationEdit, setIsSavingNarrationEdit] = useState(false);
  const [billingDialog, setBillingDialog] = useState<BillingDialogState>(null);
  const [toastState, setToastState] = useState<ActionToastState>({});
  const [voiceOptions, setVoiceOptions] = useState<VoicePickerOption[]>([]);
  const [selectedNarrationVoice, setSelectedNarrationVoice] = useState("");
  const [activeGenerationLessonId, setActiveGenerationLessonId] = useState<string | null>(null);
  const [openHistoryMenu, setOpenHistoryMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(true);
  const [isEditingLessonTitle, setIsEditingLessonTitle] = useState(false);
  const [isSavingLessonTitle, setIsSavingLessonTitle] = useState(false);
  const [lessonTitleDraft, setLessonTitleDraft] = useState("");
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const voiceOptionsRef = useRef<VoicePickerOption[]>([]);
  const voiceOptionsLoadedRef = useRef(false);
  const pendingRestoredNarrationVoiceRef = useRef<{ value: string | null } | null>(null);
  const timersRef = useRef<number[]>([]);
  const completedGenerationIdsRef = useRef<Set<string>>(new Set());
  const notifiedOperationStatesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let reloading = false;

    function reloadIfAuthSessionChanged(changedKey: string | null, changedOwner: string | null) {
      if (
        reloading ||
        !shouldReloadForPublicAuthChange(
          currentUser?.id,
          changedKey,
          changedOwner
        )
      ) {
        return;
      }

      reloading = true;
      window.location.reload();
    }

    function handleAuthSessionChange(event: StorageEvent) {
      reloadIfAuthSessionChanged(event.key, event.newValue);
    }

    function verifyCurrentAuthSession() {
      reloadIfAuthSessionChanged(
        publicAuthSessionStorageKey,
        window.localStorage.getItem(publicAuthSessionStorageKey)
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        verifyCurrentAuthSession();
      }
    }

    verifyCurrentAuthSession();
    window.addEventListener("storage", handleAuthSessionChange);
    window.addEventListener("focus", verifyCurrentAuthSession);
    window.addEventListener("pageshow", verifyCurrentAuthSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleAuthSessionChange);
      window.removeEventListener("focus", verifyCurrentAuthSession);
      window.removeEventListener("pageshow", verifyCurrentAuthSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser?.id]);

  const isGeneratingSubtitle = subtitleGenerationStatus === "generating";
  const subtitleWorkflowSource = resolveSubtitleWorkflowSource({
    generationActive: isGeneratingSubtitle,
    generationProgress: subtitleGenerationProgress,
    hasSubtitle: Boolean(subtitleFile)
  });
  const isGeneratingPractice = practiceGenerationStatus === "generating";
  const isGeneratingNarrationScript = Boolean(
    workingLesson?.content?.narrationGenerationProgress &&
      isActiveOperation(workingLesson.content.narrationGenerationProgress.status)
  );
  const isGeneratingNarrationAudio = Boolean(
    workingLesson?.content?.narrationTtsGenerationProgress &&
      isActiveOperation(workingLesson.content.narrationTtsGenerationProgress.status)
  );
  const isUploadingFiles =
    mediaFile?.uploadStatus === "uploading" || subtitleFile?.uploadStatus === "uploading" || isGeneratingSubtitle;
  const practiceLesson = generatedLesson ?? workingLesson;
  const canGenerate = Boolean(
    mediaFile &&
      subtitleFile &&
      subtitleFile.text.trim().length > 0 &&
      !isUploadingFiles &&
      status !== "generating" &&
      status !== "queued" &&
      !isGeneratingPractice &&
      (!practiceLesson || !hasActiveVideoGuideGeneration(practiceLesson)) &&
      !billingDialog?.isSubmitting
  );
  const shareHref = generatedLesson ? `/media-tutor/${lessonRouteId(generatedLesson)}` : "";
  const canGenerateNarrationAudio = Boolean(
    practiceLesson &&
      videoGuideScriptReady(practiceLesson) &&
      selectedNarrationVoice &&
      !isVoiceLoading &&
      !hasActiveVideoGuideGeneration(practiceLesson) &&
      !billingDialog?.isSubmitting
  );
  const canGeneratePractice = Boolean(
    practiceLesson &&
      canGeneratePracticeForLesson(practiceLesson) &&
      !isGeneratingPractice &&
      !billingDialog?.isSubmitting
  );
  const currentNarrationItem = narrationEditor?.items[narrationEditor.index] ?? null;
  const previewSubtitleCues = useMemo(
    () => (subtitleFile ? extractSubtitleCues(subtitleFile, Number.POSITIVE_INFINITY) : []),
    [subtitleFile]
  );
  const pendingLessonIds = useMemo(
    () =>
      storedLessons
        .filter(hasActiveVideoGuideGeneration)
        .map((lesson) => lesson.id)
        .join(","),
    [storedLessons]
  );
  const timedPreviewSubtitleCues = useMemo(
    () => previewSubtitleCues.filter(isTimedSubtitleCue),
    [previewSubtitleCues]
  );
  const previewMediaUrl = mediaFile?.upload?.url || (mediaFile?.file ? "" : mediaFile?.objectUrl ?? "");

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!openHistoryMenu) {
      return;
    }

    function closeHistoryMenu() {
      setOpenHistoryMenu(null);
    }

    function closeHistoryMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenHistoryMenu(null);
      }
    }

    window.addEventListener("click", closeHistoryMenu);
    window.addEventListener("keydown", closeHistoryMenuWithKeyboard);

    return () => {
      window.removeEventListener("click", closeHistoryMenu);
      window.removeEventListener("keydown", closeHistoryMenuWithKeyboard);
    };
  }, [openHistoryMenu]);

  useEffect(() => {
    const localLessons = sortStoredVideoGuideLessonsForEntry(readStoredLessons(historyStorageKey));
    const lessonIdsToRefresh = videoGuideLessonIdsToRefresh(localLessons);
    const initialHistorySignature = storedLessonHistorySignature(localLessons);
    let cancelled = false;

    setStoredLessons(localLessons);
    writeStoredLessons(historyStorageKey, localLessons);
    void Promise.all([
      loadStoredLessonsFromApi(currentUser?.id),
      Promise.all(
        lessonIdsToRefresh.map((lessonId) =>
          fetchGeneratedLesson(lessonId, currentUser?.id)
        )
      ),
      creatorId
        ? fetchGeneratedLesson(creatorId, currentUser?.id)
        : Promise.resolve(null)
    ]).then(([lessons, refreshedLessons, creatorLesson]) => {
      if (cancelled) {
        return;
      }

      const directLessons = refreshedLessons.filter((lesson): lesson is ApiVideoGuideLesson => Boolean(lesson)).map(toStoredLesson);
      const requestedLessons = creatorLesson ? [toStoredLesson(creatorLesson)] : [];

      if (lessons.length > 0 || directLessons.length > 0 || requestedLessons.length > 0) {
        const currentLocalLessons = readStoredLessons(historyStorageKey);
        const incomingLessons = mergeStoredVideoGuideLessons(
          requestedLessons,
          mergeStoredVideoGuideLessons(directLessons, lessons)
        );
        const mergedLessons =
          storedLessonHistorySignature(currentLocalLessons) === initialHistorySignature
            ? sortStoredVideoGuideLessonsForEntry(
                mergeStoredVideoGuideLessons(incomingLessons, currentLocalLessons)
              )
            : reconcileStoredVideoGuideLessons(
                currentLocalLessons,
                incomingLessons
              );
        setStoredLessons(mergedLessons);
        writeStoredLessons(historyStorageKey, mergedLessons);
        const activeLesson = creatorId
          ? mergedLessons.find((lesson) => lesson.id === creatorId)
          : preferredActiveVideoGuideLesson(mergedLessons);

        if (activeLesson) {
          void restoreLessonForRegeneration(activeLesson, {
            announce: false,
            scroll: false
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [creatorId, currentUser?.id, historyStorageKey]);

  useEffect(() => {
    const hasPendingLesson = Boolean(activeGenerationLessonId) || pendingLessonIds.length > 0;

    if (!hasPendingLesson) {
      return;
    }

    let cancelled = false;

    async function refreshPendingLessons() {
      const lessonIdsToRefresh = videoGuideLessonIdsToRefresh(
        readStoredLessons(historyStorageKey),
        activeGenerationLessonId,
        workingLesson
      );
      const [lessons, refreshedLessons] = await Promise.all([
        loadStoredLessonsFromApi(currentUser?.id),
        Promise.all(
          lessonIdsToRefresh.map((lessonId) =>
            fetchGeneratedLesson(lessonId, currentUser?.id)
          )
        )
      ]);
      const directLessons = refreshedLessons.filter((lesson): lesson is ApiVideoGuideLesson => Boolean(lesson)).map(toStoredLesson);

      if (cancelled || (lessons.length === 0 && directLessons.length === 0)) {
        return;
      }

      const mergedLessons = reconcileStoredVideoGuideLessons(
        readStoredLessons(historyStorageKey),
        mergeStoredVideoGuideLessons(directLessons, lessons)
      );
      setStoredLessons(mergedLessons);
      writeStoredLessons(historyStorageKey, mergedLessons);

      const activeLesson = activeGenerationLessonId
        ? mergedLessons.find((lesson) => lesson.id === activeGenerationLessonId)
        : undefined;
      const workingLessonFromApi = workingLesson
        ? mergedLessons.find((lesson) => lesson.id === workingLesson.id)
        : undefined;
      const watchedLessonIds = new Set(pendingLessonIds.split(",").filter(Boolean));
      const watchedLesson = mergedLessons.find((lesson) => watchedLessonIds.has(lesson.id));
      const visibleLesson = resolveVideoGuideWorkflowLesson({
        activeLesson,
        fallbackLesson: mergedLessons.find(hasActiveVideoGuideGeneration),
        watchedLesson,
        workingLesson: workingLessonFromApi
      });

      if (workingLessonFromApi) {
        setWorkingLesson(workingLessonFromApi);
        setGeneratedLesson((current) =>
          current?.id === workingLessonFromApi.id ? workingLessonFromApi : current
        );
      }

      if (visibleLesson) {
        const subtitleOperation = visibleLesson.content?.subtitleGenerationProgress;
        const narrationOperation = visibleLesson.content?.narrationGenerationProgress;
        const narrationTtsOperation = visibleLesson.content?.narrationTtsGenerationProgress;
        const practiceOperation = visibleLesson.content?.practiceGenerationProgress;
        const narrationTtsUi = resolveOperationUiProgress(narrationTtsOperation);
        const practiceUi = resolveOperationUiProgress(practiceOperation);

        setNarrationTtsGenerationProgress(narrationTtsUi.progress);
        setPracticeGenerationProgress(practiceUi.progress);
        setPracticeGenerationStatus(practiceUi.isGenerating ? "generating" : "idle");

        if (subtitleOperation) {
          setSubtitleUploadProgress(0);
          setSubtitleGenerationProgress(subtitleOperation.percent);
          setSubtitleGenerationStatus(isActiveOperation(subtitleOperation.status) ? "generating" : "idle");

          if (isActiveOperation(subtitleOperation.status)) {
            setStatusText(`${subtitleOperation.message}；可以关闭页面，后台会继续生成`);
          } else if (subtitleOperation.status === "SUCCEEDED") {
            const notificationKey = operationNotificationKey(visibleLesson, "SUBTITLE", subtitleOperation);

            if (!notifiedOperationStatesRef.current.has(notificationKey)) {
              notifiedOperationStatesRef.current.add(notificationKey);
              const subtitleText = visibleLesson.subtitleUrl
                ? await fetchSubtitleText(visibleLesson.subtitleUrl)
                : "";

              if (visibleLesson.subtitleUrl && visibleLesson.subtitleName && subtitleText) {
                const subtitleFormat = visibleLesson.subtitleFormat === "ASS" ? "ASS" : "SRT";
                const subtitleSize = Math.max(visibleLesson.subtitleSizeBytes ?? new Blob([subtitleText]).size, 1);
                setSubtitleFile({
                  extension: subtitleFormat === "ASS" ? ".ass" : ".srt",
                  name: visibleLesson.subtitleName,
                  size: subtitleSize,
                  text: subtitleText,
                  upload: {
                    filename: visibleLesson.subtitleStorageKey ?? "",
                    originalName: visibleLesson.subtitleName,
                    subtitleFormat,
                    mimeType: "text/plain",
                    size: subtitleSize,
                    url: visibleLesson.subtitleUrl
                  },
                  uploadStatus: "uploaded"
                });
              }

              setStatusText(subtitleOperation.message);
              setToast("字幕文件已生成并保存");
            }
          } else if (subtitleOperation.status === "FAILED") {
            notifyOperationFailureOnce(visibleLesson, "SUBTITLE", subtitleOperation, notifiedOperationStatesRef.current, setToast);
            setStatusText(subtitleOperation.errorMessage || subtitleOperation.message);
          }
        }

        if (narrationOperation && isActiveOperation(narrationOperation.status)) {
          setStatus(narrationOperation.status === "QUEUED" ? "queued" : "generating");
          setProgress(narrationOperation.percent);
          setStatusText(`${narrationOperation.message}；可以关闭页面，后台会继续生成`);
        } else if (narrationOperation?.status === "SUCCEEDED") {
          setStatus("idle");
          setProgress(100);
          const notificationKey = operationNotificationKey(
            visibleLesson,
            "NARRATION",
            narrationOperation
          );

          if (!notifiedOperationStatesRef.current.has(notificationKey)) {
            notifiedOperationStatesRef.current.add(notificationKey);
            setStatusText(narrationOperation.message);
            setToast("导学文稿已生成，可以继续合成语音或生成随堂练习");
          }
        } else if (narrationOperation?.status === "FAILED") {
          notifyOperationFailureOnce(
            visibleLesson,
            "NARRATION",
            narrationOperation,
            notifiedOperationStatesRef.current,
            setToast
          );
          setStatusText(narrationOperation.errorMessage || narrationOperation.message);
        } else if (visibleLesson.status === "QUEUED" || visibleLesson.status === "GENERATING") {
          setStatus(visibleLesson.status === "QUEUED" ? "queued" : "generating");
          setProgress(0);
          setStatusText("导学课件正在后台生成；可以关闭页面，稍后回来查看");
        } else {
          setStatus("idle");
          setProgress(0);
        }

        if (narrationTtsOperation) {
          if (isActiveOperation(narrationTtsOperation.status)) {
            setStatus(narrationTtsOperation.status === "QUEUED" ? "queued" : "generating");
            setStatusText(`${narrationTtsOperation.message}；可以关闭页面，后台会继续生成`);
          } else if (narrationTtsOperation.status === "FAILED") {
            setStatus("idle");
            notifyOperationFailureOnce(
              visibleLesson,
              "NARRATION_TTS",
              narrationTtsOperation,
              notifiedOperationStatesRef.current,
              setToast
            );
            setStatusText(narrationTtsOperation.errorMessage || narrationTtsOperation.message);
          }
        }

        if (practiceOperation) {
          if (isActiveOperation(practiceOperation.status)) {
            setStatusText(`${practiceOperation.message}；可以关闭页面，后台会继续生成`);
          } else if (practiceOperation.status === "SUCCEEDED") {
            const notificationKey = operationNotificationKey(visibleLesson, "PRACTICE", practiceOperation);

            if (!notifiedOperationStatesRef.current.has(notificationKey)) {
              notifiedOperationStatesRef.current.add(notificationKey);
              setStatusText(practiceOperation.message);
              setToast("随堂练习已生成");
            }
          } else if (practiceOperation.status === "FAILED") {
            notifyOperationFailureOnce(visibleLesson, "PRACTICE", practiceOperation, notifiedOperationStatesRef.current, setToast);
            setStatusText(practiceOperation.errorMessage || practiceOperation.message);
          }
        }

        if (
          visibleLesson.id === activeGenerationLessonId &&
          !hasActiveVideoGuideGeneration(visibleLesson)
        ) {
          setActiveGenerationLessonId(null);
        }
      }

      const narrationLesson = activeLesson ?? visibleLesson;

      if (narrationLesson?.status === "SUCCEEDED" && (status === "queued" || status === "generating")) {
        completeGeneration(narrationLesson, true);
        return;
      }

      if (narrationLesson?.status === "FAILED" && (status === "queued" || status === "generating")) {
        const message = narrationLesson.errorMessage || "导学课件生成失败，请稍后重试";
        setActiveGenerationLessonId(null);
        setStatus("idle");
        setProgress(0);
        setStatusText(message);
        setToast(message, "error");
      }
    }

    void refreshPendingLessons();
    const timer = window.setInterval(() => void refreshPendingLessons(), pendingLessonRefreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeGenerationLessonId, currentUser?.id, historyStorageKey, pendingLessonIds, status, workingLesson?.id]);

  useEffect(() => {
    const lessonId = new URLSearchParams(window.location.search).get("lessonId");

    if (!lessonId) {
      return;
    }

    router.replace(mediaTutorCreatorPath(lessonId));

    void fetchGeneratedLesson(lessonId, currentUser?.id).then((lesson) => {
      if (lesson) {
        void restoreLessonForRegeneration(toStoredLesson(lesson));
      }
    });
  }, [currentUser?.id, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadVoiceOptions() {
      setIsVoiceLoading(true);
      const options = await fetchVideoGuideVoiceOptions();

      if (cancelled) {
        return;
      }

      voiceOptionsRef.current = options;
      voiceOptionsLoadedRef.current = true;
      setVoiceOptions(options);
      const pendingRestore = pendingRestoredNarrationVoiceRef.current;
      pendingRestoredNarrationVoiceRef.current = null;
      setSelectedNarrationVoice((current) =>
        resolveVideoGuideVoiceSelection({
          currentVoice: pendingRestore ? null : current,
          fallbackVoice: defaultVideoGuideNarrationVoice,
          preferredVoice: pendingRestore?.value,
          voices: options
        })
      );
      setIsVoiceLoading(false);
    }

    void loadVoiceOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mediaFile?.objectUrl) {
        URL.revokeObjectURL(mediaFile.objectUrl);
      }
    };
  }, [mediaFile?.objectUrl]);

  function setToast(message: string, statusType: "success" | "error" = "success") {
    setToastState({
      message,
      status: statusType,
      submittedAt: Date.now()
    });
  }

  function startNewGuideLesson(showToast = true) {
    if (mediaFile?.objectUrl) {
      URL.revokeObjectURL(mediaFile.objectUrl);
    }

    setMediaFile(null);
    setSubtitleFile(null);
    setGeneratedLesson(null);
    setWorkingLesson(null);
    setActiveGenerationLessonId(null);
    setSubtitleEditor(null);
    setNarrationEditor(null);
    setIsEditingLessonTitle(false);
    setLessonTitleDraft("");
    setMediaUploadProgress(0);
    setMediaTransferStage("idle");
    setMediaConversionEtaMinutes(null);
    setSubtitleUploadProgress(0);
    setSubtitleGenerationStatus("idle");
    setSubtitleGenerationProgress(0);
    setNarrationTtsGenerationProgress(0);
    setPracticeGenerationStatus("idle");
    setPracticeGenerationProgress(0);
    setStatus("idle");
    setProgress(0);
    setStatusText("等待上传学习素材");

    if (showToast) {
      setToast("已新建导学课件，请上传视频或音频");
    }
  }

  function openNewGuideLesson(showToast = true) {
    router.push(mediaTutorCreatorPath(createToolCreatorId()));
    startNewGuideLesson(showToast);
  }

  async function handleMediaUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const kind = resolveMediaKind(file);

    if (!kind) {
      setToast("请上传视频或音频文件", "error");
      return;
    }

    const maxMediaBytes = kind === "video" ? maxVideoMediaBytes : maxAudioMediaBytes;

    if (file.size > maxMediaBytes) {
      const mediaLabel = kind === "video" ? "视频" : "音频";
      const maxSizeMb = Math.floor(maxMediaBytes / 1024 / 1024);
      setToast(`${mediaLabel}文件不能超过 ${maxSizeMb}M，当前 ${formatBytes(file.size)}`, "error");
      return;
    }

    setGeneratedLesson(null);
    setActiveGenerationLessonId(null);
    setWorkingLesson(null);
    setSubtitleFile(null);
    setSubtitleUploadProgress(0);
    setSubtitleGenerationProgress(0);
    setNarrationTtsGenerationProgress(0);
    setStatus("idle");
    setProgress(0);
    setStatusText("媒体文件已就绪，正在尝试保存到账号");
    setMediaUploadProgress(0);
    setMediaTransferStage("preparing");
    setMediaConversionEtaMinutes(null);
    const nextMediaFile: MediaFileState = {
      file,
      kind,
      name: file.name,
      objectUrl: URL.createObjectURL(file),
      size: file.size,
      type: file.type,
      uploadStatus: "uploading"
    };
    setMediaFile(nextMediaFile);

    const savedMediaFile = await saveMediaFileToAccount(nextMediaFile);

    if (savedMediaFile) {
      await saveDraftLessonFromMedia(savedMediaFile);
    }
  }

  async function handleSubtitleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!mediaFile) {
      setToast("请先上传视频或音频文件，再上传字幕文件", "error");
      return;
    }

    if (file.size > maxSubtitleBytes) {
      setToast("字幕文件不能超过 20M", "error");
      return;
    }

    let text: string;

    try {
      text = await file.text();
    } catch {
      setToast("字幕文件读取失败，请重新选择", "error");
      return;
    }

    const extension = resolveSubtitleExtension(file.name, text);

    if (!extension) {
      setToast("字幕文件内容需为 srt 或 ass 格式", "error");
      return;
    }

    setGeneratedLesson(null);
    setStatus("idle");
    setProgress(0);
    setSubtitleGenerationStatus("idle");
    setSubtitleGenerationProgress(0);
    setStatusText("字幕文件已就绪，正在尝试保存到账号");
    setSubtitleUploadProgress(1);
    const nextSubtitleFile: SubtitleFileState = {
      extension,
      file,
      name: file.name,
      size: file.size,
      text,
      uploadStatus: "uploading"
    };
    setSubtitleFile(nextSubtitleFile);

    const savedSubtitleFile = await saveSubtitleFileToAccount(nextSubtitleFile);

    if (savedSubtitleFile) {
      await saveSubtitleToWorkingLesson(savedSubtitleFile);
    }
  }

  async function handleGenerateSubtitle() {
    let selectedMediaFile = mediaFile;

    if (subtitleFile?.uploadStatus === "uploading") {
      setToast("字幕文件仍在上传，请等待上传完成后再生成", "error");
      return;
    }

    if (!selectedMediaFile) {
      setToast("请先上传视频或音频文件", "error");
      return;
    }

    if (selectedMediaFile.uploadStatus === "uploading") {
      setToast("媒体文件仍在保存，请稍后再生成字幕", "error");
      return;
    }

    if (!selectedMediaFile.upload) {
      const savedMediaFile = await saveMediaFileToAccount(selectedMediaFile);

      if (!savedMediaFile) {
        return;
      }

      selectedMediaFile = savedMediaFile;
    }

    let selectedLesson = workingLesson;

    if (!selectedLesson && selectedMediaFile.upload) {
      selectedLesson = await saveDraftLessonFromMedia(selectedMediaFile);

      if (!selectedLesson) {
        return;
      }
    }

    const estimate = await estimateSubtitleBilling(selectedMediaFile);

    if (!estimate.data) {
      setToast(estimate.message, "error");
      return;
    }

    setBillingDialog({
      action: "subtitle",
      estimate: estimate.data,
      isSubmitting: false,
      lesson: selectedLesson,
      mediaFile: selectedMediaFile
    });
  }

  async function saveMediaFileToAccount(selectedMediaFile: MediaFileState) {
    if (!selectedMediaFile.file) {
      setToast("媒体文件保存失败，请重新选择视频或音频文件", "error");
      return null;
    }

    setStatusText("正在计算媒体文件指纹");
    setMediaUploadProgress(0);
    setMediaTransferStage("preparing");
    setMediaConversionEtaMinutes(null);
    setMediaFile((current) =>
      current && isSameMediaFile(current, selectedMediaFile) ? { ...current, uploadStatus: "uploading" } : current
    );

    const existingUpload = await checkVideoGuideUploadedFile<UploadedVideoGuideMedia>("MEDIA", selectedMediaFile.file);

    if (existingUpload.shouldAbort) {
      const nextMediaFile: MediaFileState = {
        ...selectedMediaFile,
        upload: null,
        uploadStatus: "failed"
      };

      setMediaUploadProgress(0);
      setMediaTransferStage("idle");
      setMediaConversionEtaMinutes(null);
      setMediaFile((current) => (isSameMediaFile(current, selectedMediaFile) ? nextMediaFile : current));
      setStatusText(`媒体文件保存失败：${existingUpload.message}`);
      setToast(`媒体文件保存失败：${existingUpload.message}`, "error");
      return null;
    }

    if (existingUpload.data) {
      const nextMediaFile: MediaFileState = {
        ...selectedMediaFile,
        upload: existingUpload.data,
        uploadStatus: "uploaded"
      };

      setMediaUploadProgress(100);
      setMediaTransferStage("completed");
      setMediaConversionEtaMinutes(null);
      setMediaFile((current) => (isSameMediaFile(current, selectedMediaFile) ? nextMediaFile : current));
      setStatusText("服务器已有该媒体文件，已秒传");
      setToast("服务器已有该媒体文件，已秒传", "success");
      return nextMediaFile;
    }

    setStatusText("正在保存媒体文件到账号");
    setMediaUploadProgress(0);
    setMediaTransferStage("uploading");
    setMediaConversionEtaMinutes(null);
    const progressId = createVideoGuideMediaUploadProgressId();
    let stopProgressPolling = false;
    let progressPolling = Promise.resolve();
    const upload = await uploadVideoGuideFile<UploadedVideoGuideMedia>(
      "/api/video-guide/uploads/media",
      selectedMediaFile.file,
      (nextProgress) => setMediaUploadProgress(Math.round(nextProgress)),
      () => {
        setMediaUploadProgress(0);
        setMediaTransferStage("converting");
        setStatusText("媒体上传完成，正在转换为网页播放格式");
        progressPolling = pollVideoGuideMediaUploadProgress(
          progressId,
          () => stopProgressPolling,
          (nextProgress) => {
            if (nextProgress.status === "RUNNING") {
              setMediaUploadProgress(nextProgress.percent);
              setMediaConversionEtaMinutes(
                estimateMediaConversionRemainingMinutes(
                  Date.parse(nextProgress.startedAt),
                  nextProgress.percent,
                  Date.now()
                )
              );
            }
          }
        );
      },
      { progressId }
    );
    stopProgressPolling = true;
    await progressPolling;
    const nextMediaFile: MediaFileState = {
      ...selectedMediaFile,
      upload: upload.data,
      uploadStatus: upload.data ? "uploaded" : "failed"
    };

    setMediaFile((current) => (isSameMediaFile(current, selectedMediaFile) ? nextMediaFile : current));

    if (!upload.data) {
      setMediaUploadProgress(0);
      setMediaTransferStage("idle");
      setMediaConversionEtaMinutes(null);
      setStatusText(`媒体文件保存失败：${upload.message}`);
      setToast(`媒体文件保存失败：${upload.message}`, "error");
      return null;
    }

    setMediaUploadProgress(100);
    setMediaTransferStage("completed");
    setMediaConversionEtaMinutes(null);
    setStatusText(upload.data.reused ? "服务器已有该媒体文件，已秒传" : "媒体文件已保存，等待字幕文件");
    return nextMediaFile;
  }

  async function saveDraftLessonFromMedia(selectedMediaFile: MediaFileState) {
    const draft = await createDraftLessonFromMedia(selectedMediaFile);

    if (!draft.data) {
      setStatusText(`媒体已保存，但课件草稿创建失败：${draft.message}`);
      setToast(draft.message, "error");
      return null;
    }

    const lesson = toOwnedStoredLesson(draft.data, currentUser?.id);

    saveLesson(historyStorageKey, lesson);
    setWorkingLesson(lesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), lesson));
    router.replace(mediaTutorCreatorPath(lesson.id));
    setStatusText("媒体文件已保存为课件草稿，可以继续上传或生成字幕");
    setToast("媒体已上传，课件草稿已保存");

    return lesson;
  }

  async function saveSubtitleFileToAccount(selectedSubtitleFile: SubtitleFileState) {
    if (!selectedSubtitleFile.file) {
      setToast("字幕文件保存失败，请重新上传字幕文件", "error");
      return null;
    }

    setStatusText("正在计算字幕文件指纹");
    setSubtitleUploadProgress(8);
    setSubtitleFile((current) =>
      current && isSameSubtitleFile(current, selectedSubtitleFile)
        ? { ...current, uploadStatus: "uploading" }
        : current
    );

    const existingUpload = await checkVideoGuideUploadedFile<UploadedVideoGuideSubtitle>("SUBTITLE", selectedSubtitleFile.file);

    if (existingUpload.shouldAbort) {
      const nextSubtitleFile: SubtitleFileState = {
        ...selectedSubtitleFile,
        upload: null,
        uploadStatus: "failed"
      };

      setSubtitleUploadProgress(0);
      setSubtitleFile((current) => (isSameSubtitleFile(current, selectedSubtitleFile) ? nextSubtitleFile : current));
      setStatusText(`字幕文件保存失败：${existingUpload.message}`);
      setToast(`字幕文件保存失败：${existingUpload.message}`, "error");
      return null;
    }

    if (existingUpload.data) {
      const nextSubtitleFile: SubtitleFileState = {
        ...selectedSubtitleFile,
        upload: existingUpload.data,
        uploadStatus: "uploaded"
      };

      setSubtitleUploadProgress(100);
      setSubtitleFile((current) => (isSameSubtitleFile(current, selectedSubtitleFile) ? nextSubtitleFile : current));
      setStatusText("服务器已有该字幕文件，已秒传");
      setToast("服务器已有该字幕文件，已秒传", "success");
      return nextSubtitleFile;
    }

    setStatusText("正在保存字幕文件到账号");
    setSubtitleUploadProgress(12);
    const upload = await uploadVideoGuideFile<UploadedVideoGuideSubtitle>(
      "/api/video-guide/uploads/subtitle",
      selectedSubtitleFile.file,
      (nextProgress) => setSubtitleUploadProgress(Math.max(12, Math.round(nextProgress)))
    );
    const nextSubtitleFile: SubtitleFileState = {
      ...selectedSubtitleFile,
      upload: upload.data,
      uploadStatus: upload.data ? "uploaded" : "failed"
    };

    setSubtitleFile((current) => (isSameSubtitleFile(current, selectedSubtitleFile) ? nextSubtitleFile : current));

    if (!upload.data) {
      setSubtitleUploadProgress(0);
      setStatusText(`字幕文件保存失败：${upload.message}`);
      setToast(`字幕文件保存失败：${upload.message}`, "error");
      return null;
    }

    setSubtitleUploadProgress(100);
    setStatusText(upload.data.reused ? "服务器已有该字幕文件，已秒传" : "字幕文件已保存，可以生成 AI 导学课件");
    return nextSubtitleFile;
  }

  async function saveSubtitleToWorkingLesson(selectedSubtitleFile: SubtitleFileState) {
    let lesson = workingLesson;

    if (!lesson && mediaFile?.upload) {
      lesson = await saveDraftLessonFromMedia(mediaFile);
    }

    if (!lesson) {
      setToast("字幕已保存，但当前课件草稿不存在，请重新上传媒体文件", "error");
      return null;
    }

    if (!canReuseLessonRecord(lesson)) {
      return lesson;
    }

    const updated = await updateDraftLessonSubtitle(lesson.id, selectedSubtitleFile);

    if (!updated.data) {
      setToast(updated.message, "error");
      return null;
    }

    const storedLesson = toOwnedStoredLesson(updated.data, currentUser?.id);

    saveLesson(historyStorageKey, storedLesson);
    setWorkingLesson(storedLesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), storedLesson));
    setStatusText("字幕已保存到课件草稿，可以编辑字幕文字或生成导学课件文案");

    return storedLesson;
  }

  async function submitSubtitleGeneration(
    selectedMediaFile: MediaFileState,
    selectedLesson: StoredVideoGuideLesson | null | undefined = workingLesson
  ) {
    setGeneratedLesson(null);
    setStatus("idle");
    setProgress(0);
    setSubtitleGenerationStatus("generating");
    setSubtitleGenerationProgress(0);
    setSubtitleUploadProgress(0);
    setStatusText("字幕识别任务正在提交，提交后可以关闭页面");

    const generated = await generateSubtitleFromMedia(selectedMediaFile, true, selectedLesson);

    if (!generated.data) {
      setSubtitleGenerationStatus("idle");
      setSubtitleGenerationProgress(0);
      setStatusText(generated.message);
      setToast(generated.message, "error");
      return;
    }

    const queuedLesson = toOwnedStoredLesson(generated.data, currentUser?.id);
    const operation = queuedLesson.content?.subtitleGenerationProgress;

    saveLesson(historyStorageKey, queuedLesson);
    setWorkingLesson(queuedLesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), queuedLesson));
    setSubtitleGenerationProgress(operation?.percent ?? 0);
    setStatusText(operation?.message || "字幕识别任务已提交，可以关闭页面，后台会继续生成");
    setToast("字幕识别任务已提交，完成后会通知");
  }

  function completeGeneration(lesson: StoredVideoGuideLesson, persisted: boolean) {
    if (persisted && completedGenerationIdsRef.current.has(lesson.id)) {
      return;
    }

    if (persisted) {
      completedGenerationIdsRef.current.add(lesson.id);
    }

    setActiveGenerationLessonId(null);
    saveLesson(historyStorageKey, lesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), lesson));
    setGeneratedLesson(lesson);
    setWorkingLesson(lesson);
    setStatus("completed");
    setProgress(100);
    setNarrationTtsGenerationProgress(100);
    setStatusText(persisted ? "导学课件已保存，可以分享学习页面" : "演示课件已生成，登录后可保存到账号");
    setToast(persisted ? "视频导学课件已生成并保存" : "演示课件已生成，登录后可保存到账号");
  }

  async function runPersistedGeneration(
    selectedMediaFile: MediaFileState,
    selectedSubtitleFile: SubtitleFileState,
    selectedLesson: StoredVideoGuideLesson | null
  ) {
    const submitted = await createGeneratedLesson(selectedMediaFile, selectedSubtitleFile, selectedLesson);

    if (!submitted.persisted || !submitted.apiLesson) {
      setActiveGenerationLessonId(null);
      setStatus("idle");
      setProgress(0);
      setStatusText(submitted.message);
      setToast(submitted.message, "error");
      return;
    }

    const submittedLesson = toOwnedStoredLesson(submitted.apiLesson, currentUser?.id);

    completedGenerationIdsRef.current.delete(submitted.apiLesson.id);
    setActiveGenerationLessonId(submitted.apiLesson.id);
    saveLesson(historyStorageKey, submittedLesson);
    setWorkingLesson(submittedLesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), submittedLesson));
    setStatus(submitted.apiLesson.status === "GENERATING" ? "generating" : "queued");
    setProgress(submittedLesson.content?.narrationGenerationProgress?.percent ?? 0);
    setStatusText(
      submittedLesson.content?.narrationGenerationProgress?.message ||
        "导学文稿任务已提交，可以关闭页面，后台会继续生成"
    );
  }

  async function generateLesson() {
    let selectedMediaFile = mediaFile;
    let selectedSubtitleFile = subtitleFile;

    if (!selectedMediaFile || !selectedSubtitleFile) {
      setToast("请先上传媒体文件和字幕文件", "error");
      return;
    }

    if (!selectedSubtitleFile.text.trim()) {
      setToast("请先生成或上传带时间轴的字幕文件", "error");
      return;
    }

    if (!selectedMediaFile.upload) {
      const savedMediaFile = await saveMediaFileToAccount(selectedMediaFile);

      if (!savedMediaFile) {
        return;
      }

      selectedMediaFile = savedMediaFile;
    }

    if (!selectedSubtitleFile.upload) {
      const savedSubtitleFile = await saveSubtitleFileToAccount(selectedSubtitleFile);

      if (!savedSubtitleFile) {
        return;
      }

      selectedSubtitleFile = savedSubtitleFile;
    }

    void estimateLessonBilling(selectedMediaFile, selectedSubtitleFile).then((estimate) => {
      if (!estimate.data) {
        setToast(estimate.message, "error");
        return;
      }

      setBillingDialog({
        action: "lesson",
        estimate: estimate.data,
        isSubmitting: false,
        lesson: workingLesson,
        mediaFile: selectedMediaFile,
        subtitleFile: selectedSubtitleFile
      });
    });
  }

  async function handleGenerateNarrationAudio() {
    const lesson = practiceLesson;

    if (!lesson || !videoGuideScriptReady(lesson)) {
      setToast("请先完成导学文稿生成，再合成讲解语音", "error");
      return;
    }

    if (!selectedNarrationVoice) {
      setToast("请选择支持多语种的讲解音色", "error");
      return;
    }

    const estimate = await estimateNarrationAudioBilling(
      lesson.id,
      selectedNarrationVoice
    );

    if (!estimate.data) {
      setToast(estimate.message, "error");
      return;
    }

    setBillingDialog({
      action: "narrationAudio",
      estimate: estimate.data,
      isSubmitting: false,
      lesson,
      narrationVoice: selectedNarrationVoice
    });
  }

  async function handleGeneratePractice() {
    const lesson = practiceLesson;

    if (!lesson || !canGeneratePracticeForLesson(lesson)) {
      setToast("请先生成导学课件文案，再生成随堂练习", "error");
      return;
    }

    const estimate = await estimatePracticeBilling(lesson.id);

    if (!estimate.data) {
      setToast(estimate.message, "error");
      return;
    }

    setBillingDialog({
      action: "practice",
      estimate: estimate.data,
      isSubmitting: false,
      lesson
    });
  }

  function submitLessonGeneration(
    selectedMediaFile: MediaFileState,
    selectedSubtitleFile: SubtitleFileState,
    selectedLesson: StoredVideoGuideLesson | null
  ) {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setActiveGenerationLessonId(null);
    setGeneratedLesson(null);
    setNarrationTtsGenerationProgress(0);
    setStatus("queued");
    setProgress(12);
    setStatusText("已提交生成任务，正在排队解析字幕；可以关闭页面，稍后回来查看");
    setToast("导学文稿任务已提交，完成后会弹出通知");

    if (!selectedMediaFile.upload || !selectedSubtitleFile.upload) {
      setStatus("idle");
      setProgress(0);
      setStatusText("媒体或字幕尚未保存，请等待上传完成后重试");
      setToast("媒体或字幕尚未保存，请等待上传完成后重试", "error");
      return;
    }

    void runPersistedGeneration(selectedMediaFile, selectedSubtitleFile, selectedLesson);
  }

  async function submitNarrationAudioGeneration(
    lesson: StoredVideoGuideLesson,
    narrationVoice: string,
    billingRevision: string
  ) {
    setActiveGenerationLessonId(lesson.id);
    setStatus("queued");
    setNarrationTtsGenerationProgress(0);
    setStatusText("讲解语音任务正在提交，提交后可以关闭页面");

    const generated = await createNarrationAudio(
      lesson.id,
      narrationVoice,
      true,
      billingRevision
    );

    if (!generated.data) {
      setActiveGenerationLessonId(null);
      setStatus("idle");
      setNarrationTtsGenerationProgress(0);
      setStatusText(generated.message);
      setToast(generated.message, "error");
      return;
    }

    const storedLesson = toOwnedStoredLesson(generated.data, currentUser?.id);
    const practiceUi = resolveOperationUiProgress(
      storedLesson.content?.practiceGenerationProgress
    );

    completedGenerationIdsRef.current.delete(storedLesson.id);
    setGeneratedLesson(null);
    saveLesson(historyStorageKey, storedLesson);
    setWorkingLesson(storedLesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), storedLesson));
    setNarrationTtsGenerationProgress(
      storedLesson.content?.narrationTtsGenerationProgress?.percent ?? 0
    );
    setPracticeGenerationProgress(practiceUi.progress);
    setPracticeGenerationStatus(practiceUi.isGenerating ? "generating" : "idle");
    setStatusText(
      storedLesson.content?.narrationTtsGenerationProgress?.message ||
        "讲解语音任务已提交，可以关闭页面，后台会继续生成"
    );
    setToast("讲解语音任务已提交，完成后会通知");
  }

  async function submitPracticeGeneration(lesson: StoredVideoGuideLesson) {
    setPracticeGenerationStatus("generating");
    setPracticeGenerationProgress(0);
    setStatusText("随堂练习任务正在提交，提交后可以关闭页面");

    const generated = await createPracticeQuestions(lesson.id, true);

    if (!generated.data) {
      setPracticeGenerationStatus("idle");
      setPracticeGenerationProgress(0);
      setStatusText(generated.message);
      setToast(generated.message, "error");
      return;
    }

    const storedLesson = toOwnedStoredLesson(generated.data, currentUser?.id);

    saveLesson(historyStorageKey, storedLesson);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), storedLesson));
    setWorkingLesson(storedLesson);
    setGeneratedLesson((current) => (!current || current.id === storedLesson.id ? storedLesson : current));
    setPracticeGenerationProgress(storedLesson.content?.practiceGenerationProgress?.percent ?? 0);
    setStatusText(
      storedLesson.content?.practiceGenerationProgress?.message ||
        "随堂练习任务已提交，可以关闭页面，后台会继续生成"
    );
    setToast("随堂练习任务已提交，完成后会通知");
  }

  async function confirmBillingDialog() {
    const dialog = billingDialog;

    if (!dialog || dialog.isSubmitting) {
      return;
    }

    if (!dialog.estimate.enoughCredits) {
      setToast("点数余额不足，请先充值", "error");
      return;
    }

    setBillingDialog({
      ...dialog,
      isSubmitting: true
    });

    if (dialog.action === "narrationScript") {
      const billingRevision = dialog.estimate.revision;

      if (!billingRevision) {
        setBillingDialog(null);
        setToast("点数估算已失效，请重新估算", "error");
        return;
      }

      setIsSavingNarrationEdit(true);
      const updated = await updateNarrationScript(dialog.lesson.id, {
        ...dialog.requestBody,
        billingConfirmed: true,
        billingRequestId: dialog.billingRequestId,
        billingRevision
      });
      setBillingDialog(null);
      setIsSavingNarrationEdit(false);

      if (!updated.data) {
        setToast(updated.message, "error");
        return;
      }

      applySavedNarrationLesson(updated.data, "已保存修改并重新生成本句讲解语音");
      return;
    }

    if (dialog.action === "subtitle") {
      setBillingDialog(null);
      await submitSubtitleGeneration(dialog.mediaFile, dialog.lesson);
      return;
    }

    if (dialog.action === "practice") {
      setBillingDialog(null);
      await submitPracticeGeneration(dialog.lesson);
      return;
    }

    if (dialog.action === "narrationAudio") {
      const billingRevision = dialog.estimate.revision;

      if (!billingRevision) {
        setBillingDialog(null);
        setToast("点数估算已失效，请重新估算", "error");
        return;
      }

      setBillingDialog(null);
      await submitNarrationAudioGeneration(
        dialog.lesson,
        dialog.narrationVoice,
        billingRevision
      );
      return;
    }

    setBillingDialog(null);
    submitLessonGeneration(dialog.mediaFile, dialog.subtitleFile, dialog.lesson);
  }

  function rejectBillingDialog() {
    const canceledScriptSave = billingDialog?.action === "narrationScript";
    setBillingDialog(null);
    setToast(canceledScriptSave ? "已取消保存" : "已取消生成");
  }

  function beginEditingLessonTitle() {
    if (!practiceLesson) return;
    setLessonTitleDraft(displayLessonTitle(practiceLesson.title));
    setIsEditingLessonTitle(true);
  }

  async function saveLessonTitle() {
    if (!practiceLesson || isSavingLessonTitle) return;
    const title = lessonTitleDraft.trim();

    if (!title) {
      setToast("课件名称不能为空", "error");
      return;
    }

    setIsSavingLessonTitle(true);
    const updated = await updateVideoGuideLessonTitle(practiceLesson.id, title);
    setIsSavingLessonTitle(false);

    if (!updated.data) {
      setToast(updated.message, "error");
      return;
    }

    const storedLesson = toOwnedStoredLesson(updated.data, currentUser?.id);
    setWorkingLesson((current) => (current?.id === storedLesson.id ? storedLesson : current));
    setGeneratedLesson((current) => (current?.id === storedLesson.id ? storedLesson : current));
    setStoredLessons((current) => {
      const next = upsertStoredVideoGuideLesson(current, storedLesson);
      writeStoredLessons(historyStorageKey, next);
      return next;
    });
    setIsEditingLessonTitle(false);
    setToast("课件名称已更新");
  }

  async function shareLessonFromHistory(lesson: StoredVideoGuideLesson) {
    if (!isCompletedVideoGuideLesson(lesson)) {
      setToast("课件仍在生成中，完成后才能分享", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/media-tutor/${lessonRouteId(lesson)}`);
      setToast("学习页面链接已复制");
    } catch {
      setToast("浏览器暂不允许复制，请手动复制链接", "error");
    }
  }

  function startLearningFromHistory(lesson: StoredVideoGuideLesson) {
    if (!isCompletedVideoGuideLesson(lesson)) {
      setToast("课件仍在生成中，完成后才能开始学习", "error");
      return;
    }

    window.location.href = `/media-tutor/${lessonRouteId(lesson)}`;
  }

  function pinLessonToTop(lesson: StoredVideoGuideLesson) {
    const lessonId = lessonRouteId(lesson);
    const pinnedLesson = {
      ...lesson,
      pinnedAt: new Date().toISOString()
    };
    const nextLessons = [
      pinnedLesson,
      ...storedLessons.filter((item) => lessonRouteId(item) !== lessonId)
    ].slice(0, 20);

    setStoredLessons(nextLessons);
    writeStoredLessons(historyStorageKey, nextLessons);
    setWorkingLesson((current) =>
      current && lessonRouteId(current) === lessonId ? pinnedLesson : current
    );
    setToast("已置顶导学课件");
  }

  async function deleteLessonFromHistory(lesson: StoredVideoGuideLesson) {
    const deleted = await deleteVideoGuideLesson(lesson.id);

    if (!deleted.ok) {
      setToast(deleted.message, "error");
      return;
    }

    const lessonId = lessonRouteId(lesson);
    const nextLessons = storedLessons.filter((item) => lessonRouteId(item) !== lessonId);

    setStoredLessons(nextLessons);
    writeStoredLessons(historyStorageKey, nextLessons);

    if (workingLesson && lessonRouteId(workingLesson) === lessonId) {
      openNewGuideLesson(false);
    }

    if (generatedLesson && lessonRouteId(generatedLesson) === lessonId) {
      setGeneratedLesson(null);
    }

    setToast("已删除导学课件");
  }

  function openLessonHistoryMenu(event: ReactMouseEvent<HTMLButtonElement>, lesson: StoredVideoGuideLesson) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 184;
    const menuHeight = 252;

    setOpenHistoryMenu({
      id: lessonRouteId(lesson),
      left: Math.min(rect.right + 8, window.innerWidth - menuWidth - 12),
      top: Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 12))
    });
  }

  async function openLessonFromHistory(lesson: StoredVideoGuideLesson) {
    router.push(mediaTutorCreatorPath(lesson.id));
    await restoreLessonForRegeneration(lesson);
  }

  async function restoreLessonForRegeneration(
    lesson: StoredVideoGuideLesson,
    options: { announce?: boolean; scroll?: boolean } = {}
  ) {
    if (!lesson.mediaUrl) {
      setToast("这个课件缺少已保存的媒体文件地址，请重新上传媒体文件", "error");
      return;
    }

    const mediaKind: MediaKind = lesson.mediaType === "AUDIO" ? "audio" : "video";
    const mediaSize = Math.max(lesson.mediaSizeBytes ?? 1, 1);
    const mediaMimeType = lesson.mediaMimeType ?? (mediaKind === "audio" ? "audio/mpeg" : "video/mp4");
    const subtitleName = lesson.subtitleName ?? "";
    const subtitleFormat = lesson.subtitleFormat ?? resolveSubtitleFormatFromName(subtitleName) ?? "SRT";
    const subtitleText = lesson.subtitleUrl ? await fetchSubtitleText(lesson.subtitleUrl) : "";
    const subtitleSize = Math.max(lesson.subtitleSizeBytes ?? new Blob([subtitleText]).size, 1);

    setMediaFile({
      kind: mediaKind,
      name: lesson.mediaName,
      objectUrl: lesson.mediaUrl,
      size: mediaSize,
      type: mediaMimeType,
      upload: {
        filename: lesson.mediaStorageKey ?? "",
        originalName: lesson.mediaName,
        mediaType: mediaKind === "audio" ? "AUDIO" : "VIDEO",
        mimeType: mediaMimeType,
        size: mediaSize,
        url: lesson.mediaUrl
      },
      uploadStatus: "uploaded"
    });
    setSubtitleFile(
      subtitleName
        ? {
            extension: subtitleFormat === "ASS" ? ".ass" : ".srt",
            name: subtitleName,
            size: subtitleSize,
            text: subtitleText,
            upload: lesson.subtitleUrl
              ? {
                  filename: lesson.subtitleStorageKey ?? "",
                  originalName: subtitleName,
                  subtitleFormat,
                  mimeType: "text/plain",
                  size: subtitleSize,
                  url: lesson.subtitleUrl
                }
              : null,
            uploadStatus: lesson.subtitleUrl ? "uploaded" : "local"
          }
        : null
    );
    const narrationVoice = lesson.content?.narrationVoice;
    const restoredVoice = narrationVoice?.voiceAssetId
      ? `voice:${narrationVoice.voiceAssetId}`
      : narrationVoice?.providerVoiceId;

    pendingRestoredNarrationVoiceRef.current = { value: restoredVoice ?? null };

    if (voiceOptionsLoadedRef.current) {
      setSelectedNarrationVoice(
        resolveVideoGuideVoiceSelection({
          fallbackVoice: defaultVideoGuideNarrationVoice,
          preferredVoice: restoredVoice,
          voices: voiceOptionsRef.current
        })
      );
      pendingRestoredNarrationVoiceRef.current = null;
    }

    const activeGeneration = hasActiveVideoGuideGeneration(lesson);
    const activeOperation = [
      lesson.content?.subtitleGenerationProgress,
      lesson.content?.narrationGenerationProgress,
      lesson.content?.narrationTtsGenerationProgress,
      lesson.content?.practiceGenerationProgress
    ].find((operation) => operation && isActiveOperation(operation.status));

    setGeneratedLesson(isCompletedVideoGuideLesson(lesson) ? lesson : null);
    setActiveGenerationLessonId(activeGeneration ? lesson.id : null);
    setWorkingLesson(lesson);
    setStatus(
      lesson.status === "QUEUED"
        ? "queued"
        : lesson.status === "GENERATING"
          ? "generating"
          : "idle"
    );
    setProgress(lesson.content?.narrationGenerationProgress?.percent ?? 0);
    setNarrationTtsGenerationProgress(
      lesson.content?.narrationTtsGenerationProgress?.percent ?? 0
    );
    setMediaUploadProgress(100);
    setMediaTransferStage("completed");
    setMediaConversionEtaMinutes(null);
    setSubtitleUploadProgress(
      subtitleName && !lesson.content?.subtitleGenerationProgress ? 100 : 0
    );
    setSubtitleGenerationProgress(lesson.content?.subtitleGenerationProgress?.percent ?? 0);
    setSubtitleGenerationStatus(
      lesson.content?.subtitleGenerationProgress &&
        isActiveOperation(lesson.content.subtitleGenerationProgress.status)
        ? "generating"
        : "idle"
    );
    setPracticeGenerationProgress(lesson.content?.practiceGenerationProgress?.percent ?? 0);
    setPracticeGenerationStatus(
      lesson.content?.practiceGenerationProgress &&
        isActiveOperation(lesson.content.practiceGenerationProgress.status)
        ? "generating"
        : "idle"
    );
    setStatusText(
      activeOperation && isActiveOperation(activeOperation.status)
        ? `${activeOperation.message}；可以关闭页面，后台会继续生成`
        : videoGuideScriptReady(lesson)
          ? "导学文稿已生成，可以继续合成语音或生成随堂练习"
        : subtitleText
        ? "已恢复媒体和字幕，可以重新生成字幕或 AI 导学课件"
        : "已恢复媒体文件，可以点击生成字幕文件重新识别"
    );

    if (options.announce !== false) {
      setToast(subtitleText ? "已恢复为可重新生成状态" : "已恢复媒体文件，请重新生成字幕");
    }

    if (options.scroll !== false) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function openSubtitleEditor() {
    if (!subtitleFile) {
      setToast("请先上传或生成字幕文件", "error");
      return;
    }

    let editableSubtitleFile = subtitleFile;
    let editorState = createSubtitleEditorState(editableSubtitleFile);

    if (!editorState || editorState.rows.length === 0) {
      const subtitleUrl = workingLesson?.subtitleUrl ?? editableSubtitleFile.upload?.url;

      if (subtitleUrl) {
        setStatusText("正在读取字幕文件");
        const subtitleText = await fetchSubtitleText(subtitleUrl);

        if (subtitleText.trim()) {
          editableSubtitleFile = {
            ...editableSubtitleFile,
            size: new Blob([subtitleText]).size,
            text: subtitleText
          };
          setSubtitleFile(editableSubtitleFile);
          editorState = createSubtitleEditorState(editableSubtitleFile);
        }
      }
    }

    if (!editorState || editorState.rows.length === 0) {
      setToast("没有读取到可编辑的字幕句子", "error");
      return;
    }

    setSubtitleComparison(null);
    setSubtitleEditor(editorState);
  }

  async function handleDownloadSubtitle() {
    if (!subtitleFile) {
      setToast("请先上传或生成字幕文件", "error");
      return;
    }

    const subtitleText = await resolveSubtitleDownloadText(
      workingLesson?.subtitleUrl ?? subtitleFile.upload?.url,
      subtitleFile.text,
      fetchSubtitleText
    );

    if (!subtitleText) {
      setToast("字幕内容为空，暂时无法下载", "error");
      return;
    }

    downloadSubtitleText(
      subtitleText,
      subtitleDownloadFilename(
        practiceLesson
          ? displayLessonTitle(practiceLesson.title)
          : stripExtension(mediaFile?.name ?? "字幕"),
        subtitleFile.extension
      )
    );
    setToast("字幕文件已开始下载");
  }

  function updateSubtitleEditorRow(key: string, text: string) {
    setSubtitleEditor((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        rows: current.rows.map((row) => (row.key === key ? { ...row, text } : row))
      };
    });
  }

  function closeSubtitleEditor() {
    setSubtitleComparison(null);
    setSubtitleEditor(null);
  }

  function openSubtitleComparison() {
    setSubtitleComparison({
      differences: [],
      mode: "input",
      sourceText: ""
    });
  }

  function updateSubtitleComparisonSource(sourceText: string) {
    setSubtitleComparison((current) => current ? { ...current, sourceText } : current);
  }

  function runSubtitleComparison() {
    if (!subtitleEditor || !subtitleComparison?.sourceText.trim()) {
      setToast("请先填写原文文本或字幕文本", "error");
      return;
    }

    const differences = compareSubtitleRows(
      subtitleEditor.rows.map((row) => ({ key: row.key, text: row.text })),
      subtitleComparison.sourceText
    );

    if (differences.length === 0) {
      setToast("没有发现文字差异");
      return;
    }

    setSubtitleComparison((current) => current ? {
      ...current,
      differences: differences.map((difference) => ({
        ...difference,
        resolution: "pending"
      })),
      mode: "review"
    } : current);
  }

  function resolveSubtitleComparison(
    difference: SubtitleComparisonDifference,
    resolution: "recognized" | "reference"
  ) {
    updateSubtitleEditorRow(
      difference.key,
      resolution === "reference" ? difference.referenceText : difference.recognizedText
    );
    setSubtitleComparison((current) => current ? {
      ...current,
      differences: current.differences.map((item) =>
        item.key === difference.key ? { ...item, resolution } : item
      )
    } : current);
  }

  async function saveSubtitleEditor() {
    if (!subtitleFile || !subtitleEditor || isSavingSubtitleEdit) {
      return;
    }

    const text = rebuildSubtitleText(subtitleEditor);

    if (!text.trim()) {
      setToast("字幕内容不能为空", "error");
      return;
    }

    setIsSavingSubtitleEdit(true);

    const editedFile = new File([text], subtitleFile.name, {
      type: subtitleFile.extension === ".ass" ? "text/x-ssa" : "text/plain"
    });
    const nextSubtitleFile: SubtitleFileState = {
      ...subtitleFile,
      file: editedFile,
      size: editedFile.size,
      text,
      upload: null,
      uploadStatus: "uploading"
    };

    setSubtitleGenerationStatus("idle");
    setSubtitleGenerationProgress(0);
    setSubtitleUploadProgress(1);
    setSubtitleFile(nextSubtitleFile);
    const savedSubtitleFile = await saveSubtitleFileToAccount(nextSubtitleFile);

    if (savedSubtitleFile) {
      await saveSubtitleToWorkingLesson(savedSubtitleFile);
      closeSubtitleEditor();
      setToast("字幕文字已保存，时间轴未修改");
    }

    setIsSavingSubtitleEdit(false);
  }

  function openNarrationEditor() {
    if (!practiceLesson?.content || !videoGuideScriptReady(practiceLesson)) {
      setToast("请先完成导学文稿生成", "error");
      return;
    }

    try {
      setNarrationEditor(createNarrationEditorState(practiceLesson.content));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "当前课件没有可编辑的导学文稿", "error");
    }
  }

  function moveNarration(direction: "PREVIOUS" | "NEXT") {
    setNarrationEditor((current) =>
      current ? moveNarrationEditor(current, direction) : current
    );
  }

  async function saveNarrationEditor() {
    if (!narrationEditor || !practiceLesson || isSavingNarrationEdit) {
      return;
    }

    let requestBody: ReturnType<typeof narrationEditorSavePayload>;

    try {
      requestBody = narrationEditorSavePayload(narrationEditor);
    } catch (error) {
      if (error instanceof NarrationEditorValidationError) {
        setNarrationEditor((current) =>
          current ? { ...current, index: error.index } : current
        );
      }

      setToast(error instanceof Error ? error.message : "讲解文稿校验失败", "error");
      return;
    }

    setIsSavingNarrationEdit(true);

    if (lessonHasNarrationAudio(practiceLesson)) {
      const billingRequestId = createBillingRequestId();
      const estimateResult = await estimateNarrationScriptUpdate(practiceLesson.id, {
        ...requestBody,
        billingRequestId
      });

      setIsSavingNarrationEdit(false);

      if (!estimateResult.data) {
        setToast(estimateResult.message, "error");
        return;
      }

      setBillingDialog({
        action: "narrationScript",
        billingRequestId,
        estimate: estimateResult.data,
        isSubmitting: false,
        lesson: practiceLesson,
        requestBody
      });
      return;
    }

    const updated = await updateNarrationScript(practiceLesson.id, requestBody);

    if (!updated.data) {
      setIsSavingNarrationEdit(false);
      setToast(updated.message, "error");
      return;
    }

    setIsSavingNarrationEdit(false);
    applySavedNarrationLesson(updated.data, "导学文稿已保存");
  }

  function applySavedNarrationLesson(data: ApiVideoGuideLesson, message: string) {
    const storedLesson = toOwnedStoredLesson(data, currentUser?.id);

    saveLesson(historyStorageKey, storedLesson);
    setWorkingLesson(storedLesson);
    setGeneratedLesson((current) => current?.id === storedLesson.id ? storedLesson : current);
    setStoredLessons(upsertStoredVideoGuideLesson(readStoredLessons(historyStorageKey), storedLesson));
    setNarrationEditor(null);
    setNarrationTtsGenerationProgress(storedLesson.content?.narrationTimeline?.length ? 100 : 0);
    setStatusText(message);
    setToast(message);
  }

  return (
    <section
      className={cn(
        "grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-visible bg-[#f6f6f5] text-foreground lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:overflow-hidden",
        sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[292px_minmax(0,1fr)]"
      )}
    >
      <ActionToast state={toastState} />
      {billingDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-md border border-border bg-background p-5 shadow-xl">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-muted-foreground">点数消耗确认</p>
              <h2 className="text-2xl font-semibold tracking-normal">{billingDialog.estimate.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {learningBillingConsumptionLabel(billingDialog.estimate.operation)} {billingDialog.estimate.estimatedCredits.toLocaleString("zh-CN")} 点，当前可用{" "}
                {billingDialog.estimate.availableCredits.toLocaleString("zh-CN")} 点。只有点击同意后才会继续
                {billingDialog.action === "narrationScript" ? "保存并重新生成本句语音" : "生成并冻结点数"}。
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {billingDialog.estimate.items.map((item) => (
                <div className="rounded-md border border-border bg-secondary/40 p-3" key={item.code}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{item.name}</p>
                    <Badge variant="outline">{item.estimatedCredits.toLocaleString("zh-CN")} 点</Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
            {!billingDialog.estimate.enoughCredits ? (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                当前点数不足，请先充值后再生成。
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <Button disabled={billingDialog.isSubmitting} onClick={rejectBillingDialog} variant="outline">
                不同意
              </Button>
              <Button
                disabled={billingDialog.isSubmitting || !billingDialog.estimate.enoughCredits}
                onClick={confirmBillingDialog}
              >
                {billingDialog.isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {billingDialog.action === "narrationScript" ? "同意并保存" : "同意并生成"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {subtitleEditor ? (
        <div
          aria-labelledby="subtitle-editor-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4 sm:px-4 sm:py-6"
          role="dialog"
        >
          <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-md border border-border bg-background p-4 shadow-xl sm:p-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal" id="subtitle-editor-title">
                字幕文字编辑
              </h2>
            </div>
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {subtitleComparison?.mode === "input" ? (
                <div className="flex min-h-[360px] flex-col rounded-md border border-border p-4">
                  <label className="text-sm font-semibold" htmlFor="subtitle-reference-source">
                    原文文本或字幕文本
                  </label>
                  <textarea
                    className="mt-3 min-h-72 flex-1 resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    id="subtitle-reference-source"
                    onChange={(event) => updateSubtitleComparisonSource(event.target.value)}
                    placeholder="粘贴普通原文，或带时间轴的 SRT、ASS 字幕文本"
                    value={subtitleComparison.sourceText}
                  />
                </div>
              ) : subtitleComparison?.mode === "review" ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">发现 {subtitleComparison.differences.length} 处文字差异</p>
                    <p className="text-sm text-muted-foreground">
                      待确认 {subtitleComparison.differences.filter((item) => item.resolution === "pending").length} 处
                    </p>
                  </div>
                  {subtitleComparison.differences.map((difference, index) => (
                    <div className="rounded-md border border-border p-3" key={difference.key}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-muted-foreground">第 {index + 1} 处差异</p>
                        {difference.confidence < 0.45 ? (
                          <p className="text-xs text-muted-foreground">请核对对应关系</p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-md bg-secondary/45 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">识别字幕</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{difference.recognizedText}</p>
                        </div>
                        <div className="rounded-md border border-border p-3">
                          <p className="text-xs font-semibold text-muted-foreground">对应原文</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{difference.referenceText}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          onClick={() => resolveSubtitleComparison(difference, "recognized")}
                          size="sm"
                          variant={difference.resolution === "recognized" ? "default" : "outline"}
                        >
                          保留识别
                        </Button>
                        <Button
                          onClick={() => resolveSubtitleComparison(difference, "reference")}
                          size="sm"
                          variant={difference.resolution === "reference" ? "default" : "outline"}
                        >
                          使用原文
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                subtitleEditor.rows.map((row, index) => (
                  <div className="grid gap-3 rounded-md border border-border bg-secondary/30 p-3 md:grid-cols-[160px_minmax(0,1fr)]" key={row.key}>
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">{row.label || `第 ${index + 1} 句`}</p>
                      <p className="mt-1 break-all">{row.timeRange}</p>
                    </div>
                    <textarea
                      className="min-h-20 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onChange={(event) => updateSubtitleEditorRow(row.key, event.target.value)}
                      value={row.text}
                    />
                  </div>
                ))
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {subtitleComparison ? (
                <Button onClick={() => setSubtitleComparison(null)} variant="outline">
                  <ChevronLeft />
                  返回编辑
                </Button>
              ) : (
                <Button onClick={openSubtitleComparison} variant="outline">
                  <GitCompareArrows />
                  原文比对
                </Button>
              )}
              <div className="flex gap-3">
                <Button disabled={isSavingSubtitleEdit} onClick={closeSubtitleEditor} variant="outline">
                  取消
                </Button>
                {subtitleComparison?.mode === "input" ? (
                  <Button disabled={!subtitleComparison.sourceText.trim()} onClick={runSubtitleComparison}>
                    <GitCompareArrows />
                    开始比对
                  </Button>
                ) : (
                  <Button
                    disabled={
                      isSavingSubtitleEdit ||
                      Boolean(subtitleComparison?.differences.some((item) => item.resolution === "pending"))
                    }
                    onClick={saveSubtitleEditor}
                  >
                    {isSavingSubtitleEdit ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    保存修改
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {narrationEditor && currentNarrationItem ? (
        <div
          aria-labelledby="narration-editor-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold" id="narration-editor-title">
                    编辑文稿
                  </h2>
                  <Badge variant="outline">
                    {narrationEditor.index + 1} / {narrationEditor.items.length}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentNarrationItem.type === "INTRO"
                    ? "导读开场"
                    : currentNarrationItem.type === "SUMMARY"
                      ? "导读总结"
                      : `第 ${narrationEditor.index} 句`}
                </p>
              </div>
              <Button
                aria-label="关闭编辑文稿"
                className="size-8 shrink-0 px-0"
                disabled={isSavingNarrationEdit}
                onClick={() => setNarrationEditor(null)}
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-4">
                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {currentNarrationItem.type === "SENTENCE" ? "字幕原文" : "文稿位置"}
                  </p>
                  <p className="mt-2 whitespace-pre-line break-words text-base leading-8">
                    {currentNarrationItem.sourceText}
                  </p>
                </section>

                <label className="grid gap-2 text-sm font-semibold" htmlFor="narration-editor-script">
                  <span>导学文稿</span>
                  <textarea
                    className="min-h-[280px] w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-base leading-8 outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    disabled={isSavingNarrationEdit}
                    id="narration-editor-script"
                    onChange={(event) =>
                      setNarrationEditor((current) =>
                        current ? updateNarrationEditorScript(current, event.target.value) : current
                      )
                    }
                    value={currentNarrationItem.script}
                  />
                </label>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:w-auto">
              <Button
                disabled={isSavingNarrationEdit || narrationEditor.index === 0}
                onClick={() => moveNarration("PREVIOUS")}
                type="button"
                variant="outline"
              >
                <ChevronLeft />
                上一句
              </Button>
              <Button
                disabled={
                  isSavingNarrationEdit ||
                  narrationEditor.index === narrationEditor.items.length - 1
                }
                onClick={() => moveNarration("NEXT")}
                type="button"
                variant="outline"
              >
                下一句
                <ChevronRight />
              </Button>
              </div>
              <Button
                disabled={isSavingNarrationEdit}
                onClick={saveNarrationEditor}
                type="button"
              >
                {isSavingNarrationEdit ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                保存修改
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <aside className="flex max-h-[50vh] min-h-0 flex-col border-b border-border bg-background lg:max-h-none lg:border-b-0 lg:border-r">
          <div className={cn("flex h-16 shrink-0 items-center", sidebarCollapsed ? "justify-center px-0" : "justify-between px-5")}>
            {!sidebarCollapsed ? (
              <Link className="flex min-w-0 items-center gap-2 font-display text-2xl font-light tracking-normal" href="/media-tutor">
                <Film className="size-7" />
                <span className="truncate">视频导学</span>
              </Link>
            ) : null}
            <Button
              aria-label={sidebarCollapsed ? "展开左栏" : "收起左栏"}
              className={cn("hidden px-0 lg:inline-flex", sidebarCollapsed ? "size-8" : "size-9")}
              onClick={() => {
                setOpenHistoryMenu(null);
                setSidebarCollapsed((current) => !current);
              }}
              type="button"
              variant="ghost"
            >
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </div>

          <div className="flex shrink-0 flex-col gap-2 px-4 pb-5">
            <Button
              aria-label="新建导学课件"
              className={cn(
                "h-11 justify-center gap-2 rounded-full border border-border bg-background text-sm font-medium shadow-sm hover:bg-secondary",
                sidebarCollapsed ? "px-0" : "px-4"
              )}
              onClick={() => openNewGuideLesson()}
              variant="outline"
            >
              <Sparkles className="size-4" />
              {!sidebarCollapsed ? "新建导学课件" : null}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3 pt-2 text-muted-foreground">
                <History className="size-5" />
                <span className="[writing-mode:vertical-rl] text-xs">历史</span>
              </div>
            ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <History className="size-4" />
                <span>导学课件历史</span>
              </div>
              {storedLessons.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {storedLessons.map((lesson) => {
                    const lessonKey = lessonRouteId(lesson);
                    const menuOpen = openHistoryMenu?.id === lessonKey;

                    return (
                      <div className="group relative rounded-xl text-sm text-muted-foreground transition-colors hover:bg-secondary" key={lesson.id}>
                        <button
                          className="flex w-full flex-col gap-1 rounded-xl px-3 py-3 pr-11 text-left disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!lesson.mediaUrl}
                          onClick={() => void openLessonFromHistory(lesson)}
                          type="button"
                        >
                          <span className="line-clamp-2 font-medium text-foreground">{displayLessonTitle(lesson.title)}</span>
                          <span className="flex items-center justify-between gap-2 text-xs">
                            <span>{lessonHistoryStatusText(lesson)}</span>
                            <span>{new Date(lesson.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
                          </span>
                        </button>
                        <button
                          aria-label={`打开 ${lesson.title} 的更多操作`}
                          className={`absolute right-2 top-3 flex size-8 items-center justify-center rounded-full text-foreground transition-opacity hover:bg-background ${
                            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                          onClick={(event) => openLessonHistoryMenu(event, lesson)}
                          type="button"
                        >
                          <MoreHorizontal className="size-5" />
                        </button>
                        {menuOpen ? (
                          <div
                            className="fixed z-50 rounded-2xl border border-border bg-background p-2 text-sm shadow-xl"
                            onClick={(event) => event.stopPropagation()}
                            style={{ left: openHistoryMenu.left, top: openHistoryMenu.top, width: 184 }}
                          >
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                void shareLessonFromHistory(lesson);
                              }}
                              type="button"
                            >
                              <Share2 className="size-4" />
                              分享
                            </button>
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                startLearningFromHistory(lesson);
                              }}
                              type="button"
                            >
                              <PlayCircle className="size-4" />
                              开始学习
                            </button>
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                void openLessonFromHistory(lesson);
                              }}
                              type="button"
                            >
                              <RotateCcw className="size-4" />
                              重新生成
                            </button>
                            <div className="my-2 h-px bg-border" />
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                pinLessonToTop(lesson);
                              }}
                              type="button"
                            >
                              <Pin className="size-4" />
                              置顶
                            </button>
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                void deleteLessonFromHistory(lesson);
                              }}
                              type="button"
                            >
                              <Trash2 className="size-4" />
                              删除
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-sm leading-6 text-muted-foreground">
                  暂无历史。上传媒体后会自动保存导学课件草稿。
                </div>
              )}
            </div>
            )}
          </div>
      </aside>

      <main className="min-h-0 overflow-visible p-4 sm:p-5 lg:overflow-y-auto">
        <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="px-5 py-4">
              {practiceLesson && mediaFile?.uploadStatus === "uploaded" ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {isEditingLessonTitle ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 text-sm font-semibold">课件名称：</span>
                      <Input
                        autoFocus
                        className="h-9 min-w-48 max-w-xl"
                        maxLength={120}
                        onChange={(event) => setLessonTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveLessonTitle();
                          if (event.key === "Escape") setIsEditingLessonTitle(false);
                        }}
                        value={lessonTitleDraft}
                      />
                      <Button aria-label="保存课件名称" className="size-9 px-0" disabled={isSavingLessonTitle} onClick={() => void saveLessonTitle()} size="sm">
                        {isSavingLessonTitle ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      </Button>
                      <Button aria-label="取消编辑课件名称" className="size-9 px-0" onClick={() => setIsEditingLessonTitle(false)} size="sm" variant="ghost">
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <CardTitle className="min-w-0 text-base font-semibold">
                      课件名称：<span className="break-words">{displayLessonTitle(practiceLesson.title)}</span>
                    </CardTitle>
                  )}
                  {!isEditingLessonTitle ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button aria-label="编辑课件名称" className="size-9 px-0" onClick={beginEditingLessonTitle} size="sm" title="编辑课件名称" variant="outline">
                        <Pencil />
                      </Button>
                      {generatedLesson ? (
                        <Button asChild size="sm">
                          <Link href={shareHref}>进入学习页面</Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <CardTitle className="text-base font-semibold">媒体预览</CardTitle>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-5 pb-5 pt-0">
              <input accept="video/*,audio/*" className="hidden" onChange={handleMediaUpload} ref={mediaInputRef} type="file" />
              <div className="relative overflow-hidden rounded-xl border border-border bg-foreground text-background">
                {mediaFile && previewMediaUrl ? (
                  <VideoGuidePreviewPlayer
                    cues={timedPreviewSubtitleCues}
                    mediaType={mediaFile.kind === "video" ? "VIDEO" : "AUDIO"}
                    mediaUrl={previewMediaUrl}
                  />
                ) : (
                  <div
                    className="relative flex aspect-video w-full items-center justify-center text-left"
                    onClick={() => mediaInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        mediaInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex flex-col items-center gap-3 px-6 text-center text-background/75">
                      <Upload className="size-10" />
                      <p className="text-sm">点击上传视频或音频</p>
                      <p className="text-xs text-background/55">视频 500M 以内，音频 100M 以内</p>
                    </div>
                  </div>
                )}
                {mediaTransferStage === "preparing" ||
                mediaTransferStage === "uploading" ||
                mediaTransferStage === "converting" ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-foreground/90 px-6 text-background">
                    <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
                      <Loader2 className="size-10 animate-spin" />
                      <div>
                        <p className="text-base font-semibold">
                          {mediaTransferStage === "preparing"
                            ? "正在准备上传"
                            : mediaTransferStage === "uploading"
                              ? "正在上传媒体文件"
                              : mediaConversionEtaMinutes
                                ? `上传完成，正在转换，预计还需约 ${mediaConversionEtaMinutes} 分钟`
                                : "上传完成，正在转换"}
                        </p>
                        <p className="mt-1 text-sm text-background/65">
                          {mediaTransferStage === "preparing"
                            ? "正在计算文件指纹"
                            : mediaTransferStage === "uploading"
                              ? `${mediaUploadProgress}%`
                              : `${mediaUploadProgress}%`}
                        </p>
                      </div>
                      <div
                        aria-label="媒体上传进度"
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={mediaTransferStage === "preparing" ? undefined : mediaUploadProgress}
                        className="h-3 w-full overflow-hidden rounded-full bg-background/20"
                        role="progressbar"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full bg-background transition-[width] duration-200",
                            mediaTransferStage === "preparing" && "animate-pulse"
                          )}
                          style={{
                            width:
                              mediaTransferStage === "preparing"
                                ? "36%"
                                : `${mediaUploadProgress}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

        </div>

        <aside className="flex h-fit flex-col gap-5">
            <input accept=".srt,.ass,text/plain" className="hidden" onChange={handleSubtitleUpload} ref={subtitleInputRef} type="file" />
            <WorkflowStep
              action={
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button
                    className={cn(
                      "w-full justify-center",
                      workflowActionButtonClassName
                    )}
                    disabled={
                      !mediaFile ||
                      mediaFile.uploadStatus === "uploading" ||
                      subtitleFile?.uploadStatus === "uploading" ||
                      isGeneratingSubtitle
                    }
                    onClick={handleGenerateSubtitle}
                    size="sm"
                    variant="outline"
                  >
                    {isGeneratingSubtitle ? <Loader2 className="animate-spin" /> : <Captions />}
                    {subtitleWorkflowSource === "generated" &&
                    !isGeneratingSubtitle &&
                    subtitleFile
                      ? "重新生成"
                      : "生成字幕"}
                  </Button>
                  <Button
                    className={cn(
                      "w-full justify-center",
                      workflowActionButtonClassName
                    )}
                    disabled={!mediaFile || mediaFile.uploadStatus === "uploading" || isGeneratingSubtitle}
                    onClick={() => subtitleInputRef.current?.click()}
                    size="sm"
                    variant="outline"
                  >
                    <FileText />
                    {subtitleWorkflowSource === "uploaded" &&
                    subtitleFile?.uploadStatus === "uploaded"
                      ? "重新上传"
                      : "上传字幕"}
                  </Button>
                  <Button className={cn("w-full justify-center", workflowActionButtonClassName)} disabled={!subtitleFile} onClick={openSubtitleEditor} size="sm" variant="outline">
                    <Pencil />
                    编辑字幕
                  </Button>
                  <Button className={cn("w-full justify-center", workflowActionButtonClassName)} disabled={!subtitleFile} onClick={() => void handleDownloadSubtitle()} size="sm" variant="outline">
                    <Download />
                    下载字幕
                  </Button>
                </div>
              }
              title="字幕处理"
            >
              {subtitleWorkflowSource === "uploaded" &&
              (subtitleFile?.uploadStatus === "uploading" || subtitleUploadProgress > 0) ? (
                <InlineProgress label="字幕上传" value={subtitleUploadProgress} />
              ) : null}
              {subtitleWorkflowSource === "generated" &&
              (isGeneratingSubtitle || subtitleGenerationProgress > 0) ? (
                <InlineProgress label="字幕生成" value={subtitleGenerationProgress} />
              ) : null}
            </WorkflowStep>

            <WorkflowStep
              action={
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button
                    className={cn(
                      "w-full justify-center",
                      workflowActionButtonClassName
                    )}
                    disabled={!canGenerate}
                    onClick={generateLesson}
                    size="sm"
                    variant="outline"
                  >
                    {isGeneratingNarrationScript ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {videoGuideScriptReady(practiceLesson) ? "重新生成" : "生成文稿"}
                  </Button>
                  <Button
                    className={cn("w-full justify-center", workflowActionButtonClassName)}
                    disabled={!practiceLesson || !videoGuideScriptReady(practiceLesson) || hasActiveVideoGuideGeneration(practiceLesson)}
                    onClick={openNarrationEditor}
                    size="sm"
                    variant="outline"
                  >
                    <Pencil />
                    编辑文稿
                  </Button>
                </div>
              }
              title="导学文稿"
            >
              {isGeneratingNarrationScript || progress > 0 ? (
                <InlineProgress label="文稿生成" value={progress} />
              ) : null}
            </WorkflowStep>

            <WorkflowStep title="讲解语音">
              <VoicePicker
                disabled={isVoiceLoading || voiceOptions.length === 0 || !videoGuideScriptReady(practiceLesson)}
                label="语音角色"
                onChange={setSelectedNarrationVoice}
                value={selectedNarrationVoice}
                voices={voiceOptions}
              />
              <Button
                className={cn(
                  "w-full justify-center",
                  workflowActionButtonClassName
                )}
                disabled={!canGenerateNarrationAudio}
                onClick={handleGenerateNarrationAudio}
                size="sm"
                variant="outline"
              >
                {isGeneratingNarrationAudio ? <Loader2 className="animate-spin" /> : <AudioLines />}
                {practiceLesson?.status === "SUCCEEDED" ? "重新生成讲解语音" : "生成讲解语音"}
              </Button>
              {practiceLesson?.content?.narrationTtsGenerationProgress?.status === "FAILED" ? (
                <p className="text-sm leading-6 text-destructive">
                  {practiceLesson.content.narrationTtsGenerationProgress.errorMessage ||
                    "讲解语音合成失败，可以从已完成位置重新生成"}
                </p>
              ) : isGeneratingNarrationAudio || narrationTtsGenerationProgress > 0 ? (
                <InlineProgress label="语音合成" value={narrationTtsGenerationProgress} />
              ) : null}
            </WorkflowStep>

            <WorkflowStep
              action={
                <Button
                  className={cn(
                    "w-full justify-center",
                    workflowActionButtonClassName
                  )}
                  disabled={!canGeneratePractice}
                  onClick={handleGeneratePractice}
                  size="sm"
                  variant="outline"
                >
                  {isGeneratingPractice ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  生成同步练习
                </Button>
              }
              title="同步练习"
            >
              {isGeneratingPractice || practiceGenerationProgress > 0 ? (
                <InlineProgress label="同步练习" value={practiceGenerationProgress} />
              ) : null}
            </WorkflowStep>
        </aside>
        </div>
      </main>
    </section>
  );
}

function WorkflowStep({
  action,
  children,
  title
}: {
  action?: ReactNode;
  children?: ReactNode;
  title: string;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl shadow-sm">
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5">
        {action ? <div className="flex w-full flex-wrap gap-2">{action}</div> : null}
        {children}
      </CardContent>
    </Card>
  );
}

function InlineProgress({ label, value }: { label: string; value: number }) {
  const normalizedValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{normalizedValue}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
    </div>
  );
}

function resolveMediaKind(file: File): MediaKind | null {
  const normalizedName = file.name.toLowerCase();

  if (file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|mkv)$/i.test(normalizedName)) {
    return "video";
  }

  if (file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(normalizedName)) {
    return "audio";
  }

  return null;
}

function resolveSubtitleExtension(name: string, text?: string): ".srt" | ".ass" | null {
  const normalizedName = name.toLowerCase();

  if (normalizedName.endsWith(".srt")) {
    return ".srt";
  }

  if (normalizedName.endsWith(".ass")) {
    return ".ass";
  }

  return resolveSubtitleExtensionFromText(text);
}

function resolveSubtitleFormatFromName(name: string): "SRT" | "ASS" | null {
  const extension = resolveSubtitleExtension(name);

  return extension ? (extension.slice(1).toUpperCase() as "SRT" | "ASS") : null;
}

function resolveSubtitleExtensionFromText(text: string | undefined): ".srt" | ".ass" | null {
  const sample = text?.slice(0, 20_000).trim();

  if (!sample) {
    return null;
  }

  if (sample.includes("[Script Info]") || /^\s*Dialogue:/m.test(sample)) {
    return ".ass";
  }

  if (/(?:^|\n)\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(sample)) {
    return ".srt";
  }

  return null;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)}M`;
  }

  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("zh-CN")}K`;
}

function extractSubtitleCues(subtitleFile: SubtitleFileState, maxCues = 80) {
  const cues = subtitleFile.extension === ".ass" ? extractAssCues(subtitleFile.text) : extractSrtCues(subtitleFile.text);

  if (cues.length > 0) {
    return cues.slice(0, maxCues);
  }

  return subtitleFile.text
    .split(/\r?\n/)
    .map(cleanSubtitleText)
    .filter(Boolean)
    .slice(0, Math.min(maxCues, 30))
    .map((text, index) => ({
      text,
      timeRange: `片段 ${index + 1}`
    }));
}

function extractSrtCues(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block): SubtitleCue | null => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes("-->"));

      if (timeIndex < 0) {
        return null;
      }

      const text = cleanSubtitleText(lines.slice(timeIndex + 1).join(" "));

      if (!text) {
        return null;
      }

      return {
        text,
        timeRange: normalizeTimeRange(lines[timeIndex]),
        ...readTimeRangeSeconds(lines[timeIndex])
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function extractAssCues(value: string) {
  return value
    .split(/\r?\n/)
    .map((line): SubtitleCue | null => {
      if (!line.startsWith("Dialogue:")) {
        return null;
      }

      const parts = line.slice("Dialogue:".length).split(",");

      if (parts.length < 10) {
        return null;
      }

      const text = cleanSubtitleText(parts.slice(9).join(","));

      if (!text) {
        return null;
      }

      const startSeconds = parseSubtitleTimeToSeconds(parts[1]);
      const endSeconds = parseSubtitleTimeToSeconds(parts[2]);

      return {
        text,
        timeRange: `${normalizeTime(parts[1])} - ${normalizeTime(parts[2])}`,
        ...(startSeconds === null ? {} : { startSeconds }),
        ...(endSeconds === null ? {} : { endSeconds })
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function cleanSubtitleText(value: string) {
  return value
    .replace(/\{[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\[Nn]/g, " ")
    .replace(/(?:^|\s)-\s*/g, " ")
    .replace(/(?:^|\s)#\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTimeRange(value: string) {
  const [start, end] = value.split("-->");

  return `${normalizeTime(start)} - ${normalizeTime(end)}`;
}

function readTimeRangeSeconds(value: string) {
  const [start, end] = value.split("-->");
  const startSeconds = parseSubtitleTimeToSeconds(start);
  const endSeconds = parseSubtitleTimeToSeconds(end);

  return {
    ...(startSeconds === null ? {} : { startSeconds }),
    ...(endSeconds === null ? {} : { endSeconds })
  };
}

function normalizeTime(value: string | undefined) {
  const match = value?.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);

  if (!match) {
    return "00:00";
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function parseSubtitleTimeToSeconds(value: string | undefined) {
  const match = value?.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?/);

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

function isTimedSubtitleCue(cue: SubtitleCue): cue is SubtitleCue & { endSeconds: number; startSeconds: number } {
  return Number.isFinite(cue.startSeconds) && Number.isFinite(cue.endSeconds) && (cue.endSeconds ?? 0) > (cue.startSeconds ?? 0);
}

function isSameMediaFile(current: MediaFileState | null, selected: MediaFileState) {
  return Boolean(current && current.name === selected.name && current.size === selected.size && current.objectUrl === selected.objectUrl);
}

function isSameSubtitleFile(current: SubtitleFileState | null, selected: SubtitleFileState) {
  return Boolean(current && current.name === selected.name && current.size === selected.size && current.text === selected.text);
}

function createSubtitleEditorState(subtitleFile: SubtitleFileState): SubtitleEditorState | null {
  return subtitleFile.extension === ".ass"
    ? createAssSubtitleEditorState(subtitleFile.text)
    : createSrtSubtitleEditorState(subtitleFile.text);
}

function createSrtSubtitleEditorState(text: string): SubtitleEditorState | null {
  const rows = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block, index): EditableSubtitleRow | null => {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) => line.includes("-->"));

      if (timeIndex < 0) {
        return null;
      }

      const prefixLines = lines.slice(0, timeIndex + 1);
      const timeRange = normalizeTimeRange(lines[timeIndex]);

      return {
        key: `srt-${index}`,
        label: lines[0]?.trim() && !lines[0]?.includes("-->") ? `第 ${lines[0].trim()} 句` : `第 ${index + 1} 句`,
        prefixLines,
        text: lines.slice(timeIndex + 1).join("\n").trim(),
        timeRange
      };
    })
    .filter((row): row is EditableSubtitleRow => Boolean(row));

  return rows.length > 0
    ? {
        extension: ".srt",
        rows
      }
    : null;
}

function createAssSubtitleEditorState(text: string): SubtitleEditorState | null {
  const sourceLines = text.split(/\r?\n/);
  const rows = sourceLines
    .map((line, index): EditableSubtitleRow | null => {
      if (!line.startsWith("Dialogue:")) {
        return null;
      }

      const parts = splitAssDialogue(line);

      if (!parts) {
        return null;
      }

      return {
        dialoguePrefix: parts.prefix,
        key: `ass-${index}`,
        label: `第 ${rowsLabelIndex(index)} 句`,
        lineIndex: index,
        text: parts.text,
        timeRange: `${normalizeTime(parts.start)} - ${normalizeTime(parts.end)}`
      };
    })
    .filter((row): row is EditableSubtitleRow => Boolean(row))
    .map((row, index) => ({
      ...row,
      label: `第 ${index + 1} 句`
    }));

  return rows.length > 0
    ? {
        extension: ".ass",
        rows,
        sourceLines
      }
    : null;
}

function splitAssDialogue(line: string) {
  let commaCount = 0;
  let prefixEnd = -1;

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== ",") {
      continue;
    }

    commaCount += 1;

    if (commaCount === 9) {
      prefixEnd = index + 1;
      break;
    }
  }

  if (prefixEnd < 0) {
    return null;
  }

  const prefix = line.slice(0, prefixEnd);
  const prefixParts = prefix.slice("Dialogue:".length).split(",");

  return {
    end: prefixParts[2],
    prefix,
    start: prefixParts[1],
    text: line.slice(prefixEnd)
  };
}

function rebuildSubtitleText(editor: SubtitleEditorState) {
  if (editor.extension === ".srt") {
    return `${editor.rows
      .map((row) => [...(row.prefixLines ?? []), row.text.trim()].join("\n"))
      .join("\n\n")}\n`;
  }

  const lines = [...editor.sourceLines];

  editor.rows.forEach((row) => {
    if (row.lineIndex === undefined || !row.dialoguePrefix) {
      return;
    }

    lines[row.lineIndex] = `${row.dialoguePrefix}${row.text.trim()}`;
  });

  return lines.join("\n");
}

function rowsLabelIndex(index: number) {
  return index + 1;
}

async function checkVideoGuideUploadedFile<TData extends UploadedVideoGuideMedia | UploadedVideoGuideSubtitle>(
  assetType: "MEDIA" | "SUBTITLE",
  file: File
) {
  try {
    const hash = await sha256File(file);
    const response = await fetch("/api/video-guide/uploads/check", {
      credentials: "same-origin",
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assetType,
        hash,
        mimeType: file.type,
        originalName: file.name,
        sizeBytes: file.size
      })
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideUploadCheckResponse> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "文件查重失败，将继续上传",
        shouldAbort: response.status === 401 || response.status === 403
      };
    }

    const data = assetType === "MEDIA" ? payload.data.media : payload.data.subtitle;

    return {
      data: payload.data.exists && data ? (data as TData) : null,
      message: payload.message,
      shouldAbort: false
    };
  } catch {
    return {
      data: null,
      message: "文件查重失败，将继续上传",
      shouldAbort: false
    };
  }
}

async function uploadVideoGuideFile<TData>(
  path: string,
  file: File,
  onProgress?: (progress: number) => void,
  onUploadComplete?: () => void,
  options?: { progressId?: string }
) {
  const formData = new FormData();
  formData.set("file", file);
  if (options?.progressId) {
    formData.set("progressId", options.progressId);
  }

  return new Promise<{ data: TData | null; message: string }>((resolve) => {
    const request = new XMLHttpRequest();

    request.open("POST", path);
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.upload.onload = () => {
      onUploadComplete?.();
    };
    request.onerror = () => {
      resolve({
        data: null,
        message: "上传失败"
      });
    };
    request.onload = () => {
      const payload = parseApiResponse<TData>(request.responseText);

      if (request.status < 200 || request.status >= 300 || payload?.code !== 0 || !payload.data) {
        resolve({
          data: null,
          message: payload?.message ?? "上传失败"
        });
        return;
      }

      onProgress?.(100);
      resolve({
        data: payload.data,
        message: payload.message
      });
    };
    request.send(formData);
  });
}

function createVideoGuideMediaUploadProgressId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function pollVideoGuideMediaUploadProgress(
  progressId: string,
  shouldStop: () => boolean,
  onProgress: (progress: VideoGuideMediaUploadProgress) => void
) {
  while (!shouldStop()) {
    try {
      const response = await fetch(
        `/api/video-guide/uploads/media-progress/${encodeURIComponent(progressId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideMediaUploadProgress> | null;

      if (response.status === 401 || response.status === 403) {
        return;
      }

      if (response.ok && payload?.code === 0 && payload.data) {
        onProgress(payload.data);

        if (payload.data.status !== "RUNNING") {
          return;
        }
      }
    } catch {
      // The upload request remains authoritative; a transient poll failure retries quietly.
    }

    await waitForMediaUploadProgressPoll();
  }
}

function waitForMediaUploadProgressPoll() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 800);
  });
}

function parseApiResponse<TData>(value: string) {
  try {
    return JSON.parse(value) as ApiResponse<TData>;
  } catch {
    return null;
  }
}

async function sha256File(file: File) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前浏览器不支持文件指纹计算");
  }

  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchSubtitleText(url: string) {
  try {
    const proxyResponse = await fetch("/api/video-guide/subtitles/text", {
      body: JSON.stringify({ url }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const proxyPayload = (await proxyResponse.json().catch(() => null)) as ApiResponse<{ text: string }> | null;

    if (proxyResponse.ok && proxyPayload?.code === 0 && proxyPayload.data?.text) {
      return proxyPayload.data.text.trim();
    }

    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      return "";
    }

    return (await response.text()).trim();
  } catch {
    return "";
  }
}

async function fetchVideoGuideVoiceOptions() {
  try {
    const response = await fetch("/api/audio/voices", {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideVoiceLibrary> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return [];
    }

    return buildVideoGuideVoiceOptions(payload.data).filter(
      (voice) => voice.value.startsWith("voice:") || supportsVoicePickerLanguages(voice, ["中文", "英文"])
    );
  } catch {
    return [];
  }
}

async function estimateSubtitleBilling(mediaFile: MediaFileState) {
  if (!mediaFile.upload) {
    return {
      data: null,
      message: "请先登录并成功保存媒体文件后再生成字幕文件"
    };
  }

  try {
    const response = await fetch("/api/video-guide/subtitles/estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(subtitleRequestBody(mediaFile))
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideBillingEstimate> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "点数预估失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "点数预估失败，请稍后重试"
    };
  }
}

async function generateSubtitleFromMedia(
  mediaFile: MediaFileState,
  billingConfirmed: boolean,
  workingLesson?: StoredVideoGuideLesson | null
) {
  if (!mediaFile.upload) {
    return {
      data: null,
      message: "请先登录并成功保存媒体文件后再生成字幕文件"
    };
  }

  try {
    const reusableLessonId = reusableVideoGuideLessonId(workingLesson);
    const response = await fetch("/api/video-guide/subtitles/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...subtitleRequestBody(mediaFile),
        ...(reusableLessonId ? { lessonId: reusableLessonId } : {}),
        billingConfirmed
      })
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "字幕生成失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "字幕生成失败，请稍后重试"
    };
  }
}

async function createDraftLessonFromMedia(mediaFile: MediaFileState) {
  try {
    const response = await fetch("/api/video-guide/lessons/draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(draftLessonRequestBody(mediaFile))
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "课件草稿创建失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "课件草稿创建失败，请稍后重试"
    };
  }
}

async function updateDraftLessonSubtitle(lessonId: string, subtitleFile: SubtitleFileState) {
  try {
    const response = await fetch(`/api/video-guide/lessons/${encodeURIComponent(lessonId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(subtitleDraftRequestBody(subtitleFile))
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "字幕保存到课件草稿失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "字幕保存到课件草稿失败，请稍后重试"
    };
  }
}

async function updateVideoGuideLessonTitle(lessonId: string, title: string) {
  try {
    const response = await fetch(`/api/video-guide/lessons/${encodeURIComponent(lessonId)}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return { data: null, message: payload?.message ?? "课件名称保存失败" };
    }

    return { data: payload.data, message: payload.message };
  } catch {
    return { data: null, message: "课件名称保存失败，请稍后重试" };
  }
}

async function estimateLessonBilling(mediaFile: MediaFileState, subtitleFile: SubtitleFileState) {
  try {
    const response = await fetch("/api/video-guide/lessons/estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(lessonRequestBody(mediaFile, subtitleFile, false))
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideBillingEstimate> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "点数预估失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "点数预估失败，请稍后重试"
    };
  }
}

async function estimateNarrationAudioBilling(lessonId: string, narrationVoice: string) {
  try {
    const response = await fetch(
      `/api/video-guide/lessons/${encodeURIComponent(lessonId)}/narration-audio/estimate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          narrationTtsModelAlias: "tts-default",
          narrationVoice
        })
      }
    );
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideBillingEstimate> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "讲解语音点数预估失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "讲解语音点数预估失败，请稍后重试"
    };
  }
}

async function estimatePracticeBilling(lessonId: string) {
  try {
    const response = await fetch(`/api/video-guide/lessons/${encodeURIComponent(lessonId)}/practice/estimate`, {
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideBillingEstimate> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "随堂练习点数预估失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "随堂练习点数预估失败，请稍后重试"
    };
  }
}

async function createGeneratedLesson(
  mediaFile: MediaFileState,
  subtitleFile: SubtitleFileState,
  workingLesson: StoredVideoGuideLesson | null
) {
  try {
    const response = await fetch("/api/video-guide/lessons", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(lessonRequestBody(mediaFile, subtitleFile, true, workingLesson))
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        apiLesson: null,
        message: payload?.message ?? "导学文稿生成失败，请稍后重试",
        persisted: false
      };
    }

    return {
      apiLesson: payload.data,
      message: payload.message,
      persisted: true
    };
  } catch {
    return {
      apiLesson: null,
      message: "导学文稿生成失败，请稍后重试",
      persisted: false
    };
  }
}

async function createNarrationAudio(
  lessonId: string,
  narrationVoice: string,
  billingConfirmed: boolean,
  billingRevision: string
) {
  try {
    const response = await fetch(
      `/api/video-guide/lessons/${encodeURIComponent(lessonId)}/narration-audio`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          billingConfirmed,
          billingRevision,
          narrationTtsModelAlias: "tts-default",
          narrationVoice
        })
      }
    );
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "讲解语音合成失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "讲解语音合成失败，请稍后重试"
    };
  }
}

async function updateNarrationScript(
  lessonId: string,
  body: ReturnType<typeof narrationEditorSavePayload> & {
    billingConfirmed?: boolean;
    billingRequestId?: string;
    billingRevision?: string;
  }
) {
  try {
    const response = await fetch(
      `/api/video-guide/lessons/${encodeURIComponent(lessonId)}/narration-script`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "导学文稿保存失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "导学文稿保存失败，请稍后重试"
    };
  }
}

async function estimateNarrationScriptUpdate(
  lessonId: string,
  body: ReturnType<typeof narrationEditorSavePayload> & { billingRequestId: string }
) {
  try {
    const response = await fetch(
      `/api/video-guide/lessons/${encodeURIComponent(lessonId)}/narration-script/estimate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGuideBillingEstimate> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "本句讲解语音点数估算失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "本句讲解语音点数估算失败，请稍后重试"
    };
  }
}

function lessonHasNarrationAudio(lesson: StoredVideoGuideLesson) {
  return Boolean(
    lesson.content?.narrationTimeline?.some((node) => node.audioUrl?.trim())
  );
}

function createBillingRequestId() {
  return `script-${createToolCreatorId()}`;
}

async function createPracticeQuestions(lessonId: string, billingConfirmed: boolean) {
  try {
    const response = await fetch(`/api/video-guide/lessons/${encodeURIComponent(lessonId)}/practice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        billingConfirmed
      })
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return {
        data: null,
        message: payload?.message ?? "随堂练习生成失败，请稍后重试"
      };
    }

    return {
      data: payload.data,
      message: payload.message
    };
  } catch {
    return {
      data: null,
      message: "随堂练习生成失败，请稍后重试"
    };
  }
}

async function deleteVideoGuideLesson(lessonId: string) {
  try {
    const response = await fetch(`/api/video-guide/lessons/${encodeURIComponent(lessonId)}`, {
      method: "DELETE"
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<{ deleted: boolean; id: string }> | null;

    if (response.status === 404 || payload?.code === 40401) {
      return {
        ok: true,
        message: "导学课件已不存在，已移除本地记录"
      };
    }

    if (!response.ok || payload?.code !== 0 || !payload.data?.deleted) {
      return {
        ok: false,
        message: payload?.message ?? "导学课件删除失败，请稍后重试"
      };
    }

    return {
      ok: true,
      message: payload.message
    };
  } catch {
    return {
      ok: false,
      message: "导学课件删除失败，请稍后重试"
    };
  }
}

function subtitleRequestBody(mediaFile: MediaFileState) {
  return {
    mediaName: mediaFile.name,
    mediaType: mediaFile.kind.toUpperCase(),
    mediaMimeType: mediaFile.upload?.mimeType ?? mediaFile.type,
    mediaSizeBytes: mediaFile.size,
    mediaUrl: mediaFile.upload?.url,
    mediaStorageKey: mediaFile.upload?.filename
  };
}

function draftLessonRequestBody(mediaFile: MediaFileState) {
  return {
    mediaName: mediaFile.name,
    mediaType: mediaFile.kind.toUpperCase(),
    mediaMimeType: mediaFile.upload?.mimeType ?? mediaFile.type,
    mediaSizeBytes: mediaFile.size,
    mediaUrl: mediaFile.upload?.url,
    mediaStorageKey: mediaFile.upload?.filename
  };
}

function subtitleDraftRequestBody(subtitleFile: SubtitleFileState) {
  return {
    subtitleName: subtitleFile.name,
    subtitleFormat: subtitleFile.extension.slice(1).toUpperCase(),
    subtitleSizeBytes: subtitleFile.size,
    subtitleUrl: subtitleFile.upload?.url,
    subtitleStorageKey: subtitleFile.upload?.filename,
    subtitleText: subtitleFile.text.slice(0, maxBackendSubtitleTextLength)
  };
}

function lessonRequestBody(
  mediaFile: MediaFileState,
  subtitleFile: SubtitleFileState,
  billingConfirmed: boolean,
  workingLesson?: StoredVideoGuideLesson | null
) {
  const reusableLessonId = reusableVideoGuideLessonId(workingLesson);

  return {
    ...(reusableLessonId ? { lessonId: reusableLessonId } : {}),
    title: `${stripExtension(mediaFile.name)} 导学课件`,
    mediaName: mediaFile.name,
    mediaType: mediaFile.kind.toUpperCase(),
    mediaMimeType: mediaFile.upload?.mimeType ?? mediaFile.type,
    mediaSizeBytes: mediaFile.size,
    mediaUrl: mediaFile.upload?.url,
    mediaStorageKey: mediaFile.upload?.filename,
    subtitleName: subtitleFile.name,
    subtitleFormat: subtitleFile.extension.slice(1).toUpperCase(),
    subtitleSizeBytes: subtitleFile.size,
    subtitleUrl: subtitleFile.upload?.url,
    subtitleStorageKey: subtitleFile.upload?.filename,
    subtitleText: subtitleFile.text.slice(0, maxBackendSubtitleTextLength),
    billingConfirmed
  };
}

async function fetchGeneratedLesson(
  lessonId: string,
  expectedUserId: string | null | undefined
) {
  try {
    const response = await fetch(`/api/video-guide/lessons/${encodeURIComponent(lessonId)}`, {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return null;
    }

    return videoGuideLessonForUser(payload.data, expectedUserId);
  } catch {
    return null;
  }
}

async function loadStoredLessonsFromApi(expectedUserId: string | null | undefined) {
  try {
    const response = await fetch("/api/video-guide/lessons", {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ApiVideoGuideLesson[]> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      return [];
    }

    return videoGuideLessonsForUser(payload.data, expectedUserId).map(toStoredLesson);
  } catch {
    return [];
  }
}

function toStoredLesson(lesson: ApiVideoGuideLesson): StoredVideoGuideLesson {
  const content = parseVideoGuideLessonContent(lesson.content);

  return {
    id: lesson.id,
    shareToken: lesson.shareToken,
    title: lesson.title,
    mediaName: lesson.mediaName,
    mediaType: lesson.mediaType,
    mediaMimeType: lesson.mediaMimeType,
    mediaSizeBytes: lesson.mediaSizeBytes ?? null,
    mediaStorageKey: lesson.mediaStorageKey ?? null,
    mediaUrl: lesson.mediaUrl,
    subtitleName: lesson.subtitleName ?? null,
    subtitleFormat: lesson.subtitleFormat ?? null,
    subtitleSizeBytes: lesson.subtitleSizeBytes ?? null,
    subtitleStorageKey: lesson.subtitleStorageKey ?? null,
    subtitleUrl: lesson.subtitleUrl,
    status: lesson.status,
    statusName: lesson.statusName,
    errorMessage: lesson.errorMessage ?? null,
    createdAt: lesson.createdAt,
    finishedAt: lesson.finishedAt ?? null,
    ...(content ? { content } : {})
  };
}

function toOwnedStoredLesson(
  lesson: ApiVideoGuideLesson,
  expectedUserId: string | null | undefined
) {
  if (!videoGuideLessonBelongsToUser(lesson.userId, expectedUserId)) {
    window.location.reload();
    throw new Error("登录状态已变化，正在重新加载当前账号数据");
  }

  return toStoredLesson(lesson);
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}

function displayLessonTitle(value: string) {
  return value.replace(/\s*导学课件\s*$/, "").trim() || "未命名课件";
}

function saveLesson(storageKey: string, lesson: StoredVideoGuideLesson) {
  try {
    if (!canAccessVideoGuideStorage(storageKey)) {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    const existing = raw ? (JSON.parse(raw) as unknown) : [];
    const lessons = Array.isArray(existing) ? existing.filter(isStoredLesson) : [];

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(upsertStoredVideoGuideLesson(lessons, lesson))
    );
  } catch {
    window.localStorage.setItem(storageKey, JSON.stringify([lesson]));
  }
}

function writeStoredLessons(storageKey: string, lessons: StoredVideoGuideLesson[]) {
  try {
    if (!canAccessVideoGuideStorage(storageKey)) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(lessons.slice(0, 20)));
  } catch {
    // 本地历史写入失败不影响当前生成流程。
  }
}

function readStoredLessons(storageKey: string) {
  try {
    if (!canAccessVideoGuideStorage(storageKey)) {
      return [];
    }

    const raw = window.localStorage.getItem(storageKey);
    const existing = raw ? (JSON.parse(raw) as unknown) : [];

    return Array.isArray(existing) ? existing.filter(isStoredLesson).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function canAccessVideoGuideStorage(storageKey: string) {
  return videoGuideStorageMatchesAuthOwner(
    storageKey,
    window.localStorage.getItem(publicAuthSessionStorageKey)
  );
}

function storedLessonHistorySignature(lessons: StoredVideoGuideLesson[]) {
  return JSON.stringify(lessons);
}

function lessonRouteId(lesson: StoredVideoGuideLesson) {
  return lesson.shareToken || lesson.id;
}

function isActiveOperation(status: VideoGuideOperationProgress["status"]) {
  return status === "QUEUED" || status === "RUNNING";
}

function lessonHistoryStatusText(lesson: StoredVideoGuideLesson) {
  const operations: Array<[VideoGuideOperationProgress | null | undefined, string]> = [
    [lesson.content?.subtitleGenerationProgress, "字幕生成"],
    [lesson.content?.narrationGenerationProgress, "文稿生成"],
    [lesson.content?.narrationTtsGenerationProgress, "语音合成"],
    [lesson.content?.practiceGenerationProgress, "练习生成"]
  ];
  const active = operations.find(([operation]) => operation && isActiveOperation(operation.status));

  if (active?.[0]) {
    return `${active[1]}中 ${active[0].percent}%`;
  }

  const failed = operations.find(([operation]) => operation?.status === "FAILED");

  if (failed) {
    return `${failed[1]}失败`;
  }

  if (videoGuideScriptReady(lesson) && lesson.status !== "SUCCEEDED") {
    return "文案已完成";
  }

  return lesson.statusName ?? "已完成";
}

function operationNotificationKey(
  lesson: StoredVideoGuideLesson,
  operation: VideoGuideOperationProgress["operation"],
  progress: VideoGuideOperationProgress
) {
  return `${lesson.id}:${operation}:${progress.status}:${progress.updatedAt}`;
}

function notifyOperationFailureOnce(
  lesson: StoredVideoGuideLesson,
  operation: VideoGuideOperationProgress["operation"],
  progress: VideoGuideOperationProgress,
  notifiedStates: Set<string>,
  notify: (message: string, status: "success" | "error") => void
) {
  const key = operationNotificationKey(lesson, operation, progress);

  if (notifiedStates.has(key)) {
    return;
  }

  notifiedStates.add(key);
  notify(progress.errorMessage || progress.message, "error");
}

function canGeneratePracticeForLesson(lesson: StoredVideoGuideLesson | null | undefined) {
  if (!lesson || hasActiveVideoGuideGeneration(lesson)) {
    return false;
  }

  return videoGuideScriptReady(lesson);
}

function canReuseLessonRecord(lesson: StoredVideoGuideLesson) {
  return reusableVideoGuideLessonId(lesson) !== null;
}

function isStoredLesson(value: unknown): value is StoredVideoGuideLesson {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "mediaName" in value &&
    "createdAt" in value
  );
}
