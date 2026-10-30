"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent as ReactFormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AlignJustify,
  BookOpenText,
  Camera,
  CaseUpper,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Eraser,
  FileImage,
  FileText,
  History,
  Headphones,
  ImageUp,
  List,
  ListChecks,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  PencilLine,
  Pin,
  Play,
  RotateCcw,
  Save,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
  XCircle,
  type LucideIcon
} from "lucide-react";

import { VoicePicker } from "@/components/audio/voice-picker";
import { EnglishGuidedStudyDownloadButtons } from "./english-guided-study-download-buttons";
import { ActionToast, type ActionToastState } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import { learningBillingConsumptionLabel } from "@/lib/learning-billing-copy";
import {
  deleteEnglishGuidedStudyMaterial,
  estimateEnglishGuidedStudyAudio,
  estimateEnglishGuidedStudyMaterial,
  estimateEnglishGuidedStudyReadAlong,
  estimateEnglishGuidedStudyReadAlongUpload,
  estimateEnglishGuidedStudyScriptUpdate,
  extractEnglishGuidedStudyImageText,
  extractEnglishGuidedStudyReferenceDocuments,
  generateEnglishGuidedStudyAudio,
  generateEnglishGuidedStudyMaterial,
  generateEnglishGuidedStudyPractice,
  generateEnglishGuidedStudyReadAlong,
  getUserEnglishGuidedStudyMaterial,
  getUserEnglishGuidedStudyMaterialHistory,
  getUserEnglishGuidedStudyMaterials,
  pinEnglishGuidedStudyMaterial,
  type EnglishGuidedStudyBillingEstimate,
  type GenerateEnglishGuidedStudyAudioInput,
  type GenerateEnglishGuidedStudyMaterialInput,
  type UpdateEnglishGuidedStudyScriptInput,
  uploadEnglishGuidedStudyReadAlong,
  updateEnglishGuidedStudySource,
  updateEnglishGuidedStudyScript
} from "@/lib/english-guided-study-api";
import {
  englishGuidedStudyDraftFromMaterial,
  englishGuidedStudyNarrationVoiceSelection,
  englishGuidedStudyReadAlongUploadMaxBytes,
  englishGuidedStudyReadAlongVoiceSelection,
  englishLevelGroups,
  gushiwenGradeGroups,
  gushiwenStudyPath,
  guidedStudySceneOf,
  isLocalEnglishGuidedStudyMaterialId,
  text2lessonStudyPath,
  type EnglishAudioTimelineSegment,
  type EnglishGuidedStudyAuthorIntroductionMode,
  type EnglishGuidedStudyMaterial,
  type EnglishGuidedStudyOperationProgress,
  type EnglishGuidedStudyReferenceMaterial,
  type EnglishLevelOption,
  type EnglishStudyPoint,
  type EnglishStudyExplanationMode,
  type EnglishStudySentence
} from "@/lib/english-guided-study-data";
import type { GuidedStudyScene } from "@/lib/english-guided-study-data";
import {
  accountHistoryForUser,
  accountHistoryLoaded,
  loadAccountHistoryRequest,
  accountHistoryPin,
  accountHistoryRemove,
  accountHistoryUpsert
} from "@/lib/english-guided-study-history";
import {
  narrationPreviewSourceSignature,
  resumeNarrationPreviewAfterLoad,
  sequentialPlaybackFinished,
  type NarrationPreviewContinuationState
} from "@/lib/english-guided-study-learning";
import {
  cycleEnglishTitleCase,
  type EnglishTitleCaseMode
} from "@/lib/english-title-case";
import { cn } from "@/lib/utils";
import {
  createToolCreatorId,
  gushiwenCreatorPath,
  text2lessonCreatorPath
} from "@/lib/tool-creator-routes";
import type { VoicePickerOption } from "@/lib/voice-picker";

type InputMode = "TEXT" | "IMAGE";
type GenerationStatus = "idle" | "recognizing" | "generating" | "completed";
type StudyView = "study" | "guided" | "practice";
type ActiveEnglishGuidedStudyOperationProgress = EnglishGuidedStudyOperationProgress & {
  status: "QUEUED" | "RUNNING";
};
type ImageCropPoint = {
  x: number;
  y: number;
};
type ImageCropSelection = {
  topLeft: ImageCropPoint;
  topRight: ImageCropPoint;
  bottomRight: ImageCropPoint;
  bottomLeft: ImageCropPoint;
};
type ImageCropQuad = [ImageCropPoint, ImageCropPoint, ImageCropPoint, ImageCropPoint];
type ImageCropCorner = keyof ImageCropSelection;
type ImageRecognitionDraft = {
  title: string;
  author: string;
  bodyText: string;
};
type ScriptEditorItem = {
  key: string;
  label: string;
  originalLabel: string;
  originalText: string;
  script: string;
  sentenceId?: string;
  targetType: "INTRO" | "SENTENCE" | "SUMMARY";
};
type HistoryBrowserState = {
  errorMessage: string | null;
  items: EnglishGuidedStudyMaterial[];
  page: number;
  pageSize: number;
  status: "idle" | "loading" | "ready" | "error";
  total: number;
  totalPages: number;
};
type GuidedStudyVoiceOption = VoicePickerOption;

function readUploadedAudioDurationMs(file: File) {
  return new Promise<number>((resolve, reject) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const durationMs = Math.ceil(audio.duration * 1_000);
      cleanup();

      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        reject(new Error("无法读取音频时长，请重新选择音频文件"));
        return;
      }

      resolve(durationMs);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("无法读取音频时长，请重新选择音频文件"));
    };
    audio.src = objectUrl;
  });
}

type BillingDialogState =
  | {
      action: "material";
      estimate: EnglishGuidedStudyBillingEstimate;
      input: GenerateEnglishGuidedStudyMaterialInput;
      isSubmitting: boolean;
    }
  | {
      action: "audio";
      estimate: EnglishGuidedStudyBillingEstimate;
      input: GenerateEnglishGuidedStudyAudioInput;
      isSubmitting: boolean;
      materialId: string;
    }
  | {
      action: "readAlong";
      estimate: EnglishGuidedStudyBillingEstimate;
      input: GenerateEnglishGuidedStudyAudioInput;
      isSubmitting: boolean;
      materialId: string;
    }
  | {
      action: "readAlongUpload";
      estimate: EnglishGuidedStudyBillingEstimate;
      file: File;
      isSubmitting: boolean;
      materialId: string;
    }
  | {
      action: "script";
      estimate: EnglishGuidedStudyBillingEstimate;
      input: UpdateEnglishGuidedStudyScriptInput;
      isSubmitting: boolean;
      materialId: string;
    }
  | null;

const explanationModeOptions: ReadonlyArray<{
  icon: LucideIcon;
  label: string;
  value: EnglishStudyExplanationMode;
}> = [
  { icon: List, label: "逐句讲解", value: "SENTENCE" },
  { icon: AlignJustify, label: "逐段讲解", value: "PARAGRAPH" },
  { icon: Sparkles, label: "自由发挥", value: "FREEFORM" }
];
const authorIntroductionOptions: ReadonlyArray<{
  label: string;
  value: EnglishGuidedStudyAuthorIntroductionMode;
}> = [
  { label: "简单介绍", value: "BRIEF" },
  { label: "详细介绍", value: "DETAILED" },
  { label: "不做介绍", value: "NONE" }
];
const titleCaseOptions: ReadonlyArray<{
  label: string;
  value: EnglishTitleCaseMode;
}> = [
  { label: "整个标题首字母大写", value: "SENTENCE" },
  { label: "标题每个单词首字母大写", value: "TITLE" },
  { label: "标题全部字母大写", value: "UPPER" }
];

const maxImageBytes = 12 * 1024 * 1024;
const maxReferenceDocumentCount = 3;
const maxReferenceDocumentBytes = 2 * 1024 * 1024;
const maxReferenceTextLength = 10_000;
const maxReferenceMaterialsLength = 256_000;
const playbackRates = [0.5, 0.8, 1, 1.2, 1.5] as const;
const fallbackGuidedStudyVoices: GuidedStudyVoiceOption[] = [
  {
    badge: "官方系统音色",
    description: "阳光清晰，适合一对一讲解。",
    name: "龙安洋",
    previewAudioUrl: "/audio/voices/cosyvoice-v3/longanyang.mp3",
    language: "中文、英文",
    languages: ["中文", "英文"],
    value: "system:longanyang"
  },
  {
    badge: "官方系统音色",
    description: "元气明亮，适合轻快带学。",
    name: "龙安欢",
    previewAudioUrl: "/audio/voices/cosyvoice-v3/longanhuan.mp3",
    language: "中文、英文",
    languages: ["中文", "英文"],
    value: "system:longanhuan"
  },
  {
    badge: "官方系统音色",
    description: "温和耐听，适合专辑讲解。",
    name: "龙珊珊",
    previewAudioUrl: "/audio/voices/cosyvoice-v3/longshanshan_v3.mp3",
    language: "中文、英文",
    languages: ["中文", "英文"],
    value: "system:longshanshan_v3"
  }
];
const defaultImageCropSelection: ImageCropSelection = {
  topLeft: { x: 12, y: 12 },
  topRight: { x: 88, y: 12 },
  bottomRight: { x: 88, y: 88 },
  bottomLeft: { x: 12, y: 88 }
};

export function EnglishGuidedStudyConsole({
  creatorId,
  currentUser,
  scene = "ENGLISH"
}: {
  creatorId?: string;
  currentUser: PublicUser | null;
  scene?: GuidedStudyScene;
}) {
  const router = useRouter();
  const isGushiwen = scene === "GUSHIWEN";
  const maxSourceTextLength = isGushiwen ? 10_000 : 30_000;
  const levelGroups = isGushiwen ? gushiwenGradeGroups : englishLevelGroups;
  const defaultLevelIndex = isGushiwen ? 7 : 1;
  const creatorPath = isGushiwen ? gushiwenCreatorPath : text2lessonCreatorPath;
  const homePath = isGushiwen ? "/gushiwen" : "/text2lesson";
  const [inputMode, setInputMode] = useState<InputMode>("TEXT");
  const [title, setTitle] = useState("");
  const [titleCaseMode, setTitleCaseMode] = useState<EnglishTitleCaseMode>("SENTENCE");
  const [author, setAuthor] = useState("");
  const [authorIntroductionMode, setAuthorIntroductionMode] =
    useState<EnglishGuidedStudyAuthorIntroductionMode>(isGushiwen ? "DETAILED" : "BRIEF");
  const [sourceText, setSourceText] = useState("");
  const [referenceMaterials, setReferenceMaterials] = useState<EnglishGuidedStudyReferenceMaterial[]>([]);
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [referenceDraftText, setReferenceDraftText] = useState("");
  const [referenceDraftDocuments, setReferenceDraftDocuments] = useState<EnglishGuidedStudyReferenceMaterial[]>([]);
  const [referenceUploadPending, setReferenceUploadPending] = useState(false);
  const [standardName, setStandardName] = useState(levelGroups[0].standardName);
  const [levelOptionLabel, setLevelOptionLabel] = useState(levelGroups[0].options[defaultLevelIndex].label);
  const [explanationMode, setExplanationMode] = useState<EnglishStudyExplanationMode>("SENTENCE");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("等待学习材料");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageCrop, setImageCrop] = useState<ImageCropSelection>(defaultImageCropSelection);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imageCropDialogOpen, setImageCropDialogOpen] = useState(false);
  const [imageRecognitionDraft, setImageRecognitionDraft] = useState<ImageRecognitionDraft | null>(null);
  const [material, setMaterial] = useState<EnglishGuidedStudyMaterial | null>(null);
  const [accountHistory, setAccountHistory] = useState(() => accountHistoryForUser(currentUser?.id ?? null));
  const [historyRetry, setHistoryRetry] = useState(0);
  const [historyBrowserOpen, setHistoryBrowserOpen] = useState(false);
  const [historySearchInput, setHistorySearchInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyJumpPageInput, setHistoryJumpPageInput] = useState("1");
  const [historyBrowser, setHistoryBrowser] = useState<HistoryBrowserState>({
    errorMessage: null,
    items: [],
    page: 1,
    pageSize: 20,
    status: "idle",
    total: 0,
    totalPages: 1
  });
  const [studyView, setStudyView] = useState<StudyView>("study");
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedAudioDuration, setLoadedAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<(typeof playbackRates)[number]>(1);
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const [contentSubmissionPending, setContentSubmissionPending] = useState(false);
  const [practiceGenerationPending, setPracticeGenerationPending] = useState(false);
  const [audioGenerationPending, setAudioGenerationPending] = useState(false);
  const [audioVoice, setAudioVoice] = useState(fallbackGuidedStudyVoices[0].value);
  const [readAlongGenerationPending, setReadAlongGenerationPending] = useState(false);
  const [readAlongVoice, setReadAlongVoice] = useState(fallbackGuidedStudyVoices[0].value);
  const [voiceOptions, setVoiceOptions] = useState<GuidedStudyVoiceOption[]>(fallbackGuidedStudyVoices);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [visibleExplanations, setVisibleExplanations] = useState<Record<string, boolean>>({});
  const [toastState, setToastState] = useState<ActionToastState>({});
  const [openHistoryMenu, setOpenHistoryMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false);
  const [scriptEditorIndex, setScriptEditorIndex] = useState(0);
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptSavePending, setScriptSavePending] = useState(false);
  const [sourceSavePending, setSourceSavePending] = useState(false);
  const [billingDialog, setBillingDialog] = useState<BillingDialogState>(null);
  const [pageRestoreVersion, setPageRestoreVersion] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const readAlongInputRef = useRef<HTMLInputElement>(null);
  const activeCropCornerRef = useRef<ImageCropCorner | null>(null);
  const timersRef = useRef<number[]>([]);
  const historyRequestSequenceRef = useRef(0);
  const historyBrowserRequestSequenceRef = useRef(0);
  const contentSubmissionRef = useRef(false);
  const notifiedGenerationStatesRef = useRef(new Set<string>());

  const levelOptions = useMemo(
    () => levelGroups.find((group) => group.standardName === standardName)?.options ?? levelGroups[0].options,
    [levelGroups, standardName]
  );
  const selectedLevelOption = useMemo<EnglishLevelOption>(
    () => levelOptions.find((option) => option.label === levelOptionLabel) ?? levelOptions[0],
    [levelOptionLabel, levelOptions]
  );
  const audioTimeline = useMemo(() => materialTimeline(material), [material]);
  const activeTimelineSegment = useMemo(() => findActiveTimelineSegment(audioTimeline, currentTime), [audioTimeline, currentTime]);
  const activeSentence = useMemo(
    () => findActiveSentence(material, activeTimelineSegment, currentTime),
    [activeTimelineSegment, currentTime, material]
  );
  const activePoint = useMemo(
    () => findActivePoint(activeSentence, activeTimelineSegment, currentTime),
    [activeSentence, activeTimelineSegment, currentTime]
  );
  const guidedHighlightActive = studyView === "guided" && (isPlaying || currentTime > 0);
  const durationSeconds = material?.audioUrl && loadedAudioDuration > 0 ? loadedAudioDuration : (material?.audioDurationSeconds ?? 0);
  const answeredCount = material ? Object.keys(answers).filter((id) => material.questions.some((question) => question.id === id)).length : 0;
  const correctCount = material ? material.questions.filter((question) => answers[question.id] === question.answer).length : 0;
  const contentGenerationActive = isActiveEnglishGuidedStudyOperation(material?.contentGenerationProgress);
  const practiceGenerationActive = isActiveEnglishGuidedStudyOperation(material?.practiceGenerationProgress);
  const audioGenerationActive = isActiveEnglishGuidedStudyOperation(material?.audioGenerationProgress);
  const readAlongGenerationActive = isActiveEnglishGuidedStudyOperation(material?.readAlongGenerationProgress);
  const generationActive =
    contentGenerationActive ||
    practiceGenerationActive ||
    audioGenerationActive ||
    readAlongGenerationActive;
  const materialReady = Boolean(material && material.sentences.length > 0);
  const savedSourceDraft = material ? englishGuidedStudyDraftFromMaterial(material) : null;
  const sourceHasChanges = Boolean(
    savedSourceDraft &&
      (title !== savedSourceDraft.title ||
        author !== savedSourceDraft.author ||
        authorIntroductionMode !== savedSourceDraft.authorIntroductionMode ||
        sourceText !== savedSourceDraft.sourceText)
  );
  const canGenerate =
    sourceText.trim().length > 0 &&
    status !== "recognizing" &&
    status !== "generating" &&
    !contentSubmissionPending &&
    !generationActive &&
    !billingDialog?.isSubmitting;
  const contentProgressValue = contentGenerationActive
    ? material?.contentGenerationProgress?.percent ?? 0
    : progress;
  const contentProgressText = contentGenerationActive
    ? operationProgressMessage(material?.contentGenerationProgress?.message ?? "带学文稿正在生成")
    : statusText;
  const audioControlsPending = audioGenerationPending || audioGenerationActive;
  const practiceControlsPending = practiceGenerationPending || practiceGenerationActive;
  const readAlongControlsPending = readAlongGenerationPending || readAlongGenerationActive;
  const completedSentenceCount = material ? completedGuidedSentenceCount(material, currentTime, playbackCompleted) : 0;
  const isLearningMode = studyView === "guided" || studyView === "practice";
  const studyShareHref = material ? studyShareHrefForMaterial(material, isGushiwen) : "";
  const storedAudioVoice = material
    ? englishGuidedStudyNarrationVoiceSelection(material)
    : null;
  const audioVoiceOptions = useMemo<GuidedStudyVoiceOption[]>(() => {
    if (!storedAudioVoice || voiceOptions.some((option) => option.value === storedAudioVoice)) {
      return voiceOptions;
    }

    return [
      {
        badge: "当前不可用",
        description: "该音色曾用于当前讲解语音，但现在不在可用音色列表中。",
        name: "此前使用的音色",
        value: storedAudioVoice
      },
      ...voiceOptions
    ];
  }, [storedAudioVoice, voiceOptions]);
  const storedReadAlongVoice = isGushiwen ? null : englishGuidedStudyReadAlongVoiceSelection(material);
  const readAlongVoiceOptions = useMemo<GuidedStudyVoiceOption[]>(() => {
    if (!storedReadAlongVoice || voiceOptions.some((option) => option.value === storedReadAlongVoice)) {
      return voiceOptions;
    }

    return [
      {
        badge: "当前不可用",
        description: "该音色曾用于当前示范语音，但现在不在可用音色列表中。",
        name: "此前使用的音色",
        value: storedReadAlongVoice
      },
      ...voiceOptions
    ];
  }, [storedReadAlongVoice, voiceOptions]);
  const scriptEditorItems = useMemo(() => buildScriptEditorItems(material), [material]);
  const activeScriptEditorItem = scriptEditorItems[scriptEditorIndex] ?? scriptEditorItems[0] ?? null;
  const activeScriptEditorKey = activeScriptEditorItem?.key;
  const history = accountHistory.items;
  const pendingMaterialIds = useMemo(
    () => history
      .filter(hasActiveEnglishGuidedStudyGeneration)
      .map((item) => item.id)
      .sort()
      .join(","),
    [history]
  );
  const referenceMaterialCount = referenceMaterials.length;
  const referenceDraftLength =
    referenceDraftText.trim().length +
    referenceDraftDocuments.reduce((total, item) => total + item.content.length, 0);
  const nextTitleCaseOption =
    titleCaseOptions.find((option) => option.value === titleCaseMode) ?? titleCaseOptions[0];

  function replaceTitle(nextTitle: string) {
    setTitle(nextTitle);
    setTitleCaseMode("SENTENCE");
  }

  function cycleTitleCase() {
    const nextTitle = cycleEnglishTitleCase(title, titleCaseMode);
    setTitle(nextTitle.title);
    setTitleCaseMode(nextTitle.nextMode);
  }

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setPageRestoreVersion((current) => current + 1);
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    const userId = currentUser?.id ?? null;
    const requestSequence = historyRequestSequenceRef.current + 1;
    historyRequestSequenceRef.current = requestSequence;
    setAccountHistory(accountHistoryForUser(userId));

    if (!userId) return;

    void loadAccountHistoryRequest({
      userId,
      load: () => getUserEnglishGuidedStudyMaterials(scene).then((items) =>
        items.filter((item) => guidedStudySceneOf(item) === scene)
      ),
      isCurrent: () => historyRequestSequenceRef.current === requestSequence,
      update: setAccountHistory
    });
  }, [currentUser?.id, historyRetry, pageRestoreVersion]);

  useEffect(() => {
    if (!currentUser || !creatorId) {
      return;
    }

    let cancelled = false;

    void getUserEnglishGuidedStudyMaterial(creatorId)
      .then((nextMaterial) => {
        if (!cancelled && guidedStudySceneOf(nextMaterial) === scene) {
          loadFromHistory(nextMaterial);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [creatorId, currentUser, pageRestoreVersion, scene]);

  useEffect(() => {
    const userId = currentUser?.id;
    const watchedMaterialId = material?.id ?? creatorId ?? null;
    const shouldPoll = Boolean(
      userId &&
      (pendingMaterialIds || hasActiveEnglishGuidedStudyGeneration(material))
    );

    if (!userId || !shouldPoll) {
      return;
    }

    const pollingUserId = userId;
    let cancelled = false;
    let timer: number | null = null;

    async function refreshGenerationProgress() {
      try {
        const materials = await getUserEnglishGuidedStudyMaterials(scene);

        if (cancelled) {
          return;
        }

        setAccountHistory((current) => accountHistoryLoaded(current, pollingUserId, materials));
        let watchedMaterial = watchedMaterialId
          ? materials.find((item) => item.id === watchedMaterialId)
          : null;

        if (!watchedMaterial && watchedMaterialId) {
          watchedMaterial = await getUserEnglishGuidedStudyMaterial(watchedMaterialId)
            .catch(() => null);
        }

        if (watchedMaterial && guidedStudySceneOf(watchedMaterial) !== scene) {
          watchedMaterial = null;
        }

        if (cancelled) {
          return;
        }

        if (watchedMaterial) {
          setMaterial(watchedMaterial);
          syncMaterialGenerationState(watchedMaterial, true);
        }
      } catch {
        // Keep the current progress visible and retry on the next polling interval.
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void refreshGenerationProgress();
          }, 2_000);
        }
      }
    }

    void refreshGenerationProgress();

    return () => {
      cancelled = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [creatorId, currentUser?.id, material?.id, pendingMaterialIds, scene]);

  useEffect(() => {
    let cancelled = false;

    async function loadVoiceOptions() {
      const options = await fetchGuidedStudyVoiceOptions().catch(() => fallbackGuidedStudyVoices);

      if (cancelled) {
        return;
      }

      setVoiceOptions(options.length > 0 ? options : fallbackGuidedStudyVoices);
      setAudioVoice((current) =>
        options.some((option) => option.value === current)
          ? current
          : options.find((option) => option.value === fallbackGuidedStudyVoices[0].value)?.value ?? options[0]?.value ?? fallbackGuidedStudyVoices[0].value
      );
    }

    void loadVoiceOptions();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!storedAudioVoice) {
      return;
    }

    setAudioVoice(storedAudioVoice);
  }, [material?.id, storedAudioVoice, voiceOptions]);

  useEffect(() => {
    if (storedReadAlongVoice) {
      setReadAlongVoice(storedReadAlongVoice);
    }
  }, [material?.id, storedReadAlongVoice]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      audioRef.current?.pause();
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
    if (!scriptEditorOpen) {
      return;
    }

    if (scriptEditorItems.length === 0) {
      setScriptEditorOpen(false);
      return;
    }

    if (scriptEditorIndex >= scriptEditorItems.length) {
      setScriptEditorIndex(scriptEditorItems.length - 1);
    }
  }, [scriptEditorIndex, scriptEditorItems.length, scriptEditorOpen]);

  useEffect(() => {
    if (scriptEditorOpen && activeScriptEditorItem) {
      setScriptDraft(activeScriptEditorItem.script);
    }
  }, [activeScriptEditorKey, activeScriptEditorItem, scriptEditorOpen]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (levelOptions.some((option) => option.label === levelOptionLabel)) {
      return;
    }

    setLevelOptionLabel(levelOptions[0].label);
  }, [levelOptionLabel, levelOptions]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    setLoadedAudioDuration(0);
  }, [material?.audioUrl, material?.id]);

  function setToast(message: string, statusType: "success" | "error" = "success") {
    setToastState({
      message,
      status: statusType,
      submittedAt: Date.now()
    });
  }

  function syncMaterialGenerationState(
    nextMaterial: EnglishGuidedStudyMaterial,
    notify: boolean
  ) {
    const contentOperation = nextMaterial.contentGenerationProgress;
    const practiceOperation = nextMaterial.practiceGenerationProgress;
    const audioOperation = nextMaterial.audioGenerationProgress;
    const readAlongOperation = nextMaterial.readAlongGenerationProgress;

    if (isActiveEnglishGuidedStudyOperation(contentOperation)) {
      setStatus("generating");
      setProgress(contentOperation.percent);
      setStatusText(operationProgressMessage(contentOperation.message));
    } else if (contentOperation?.status === "SUCCEEDED") {
      setStatus("completed");
      setProgress(100);
      setStatusText("已生成");
    } else if (contentOperation?.status === "FAILED") {
      setStatus("idle");
      setProgress(0);
      setStatusText(contentOperation.errorMessage || contentOperation.message);
    } else if (nextMaterial.sentences.length > 0) {
      setStatus("completed");
      setProgress(100);
      setStatusText("已生成");
    }

    if (!notify) {
      return;
    }

    notifyEnglishGuidedStudyOperationOnce(
      nextMaterial,
      contentOperation,
      notifiedGenerationStatesRef.current,
      setToast
    );
    notifyEnglishGuidedStudyOperationOnce(
      nextMaterial,
      practiceOperation,
      notifiedGenerationStatesRef.current,
      setToast
    );
    notifyEnglishGuidedStudyOperationOnce(
      nextMaterial,
      audioOperation,
      notifiedGenerationStatesRef.current,
      setToast
    );
    notifyEnglishGuidedStudyOperationOnce(
      nextMaterial,
      readAlongOperation,
      notifiedGenerationStatesRef.current,
      setToast
    );
  }

  function clearGenerationTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function handleStandardChange(value: string) {
    const nextOptions = levelGroups.find((group) => group.standardName === value)?.options ?? levelGroups[0].options;

    setStandardName(value);
    setLevelOptionLabel(nextOptions[0].label);
  }

  function openImageUpload() {
    if (isMobileImagePicker()) {
      setImagePickerOpen(true);
      return;
    }

    imageInputRef.current?.click();
  }

  function chooseLocalImage() {
    setImagePickerOpen(false);
    imageInputRef.current?.click();
  }

  function chooseCameraImage() {
    setImagePickerOpen(false);
    cameraInputRef.current?.click();
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setToast("请上传图片文件", "error");
      return;
    }

    if (file.size > maxImageBytes) {
      setToast("图片不能超过 12M", "error");
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    setInputMode("IMAGE");
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageFile(file);
    setImageName(file.name);
    setImageCrop(defaultImageCropSelection);
    setImagePickerOpen(false);
    setImageCropDialogOpen(true);
    setImageRecognitionDraft(null);
    setMaterial(null);
    setStatus("idle");
    setProgress(0);
    setStatusText("请框选需要识别的正文区域");
    setToast("请框选正文区域后点击识别文本");
    clearGenerationTimers();
  }

  async function recognizeImageText() {
    if (!imageFile) {
      setToast("请先选择图片", "error");
      return;
    }

    setMaterial(null);
    setStatus("recognizing");
    setProgress(16);
    setStatusText("正在裁剪框选区域");
    clearGenerationTimers();
    timersRef.current.push(
      window.setTimeout(() => {
        setProgress(34);
        setStatusText("正在调用多模态模型识别正文");
      }, 500),
      window.setTimeout(() => {
        setProgress(62);
        setStatusText("正在提取标题、作者和完整正文");
      }, 1400),
      window.setTimeout(() => {
        setProgress(82);
        setStatusText("正在过滤页眉页脚和无关内容");
      }, 2600)
    );

    try {
      const croppedImage = await cropImageFileToDataUrl(imageFile, imageCrop);
      const extracted = await extractEnglishGuidedStudyImageText({
        imageDataUrl: croppedImage.dataUrl,
        imageMimeType: croppedImage.mimeType,
        imageName: imageFile.name,
        imageSizeBytes: croppedImage.sizeBytes
      });

      clearGenerationTimers();
      setImageRecognitionDraft({
        title: extracted.title ?? "",
        author: extracted.author ?? "",
        bodyText: extracted.bodyText
      });
      setProgress(100);
      setStatus("idle");
      setStatusText("图片正文已识别，请确认文本");
      setToast("图片文本已识别，请确认后写入文稿");
    } catch (error) {
      clearGenerationTimers();
      setProgress(0);
      setStatus("idle");
      setStatusText("图片识别失败，请换一张清晰图片或稍后重试");
      setToast(error instanceof Error ? error.message : "图片识别失败", "error");
    }
  }

  function confirmRecognizedImageText() {
    if (!imageRecognitionDraft?.bodyText.trim()) {
      setToast("请先识别或填写正文内容", "error");
      return;
    }

    if (imageRecognitionDraft.bodyText.length > maxSourceTextLength) {
      setToast(`${isGushiwen ? "古诗文正文" : "英文正文"}不能超过 ${maxSourceTextLength.toLocaleString("zh-CN")} 个字符`, "error");
      return;
    }

    setInputMode("IMAGE");
    replaceTitle(imageRecognitionDraft.title.trim());
    setAuthor(imageRecognitionDraft.author.trim());
    setSourceText(imageRecognitionDraft.bodyText);
    setImageCropDialogOpen(false);
    setStatusText("图片识别文本已写入文稿，可以生成带学材料");
    setToast(`已写入标题、作者和${isGushiwen ? "古诗文原文" : "英文原文"}`);
  }

  function openReferenceMaterials() {
    setReferenceDraftText(
      referenceMaterials.find((item) => item.kind === "TEXT")?.content ?? ""
    );
    setReferenceDraftDocuments(
      referenceMaterials.filter((item) => item.kind === "DOCUMENT")
    );
    setReferenceDialogOpen(true);
  }

  function clearSourceLineEdgeSpaces() {
    const cleanedSourceText = sourceText
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    if (cleanedSourceText === sourceText) {
      setToast("正文中没有需要清除的首尾空格");
      return;
    }

    setSourceText(cleanedSourceText);
    setToast("已清除每行首尾空格");
  }

  async function saveSourceUpdate() {
    if (!material || isLocalEnglishGuidedStudyMaterialId(material.id)) {
      setToast("请先生成带学材料后再保存更新", "error");
      return;
    }

    if (!currentUser) {
      setToast("请先登录后再保存更新", "error");
      return;
    }

    if (!sourceText.trim()) {
      setToast("学习内容正文不能为空", "error");
      return;
    }

    if (sourceText.length > maxSourceTextLength) {
      setToast(`${isGushiwen ? "古诗文正文" : "英文正文"}不能超过 ${maxSourceTextLength.toLocaleString("zh-CN")} 个字符`, "error");
      return;
    }

    setSourceSavePending(true);

    try {
      const updatedMaterial = await updateEnglishGuidedStudySource(material.id, {
        title: title.trim() || undefined,
        author: author.trim() || undefined,
        authorIntroductionMode,
        sourceText
      });
      const draft = englishGuidedStudyDraftFromMaterial(updatedMaterial);

      setMaterial(updatedMaterial);
      replaceTitle(draft.title);
      setAuthor(draft.author);
      setAuthorIntroductionMode(draft.authorIntroductionMode);
      setSourceText(draft.sourceText);
      saveAccountHistory(updatedMaterial, material.id);
      setToast("学习内容已保存，示范诵读和跟读训练将按最新正文生成");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "学习内容保存失败", "error");
    } finally {
      setSourceSavePending(false);
    }
  }

  function chooseReferenceDocuments() {
    if (!currentUser) {
      setToast("请先登录后再上传参考文档", "error");
      return;
    }

    referenceInputRef.current?.click();
  }

  async function handleReferenceDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableCount = maxReferenceDocumentCount - referenceDraftDocuments.length;

    if (availableCount <= 0) {
      setToast(`最多上传 ${maxReferenceDocumentCount} 个参考文档`, "error");
      return;
    }

    if (files.length > availableCount) {
      setToast(`参考文档最多 ${maxReferenceDocumentCount} 个，请重新选择`, "error");
      return;
    }

    const oversizedFile = files.find((file) => file.size > maxReferenceDocumentBytes);

    if (oversizedFile) {
      setToast(`${oversizedFile.name} 超过 2 MB，请选择更小的文档`, "error");
      return;
    }

    setReferenceUploadPending(true);

    try {
      const result = await extractEnglishGuidedStudyReferenceDocuments(files);
      setReferenceDraftDocuments((current) => {
        const next = [...current];

        for (const document of result.documents) {
          const duplicateIndex = next.findIndex(
            (item) => item.name === document.name && item.sizeBytes === document.sizeBytes
          );
          const normalizedDocument: EnglishGuidedStudyReferenceMaterial = {
            ...document,
            kind: "DOCUMENT"
          };

          if (duplicateIndex >= 0) {
            next[duplicateIndex] = normalizedDocument;
          } else {
            next.push(normalizedDocument);
          }
        }

        return next.slice(0, maxReferenceDocumentCount);
      });

      const truncatedCount = result.documents.filter((item) => item.truncated).length;
      const failureMessage = result.failures.map((item) => `${item.name}：${item.message}`).join("；");

      if (failureMessage) {
        setToast(failureMessage, "error");
      } else if (truncatedCount > 0) {
        setToast(`已提取 ${result.documents.length} 个文档，较长文档保留前 8 万字符`);
      } else {
        setToast(`已提取 ${result.documents.length} 个参考文档`);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "参考文档提取失败", "error");
    } finally {
      setReferenceUploadPending(false);
    }
  }

  function removeReferenceDocument(id: string) {
    setReferenceDraftDocuments((current) => current.filter((item) => item.id !== id));
  }

  function confirmReferenceMaterials() {
    const text = referenceDraftText.trim();

    if (text.length > maxReferenceTextLength) {
      setToast("录入文本不能超过 10,000 个字符", "error");
      return;
    }

    const totalLength =
      text.length +
      referenceDraftDocuments.reduce((total, item) => total + item.content.length, 0);

    if (totalLength > maxReferenceMaterialsLength) {
      setToast("参考资料总长度不能超过 256,000 个字符", "error");
      return;
    }

    const previousTextMaterial = referenceMaterials.find((item) => item.kind === "TEXT");
    setReferenceMaterials([
      ...(text
        ? [
            {
              id: previousTextMaterial?.id ?? `ref-text-${Date.now()}`,
              kind: "TEXT" as const,
              name: "补充参考资料",
              content: text
            }
          ]
        : []),
      ...referenceDraftDocuments
    ]);
    setReferenceDialogOpen(false);
    setToast(totalLength > 0 ? "参考资料已保存，生成文稿时会优先采用" : "已清空参考资料");
  }

  async function generateMaterial() {
    if (!sourceText.trim()) {
      setToast(`请先输入或识别需要带学的${isGushiwen ? "古诗文" : "英文文本"}`, "error");
      return;
    }

    if (sourceText.length > maxSourceTextLength) {
      setToast(`${isGushiwen ? "古诗文正文" : "英文正文"}不能超过 ${maxSourceTextLength.toLocaleString("zh-CN")} 个字符`, "error");
      return;
    }

    if (!currentUser) {
      setToast(`请先登录后再生成${isGushiwen ? "古诗文带学" : "英文带学"}`, "error");
      return;
    }

    const input: GenerateEnglishGuidedStudyMaterialInput = {
      aiLevel: selectedLevelOption.aiLevel,
      author: author.trim() || undefined,
      authorIntroductionMode,
      explanationMode,
      levelOptionLabel: selectedLevelOption.label,
      levelStandardName: standardName,
      materialId: material?.id,
      sourceName: inputMode === "IMAGE" ? imageName : null,
      sourceText,
      sourceType: inputMode,
      referenceMaterials,
      scene,
      title: title.trim() || undefined
    };

    try {
      const estimate = await estimateEnglishGuidedStudyMaterial(input);
      setBillingDialog({
        action: "material",
        estimate,
        input,
        isSubmitting: false
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "点数预估失败，请稍后重试", "error");
    }
  }

  async function submitMaterialGeneration(
    input: GenerateEnglishGuidedStudyMaterialInput,
    billingRequestId: string,
    billingRevision: string
  ) {
    if (contentSubmissionRef.current) {
      return false;
    }

    contentSubmissionRef.current = true;
    setContentSubmissionPending(true);
    clearGenerationTimers();
    audioRef.current?.pause();
    setStudyView("study");
    setAnswers({});
    setSubmitted(false);
    setVisibleExplanations({});
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackCompleted(false);
    setStatus("generating");
    setProgress(0);
    setStatusText("正在提交带学文稿任务");

    try {
      const nextMaterial = await generateEnglishGuidedStudyMaterial({
        ...input,
        billingConfirmed: true,
        billingRequestId,
        billingRevision
      });

      setMaterial(nextMaterial);
      saveAccountHistory(nextMaterial);
      router.replace(creatorPath(nextMaterial.id));
      syncMaterialGenerationState(nextMaterial, false);
      setToast("带学文稿任务已提交，可以关闭页面，后台会继续生成");
      return true;
    } catch (error) {
      clearGenerationTimers();
      setProgress(0);
      setStatus("idle");
      setStatusText("带学文稿任务提交失败，请稍后重试");
      setToast(error instanceof Error ? error.message : "带学文稿任务提交失败", "error");
      return false;
    } finally {
      contentSubmissionRef.current = false;
      setContentSubmissionPending(false);
    }
  }

  async function generateAudio() {
    if (!material) {
      return false;
    }

    if (!currentUser) {
      setToast("请先登录后再生成讲解语音", "error");
      return;
    }

    if (isLocalEnglishGuidedStudyMaterialId(material.id)) {
      setToast("旧的本地材料不能重新生成音频，请先新建带学课件", "error");
      return;
    }

    setAudioGenerationPending(true);

    try {
      const input = voicePayloadFromOption(audioVoice, 1);
      const estimate = await estimateEnglishGuidedStudyAudio(material.id, input);
      setBillingDialog({
        action: "audio",
        estimate,
        input,
        isSubmitting: false,
        materialId: material.id
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "语音点数预估失败，请稍后重试", "error");
    } finally {
      setAudioGenerationPending(false);
    }
  }

  async function generatePractice() {
    if (!material || !materialReady) {
      setToast("请先生成带学文稿", "error");
      return;
    }

    if (!currentUser) {
      setToast("请先登录后再生成练习", "error");
      return;
    }

    if (isLocalEnglishGuidedStudyMaterialId(material.id)) {
      setToast("旧的本地材料不能生成练习，请先新建带学课件", "error");
      return;
    }

    setPracticeGenerationPending(true);
    setToast("正在提交练习生成任务");

    try {
      const updatedMaterial = await generateEnglishGuidedStudyPractice(material.id);

      setMaterial(updatedMaterial);
      saveAccountHistory(updatedMaterial, material.id);
      setAnswers({});
      setSubmitted(false);
      setVisibleExplanations({});
      syncMaterialGenerationState(updatedMaterial, false);
      setToast("练习生成任务已提交，可以关闭页面，后台会继续生成");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "练习生成失败", "error");
    } finally {
      setPracticeGenerationPending(false);
    }
  }

  async function generateReadAlong() {
    if (!material || !materialReady) {
      setToast("请先生成带学文稿", "error");
      return;
    }

    if (!currentUser) {
      setToast("请先登录后再生成跟读音频", "error");
      return;
    }

    if (isLocalEnglishGuidedStudyMaterialId(material.id)) {
      setToast("旧的本地材料不能生成跟读训练，请先新建带学课件", "error");
      return;
    }

    setReadAlongGenerationPending(true);

    try {
      const input = voicePayloadFromOption(readAlongVoice, 1);
      const estimate = await estimateEnglishGuidedStudyReadAlong(material.id, input);
      setBillingDialog({
        action: "readAlong",
        estimate,
        input,
        isSubmitting: false,
        materialId: material.id
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "跟读音频点数预估失败，请稍后重试", "error");
    } finally {
      setReadAlongGenerationPending(false);
    }
  }

  function chooseReadAlongAudio() {
    if (!material || !materialReady) {
      setToast("请先生成带学文稿", "error");
      return;
    }

    if (!currentUser) {
      setToast("请先登录后再上传跟读音频", "error");
      return;
    }

    readAlongInputRef.current?.click();
  }

  async function handleReadAlongUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !material) {
      return;
    }

    if (file.size > englishGuidedStudyReadAlongUploadMaxBytes) {
      setToast("跟读音频不能超过 30 MB", "error");
      return;
    }

    setReadAlongGenerationPending(true);
    setToast("正在读取音频时长并核算点数");

    try {
      const input = {
        audioDurationMs: await readUploadedAudioDurationMs(file),
        audioMimeType: file.type || "application/octet-stream",
        audioName: file.name,
        audioSizeBytes: file.size
      };
      const estimate = await estimateEnglishGuidedStudyReadAlongUpload(material.id, input);
      setBillingDialog({
        action: "readAlongUpload",
        estimate,
        file,
        isSubmitting: false,
        materialId: material.id
      });
      setToast("音频时长和点数已核算，请确认后上传");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "无法读取音频时长，请重新选择", "error");
    } finally {
      setReadAlongGenerationPending(false);
    }
  }

  async function submitReadAlongUpload(
    materialId: string,
    file: File,
    billingRequestId: string,
    billingRevision: string
  ) {
    if (!material) {
      return;
    }

    setReadAlongGenerationPending(true);
    setToast("正在上传跟读音频");

    try {
      const updatedMaterial = await uploadEnglishGuidedStudyReadAlong(materialId, file, {
        billingRequestId,
        billingRevision
      });
      setMaterial(updatedMaterial);
      saveAccountHistory(updatedMaterial, material.id);
      syncMaterialGenerationState(updatedMaterial, false);
      setToast("音频已上传，后台正在识别并生成同步字幕");
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "跟读音频上传失败", "error");
      return false;
    } finally {
      setReadAlongGenerationPending(false);
    }
  }

  async function submitAudioGeneration(
    materialId: string,
    input: GenerateEnglishGuidedStudyAudioInput,
    billingRequestId: string,
    billingRevision: string
  ) {
    if (!material) {
      return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
    setAudioGenerationPending(true);
    setToast("正在提交讲解语音任务");

    try {
      const updatedMaterial = await generateEnglishGuidedStudyAudio(materialId, {
        ...input,
        billingConfirmed: true,
        billingRequestId,
        billingRevision
      });

      setMaterial(updatedMaterial);
      saveAccountHistory(updatedMaterial, material.id);
      setCurrentTime(0);
      setLoadedAudioDuration(0);
      setPlaybackCompleted(false);
      setStudyView("study");
      syncMaterialGenerationState(updatedMaterial, false);
      setToast("讲解语音任务已提交，可以关闭页面，后台会继续生成");
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "讲解语音生成失败", "error");
      return false;
    } finally {
      setAudioGenerationPending(false);
    }
  }

  async function submitReadAlongGeneration(
    materialId: string,
    input: GenerateEnglishGuidedStudyAudioInput,
    billingRequestId: string,
    billingRevision: string
  ) {
    if (!material) {
      return;
    }

    setReadAlongGenerationPending(true);
    setToast("正在提交跟读音频任务");

    try {
      const updatedMaterial = await generateEnglishGuidedStudyReadAlong(materialId, {
        ...input,
        billingConfirmed: true,
        billingRequestId,
        billingRevision
      });

      setMaterial(updatedMaterial);
      saveAccountHistory(updatedMaterial, material.id);
      syncMaterialGenerationState(updatedMaterial, false);
      setToast("跟读音频任务已提交，可以关闭页面，后台会继续生成");
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "跟读音频生成失败", "error");
      return false;
    } finally {
      setReadAlongGenerationPending(false);
    }
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

    setBillingDialog(null);

    if (dialog.action === "material") {
      void submitMaterialGeneration(
        dialog.input,
        dialog.estimate.requestId,
        dialog.estimate.revision
      );
      return;
    }

    if (dialog.action === "audio") {
      void submitAudioGeneration(
        dialog.materialId,
        dialog.input,
        dialog.estimate.requestId,
        dialog.estimate.revision
      );
      return;
    }

    if (dialog.action === "readAlongUpload") {
      void submitReadAlongUpload(
        dialog.materialId,
        dialog.file,
        dialog.estimate.requestId,
        dialog.estimate.revision
      );
      return;
    }

    if (dialog.action === "script") {
      setScriptSavePending(true);

      try {
        const updatedMaterial = await updateEnglishGuidedStudyScript(dialog.materialId, {
          ...dialog.input,
          billingConfirmed: true,
          billingRequestId: dialog.estimate.requestId,
          billingRevision: dialog.estimate.revision
        });

        audioRef.current?.pause();
        setCurrentTime(0);
        setLoadedAudioDuration(0);
        setIsPlaying(false);
        setPlaybackCompleted(false);
        setStudyView("study");
        setMaterial(updatedMaterial);
        saveAccountHistory(updatedMaterial, dialog.materialId);
        setScriptDraft(dialog.input.script);
        setToast("已保存修改并重新生成本句讲解语音，旧练习已失效");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "带学文稿保存失败", "error");
      } finally {
        setScriptSavePending(false);
      }
      return;
    }

    void submitReadAlongGeneration(
      dialog.materialId,
      dialog.input,
      dialog.estimate.requestId,
      dialog.estimate.revision
    );
  }

  function rejectBillingDialog() {
    const canceledScriptSave = billingDialog?.action === "script";
    setBillingDialog(null);
    setToast(canceledScriptSave ? "已取消保存" : "已取消生成");
  }

  function openScriptEditor() {
    if (!material || scriptEditorItems.length === 0) {
      setToast("当前材料暂无可编辑的带学文稿", "error");
      return;
    }

    setScriptEditorIndex(0);
    setScriptEditorOpen(true);
  }

  function closeScriptEditor() {
    if (scriptSavePending) {
      return;
    }

    setScriptEditorOpen(false);
  }

  function switchScriptEditorItem(nextIndex: number) {
    setScriptEditorIndex(clamp(nextIndex, 0, Math.max(0, scriptEditorItems.length - 1)));
  }

  async function saveScriptEdit() {
    if (!material || !activeScriptEditorItem) {
      return;
    }

    const script = scriptDraft.trim();

    if (!script) {
      setToast("带学文稿不能为空", "error");
      return;
    }

    setScriptSavePending(true);

    try {
      const hadAudio = Boolean(material.audioUrl);
      const hadPractice = material.questions.length > 0;
      const input: UpdateEnglishGuidedStudyScriptInput = {
        originalScript: activeScriptEditorItem.script.trim(),
        script,
        sentenceId: activeScriptEditorItem.sentenceId,
        targetType: activeScriptEditorItem.targetType
      };
      const isLocalMaterial = isLocalEnglishGuidedStudyMaterialId(material.id);

      if (hadAudio && !isLocalMaterial) {
        const estimate = await estimateEnglishGuidedStudyScriptUpdate(material.id, input);
        setBillingDialog({
          action: "script",
          estimate,
          input,
          isSubmitting: false,
          materialId: material.id
        });
        return;
      }

      const updatedMaterial = isLocalMaterial
        ? applyLocalScriptEdit(material, activeScriptEditorItem, script)
        : await updateEnglishGuidedStudyScript(material.id, input);

      if (hadAudio) {
        audioRef.current?.pause();
        setCurrentTime(0);
        setLoadedAudioDuration(0);
        setIsPlaying(false);
        setPlaybackCompleted(false);
        setStudyView("study");
      }

      setMaterial(updatedMaterial);
      saveAccountHistory(updatedMaterial, material.id);
      setScriptDraft(script);
      setToast(
        hadAudio || hadPractice
          ? "已保存修改，旧练习和语音已失效，请按需重新生成"
          : "已保存带学文稿修改"
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "带学文稿保存失败", "error");
    } finally {
      setScriptSavePending(false);
    }
  }

  function saveAccountHistory(nextMaterial: EnglishGuidedStudyMaterial, replaceId?: string) {
    setAccountHistory((current) => {
      const withoutReplaced = replaceId ? accountHistoryRemove(current, replaceId) : current;
      return accountHistoryUpsert(withoutReplaced, nextMaterial);
    });
  }

  function loadFromHistory(nextMaterial: EnglishGuidedStudyMaterial) {
    const draft = englishGuidedStudyDraftFromMaterial(nextMaterial);

    audioRef.current?.pause();
    setMaterial(nextMaterial);
    replaceTitle(draft.title);
    setAuthor(draft.author);
    setAuthorIntroductionMode(draft.authorIntroductionMode);
    setSourceText(draft.sourceText);
    setReferenceMaterials(draft.referenceMaterials);
    setInputMode(draft.inputMode);
    setImageName(draft.imageName);
    setStandardName(draft.standardName);
    setLevelOptionLabel(draft.levelOptionLabel);
    setExplanationMode(draft.explanationMode);
    setStudyView("study");
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackCompleted(false);
    setAnswers({});
    setSubmitted(false);
    setVisibleExplanations({});
    syncMaterialGenerationState(nextMaterial, false);
  }

  function startNewMaterial(showToast = true) {
    audioRef.current?.pause();
    clearGenerationTimers();
    setOpenHistoryMenu(null);
    setImagePickerOpen(false);
    setImageCropDialogOpen(false);
    setMaterial(null);
    replaceTitle("");
    setAuthor("");
    setAuthorIntroductionMode(isGushiwen ? "DETAILED" : "BRIEF");
    setSourceText("");
    setReferenceMaterials([]);
    setReferenceDialogOpen(false);
    setReferenceDraftText("");
    setReferenceDraftDocuments([]);
    setInputMode("TEXT");
    setStandardName(levelGroups[0].standardName);
    setLevelOptionLabel(levelGroups[0].options[defaultLevelIndex].label);
    setExplanationMode("SENTENCE");
    setImageFile(null);
    setImageName(null);
    setImageCrop(defaultImageCropSelection);
    setImageRecognitionDraft(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl("");
    }
    setStudyView("study");
    setCurrentTime(0);
    setLoadedAudioDuration(0);
    setIsPlaying(false);
    setPlaybackCompleted(false);
    setAnswers({});
    setSubmitted(false);
    setVisibleExplanations({});
    setStatus("idle");
    setProgress(0);
    setStatusText("等待学习材料");

    if (showToast) {
      setToast("已新建带学课件");
    }
  }

  function openNewMaterial(showToast = true) {
    router.push(creatorPath(createToolCreatorId()));
    startNewMaterial(showToast);
  }

  function beginImageCropCorner(event: ReactPointerEvent<HTMLButtonElement>, corner: ImageCropCorner) {
    if (!imagePreviewUrl || status === "recognizing") {
      return;
    }

    event.stopPropagation();
    activeCropCornerRef.current = corner;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveImageCropCorner(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeCorner = activeCropCornerRef.current;

    if (!activeCorner || !imagePreviewUrl || status === "recognizing") {
      return;
    }

    const point = cropPointFromCornerPointerEvent(event);

    setImageCrop((current) => clampPerspectiveSelection({ ...current, [activeCorner]: point }));
  }

  function endImageCropCorner(event: ReactPointerEvent<HTMLButtonElement>) {
    activeCropCornerRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function loadHistoryBrowserPage(page: number, search: string) {
    if (!currentUser) {
      return;
    }

    const requestSequence = historyBrowserRequestSequenceRef.current + 1;
    historyBrowserRequestSequenceRef.current = requestSequence;
    setHistoryBrowser((current) => ({
      ...current,
      errorMessage: null,
      page,
      status: "loading"
    }));

    try {
      const result = await getUserEnglishGuidedStudyMaterialHistory({ page, scene, search });

      if (historyBrowserRequestSequenceRef.current === requestSequence) {
        setHistoryJumpPageInput(String(result.page));
        setHistoryBrowser({
          ...result,
          errorMessage: null,
          status: "ready"
        });
      }
    } catch (error) {
      if (historyBrowserRequestSequenceRef.current === requestSequence) {
        setHistoryBrowser((current) => ({
          ...current,
          errorMessage: error instanceof Error ? error.message : "历史记录加载失败",
          status: "error"
        }));
      }
    }
  }

  function openHistoryBrowser() {
    setOpenHistoryMenu(null);
    setHistorySearchInput("");
    setHistorySearch("");
    setHistoryJumpPageInput("1");
    setHistoryBrowserOpen(true);
    void loadHistoryBrowserPage(1, "");
  }

  function closeHistoryBrowser() {
    historyBrowserRequestSequenceRef.current += 1;
    setHistoryBrowserOpen(false);
  }

  function submitHistorySearch(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = historySearchInput.trim();
    setHistorySearch(search);
    void loadHistoryBrowserPage(1, search);
  }

  function submitHistoryJump(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPage = /^\d+$/u.test(historyJumpPageInput.trim())
      ? Number(historyJumpPageInput)
      : Number.NaN;

    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      setHistoryJumpPageInput(String(historyBrowser.page));
      return;
    }

    const targetPage = Math.min(requestedPage, historyBrowser.totalPages);
    setHistoryJumpPageInput(String(targetPage));
    void loadHistoryBrowserPage(targetPage, historySearch);
  }

  function openMaterialHistoryMenu(event: ReactMouseEvent<HTMLButtonElement>, nextMaterial: EnglishGuidedStudyMaterial) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 184;
    const menuHeight = 292;

    setOpenHistoryMenu({
      id: nextMaterial.id,
      left: Math.min(rect.right + 8, window.innerWidth - menuWidth - 12),
      top: Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 12))
    });
  }

  function openHistoryMaterial(nextMaterial: EnglishGuidedStudyMaterial) {
    setOpenHistoryMenu(null);
    closeHistoryBrowser();
    router.push(creatorPath(nextMaterial.id));
    loadFromHistory(nextMaterial);
  }

  function openHistoryPractice(nextMaterial: EnglishGuidedStudyMaterial) {
    setOpenHistoryMenu(null);
    router.push(creatorPath(nextMaterial.id));
    loadFromHistory(nextMaterial);

    if (nextMaterial.questions.length === 0) {
      setStudyView("study");
      setToast("这份材料尚未生成练习，请在右侧生成", "error");
      return;
    }

    setStudyView("practice");
    setToast("已打开同步练习");
  }

  async function copyHistorySourceText(nextMaterial: EnglishGuidedStudyMaterial) {
    try {
      await navigator.clipboard.writeText(nextMaterial.sourceText);
      setToast(`${isGushiwen ? "古诗文原文" : "英文原文"}已复制`);
    } catch {
      setToast("浏览器暂不允许复制，请手动复制原文", "error");
    }
  }

  async function copyStudyShareLink(nextMaterial = material) {
    const href = nextMaterial ? studyShareHrefForMaterial(nextMaterial, isGushiwen) : "";

    if (!href) {
      setToast("请先生成讲解语音后再分享学习页", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setToast("学习页面链接已复制");
    } catch {
      setToast("浏览器暂不允许复制，请手动复制链接", "error");
    }
  }

  async function pinHistoryMaterial(nextMaterial: EnglishGuidedStudyMaterial) {
    try {
      const updatedMaterial = await pinEnglishGuidedStudyMaterial(nextMaterial.id);
      setAccountHistory((current) => accountHistoryPin(
        accountHistoryUpsert(current, updatedMaterial),
        updatedMaterial.id
      ));
      setToast("已置顶带学材料");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "带学材料置顶失败", "error");
    }
  }

  async function deleteHistoryMaterial(nextMaterial: EnglishGuidedStudyMaterial) {
    try {
      await deleteEnglishGuidedStudyMaterial(nextMaterial.id);
      setAccountHistory((current) => accountHistoryRemove(current, nextMaterial.id));

      if (material?.id === nextMaterial.id) {
        openNewMaterial(false);
      }

      setToast("已删除历史记录");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "历史记录删除失败", "error");
    }
  }

  function togglePlayback() {
    if (!material) {
      return;
    }

    if (!material.audioUrl) {
      setToast("当前材料还没有真实讲解语音文件，请先接入后端 TTS 后再播放", "error");
      return;
    }

    const audio = audioRef.current;

    if (!audio) {
      setToast("音频播放器尚未准备好", "error");
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    const startTime = currentTime >= durationSeconds ? 0 : currentTime;

    if (startTime === 0) {
      setPlaybackCompleted(false);
    }

    audio.currentTime = startTime;
    audio.playbackRate = playbackRate;
    void audio.play().catch(() => {
      setToast("浏览器暂不允许播放音频，请再次点击播放", "error");
    });
  }

  function resetPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackCompleted(false);
  }

  function changePlaybackRate(rate: (typeof playbackRates)[number]) {
    setPlaybackRate(rate);

    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }

  function startPractice() {
    if (!material || material.questions.length === 0) {
      setToast("请先生成练习", "error");
      return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
    setStudyView("practice");
  }

  function startGuidedStudy() {
    if (!studyShareHref) {
      setToast("请先生成讲解语音后再进入学习页", "error");
      return;
    }

    router.push(studyShareHref);
  }

  function submitPractice() {
    if (!material) {
      return;
    }

    if (answeredCount < material.questions.length) {
      setToast("请先完成全部选择题", "error");
      return;
    }

    setSubmitted(true);
    setToast(`练习完成：答对 ${correctCount} / ${material.questions.length} 题`);
  }

  function answerQuestion(questionId: string, optionIndex: number) {
    if (submitted) {
      return;
    }

    setAnswers((current) => ({
      ...current,
      [questionId]: optionIndex
    }));
  }

  function toggleExplanation(questionId: string) {
    setVisibleExplanations((current) => ({
      ...current,
      [questionId]: !current[questionId]
    }));
  }

  return (
    <section
      className={cn(
        "grid h-[calc(100vh-4rem)] min-h-0 grid-cols-1 overflow-hidden bg-[#f6f6f5] text-foreground",
        sidebarCollapsed
          ? "lg:grid-cols-[76px_minmax(0,1fr)]"
          : "lg:grid-cols-[292px_minmax(0,1fr)]"
      )}
    >
	      <ActionToast state={toastState} />
	      <input accept="image/*" className="hidden" onChange={handleImageUpload} ref={imageInputRef} type="file" />
	      <input accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} ref={cameraInputRef} type="file" />
	      <input
	        accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	        className="hidden"
	        multiple
	        onChange={handleReferenceDocumentUpload}
	        ref={referenceInputRef}
	        type="file"
	      />
	      <input
	        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.webm,.ogg,.m4a,.aac"
	        className="hidden"
	        onChange={handleReadAlongUpload}
	        ref={readAlongInputRef}
	        type="file"
	      />
	      {material ? (
	        <audio
	          className="hidden"
	          onEnded={() => {
	            setIsPlaying(false);
	            setPlaybackCompleted(true);
	            setCurrentTime(durationSeconds);
	          }}
	          onLoadedMetadata={(event) => {
	            const nextDuration = event.currentTarget.duration;

	            if (Number.isFinite(nextDuration) && nextDuration > 0) {
	              setLoadedAudioDuration(nextDuration);
	            }
	            event.currentTarget.playbackRate = playbackRate;
	          }}
	          onPause={() => setIsPlaying(false)}
	          onPlay={() => setIsPlaying(true)}
	          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
	          preload="metadata"
	          ref={audioRef}
	          src={material.audioUrl ?? undefined}
	        />
	      ) : null}

          {historyBrowserOpen ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
              onClick={closeHistoryBrowser}
            >
              <div
                aria-labelledby="english-guided-study-history-title"
                aria-modal="true"
                className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold" id="english-guided-study-history-title">
                      全部历史记录
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      每页 {historyBrowser.pageSize} 条
                    </p>
                  </div>
                  <Button
                    aria-label="关闭全部历史记录"
                    className="size-8 px-0"
                    onClick={closeHistoryBrowser}
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <form className="flex shrink-0 gap-2 border-b border-border p-4" onSubmit={submitHistorySearch}>
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="搜索历史记录"
                      className="pl-9"
                      maxLength={120}
                      onChange={(event) => setHistorySearchInput(event.target.value)}
                      placeholder="搜索标题或原文"
                      value={historySearchInput}
                    />
                  </div>
                  <Button disabled={historyBrowser.status === "loading"} type="submit" variant="outline">
                    搜索
                  </Button>
                </form>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {historyBrowser.status === "loading" ? (
                    <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      正在加载历史记录
                    </div>
                  ) : historyBrowser.status === "error" ? (
                    <div className="grid min-h-48 place-content-center gap-3 text-center text-sm text-muted-foreground">
                      <span>{historyBrowser.errorMessage ?? "历史记录加载失败"}</span>
                      <Button
                        onClick={() => void loadHistoryBrowserPage(historyBrowser.page, historySearch)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        重新加载
                      </Button>
                    </div>
                  ) : historyBrowser.items.length > 0 ? (
                    <div className="grid gap-2">
                      {historyBrowser.items.map((item) => (
                        <button
                          className={cn(
                            "flex w-full items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-secondary",
                            material?.id === item.id && "bg-secondary"
                          )}
                          key={item.id}
                          onClick={() => openHistoryMaterial(item)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {item.sourceText}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-xs text-muted-foreground">
                            <span className="block">{englishGuidedStudyHistoryStatus(item)}</span>
                            <span className="mt-1 block">
                              {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid min-h-48 place-content-center text-sm text-muted-foreground">
                      {historySearch ? "没有找到匹配的历史记录" : "暂无历史记录"}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
                  <p className="text-xs text-muted-foreground">
                    共 {historyBrowser.total.toLocaleString("zh-CN")} 条
                  </p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {historyBrowser.page}/{historyBrowser.totalPages}页
                    </span>
                    <form className="flex items-center gap-2" onSubmit={submitHistoryJump}>
                      <Input
                        aria-label="跳转页码"
                        className="h-8 w-20"
                        disabled={historyBrowser.status === "loading"}
                        inputMode="numeric"
                        max={historyBrowser.totalPages}
                        min={1}
                        onChange={(event) => setHistoryJumpPageInput(event.target.value)}
                        step={1}
                        type="number"
                        value={historyJumpPageInput}
                      />
                      <Button
                        disabled={historyBrowser.status === "loading"}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        跳转
                      </Button>
                    </form>
                    <Button
                      disabled={historyBrowser.status === "loading" || historyBrowser.page <= 1}
                      onClick={() => void loadHistoryBrowserPage(historyBrowser.page - 1, historySearch)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ChevronLeft className="size-4" />
                      上一页
                    </Button>
                    <Button
                      disabled={
                        historyBrowser.status === "loading" ||
                        historyBrowser.page >= historyBrowser.totalPages
                      }
                      onClick={() => void loadHistoryBrowserPage(historyBrowser.page + 1, historySearch)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      下一页
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {billingDialog ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 py-6">
              <div
                aria-labelledby="english-guided-study-billing-title"
                aria-modal="true"
                className="w-full max-w-lg rounded-md border border-border bg-background p-5 shadow-xl"
                role="dialog"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-muted-foreground">点数消耗确认</p>
                  <h2 className="text-xl font-semibold" id="english-guided-study-billing-title">
                    {billingDialog.estimate.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {learningBillingConsumptionLabel(billingDialog.estimate.operation)} {billingDialog.estimate.estimatedCredits.toLocaleString("zh-CN")} 点，当前可用{" "}
                    {billingDialog.estimate.availableCredits.toLocaleString("zh-CN")} 点。
                    {billingDialog.action === "script"
                      ? "确认后将保存文稿修改，并重新合成本句讲解语音。"
                      : billingDialog.action === "readAlongUpload"
                        ? "确认后才会上传音频并冻结点数，识别失败将自动退还。"
                        : "确认后才会开始生成并冻结点数。"}
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
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">当前点数不足，请先充值后再生成。</p>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/pricing">去充值</Link>
                    </Button>
                  </div>
                ) : null}
                <div className="mt-5 flex justify-end gap-3">
                  <Button disabled={billingDialog.isSubmitting} onClick={rejectBillingDialog} variant="outline">
                    不同意
                  </Button>
                  <Button
                    disabled={billingDialog.isSubmitting || !billingDialog.estimate.enoughCredits}
                    onClick={() => void confirmBillingDialog()}
                  >
                    {billingDialog.isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    {billingDialog.action === "script"
                      ? "同意并保存"
                      : billingDialog.action === "readAlongUpload"
                        ? "同意并上传"
                        : "同意并生成"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

	      {referenceDialogOpen ? (
	        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
	          <div
	            aria-labelledby="english-guided-study-reference-title"
	            aria-modal="true"
	            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border bg-background shadow-xl"
	            role="dialog"
	          >
	            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
	              <div className="min-w-0">
	                <h2 className="text-base font-semibold" id="english-guided-study-reference-title">
	                  参考资料
	                </h2>
	                <p className="mt-1 text-xs text-muted-foreground">
	                  可录入译文、重点词汇、注释或练习，生成时优先采用。
	                </p>
	              </div>
	              <Button
	                aria-label="关闭参考资料"
	                className="size-8 px-0"
	                disabled={referenceUploadPending}
	                onClick={() => setReferenceDialogOpen(false)}
	                type="button"
	                variant="ghost"
	              >
	                <X className="size-4" />
	              </Button>
	            </div>

	            <div className="min-h-0 flex-1 overflow-y-auto p-5">
	              <div className="grid gap-5">
	                <label className="grid gap-2 text-sm">
	                  <span className="font-semibold">录入文本</span>
	                  <span className="relative block">
	                    <Textarea
	                      className="min-h-[220px] w-full resize-y pb-9 text-base font-normal leading-7 md:text-base"
	                      maxLength={maxReferenceTextLength}
	                      onChange={(event) => setReferenceDraftText(event.target.value)}
	                      placeholder="在这里录入经典译文、重点词汇与固定释义、背景注释或练习题等参考内容。"
	                      value={referenceDraftText}
	                    />
	                    <span className="pointer-events-none absolute bottom-2 right-3 text-xs font-normal text-muted-foreground">
	                      {referenceDraftText.length.toLocaleString("zh-CN")} /{" "}
	                      {maxReferenceTextLength.toLocaleString("zh-CN")} 字符
	                    </span>
	                  </span>
	                </label>

	                <section className="grid gap-3">
	                  <div className="flex flex-wrap items-center justify-between gap-3">
	                    <div>
	                      <h3 className="text-sm font-semibold">参考文档</h3>
	                      <p className="mt-1 text-xs text-muted-foreground">
	                        支持 TXT、Markdown、PDF、DOCX，最多 {maxReferenceDocumentCount} 个，单个不超过 2 MB。
	                      </p>
	                    </div>
	                    <Button
	                      disabled={
	                        referenceUploadPending ||
	                        referenceDraftDocuments.length >= maxReferenceDocumentCount
	                      }
	                      onClick={chooseReferenceDocuments}
	                      type="button"
	                      variant="outline"
	                    >
	                      {referenceUploadPending ? (
	                        <Loader2 className="size-4 animate-spin" />
	                      ) : (
	                        <Upload className="size-4" />
	                      )}
	                      上传文档
	                    </Button>
	                  </div>

	                  {referenceDraftDocuments.length > 0 ? (
	                    <div className="divide-y divide-border border-y border-border">
	                      {referenceDraftDocuments.map((document) => (
	                        <div className="flex items-center gap-3 py-3" key={document.id}>
	                          <FileText className="size-5 shrink-0 text-muted-foreground" />
	                          <div className="min-w-0 flex-1">
	                            <p className="truncate text-sm font-medium">{document.name}</p>
	                            <p className="mt-1 text-xs text-muted-foreground">
	                              已提取 {document.content.length.toLocaleString("zh-CN")} 个字符
	                            </p>
	                          </div>
	                          <Button
	                            aria-label={`移除${document.name}`}
	                            className="size-8 shrink-0 px-0"
	                            disabled={referenceUploadPending}
	                            onClick={() => removeReferenceDocument(document.id)}
	                            type="button"
	                            variant="ghost"
	                          >
	                            <Trash2 className="size-4" />
	                          </Button>
	                        </div>
	                      ))}
	                    </div>
	                  ) : (
	                    <div className="border-y border-dashed border-border py-6 text-center text-sm text-muted-foreground">
	                      暂无参考文档
	                    </div>
	                  )}
	                </section>
	              </div>
	            </div>

	            <div className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
	              <p
	                className={cn(
	                  "text-xs text-muted-foreground",
	                  referenceDraftLength > maxReferenceMaterialsLength && "text-destructive"
	                )}
	              >
	                共 {referenceDraftLength.toLocaleString("zh-CN")} /{" "}
	                {maxReferenceMaterialsLength.toLocaleString("zh-CN")} 个字符
	              </p>
	              <div className="flex justify-end gap-2">
	                <Button
	                  disabled={referenceUploadPending}
	                  onClick={() => setReferenceDialogOpen(false)}
	                  type="button"
	                  variant="outline"
	                >
	                  取消
	                </Button>
	                <Button
	                  disabled={
	                    referenceUploadPending ||
	                    referenceDraftLength > maxReferenceMaterialsLength
	                  }
	                  onClick={confirmReferenceMaterials}
	                  type="button"
	                >
	                  <CheckCircle2 className="size-4" />
	                  确认资料
	                </Button>
	              </div>
	            </div>
	          </div>
	        </div>
	      ) : null}

	      {imagePickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 py-6 md:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">上传图片</h2>
              <Button aria-label="关闭上传图片选择" className="size-8 px-0" onClick={() => setImagePickerOpen(false)} type="button" variant="ghost">
                <XCircle className="size-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-2">
              <Button className="w-full justify-start" onClick={chooseLocalImage} type="button" variant="outline">
                <ImageUp className="size-4" />
                本地图片
              </Button>
              <Button className="w-full justify-start" onClick={chooseCameraImage} type="button" variant="outline">
                <Camera className="size-4" />
                拍照上传
              </Button>
            </div>
          </div>
        </div>
      ) : null}

	      {imageCropDialogOpen && imagePreviewUrl ? (
	        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">选择学习内容</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">拖动四角框选需要识别的文本。</p>
              </div>
              <Button
                aria-label="关闭图片框选"
                className="size-8 px-0"
                disabled={status === "recognizing"}
                onClick={() => setImageCropDialogOpen(false)}
                type="button"
                variant="ghost"
              >
                <XCircle className="size-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-5">
              <div className={cn("min-h-0", imageRecognitionDraft ? "grid h-full gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : "flex h-full flex-col")}>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <div className="inline-flex max-h-[calc(90vh-220px)] max-w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
                    <div className="relative inline-block max-h-[calc(90vh-220px)] max-w-full touch-none select-none" role="presentation">
                      <img
                        alt={imageName ?? "上传图片"}
                        className="block max-h-[calc(90vh-220px)] max-w-full select-none object-contain"
                        draggable={false}
                        src={imagePreviewUrl}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-black/5" />
                      <svg className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                          <mask id="english-guided-study-crop-mask">
                            <rect fill="white" height="100" width="100" x="0" y="0" />
                            <polygon fill="black" points={cropPointsAttribute(imageCrop)} />
                          </mask>
                        </defs>
                        <rect fill="rgba(0,0,0,0.22)" height="100" mask="url(#english-guided-study-crop-mask)" width="100" x="0" y="0" />
                        <polygon
                          fill="rgba(250,204,21,0.16)"
                          points={cropPointsAttribute(imageCrop)}
                          stroke="#3b82f6"
                          strokeWidth="0.34"
                          vectorEffect="non-scaling-stroke"
                        />
                        <line
                          {...perspectiveGuideLineProps(
                            interpolatePerspectivePoint(imageCrop.topLeft, imageCrop.bottomLeft, 1 / 3),
                            interpolatePerspectivePoint(imageCrop.topRight, imageCrop.bottomRight, 1 / 3)
                          )}
                        />
                        <line
                          {...perspectiveGuideLineProps(
                            interpolatePerspectivePoint(imageCrop.topLeft, imageCrop.bottomLeft, 2 / 3),
                            interpolatePerspectivePoint(imageCrop.topRight, imageCrop.bottomRight, 2 / 3)
                          )}
                        />
                        <line
                          {...perspectiveGuideLineProps(
                            interpolatePerspectivePoint(imageCrop.topLeft, imageCrop.topRight, 1 / 3),
                            interpolatePerspectivePoint(imageCrop.bottomLeft, imageCrop.bottomRight, 1 / 3)
                          )}
                        />
                        <line
                          {...perspectiveGuideLineProps(
                            interpolatePerspectivePoint(imageCrop.topLeft, imageCrop.topRight, 2 / 3),
                            interpolatePerspectivePoint(imageCrop.bottomLeft, imageCrop.bottomRight, 2 / 3)
                          )}
                        />
                      </svg>
                      {cropCorners.map((corner) => (
                        <button
                          aria-label={`拖动${cropCornerLabels[corner]}`}
                          className="absolute z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-blue-500 bg-background shadow-sm active:cursor-grabbing"
                          key={corner}
                          onPointerCancel={endImageCropCorner}
                          onPointerDown={(event) => beginImageCropCorner(event, corner)}
                          onPointerMove={moveImageCropCorner}
                          onPointerUp={endImageCropCorner}
                          style={cropCornerStyle(imageCrop[corner])}
                          type="button"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {imageRecognitionDraft ? (
                  <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
                    <label className="flex flex-col gap-2 text-sm font-semibold">
                      <FieldLabel icon={FileText} label="标题" />
                      <Input
                        onChange={(event) =>
                          setImageRecognitionDraft((current) => (current ? { ...current, title: event.target.value } : current))
                        }
                        placeholder="可选"
                        value={imageRecognitionDraft.title}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold">
                      <span>作者</span>
                      <Input
                        maxLength={120}
                        onChange={(event) =>
                          setImageRecognitionDraft((current) =>
                            current ? { ...current, author: event.target.value } : current
                          )
                        }
                        placeholder="未识别到作者时可留空"
                        value={imageRecognitionDraft.author}
                      />
                    </label>
                    <label className="flex min-h-0 flex-1 flex-col gap-2 text-sm font-semibold">
                      <FieldLabel icon={FileImage} label="识别文本" />
                      <Textarea
                        className="min-h-72 flex-1 resize-none text-base leading-8 md:text-base"
                        maxLength={maxSourceTextLength}
                        onChange={(event) =>
                          setImageRecognitionDraft((current) => (current ? { ...current, bodyText: event.target.value } : current))
                        }
                        value={imageRecognitionDraft.bodyText}
                      />
                    </label>
                  </div>
                ) : null}

                {status === "recognizing" ? (
                  <div className="mx-auto mt-4 flex w-full max-w-4xl shrink-0 flex-col gap-2 rounded-xl bg-secondary px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                      <span>{statusText}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-background">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                disabled={status === "recognizing"}
                onClick={() => {
                  setImageCropDialogOpen(false);
                  openImageUpload();
                }}
                type="button"
                variant="outline"
              >
                <ImageUp className="size-4" />
                重新选择图片
              </Button>
              <div className="flex gap-2">
                <Button disabled={status === "recognizing"} onClick={() => setImageCropDialogOpen(false)} type="button" variant="outline">
                  取消
                </Button>
                <Button
                  disabled={status === "recognizing" || (imageRecognitionDraft ? !imageRecognitionDraft.bodyText.trim() : !imageFile)}
                  onClick={imageRecognitionDraft ? confirmRecognizedImageText : recognizeImageText}
                  type="button"
                >
                  {status === "recognizing" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : imageRecognitionDraft ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                  {imageRecognitionDraft ? "确认文本" : "识别文本"}
                </Button>
              </div>
            </div>
          </div>
	        </div>
	      ) : null}

	      {scriptEditorOpen && activeScriptEditorItem ? (
	        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
	          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl" role="dialog" aria-modal="true">
	            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
	              <div className="min-w-0">
	                <div className="flex flex-wrap items-center gap-2">
	                  <h2 className="text-base font-semibold">编辑文稿</h2>
	                  <Badge variant="outline">
	                    {scriptEditorIndex + 1} / {scriptEditorItems.length}
	                  </Badge>
	                </div>
	                <p className="mt-1 text-sm text-muted-foreground">{activeScriptEditorItem.label}</p>
	              </div>
	              <Button aria-label="关闭编辑文稿" className="size-8 px-0" disabled={scriptSavePending} onClick={closeScriptEditor} type="button" variant="ghost">
	                <X className="size-4" />
	              </Button>
	            </div>
	            <div className="min-h-0 flex-1 overflow-y-auto p-5">
	              <div className="grid gap-4">
	                <section className="rounded-xl border border-border bg-card p-4">
	                  <p className="text-xs font-medium text-muted-foreground">{activeScriptEditorItem.originalLabel}</p>
	                  <p className="mt-2 whitespace-pre-line text-base leading-8">{activeScriptEditorItem.originalText}</p>
	                </section>
	                <label className="grid gap-2 text-sm font-semibold">
	                  <span>带学文稿</span>
	                  <Textarea
	                    className="min-h-[280px] resize-y text-base leading-8 md:text-base"
	                    onChange={(event) => setScriptDraft(event.target.value)}
	                    value={scriptDraft}
	                  />
	                </label>
	              </div>
	            </div>
	            <div className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
	              <div className="grid grid-cols-2 gap-2 sm:w-auto">
	                <Button
	                  disabled={scriptEditorIndex <= 0 || scriptSavePending}
	                  onClick={() => switchScriptEditorItem(scriptEditorIndex - 1)}
	                  type="button"
	                  variant="outline"
	                >
	                  <ChevronLeft className="size-4" />
	                  上一句
	                </Button>
	                <Button
	                  disabled={scriptEditorIndex >= scriptEditorItems.length - 1 || scriptSavePending}
	                  onClick={() => switchScriptEditorItem(scriptEditorIndex + 1)}
	                  type="button"
	                  variant="outline"
	                >
	                  下一句
	                  <ChevronRight className="size-4" />
	                </Button>
	              </div>
	              <Button disabled={scriptSavePending || !scriptDraft.trim()} onClick={saveScriptEdit} type="button">
	                {scriptSavePending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
	                保存修改
	              </Button>
	            </div>
	          </div>
	        </div>
	      ) : null}

	      <aside className="hidden min-h-0 flex-col border-r border-border bg-background lg:flex">
        <div className={cn("flex h-16 shrink-0 items-center", sidebarCollapsed ? "justify-center px-0" : "justify-between px-5")}>
          {!sidebarCollapsed ? (
            <div className="flex min-w-0 items-center gap-2 font-display text-2xl font-light tracking-normal">
              <BookOpenText className="size-7 shrink-0" />
              <span className="truncate">{isGushiwen ? "学古诗文" : "英文带学"}</span>
            </div>
          ) : null}
          <Button
            aria-label={sidebarCollapsed ? "展开左栏" : "收起左栏"}
            className={cn("px-0", sidebarCollapsed ? "size-8" : "size-9")}
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
            aria-label="新建带学课件"
            className={cn(
              "h-11 justify-center gap-2 rounded-full border border-border bg-background text-sm font-medium shadow-sm hover:bg-secondary",
              sidebarCollapsed ? "px-0" : "px-4"
            )}
            onClick={() => openNewMaterial()}
            variant="outline"
          >
            <Sparkles className="size-4" />
            {!sidebarCollapsed ? "新建带学课件" : null}
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
              <button
                aria-label="查看全部带学材料历史"
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
                disabled={!currentUser}
                onClick={openHistoryBrowser}
                type="button"
              >
                <History className="size-4" />
                <span>带学材料历史</span>
              </button>
              {accountHistory.status === "guest" ? (
                <div className="grid gap-3 rounded-xl border border-dashed border-border bg-card px-3 py-5 text-center text-sm text-muted-foreground">
                  <span>登录后查看账号历史</span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/login?next=${encodeURIComponent(homePath)}`}>登录</Link>
                  </Button>
                </div>
              ) : accountHistory.status === "loading" ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-5 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在加载账号历史
                </div>
              ) : accountHistory.status === "error" ? (
                <div className="grid gap-3 rounded-xl border border-dashed border-border bg-card px-3 py-5 text-center text-sm text-muted-foreground">
                  <span>{accountHistory.errorMessage ?? "账号历史加载失败"}</span>
                  <Button onClick={() => setHistoryRetry((value) => value + 1)} size="sm" type="button" variant="outline">
                    重新加载
                  </Button>
                </div>
              ) : history.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {history.map((item) => {
                    const menuOpen = openHistoryMenu?.id === item.id;

                    return (
                      <div
                        className={cn(
                          "group relative rounded-xl text-sm text-muted-foreground transition-colors hover:bg-secondary",
                          material?.id === item.id ? "bg-secondary text-foreground" : ""
                        )}
                        key={item.id}
                      >
                        <button className="flex w-full flex-col gap-1 rounded-xl px-3 py-3 pr-11 text-left" onClick={() => openHistoryMaterial(item)} type="button">
                          <span className="line-clamp-2 font-medium text-foreground">{item.title}</span>
                          <span className="flex items-center justify-between gap-2 text-xs">
                            <span>{englishGuidedStudyHistoryStatus(item)}</span>
                            <span>{new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
                          </span>
                        </button>
                        <button
                          aria-label={`打开 ${item.title} 的更多操作`}
                          className={cn(
                            "absolute right-2 top-3 flex size-8 items-center justify-center rounded-full text-foreground transition-opacity hover:bg-background",
                            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}
                          onClick={(event) => openMaterialHistoryMenu(event, item)}
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
                              onClick={() => openHistoryMaterial(item)}
                              type="button"
                            >
                              <FileText className="size-4" />
                              打开材料
                            </button>
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={item.questions.length === 0}
                              onClick={() => openHistoryPractice(item)}
                              type="button"
                            >
                              <ListChecks className="size-4" />
                              同步练习
                            </button>
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                void copyHistorySourceText(item);
                              }}
                              type="button"
                            >
                              <Copy className="size-4" />
                              复制原文
                            </button>
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!studyShareHrefForMaterial(item, isGushiwen)}
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                void copyStudyShareLink(item);
                              }}
                              type="button"
                            >
                              <Share2 className="size-4" />
                              复制学习链接
                            </button>
                            <div className="my-2 h-px bg-border" />
                            <button
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-secondary"
                              onClick={() => {
                                setOpenHistoryMenu(null);
                                void pinHistoryMaterial(item);
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
                                void deleteHistoryMaterial(item);
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
                  {history.length >= 50 ? (
                    <Button className="mt-1 w-full" onClick={openHistoryBrowser} type="button" variant="outline">查看更多记录</Button>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-sm leading-6 text-muted-foreground">
                  暂无账号历史
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

	      <main className="min-h-0 overflow-y-auto p-5">
	        <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
	          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
	            {!isLearningMode ? (
	              <Card className="overflow-hidden rounded-2xl shadow-sm">
	                <CardHeader className="px-6 py-4">
	                  <div className="flex flex-wrap items-center justify-between gap-3">
		                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
		                      <FileText className="size-5" />
		                      学习内容
		                    </CardTitle>
		                    {material?.audioUrl && studyShareHref ? (
		                      <Button onClick={startGuidedStudy} type="button">
		                        <Play className="size-4" />
		                        进入学习页面
		                      </Button>
		                    ) : null}
	                  </div>
	                </CardHeader>
	                <CardContent className="flex flex-col gap-4 p-5">
	                  <div className="relative">
	                    <Input
	                      aria-label="标题"
	                      className={cn(
	                        "h-11 text-lg font-semibold placeholder:text-base placeholder:font-normal md:text-lg",
	                        !isGushiwen && "pr-12"
	                      )}
	                      maxLength={120}
	                      onChange={(event) => replaceTitle(event.target.value)}
	                      placeholder="请在这里输入标题，非必填"
	                      value={title}
	                    />
	                    {!isGushiwen ? (
	                      <Button
	                        aria-label={nextTitleCaseOption.label}
	                        className="absolute right-1 top-1/2 z-10 h-9 w-9 -translate-y-1/2 px-0"
	                        disabled={!title.trim()}
	                        onClick={cycleTitleCase}
	                        title={nextTitleCaseOption.label}
	                        type="button"
	                        variant="ghost"
	                      >
	                        <CaseUpper className="size-4" />
	                      </Button>
	                    ) : null}
	                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      aria-label="作者"
                      maxLength={120}
                      onChange={(event) => setAuthor(event.target.value)}
                      placeholder="请输入作者，非必填"
                      value={author}
                    />
                    <div
                      aria-label="作者介绍方式"
                      className="grid grid-cols-3 rounded-xl border border-input bg-muted/40 p-1"
                      role="radiogroup"
                    >
                      {authorIntroductionOptions.map((option) => (
                        <button
                          aria-checked={authorIntroductionMode === option.value}
                          className={cn(
                            "h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
                            authorIntroductionMode === option.value
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          key={option.value}
                          onClick={() => setAuthorIntroductionMode(option.value)}
                          role="radio"
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
	                  <div className="relative">
	                    <Textarea
	                      aria-label={isGushiwen ? "古诗文原文" : "英文原文"}
	                      className="min-h-[320px] resize-y pb-9 text-base leading-8 md:text-base"
	                      maxLength={maxSourceTextLength}
	                      onChange={(event) => {
	                        setSourceText(event.target.value);
	                        if (inputMode === "IMAGE") {
	                          setInputMode("TEXT");
	                        }
	                      }}
	                      placeholder={isGushiwen
                          ? "在这里录入要学习的古诗词或古文，也可以通过上传图片识别文本。"
                          : "在这里录入要学习的英文文本或通过上传图片识别文本。"}
	                      value={sourceText}
	                    />
	                    <span className="pointer-events-none absolute bottom-2 right-3 text-xs font-normal text-muted-foreground">
	                      {sourceText.length.toLocaleString("zh-CN")} /{" "}
	                      {maxSourceTextLength.toLocaleString("zh-CN")} 字符
	                    </span>
	                  </div>
		                  <div className="flex flex-wrap items-center gap-2">
		                    <Button
		                      disabled={generationActive}
		                      onClick={openReferenceMaterials}
	                      type="button"
	                      variant="outline"
	                    >
	                      <Paperclip className="size-4" />
	                      参考资料
	                      {referenceMaterialCount > 0 ? (
	                        <Badge className="ml-1" variant="secondary">
	                          {referenceMaterialCount}
	                        </Badge>
		                      ) : null}
		                    </Button>
		                    <Button
		                      disabled={generationActive}
		                      onClick={openImageUpload}
		                      type="button"
		                      variant="outline"
		                    >
		                      <FileImage className="size-4" />
		                      图片识别
		                    </Button>
		                    <Button
		                      className="ml-auto"
		                      disabled={generationActive || sourceText.length === 0}
		                      onClick={clearSourceLineEdgeSpaces}
		                      type="button"
		                      variant="outline"
		                    >
		                      <Eraser className="size-4" />
		                      清除空格
		                    </Button>
		                    <Button
		                      disabled={
		                        !material ||
		                        isLocalEnglishGuidedStudyMaterialId(material.id) ||
		                        generationActive ||
		                        sourceSavePending ||
		                        !sourceHasChanges ||
		                        !sourceText.trim()
		                      }
		                      onClick={saveSourceUpdate}
		                      type="button"
		                      variant="outline"
		                    >
		                      {sourceSavePending ? (
		                        <Loader2 className="size-4 animate-spin" />
		                      ) : (
		                        <Save className="size-4" />
		                      )}
		                      保存更新
		                    </Button>
		                  </div>
	                </CardContent>
	              </Card>
	            ) : null}

	            {materialReady && material ? (
	              <Card className="order-3 overflow-hidden rounded-2xl shadow-sm lg:order-none">
	                <CardHeader className="px-6 py-4">
	                  <div className="flex flex-wrap items-start justify-between gap-3">
	                    <div className="min-w-0">
	                      <CardTitle className="text-base font-semibold">{material.title}</CardTitle>
	                      <CardDescription>
	                        {material.level.standardName} · {material.level.optionLabel}
	                      </CardDescription>
	                    </div>
	                    <Badge>{material.sourceType === "IMAGE" ? "图片文本" : "直接文本"}</Badge>
	                  </div>
	                </CardHeader>
	                <CardContent className="flex flex-col gap-5 p-5">
	                  {studyView !== "practice" ? (
	                    <>
	                      <div className="rounded-xl border border-border bg-card p-4 text-sm leading-7 text-muted-foreground">
	                        {material.summary}
	                      </div>
	                      <div className="flex flex-col gap-3">
	                        {material.sentences.map((sentence) => (
	                          <SentenceBlock
	                            activePoint={guidedHighlightActive && activeSentence?.id === sentence.id ? activePoint : null}
	                            activeSentence={guidedHighlightActive && activeSentence?.id === sentence.id}
	                            key={sentence.id}
	                            sentence={sentence}
	                          />
	                        ))}
	                      </div>
	                      <div className="rounded-xl border border-border bg-card p-4 text-sm leading-7 text-muted-foreground">
	                        {material.closing}
	                      </div>
	                    </>
	                  ) : (
	                    <PracticePanel
	                      answers={answers}
	                      correctCount={correctCount}
	                      material={material}
	                      onAnswer={answerQuestion}
	                      onSubmit={submitPractice}
	                      onToggleExplanation={toggleExplanation}
	                      submitted={submitted}
	                      visibleExplanations={visibleExplanations}
	                    />
	                  )}
	                  {studyView === "guided" ? (
	                    <GuidedAudioBar
	                      currentTime={currentTime}
	                      durationSeconds={durationSeconds}
	                      isPlaying={isPlaying}
	                      onChangePlaybackRate={changePlaybackRate}
	                      onReset={resetPlayback}
	                      onSeek={(nextTime) => {
	                        setCurrentTime(nextTime);
	                        if (audioRef.current) {
	                          audioRef.current.currentTime = nextTime;
	                        }
	                      }}
	                      onTogglePlayback={togglePlayback}
	                      playbackRate={playbackRate}
	                    />
	                  ) : null}
	                </CardContent>
	              </Card>
	            ) : null}
	          </div>

	          <aside className="order-2 flex min-h-0 flex-col gap-5 lg:order-none lg:overflow-y-auto">
	            {isLearningMode && material ? (
	              <Card className="overflow-hidden rounded-2xl shadow-sm">
	                <CardHeader className="px-5 py-4">
	                  <CardTitle className="text-base font-semibold">学习进度</CardTitle>
	                </CardHeader>
	                <CardContent className="grid gap-3 p-5 text-sm">
	                  <LearningProgressStep
	                    active={studyView === "guided"}
	                    description={`已完成 ${completedSentenceCount} / ${material.sentences.length} 句`}
	                    index={1}
	                    title="语音带学"
	                  />
	                  <LearningProgressStep
	                    active={studyView === "practice"}
	                    description={
	                      material.questions.length > 0
	                        ? `已完成 ${answeredCount} / ${material.questions.length} 题`
	                        : "尚未生成"
	                    }
	                    index={2}
	                    title="同步练习"
	                  />
	                  <Button
	                    className="mt-2 w-full"
	                    disabled={material.questions.length === 0}
	                    onClick={startPractice}
	                    type="button"
	                    variant={studyView === "practice" ? "default" : "outline"}
	                  >
	                    <ListChecks />
	                    同步练习
	                  </Button>
	                </CardContent>
	              </Card>
	            ) : (
	              <>
	                <Card className="overflow-hidden rounded-2xl shadow-sm">
	                  <CardHeader className="px-5 py-4">
	                    <CardTitle className="text-base font-semibold">带学文稿</CardTitle>
	                  </CardHeader>
	                  <CardContent className="flex flex-col gap-4 p-5">
	                    <label className="flex flex-col gap-2 text-sm font-semibold">
	                      <FieldLabel icon={BookOpenText} label={isGushiwen ? "学段年级" : "英文水平"} />
	                      {isGushiwen ? (
	                        <Select aria-label="学段年级选项" value={levelOptionLabel} onChange={(event) => setLevelOptionLabel(event.target.value)}>
	                          {levelOptions.map((option) => (
	                            <option value={option.label} key={`${option.label}-${option.aiLevel}`}>
	                              {option.label}
	                            </option>
	                          ))}
	                        </Select>
	                      ) : (
	                        <Select value={standardName} onChange={(event) => handleStandardChange(event.target.value)}>
	                          {levelGroups.map((group) => (
	                            <option value={group.standardName} key={group.standardName}>
	                              {group.standardName}
	                            </option>
	                          ))}
	                        </Select>
	                      )}
	                    </label>
	                    {!isGushiwen ? (
	                      <label className="flex flex-col gap-2 text-sm font-semibold">
	                        <span className="sr-only">等级分数</span>
	                        <Select aria-label="等级分数" value={levelOptionLabel} onChange={(event) => setLevelOptionLabel(event.target.value)}>
	                          {levelOptions.map((option) => (
	                            <option value={option.label} key={`${option.label}-${option.aiLevel}`}>
	                              {option.label}
	                            </option>
	                          ))}
	                        </Select>
	                      </label>
	                    ) : null}
	                    <div className="flex flex-col gap-2 text-sm font-semibold">
	                      <FieldLabel icon={MessageSquareText} label="讲解方式" />
	                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="讲解方式">
	                        {explanationModeOptions.map((option) => {
	                          const Icon = option.icon;
	                          const active = explanationMode === option.value;

	                          return (
	                            <button
	                              aria-pressed={active}
	                              className={cn(
	                                "flex h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors",
	                                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
	                              )}
	                              key={option.value}
	                              onClick={() => setExplanationMode(option.value)}
	                              type="button"
	                            >
	                              <Icon className="size-3.5" />
	                              <span>{option.label}</span>
	                            </button>
	                          );
	                        })}
	                      </div>
	                    </div>

	                    <div className={cn("grid gap-2", materialReady && "sm:grid-cols-2")}>
	                      <Button className="w-full bg-white text-black hover:bg-neutral-100" disabled={!canGenerate} onClick={generateMaterial} variant="outline">
	                        {contentGenerationActive || status === "recognizing" ? <Loader2 className="animate-spin" /> : <Sparkles />}
	                        生成文稿
	                      </Button>
	                      {materialReady ? (
	                        <Button className="w-full bg-white text-black hover:bg-neutral-100" disabled={generationActive} onClick={openScriptEditor} type="button" variant="outline">
	                          <PencilLine />
	                          编辑文稿
	                        </Button>
	                      ) : null}
	                    </div>

	                    <div className="flex flex-col gap-2 rounded-xl bg-secondary px-4 py-3">
	                      <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
	                        <span>{contentProgressText}</span>
	                        <span>{contentProgressValue}%</span>
	                      </div>
	                      <div className="h-2 overflow-hidden rounded-full bg-background">
	                        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${contentProgressValue}%` }} />
	                      </div>
	                    </div>
	                  </CardContent>
	                </Card>

	                <Card className="overflow-hidden rounded-2xl shadow-sm">
	                  <CardHeader className="px-5 py-4">
	                    <CardTitle className="text-base font-semibold">讲解语音</CardTitle>
	                  </CardHeader>
	                  <CardContent className="flex flex-col gap-4 p-5">
	                    <VoicePicker disabled={!materialReady || audioGenerationPending || generationActive} label="选择音色" onChange={setAudioVoice} value={audioVoice} voices={audioVoiceOptions} />
	                    <Button
	                      className="w-full bg-white text-black hover:bg-neutral-100"
	                      disabled={!materialReady || audioGenerationPending || generationActive}
	                      onClick={generateAudio}
	                      type="button"
	                      variant="outline"
	                    >
	                      {audioControlsPending ? <Loader2 className="animate-spin" /> : <Volume2 />}
	                      {audioGenerationActive
	                        ? `讲解语音生成中 ${material?.audioGenerationProgress?.percent ?? 0}%`
	                        : audioGenerationPending
	                          ? "正在提交讲解语音任务"
	                        : material?.audioUrl
	                          ? "重新生成语音"
	                          : "生成讲解语音"}
	                    </Button>
	                    {audioGenerationActive && material?.audioGenerationProgress ? (
	                      <OperationProgressPanel progress={material.audioGenerationProgress} />
	                    ) : null}
		                    {material?.audioUrl ? (
		                      <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-3">
		                        <NarrationAudioPreview
		                          fallbackUrl={material.audioUrl}
		                          nodes={material.narrationTimelineV2?.nodes ?? []}
		                        />
	                      </div>
		                    ) : null}
	                  </CardContent>
	                </Card>

	                <Card className="overflow-hidden rounded-2xl shadow-sm">
	                  <CardHeader className="px-5 py-4">
	                    <CardTitle className="text-base font-semibold">同步练习</CardTitle>
	                  </CardHeader>
	                  <CardContent className="flex flex-col gap-4 p-5">
	                    <Button
	                      className="w-full bg-white text-black hover:bg-neutral-100"
	                      disabled={!materialReady || practiceGenerationPending || generationActive}
	                      onClick={generatePractice}
	                      type="button"
	                      variant="outline"
	                    >
	                      {practiceControlsPending ? <Loader2 className="animate-spin" /> : <ListChecks />}
	                      {practiceGenerationActive
	                        ? `同步练习生成中 ${material?.practiceGenerationProgress?.percent ?? 0}%`
	                        : practiceGenerationPending
	                          ? "正在提交同步练习任务"
	                          : (material?.questions.length ?? 0) > 0
	                            ? "重新生成练习"
	                            : "生成同步练习"}
	                    </Button>
	                    {practiceGenerationActive && material?.practiceGenerationProgress ? (
	                      <OperationProgressPanel progress={material.practiceGenerationProgress} />
	                    ) : null}
	                    {(material?.questions.length ?? 0) > 0 && !practiceGenerationActive ? (
	                      <p className="text-xs font-medium text-muted-foreground">
	                        已生成 {material?.questions.length ?? 0} 道同步练习
	                      </p>
	                    ) : null}
	                  </CardContent>
	                </Card>

	                <Card className="overflow-hidden rounded-2xl shadow-sm">
	                  <CardHeader className="px-5 py-4">
	                    <CardTitle className="text-base font-semibold">{isGushiwen ? "跟读训练" : "示范语音"}</CardTitle>
	                  </CardHeader>
	                  <CardContent className="flex flex-col gap-4 p-5">
	                    <VoicePicker
	                      disabled={!materialReady || readAlongGenerationPending || generationActive}
	                      label="选择音色"
	                      onChange={setReadAlongVoice}
	                      value={readAlongVoice}
	                      voices={readAlongVoiceOptions}
	                    />
	                    <div className="grid gap-2 sm:grid-cols-2">
	                      <Button
	                        className="w-full bg-white text-black hover:bg-neutral-100"
	                        disabled={!materialReady || readAlongGenerationPending || generationActive}
	                        onClick={generateReadAlong}
	                        type="button"
	                        variant="outline"
	                      >
	                        {readAlongControlsPending ? <Loader2 className="animate-spin" /> : <Headphones />}
	                        {readAlongGenerationActive
	                          ? `生成中 ${material?.readAlongGenerationProgress?.percent ?? 0}%`
	                          : material?.readAlong
	                            ? isGushiwen ? "重新生成诵读" : "重新生成语音"
	                            : isGushiwen ? "生成全文诵读" : "生成语音"}
	                      </Button>
	                      <Button
	                        className="w-full bg-white text-black hover:bg-neutral-100"
	                        disabled={!materialReady || readAlongGenerationPending || generationActive}
	                        onClick={chooseReadAlongAudio}
	                        type="button"
	                        variant="outline"
	                      >
	                        {readAlongGenerationPending && !readAlongGenerationActive
	                          ? <Loader2 className="animate-spin" />
	                          : <Upload />}
	                        上传音频
	                      </Button>
	                    </div>
	                    {readAlongGenerationActive && material?.readAlongGenerationProgress ? (
	                      <OperationProgressPanel progress={material.readAlongGenerationProgress} />
	                    ) : null}
	                    {material?.readAlong && !readAlongGenerationActive ? (
	                      <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-3">
	                        <NarrationAudioPreview
	                          fallbackUrl={material.readAlong.audioUrl}
	                          nodes={material.readAlong.nodes}
	                        />
	                        {isGushiwen ? (
	                          <p className="text-xs font-medium text-muted-foreground">
                            已生成 {material.readAlong.cues.length} 段同步字幕
	                          </p>
	                        ) : null}
	                      </div>
	                    ) : null}
	                  </CardContent>
	                </Card>
	                {!isGushiwen ? (
	                  <EnglishGuidedStudyDownloadButtons
	                    disabled={generationActive || audioControlsPending || readAlongControlsPending}
	                    material={material}
	                  />
	                ) : null}
	              </>
	            )}
	          </aside>
	        </div>
	      </main>
    </section>
  );
}

function FieldLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </span>
  );
}

function OperationProgressPanel({
  progress
}: {
  progress: EnglishGuidedStudyOperationProgress;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-secondary px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>{operationProgressMessage(progress.message)}</span>
        <span>{progress.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function GuidedAudioBar({
  currentTime,
  durationSeconds,
  isPlaying,
  onChangePlaybackRate,
  onReset,
  onSeek,
  onTogglePlayback,
  playbackRate
}: {
  currentTime: number;
  durationSeconds: number;
  isPlaying: boolean;
  onChangePlaybackRate: (rate: (typeof playbackRates)[number]) => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onTogglePlayback: () => void;
  playbackRate: (typeof playbackRates)[number];
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(durationSeconds)}</span>
        </div>
        <input
          aria-label="语音带学播放进度"
          className="w-full accent-primary"
          max={Math.max(durationSeconds, 1)}
          min={0}
          onChange={(event) => onSeek(Number(event.target.value))}
          type="range"
          value={Math.min(currentTime, Math.max(durationSeconds, 1))}
        />
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-2 gap-2 xl:w-56">
            <Button className="w-full" onClick={onTogglePlayback} type="button">
              {isPlaying ? <Pause /> : <Play />}
              {isPlaying ? "暂停" : "播放"}
            </Button>
            <Button className="w-full" onClick={onReset} type="button" variant="outline">
              <RotateCcw />
              重学一次
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {playbackRates.map((rate) => (
              <button
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  playbackRate === rate
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                key={rate}
                onClick={() => onChangePlaybackRate(rate)}
                type="button"
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LearningProgressStep({
  active,
  description,
  index,
  title
}: {
  active: boolean;
  description: string;
  index: number;
  title: string;
}) {
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3", active ? "border-primary bg-primary/5" : "border-border bg-card")}>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
        )}
      >
        {index}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
    </div>
  );
}

function SentenceBlock({
  activePoint,
  activeSentence,
  sentence
}: {
  activePoint: EnglishStudyPoint | null;
  activeSentence: boolean;
  sentence: EnglishStudySentence;
}) {
  const script = sentence.script?.trim() || sentence.explanation;

  return (
    <div
      className={cn(
        "rounded-md border p-4 transition-colors",
        activeSentence ? "border-yellow-300 bg-yellow-100 text-yellow-950" : "border-border bg-background"
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">原文片段</p>
      <p
        className="mt-1 text-base leading-8"
        style={{ fontFamily: "var(--font-mulish), Arial, Helvetica, sans-serif" }}
      >
        {renderHighlightedText(sentence.text, activePoint)}
      </p>
      <p className="mt-4 text-xs font-medium text-muted-foreground">带学文稿</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-7 text-foreground/90">{renderHighlightedText(script, activePoint)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sentence.points.map((point) => (
          <Badge className={activePoint?.id === point.id ? "border-red-200 bg-red-50 text-red-700" : ""} key={point.id} variant="outline">
            {point.term} · {point.meaning}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PracticePanel({
  answers,
  correctCount,
  material,
  onAnswer,
  onSubmit,
  onToggleExplanation,
  submitted,
  visibleExplanations
}: {
  answers: Record<string, number>;
  correctCount: number;
  material: EnglishGuidedStudyMaterial;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onSubmit: () => void;
  onToggleExplanation: (questionId: string) => void;
  submitted: boolean;
  visibleExplanations: Record<string, boolean>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">同步练习</p>
            <p className="mt-1 text-sm text-muted-foreground">提交后会显示对错、正确答案和每题讲解。</p>
          </div>
          {submitted ? <Badge>答对 {correctCount} / {material.questions.length}</Badge> : null}
        </div>
      </div>

      {material.questions.map((question, questionIndex) => {
        const selected = answers[question.id];
        const isCorrect = submitted && selected === question.answer;
        const isWrong = submitted && selected !== undefined && selected !== question.answer;

        return (
          <div className="rounded-md border border-border bg-background p-4" key={question.id}>
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold">
                {questionIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium leading-7">{question.question}</p>
                  {isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                      <CheckCircle2 className="size-4" />
                      正确
                    </span>
                  ) : null}
                  {isWrong ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
                      <XCircle className="size-4" />
                      错误
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {question.options.map((option, optionIndex) => {
                    const selectedOption = selected === optionIndex;
                    const correctOption = submitted && question.answer === optionIndex;
                    const wrongOption = submitted && selectedOption && question.answer !== optionIndex;

                    return (
                      <button
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          selectedOption && !submitted ? "border-primary bg-secondary" : "border-border bg-card hover:bg-secondary",
                          correctOption ? "border-blue-200 bg-blue-50 text-blue-700" : "",
                          wrongOption ? "border-red-200 bg-red-50 text-red-700" : ""
                        )}
                        disabled={submitted}
                        key={option}
                        onClick={() => onAnswer(question.id, optionIndex)}
                        type="button"
                      >
                        <span>{option}</span>
                        {correctOption ? <CheckCircle2 className="size-4 text-blue-600" /> : null}
                        {wrongOption ? <XCircle className="size-4 text-red-600" /> : null}
                      </button>
                    );
                  })}
                </div>
                {submitted && isWrong ? (
                  <p className="mt-3 text-sm font-medium text-blue-600">正确答案：{question.options[question.answer]}</p>
                ) : null}
                {submitted ? (
                  <div className="mt-3">
                    <Button onClick={() => onToggleExplanation(question.id)} size="sm" variant="outline">
                      {visibleExplanations[question.id] ? "收起讲解" : "查看讲解"}
                    </Button>
                    {visibleExplanations[question.id] ? (
                      <p className="mt-3 rounded-md bg-secondary p-3 text-sm leading-6 text-muted-foreground">
                        {question.explanation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      <Button className="w-fit" onClick={onSubmit} disabled={submitted}>
        <CheckCircle2 />
        提交练习
      </Button>
    </div>
  );
}

function buildScriptEditorItems(material: EnglishGuidedStudyMaterial | null): ScriptEditorItem[] {
  if (!material) {
    return [];
  }

  const items: ScriptEditorItem[] = [];

  if (material.summary.trim() || material.contentTitle?.trim()) {
    const hasContentTitle = Boolean(material.contentTitle?.trim());

    items.push({
      key: "intro",
      label: hasContentTitle ? "标题和导语" : "导语",
      originalLabel: hasContentTitle ? "标题" : "导语",
      originalText: material.contentTitle || "导读开场",
      script: material.summary,
      targetType: "INTRO"
    });
  }

  material.sentences.forEach((sentence, index) => {
    items.push({
      key: sentence.id,
      label: `第 ${index + 1} 句`,
      originalLabel: "原文",
      originalText: sentence.text,
      script: sentence.script?.trim() || sentence.explanation,
      sentenceId: sentence.id,
      targetType: "SENTENCE"
    });
  });

  items.push({
    key: "summary",
    label: "结束语",
    originalLabel: "文稿位置",
    originalText: "全文讲解结束",
    script: material.closing,
    targetType: "SUMMARY"
  });

  return items;
}

function applyLocalScriptEdit(
  material: EnglishGuidedStudyMaterial,
  item: ScriptEditorItem,
  script: string
): EnglishGuidedStudyMaterial {
  const nextSentences = material.sentences.map((sentence) =>
    item.targetType === "SENTENCE" && sentence.id === item.sentenceId
      ? {
          ...sentence,
          script
        }
      : sentence
  );
  const nextSummary = item.targetType === "INTRO" ? script : material.summary;
  const nextClosing = item.targetType === "SUMMARY" ? script : material.closing;

  return {
    ...material,
    summary: nextSummary,
    closing: nextClosing,
    narration: buildEditedNarrationForMaterial(nextSummary, nextSentences, nextClosing),
    audioUrl: null,
    audioTaskId: null,
    narrationTimelineV2: null,
    questions: [],
    practiceGenerationProgress: null,
    sentences: nextSentences
  };
}

function isActiveEnglishGuidedStudyOperation(
  progress: EnglishGuidedStudyOperationProgress | null | undefined
): progress is ActiveEnglishGuidedStudyOperationProgress {
  return progress?.status === "QUEUED" || progress?.status === "RUNNING";
}

function operationProgressMessage(message: string) {
  return message.includes("关闭页面")
    ? message
    : `${message}；可以关闭页面`;
}

function hasActiveEnglishGuidedStudyGeneration(
  material: EnglishGuidedStudyMaterial | null | undefined
) {
  return Boolean(
    material &&
    (
      isActiveEnglishGuidedStudyOperation(material.contentGenerationProgress) ||
      isActiveEnglishGuidedStudyOperation(material.practiceGenerationProgress) ||
      isActiveEnglishGuidedStudyOperation(material.audioGenerationProgress) ||
      isActiveEnglishGuidedStudyOperation(material.readAlongGenerationProgress)
    )
  );
}

function englishGuidedStudyHistoryStatus(material: EnglishGuidedStudyMaterial) {
  if (isActiveEnglishGuidedStudyOperation(material.contentGenerationProgress)) {
    return `文稿生成 ${material.contentGenerationProgress?.percent ?? 0}%`;
  }

  if (isActiveEnglishGuidedStudyOperation(material.audioGenerationProgress)) {
    return `语音生成 ${material.audioGenerationProgress?.percent ?? 0}%`;
  }

  if (isActiveEnglishGuidedStudyOperation(material.practiceGenerationProgress)) {
    return `练习生成 ${material.practiceGenerationProgress?.percent ?? 0}%`;
  }

  if (isActiveEnglishGuidedStudyOperation(material.readAlongGenerationProgress)) {
    return `跟读生成 ${material.readAlongGenerationProgress?.percent ?? 0}%`;
  }

  if (material.contentGenerationProgress?.status === "FAILED") {
    return "文稿生成失败";
  }

  if (material.audioGenerationProgress?.status === "FAILED") {
    return "语音生成失败";
  }

  if (material.practiceGenerationProgress?.status === "FAILED") {
    return "练习生成失败";
  }

  if (material.readAlongGenerationProgress?.status === "FAILED") {
    return "跟读生成失败";
  }

  return material.level.aiLevel;
}

function notifyEnglishGuidedStudyOperationOnce(
  material: EnglishGuidedStudyMaterial,
  progress: EnglishGuidedStudyOperationProgress | null | undefined,
  notifiedStates: Set<string>,
  notify: (message: string, status?: "success" | "error") => void
) {
  if (!progress || (progress.status !== "SUCCEEDED" && progress.status !== "FAILED")) {
    return;
  }

  const key = `${material.id}:${progress.operation}:${progress.status}:${progress.updatedAt}`;

  if (notifiedStates.has(key)) {
    return;
  }

  notifiedStates.add(key);
  notify(
    progress.status === "FAILED"
      ? progress.errorMessage || progress.message
      : progress.message,
    progress.status === "FAILED" ? "error" : "success"
  );
}

function buildEditedNarrationForMaterial(
  summary: string,
  sentences: EnglishStudySentence[],
  closing: string
) {
  return [
    summary,
    ...sentences.map((sentence) => sentence.script?.trim() || sentence.explanation).filter(Boolean),
    closing
  ].join("\n");
}

function completedGuidedSentenceCount(
  material: EnglishGuidedStudyMaterial,
  currentTime: number,
  playbackCompleted: boolean
) {
  if (playbackCompleted) {
    return material.sentences.length;
  }

  return material.sentences.filter((sentence) => currentTime >= sentence.endSeconds).length;
}

function NarrationAudioPreview({
  fallbackUrl,
  nodes
}: {
  fallbackUrl: string;
  nodes: Array<{ audioUrl: string }>;
}) {
  const [nodeIndex, setNodeIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const continuationStateRef = useRef<NarrationPreviewContinuationState>({
    attemptPending: false,
    requested: false
  });
  const currentNode = nodes[nodeIndex] ?? null;
  const audioUrl = currentNode?.audioUrl ?? fallbackUrl;
  const sourceSignature = narrationPreviewSourceSignature(fallbackUrl, nodes);
  const progressPercent = durationSeconds > 0
    ? clamp((currentTime / durationSeconds) * 100, 0, 100)
    : 0;

  useEffect(() => {
    continuationStateRef.current = { attemptPending: false, requested: false };
    setNodeIndex(0);
  }, [sourceSignature]);

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    setCurrentTime(0);
    setDurationSeconds(0);
    audio.load();
  }, [audioUrl]);

  function changeNode(nextIndex: number) {
    continuationStateRef.current = { attemptPending: false, requested: false };
    audioPreviewRef.current?.pause();
    setNodeIndex(clamp(nextIndex, 0, Math.max(0, nodes.length - 1)));
  }

  function handleEnded() {
    if (nodeIndex >= nodes.length - 1) {
      continuationStateRef.current = { attemptPending: false, requested: false };
      setIsPlaying(false);
      return;
    }

    continuationStateRef.current.requested = true;
    setNodeIndex((current) => current + 1);
  }

  function resumePendingPlayback(audio: HTMLAudioElement) {
    const continuationState = continuationStateRef.current;
    void resumeNarrationPreviewAfterLoad(
      continuationState,
      () => audio.play()
    );
  }

  function togglePlayback() {
    const audio = audioPreviewRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    if (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.05) {
      if (sequentialPlaybackFinished(nodeIndex, nodes.length, audio.currentTime, audio.duration)) {
        continuationStateRef.current.requested = true;
        setNodeIndex(0);
        return;
      }

      audio.currentTime = 0;
    }

    void audio.play().catch(() => setIsPlaying(false));
  }

  function seekAudio(nextTime: number) {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function toggleMute() {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    const nextMuted = !audio.muted;
    audio.muted = nextMuted;
    setIsMuted(nextMuted);
  }

  return (
    <div className="grid min-w-0 gap-2">
      {currentNode ? (
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
          <Button
            aria-label="试听上一个讲解节点"
            className="size-8 px-0"
            disabled={nodeIndex === 0}
            onClick={() => changeNode(nodeIndex - 1)}
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>讲解点 {nodeIndex + 1} / {nodes.length}</span>
          <Button
            aria-label="试听下一个讲解节点"
            className="size-8 px-0"
            disabled={nodeIndex === nodes.length - 1}
            onClick={() => changeNode(nodeIndex + 1)}
            type="button"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
      <div className="flex h-14 w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-full bg-[#f1f2f3] px-3 text-[#171717]">
        <button
          aria-label={isPlaying ? "暂停讲解语音" : "播放讲解语音"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={togglePlayback}
          type="button"
        >
          {isPlaying
            ? <Pause className="size-6" />
            : <Play className="ml-0.5 size-6 fill-current" />}
        </button>
        <span className="min-w-[5.5rem] whitespace-nowrap text-base font-normal tabular-nums">
          {formatTime(currentTime)} / {formatTime(durationSeconds)}
        </span>
        <div className="relative h-8 w-0 min-w-0 flex-1">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-[#bfc0c2]">
            <div
              className="h-full rounded-full bg-[#626262]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span
            className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#626262]"
            style={{
              left: progressPercent <= 0
                ? "5px"
                : progressPercent >= 100
                  ? "calc(100% - 5px)"
                  : `${progressPercent}%`
            }}
          />
          <input
            aria-label="讲解语音试听进度"
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
            disabled={durationSeconds <= 0}
            max={Math.max(durationSeconds, 1)}
            min={0}
            onChange={(event) => seekAudio(Number(event.target.value))}
            step={0.05}
            type="range"
            value={Math.min(currentTime, Math.max(durationSeconds, 1))}
          />
        </div>
        <button
          aria-label={isMuted ? "恢复讲解语音音量" : "静音讲解语音"}
          aria-pressed={isMuted}
          className="flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={toggleMute}
          type="button"
        >
          {isMuted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
        </button>
      </div>
      <audio
        className="hidden"
        onEnded={handleEnded}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          setDurationSeconds(Number.isFinite(duration) ? duration : 0);
          resumePendingPlayback(event.currentTarget);
        }}
        onCanPlay={(event) => resumePendingPlayback(event.currentTarget)}
        onError={() => {
          continuationStateRef.current = { attemptPending: false, requested: false };
          setIsPlaying(false);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        preload="metadata"
        ref={audioPreviewRef}
        src={audioUrl}
      />
    </div>
  );
}

function voicePayloadFromOption(value: string, speed: number) {
  if (value.startsWith("voice:")) {
    return {
      speed,
      voiceAssetId: value.slice("voice:".length)
    };
  }

  return {
    speed,
    voice: value.startsWith("system:") ? value.slice("system:".length) : value
  };
}

async function fetchGuidedStudyVoiceOptions() {
  const response = await fetch("/api/audio/voices", {
    cache: "no-store"
  });
  const payload = (await response.json()) as {
    code?: number;
    data?: {
      customVoices?: Array<Record<string, unknown>>;
      defaultVoice?: {
        systemVoiceId?: string | null;
        voiceAssetId?: string | null;
      };
      platformVoices?: Array<Record<string, unknown>>;
      systemVoices?: Array<Record<string, unknown>>;
    } | null;
  };

  if (!response.ok || payload.code !== 0 || !payload.data) {
    return fallbackGuidedStudyVoices;
  }

  const defaultVoiceAssetId = payload.data.defaultVoice?.voiceAssetId ?? null;
  const defaultSystemVoiceId = payload.data.defaultVoice?.systemVoiceId ?? null;
  const systemVoices = (payload.data.systemVoices ?? [])
    .filter((voice) => voice.status === "READY")
    .map((voice) =>
      mapVoiceAssetToGuidedStudyOption(voice, {
        badge: "官方系统音色",
        defaultValue: defaultSystemVoiceId,
        valuePrefix: "system:",
        valueProperty: "providerVoiceId"
      })
    );
  const platformVoices = (payload.data.platformVoices ?? [])
    .filter((voice) => voice.status === "READY")
    .map((voice) =>
      mapVoiceAssetToGuidedStudyOption(voice, {
        badge: voice.type === "CLONED" ? "平台复刻音色" : "平台设计音色",
        defaultValue: defaultVoiceAssetId,
        valuePrefix: "voice:",
        valueProperty: "id"
      })
    );
  const customVoices = (payload.data.customVoices ?? [])
    .filter((voice) => voice.status === "READY")
    .map((voice) =>
      mapVoiceAssetToGuidedStudyOption(voice, {
        badge: String(voice.typeName ?? "我的音色"),
        defaultValue: defaultVoiceAssetId,
        valuePrefix: "voice:",
        valueProperty: "id"
      })
    );
  const options = [...customVoices, ...platformVoices, ...systemVoices].filter(
    (option): option is GuidedStudyVoiceOption => Boolean(option)
  );
  const merged = [...options, ...fallbackGuidedStudyVoices].filter(
    (option, index, list) => list.findIndex((item) => item.value === option.value) === index
  );

  if (!defaultVoiceAssetId && !defaultSystemVoiceId) {
    return merged;
  }

  return [...merged].sort((left, right) => {
    const leftDefault = left.value === `voice:${defaultVoiceAssetId}` || left.value === `system:${defaultSystemVoiceId}`;
    const rightDefault = right.value === `voice:${defaultVoiceAssetId}` || right.value === `system:${defaultSystemVoiceId}`;

    return Number(rightDefault) - Number(leftDefault);
  });
}

function mapVoiceAssetToGuidedStudyOption(
  voice: Record<string, unknown>,
  options: {
    badge: string;
    defaultValue: string | null;
    valuePrefix: "system:" | "voice:";
    valueProperty: "id" | "providerVoiceId";
  }
): GuidedStudyVoiceOption | null {
  const rawValue = stringRecordValue(voice[options.valueProperty]);
  const name = stringRecordValue(voice.name);

  if (!rawValue || !name) {
    return null;
  }

  return {
    badge: options.defaultValue === rawValue ? `${options.badge} · 默认` : options.badge,
    description: stringRecordValue(voice.description),
    name,
    previewAudioUrl: stringRecordValue(voice.previewAudioUrl),
    visibility: voice.visibility === "PUBLIC" || voice.visibility === "PRIVATE" || voice.visibility === "ADMIN_ONLY" ? voice.visibility : undefined,
    language: stringRecordValue(voice.language),
    languages: stringArrayRecordValue(voice.languages),
    accent: stringRecordValue(voice.accent),
    gender: stringRecordValue(voice.gender),
    avatarUrl: stringRecordValue(voice.avatarUrl),
    trait: stringRecordValue(voice.trait),
    scene: stringRecordValue(voice.scene),
    ageCategory: stringRecordValue(voice.ageCategory),
    supportedModels: stringArrayRecordValue(voice.supportedModels),
    ssmlSupported: voice.ssmlSupported === true,
    instructSupported: voice.instructSupported === true,
    timestampSupported: voice.timestampSupported === true,
    value: `${options.valuePrefix}${rawValue}`
  };
}

function stringRecordValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayRecordValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function studyShareHrefForMaterial(material: EnglishGuidedStudyMaterial, isGushiwen = false) {
  if (!material.audioUrl || isLocalEnglishGuidedStudyMaterialId(material.id)) {
    return "";
  }

  return isGushiwen ? gushiwenStudyPath(material.id) : text2lessonStudyPath(material.id);
}

const cropCorners: ImageCropCorner[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
const cropCornerLabels: Record<ImageCropCorner, string> = {
  topLeft: "左上角",
  topRight: "右上角",
  bottomRight: "右下角",
  bottomLeft: "左下角"
};

function cropPointFromCornerPointerEvent(event: ReactPointerEvent<HTMLButtonElement>) {
  const cropArea = event.currentTarget.parentElement;
  const rect = cropArea?.getBoundingClientRect();

  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

function selectionBounds(points: ImageCropPoint[]) {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: clamp(minX, 0, 100),
    y: clamp(minY, 0, 100),
    width: clamp(maxX - minX, 0, 100),
    height: clamp(maxY - minY, 0, 100)
  };
}

function cropPoints(selection: ImageCropSelection): ImageCropQuad {
  return [selection.topLeft, selection.topRight, selection.bottomRight, selection.bottomLeft];
}

function cropPointsAttribute(selection: ImageCropSelection) {
  return cropPoints(selection).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function cropCornerStyle(point: ImageCropPoint) {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`
  };
}

function interpolatePerspectivePoint(start: ImageCropPoint, end: ImageCropPoint, ratio: number) {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio
  };
}

function perspectiveGuideLineProps(start: ImageCropPoint, end: ImageCropPoint) {
  return {
    stroke: "rgba(55,65,81,0.58)",
    strokeWidth: "0.2",
    vectorEffect: "non-scaling-stroke",
    x1: start.x,
    x2: end.x,
    y1: start.y,
    y2: end.y
  };
}

function clampPerspectiveSelection(selection: ImageCropSelection) {
  return {
    topLeft: clampCropPoint(selection.topLeft),
    topRight: clampCropPoint(selection.topRight),
    bottomRight: clampCropPoint(selection.bottomRight),
    bottomLeft: clampCropPoint(selection.bottomLeft)
  };
}

function clampCropPoint(point: ImageCropPoint) {
  return {
    x: clamp(point.x, 0, 100),
    y: clamp(point.y, 0, 100)
  };
}

function pointPixelDistance(start: ImageCropPoint, end: ImageCropPoint) {
  return Math.hypot(start.x - end.x, start.y - end.y);
}

function drawPerspectiveCorrectedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sourcePoints: ImageCropQuad,
  outputWidth: number,
  outputHeight: number
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceCanvas = document.createElement("canvas");

  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;

  const sourceContext = sourceCanvas.getContext("2d");

  if (!sourceContext) {
    throw new Error("图片裁剪失败");
  }

  sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);

  const sourceData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const outputImage = context.createImageData(outputWidth, outputHeight);
  const mapPoint = createPerspectivePointMapper(sourcePoints);

  for (let y = 0; y < outputHeight; y += 1) {
    const v = outputHeight <= 1 ? 0 : y / (outputHeight - 1);

    for (let x = 0; x < outputWidth; x += 1) {
      const u = outputWidth <= 1 ? 0 : x / (outputWidth - 1);
      const sourcePoint = mapPoint(u, v);
      const sourceX = Math.round(clamp(sourcePoint.x, 0, sourceWidth - 1));
      const sourceY = Math.round(clamp(sourcePoint.y, 0, sourceHeight - 1));
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const outputIndex = (y * outputWidth + x) * 4;

      outputImage.data[outputIndex] = sourceData.data[sourceIndex] ?? 255;
      outputImage.data[outputIndex + 1] = sourceData.data[sourceIndex + 1] ?? 255;
      outputImage.data[outputIndex + 2] = sourceData.data[sourceIndex + 2] ?? 255;
      outputImage.data[outputIndex + 3] = 255;
    }
  }

  context.putImageData(outputImage, 0, 0);
}

function createPerspectivePointMapper(points: ImageCropQuad) {
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const dx1 = topRight.x - bottomRight.x;
  const dy1 = topRight.y - bottomRight.y;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const determinant = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(determinant) < 0.0001) {
    return (u: number, v: number) => ({
      x: topLeft.x + (topRight.x - topLeft.x) * u + (bottomLeft.x - topLeft.x) * v,
      y: topLeft.y + (topRight.y - topLeft.y) * u + (bottomLeft.y - topLeft.y) * v
    });
  }

  const a13 = (dx3 * dy2 - dx2 * dy3) / determinant;
  const a23 = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a11 = topRight.x - topLeft.x + a13 * topRight.x;
  const a21 = bottomLeft.x - topLeft.x + a23 * bottomLeft.x;
  const a31 = topLeft.x;
  const a12 = topRight.y - topLeft.y + a13 * topRight.y;
  const a22 = bottomLeft.y - topLeft.y + a23 * bottomLeft.y;
  const a32 = topLeft.y;

  return (u: number, v: number) => {
    const denominator = a13 * u + a23 * v + 1;

    return {
      x: (a11 * u + a21 * v + a31) / denominator,
      y: (a12 * u + a22 * v + a32) / denominator
    };
  };
}

async function cropImageFileToDataUrl(file: File, crop: ImageCropSelection) {
  const image = await loadImageFromFile(file);
  const selectedPoints = cropPoints(crop);
  const bounds = selectionBounds(selectedPoints);
  const validCrop = bounds.width >= 4 && bounds.height >= 4 ? crop : defaultImageCropSelection;
  const validPoints = cropPoints(validCrop);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const sourcePoints: ImageCropQuad = [
    { x: (validPoints[0].x / 100) * naturalWidth, y: (validPoints[0].y / 100) * naturalHeight },
    { x: (validPoints[1].x / 100) * naturalWidth, y: (validPoints[1].y / 100) * naturalHeight },
    { x: (validPoints[2].x / 100) * naturalWidth, y: (validPoints[2].y / 100) * naturalHeight },
    { x: (validPoints[3].x / 100) * naturalWidth, y: (validPoints[3].y / 100) * naturalHeight }
  ];
  const topWidth = pointPixelDistance(sourcePoints[0], sourcePoints[1]);
  const bottomWidth = pointPixelDistance(sourcePoints[3], sourcePoints[2]);
  const leftHeight = pointPixelDistance(sourcePoints[0], sourcePoints[3]);
  const rightHeight = pointPixelDistance(sourcePoints[1], sourcePoints[2]);
  const sourceWidth = Math.max(1, Math.round(Math.max(topWidth, bottomWidth)));
  const sourceHeight = Math.max(1, Math.round(Math.max(leftHeight, rightHeight)));
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("图片裁剪失败");
  }

  drawPerspectiveCorrectedImage(context, image, sourcePoints, canvas.width, canvas.height);

  for (const quality of [0.9, 0.78, 0.66, 0.54]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const sizeBytes = dataUrlSizeBytes(dataUrl);

    if (sizeBytes <= maxImageBytes) {
      return {
        dataUrl,
        mimeType: "image/jpeg",
        sizeBytes
      };
    }
  }

  throw new Error("框选区域图片过大，请缩小框选范围");
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败"));
    };
    image.src = objectUrl;
  });
}

function dataUrlSizeBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";

  return Math.ceil((base64.length * 3) / 4);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isMobileImagePicker() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
}

function materialTimeline(material: EnglishGuidedStudyMaterial | null): EnglishAudioTimelineSegment[] {
  if (!material) {
    return [];
  }

  if (Array.isArray(material.audioTimeline) && material.audioTimeline.length > 0) {
    return material.audioTimeline;
  }

  return material.sentences.map((sentence) => ({
    sentenceId: sentence.id,
    startSeconds: sentence.startSeconds,
    endSeconds: sentence.endSeconds,
    terms: sentence.points.map((point) => ({
      pointId: point.id,
      term: point.term,
      startSeconds: point.startSeconds,
      endSeconds: point.endSeconds
    }))
  }));
}

function findActiveTimelineSegment(timeline: EnglishAudioTimelineSegment[], currentTime: number) {
  return timeline.find((segment) => currentTime >= segment.startSeconds && currentTime < segment.endSeconds) ?? null;
}

function findActiveSentence(
  material: EnglishGuidedStudyMaterial | null,
  activeTimelineSegment: EnglishAudioTimelineSegment | null,
  currentTime: number
) {
  if (!material) {
    return null;
  }

  if (activeTimelineSegment) {
    return material.sentences.find((sentence) => sentence.id === activeTimelineSegment.sentenceId) ?? null;
  }

  return material.sentences.find((sentence) => currentTime >= sentence.startSeconds && currentTime < sentence.endSeconds) ?? null;
}

function findActivePoint(
  sentence: EnglishStudySentence | null,
  activeTimelineSegment: EnglishAudioTimelineSegment | null,
  currentTime: number
) {
  if (!sentence) {
    return null;
  }

  const activeTerm = activeTimelineSegment?.terms.find((term) => currentTime >= term.startSeconds && currentTime < term.endSeconds);

  if (activeTerm) {
    return sentence.points.find((point) => point.id === activeTerm.pointId || point.term === activeTerm.term) ?? null;
  }

  return sentence.points.find((point) => currentTime >= point.startSeconds && currentTime < point.endSeconds) ?? null;
}

function renderHighlightedText(text: string, activePoint: EnglishStudyPoint | null) {
  if (!activePoint) {
    return text;
  }

  const lower = text.toLowerCase();
  const term = activePoint.term.toLowerCase();
  const index = lower.indexOf(term);

  if (index < 0) {
    return text;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + activePoint.term.length);
  const after = text.slice(index + activePoint.term.length);

  return (
    <>
      {before}
      <strong className="font-semibold text-red-600">{match}</strong>
      {after}
    </>
  );
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
