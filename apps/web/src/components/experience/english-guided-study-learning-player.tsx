"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gauge,
  Maximize2,
  Mic2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  Share2,
  Volume2,
  XCircle,
  type LucideIcon
} from "lucide-react";

import { ActionToast, type ActionToastState } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  publishLearningContext,
  publishLearningEvent
} from "@/components/learning/learner-learning-provider";
import { Select } from "@/components/ui/select";
import {
  type EnglishAudioTimelineSegment,
  type EnglishGuidedStudyMaterial,
  type EnglishNarrationNode,
  type EnglishReadAlongTrack,
  type EnglishStudyPoint,
  type EnglishStudyQuestion,
  type EnglishStudySentence,
  gushiwenHomePath,
  text2lessonHomePath
} from "@/lib/english-guided-study-data";
import {
  audioPlaybackErrorMessage,
  buildLearningTimeline,
  buildOriginalDocumentLayout,
  expandLegacyStudySentences,
  globalTimeForNode,
  nextReadAlongCueIndex,
  nextSentenceNodeIndex,
  nextPracticeQuestionIndex,
  nodePositionAtGlobalTime,
  practiceResult,
  readAlongPlaybackPositionAtTime,
  readAlongWaitSeconds,
  shouldWaitAtReadAlongBoundary,
  sequentialPlaybackFinished
} from "@/lib/english-guided-study-learning";
import {
  completedGuidedNodeIds,
  flushGuidedStudyPlaybackRange,
  guidedStudyPartKey
} from "@/lib/english-guided-study-tracking";
import { cn } from "@/lib/utils";

type StudyView = "demonstration" | "guided" | "practice" | "readAlong";
type PlaybackLoopMode = "all" | "sentence";
type DemonstrationPlaybackMode = "once" | "sentence" | "all";
type ReadAlongPlaybackMode = "sentence-repeat" | "all-repeat" | "all-once";
type ReadAlongTimingMode = "pause" | "delay" | "shadow";

const playbackRates = [0.5, 0.8, 1, 1.2, 1.5] as const;

interface SavedLearningProgress {
  answers: Record<string, number>;
  currentQuestionIndex: number;
  currentNodeIndex?: number;
  currentNodeTime?: number;
  currentTime: number;
  furthestTime: number;
  loopMode: PlaybackLoopMode;
  loopPlayback?: boolean;
  playbackRate: (typeof playbackRates)[number];
  retryQuestionIds: string[] | null;
  sentenceLoop?: boolean;
  studyView: StudyView;
  submitted: boolean;
}

export function EnglishGuidedStudyLearningPlayer({
  courseId,
  courseRevisionItemId,
  material,
  materialId,
  scene = "ENGLISH"
}: {
  courseId?: string;
  courseRevisionItemId?: string;
  material: EnglishGuidedStudyMaterial | null;
  materialId: string;
  scene?: "ENGLISH" | "GUSHIWEN";
}) {
  const router = useRouter();
  const isGushiwen = scene === "GUSHIWEN";
  const [studyView, setStudyView] = useState<StudyView>(material?.readAlong ? "demonstration" : "guided");
  const [currentTime, setCurrentTime] = useState(0);
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  const [currentNodeTime, setCurrentNodeTime] = useState(0);
  const [furthestTime, setFurthestTime] = useState(0);
  const [loadedAudioDuration, setLoadedAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<(typeof playbackRates)[number]>(1);
  const [loopMode, setLoopMode] = useState<PlaybackLoopMode>("all");
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [retryQuestionIds, setRetryQuestionIds] = useState<string[] | null>(null);
  const [visibleExplanations, setVisibleExplanations] = useState<Record<string, boolean>>({});
  const [toastState, setToastState] = useState<ActionToastState>({});
  const [shareUrl, setShareUrl] = useState("");
  const [readAlongSettingsPortalTarget, setReadAlongSettingsPortalTarget] = useState<HTMLElement | null>(null);
  const [progressRestored, setProgressRestored] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const guidedDocumentScrollRef = useRef<HTMLDivElement>(null);
  const continuePlaybackRef = useRef(false);
  const pendingNodeTimeRef = useRef(0);
  const completedGuidedIdsRef = useRef(new Set<string>());
  const previousCompletedSentenceIndexRef = useRef(-1);
  const narrationNodes = useMemo(() => material?.narrationTimelineV2?.nodes ?? [], [material]);
  const usingNodeAudio = narrationNodes.length > 0;
  const loopPlayback = loopMode === "all";
  const sentenceLoop = loopMode === "sentence";
  const currentNode = usingNodeAudio ? narrationNodes[currentNodeIndex] ?? narrationNodes[0] : null;
  const learningSentences = useMemo(
    () => material
      ? usingNodeAudio
        ? material.sentences
        : expandLegacyStudySentences(material.sentences, material.audioTimeline)
      : [],
    [material, usingNodeAudio]
  );
  const audioTimeline = useMemo(() => buildLearningTimeline(learningSentences), [learningSentences]);
  const activeTimelineSegment = useMemo(
    () => findActiveTimelineSegment(audioTimeline, currentTime),
    [audioTimeline, currentTime]
  );
  const activeSentence = useMemo(() => {
    if (usingNodeAudio) {
      return learningSentences.find((sentence) => sentence.id === currentNode?.sentenceId) ?? null;
    }

    return findActiveSentence(learningSentences, activeTimelineSegment, currentTime);
  }, [activeTimelineSegment, currentNode?.sentenceId, currentTime, learningSentences, usingNodeAudio]);
  const activeSentenceIndex = activeSentence
    ? learningSentences.findIndex((sentence) => sentence.id === activeSentence.id)
    : -1;
  const playerPositionLabel = usingNodeAudio && activeSentenceIndex < 0
    ? currentNode?.type === "SUMMARY" ? "总结讲解" : "导入讲解"
    : `第 ${Math.max(1, activeSentenceIndex + 1)} / ${learningSentences.length} 句`;
  const activePoint = useMemo(() => {
    if (usingNodeAudio) return findNodeFocusPoint(activeSentence, currentNode);
    return findActivePoint(activeSentence, activeTimelineSegment, currentTime);
  }, [activeSentence, activeTimelineSegment, currentNode, currentTime, usingNodeAudio]);
  const durationSeconds = usingNodeAudio
    ? narrationNodes.reduce((total, node) => total + node.durationMs / 1000, 0)
    : material?.audioUrl && loadedAudioDuration > 0
      ? loadedAudioDuration
      : (material?.audioDurationSeconds ?? 0);
  const allPracticeResult = useMemo(
    () => practiceResult(material?.questions ?? [], answers),
    [answers, material?.questions]
  );
  const practiceQuestions = useMemo(() => {
    if (!material) {
      return [];
    }

    if (!retryQuestionIds) {
      return material.questions;
    }

    const retryIds = new Set(retryQuestionIds);
    return material.questions.filter((question) => retryIds.has(question.id));
  }, [material, retryQuestionIds]);
  const activePracticeResult = useMemo(
    () => practiceResult(practiceQuestions, answers),
    [answers, practiceQuestions]
  );
  const answeredCount = material
    ? material.questions.length - allPracticeResult.unansweredQuestionIds.length
    : 0;
  const completedSentenceCount = playbackCompleted
    ? learningSentences.length
    : usingNodeAudio
      ? completedNodeSentenceCount(narrationNodes, furthestTime)
      : learningSentences.filter((sentence) => furthestTime >= sentence.endSeconds - 0.2).length;
  const safeQuestionIndex = practiceQuestions.length > 0
    ? Math.min(currentQuestionIndex, practiceQuestions.length - 1)
    : 0;
  const stableMaterialId = material?.id ?? materialId;
  const learningContext = useMemo(
    () => ({
      isLearning: true,
      ...(courseId ? { courseId } : {}),
      ...(courseRevisionItemId ? { courseRevisionItemId } : {}),
      materialType: "ENGLISH_GUIDED_STUDY" as const,
      materialId: stableMaterialId
    }),
    [courseId, courseRevisionItemId, stableMaterialId]
  );

  useEffect(() => {
    if (!material) return;
    const timer = window.setTimeout(() => {
      publishLearningContext({
        ...learningContext,
        partKey: guidedStudyPartKey(studyView)
      });
    });
    return () => window.clearTimeout(timer);
  }, [learningContext, material, studyView]);

  useEffect(() => {
    if (!material) return;
    completedGuidedIdsRef.current.clear();
    previousCompletedSentenceIndexRef.current = -1;
    const initialPartKey = guidedStudyPartKey(material.readAlong ? "demonstration" : "guided");
    const timer = window.setTimeout(() => {
      publishLearningEvent({ type: "MATERIAL_STARTED", partKey: initialPartKey });
    });
    return () => {
      window.clearTimeout(timer);
      publishLearningContext({ isLearning: false });
    };
  }, [material?.id]);

  useEffect(() => {
    setShareUrl(window.location.href);

    if (material) {
      try {
        const raw = window.localStorage.getItem(progressStorageKey(material.id));
        const saved = raw ? JSON.parse(raw) as Partial<SavedLearningProgress> : null;

        if (saved) {
          if (
            (saved.studyView === "demonstration" && material.readAlong) ||
            saved.studyView === "guided" ||
            saved.studyView === "practice" ||
            (saved.studyView === "readAlong" && material.readAlong)
          ) {
            setStudyView(saved.studyView);
          }
          if (typeof saved.currentTime === "number") {
            const savedTime = Math.max(0, saved.currentTime);
            setCurrentTime(savedTime);

            if (narrationNodes.length > 0) {
              const restoredPosition =
                typeof saved.currentNodeIndex === "number" && typeof saved.currentNodeTime === "number"
                  ? {
                      nodeIndex: Math.max(0, Math.min(Math.floor(saved.currentNodeIndex), narrationNodes.length - 1)),
                      nodeTimeSeconds: Math.max(0, saved.currentNodeTime)
                    }
                  : nodePositionAtGlobalTime(narrationNodes, savedTime);
              setCurrentNodeIndex(restoredPosition.nodeIndex);
              setCurrentNodeTime(restoredPosition.nodeTimeSeconds);
              pendingNodeTimeRef.current = restoredPosition.nodeTimeSeconds;
            }
          }
          if (typeof saved.furthestTime === "number") setFurthestTime(Math.max(0, saved.furthestTime));
          if (playbackRates.includes(saved.playbackRate as (typeof playbackRates)[number])) {
            setPlaybackRate(saved.playbackRate as (typeof playbackRates)[number]);
          }
          if (saved.loopMode === "all" || saved.loopMode === "sentence") {
            setLoopMode(saved.loopMode);
          } else {
            setLoopMode(saved.sentenceLoop ? "sentence" : "all");
          }
          if (saved.answers && typeof saved.answers === "object") setAnswers(saved.answers);
          if (typeof saved.submitted === "boolean") setSubmitted(saved.submitted);
          if (typeof saved.currentQuestionIndex === "number") {
            setCurrentQuestionIndex(Math.max(0, Math.floor(saved.currentQuestionIndex)));
          }
          if (saved.retryQuestionIds === null || Array.isArray(saved.retryQuestionIds)) {
            setRetryQuestionIds(saved.retryQuestionIds ?? null);
          }
        }
      } catch {
        window.localStorage.removeItem(progressStorageKey(material.id));
      }
    }

    setProgressRestored(true);

    return () => {
      audioRef.current?.pause();
    };
  }, [material, narrationNodes]);

  useEffect(() => {
    if (!material || !progressRestored) {
      return;
    }

    const progress: SavedLearningProgress = {
      answers,
      currentQuestionIndex,
      currentNodeIndex,
      currentNodeTime,
      currentTime,
      furthestTime,
      loopMode,
      playbackRate,
      retryQuestionIds,
      studyView,
      submitted
    };

    window.localStorage.setItem(progressStorageKey(material.id), JSON.stringify(progress));
  }, [
    answers,
    currentQuestionIndex,
    currentNodeIndex,
    currentNodeTime,
    currentTime,
    furthestTime,
    loopMode,
    material,
    playbackRate,
    progressRestored,
    retryQuestionIds,
    studyView,
    submitted
  ]);

  useEffect(() => {
    if (studyView !== "guided" || !activeSentence) {
      return;
    }

    const container = guidedDocumentScrollRef.current;
    const element = container?.querySelector<HTMLElement>(
      `[data-study-sentence-id="${activeSentence.id}"]`
    );

    if (!container || !element) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const nextScrollTop =
      container.scrollTop +
      elementRect.top -
      containerRect.top -
      (container.clientHeight - elementRect.height) / 2;

    container.scrollTo({
      behavior: isPlaying ? "smooth" : "auto",
      top: Math.max(0, nextScrollTop)
    });
  }, [activeSentence, isPlaying, studyView]);

  function setToast(message: string, status: "success" | "error" = "success") {
    setToastState({ message, status, submittedAt: Date.now() });
  }

  function seekTo(nextTime: number) {
    const safeTime = Math.max(0, Math.min(nextTime, durationSeconds || nextTime));
    setCurrentTime(safeTime);

    if (usingNodeAudio) {
      const position = nodePositionAtGlobalTime(narrationNodes, safeTime);
      seekToNode(position.nodeIndex, position.nodeTimeSeconds, isPlaying);
      return;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = safeTime;
    }
  }

  function seekToNode(nodeIndex: number, nodeTimeSeconds = 0, keepPlaying = isPlaying) {
    if (!usingNodeAudio) return;

    const safeIndex = Math.max(0, Math.min(nodeIndex, narrationNodes.length - 1));
    const safeNodeTime = Math.max(0, Math.min(nodeTimeSeconds, narrationNodes[safeIndex]!.durationMs / 1000));
    const nextGlobalTime = globalTimeForNode(narrationNodes, safeIndex, safeNodeTime);
    continuePlaybackRef.current = keepPlaying;
    pendingNodeTimeRef.current = safeNodeTime;
    setCurrentNodeTime(safeNodeTime);
    setCurrentTime(nextGlobalTime);

    if (safeIndex === currentNodeIndex && audioRef.current) {
      audioRef.current.currentTime = safeNodeTime;
      if (keepPlaying && audioRef.current.paused) {
        audioRef.current.playbackRate = playbackRate;
        void audioRef.current.play().catch((error) =>
          setToast(audioPlaybackErrorMessage(currentNode?.audioUrl ?? material?.audioUrl ?? "", error), "error")
        );
      }
      return;
    }

    setCurrentNodeIndex(safeIndex);
  }

  function togglePlayback() {
    if (!(currentNode?.audioUrl ?? material?.audioUrl)) {
      setToast("当前学习材料还没有讲解音频", "error");
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

    if (usingNodeAudio && currentTime >= durationSeconds - 0.05) {
      setPlaybackCompleted(false);
      seekToNode(0, 0, true);
      return;
    }

    const startTime = currentTime >= durationSeconds ? 0 : currentTime;
    if (startTime === 0) setPlaybackCompleted(false);
    audio.currentTime = usingNodeAudio ? currentNodeTime : startTime;
    audio.playbackRate = playbackRate;
    void audio.play().catch((error) =>
      setToast(audioPlaybackErrorMessage(currentNode?.audioUrl ?? material?.audioUrl ?? "", error), "error")
    );
  }

  function changePlaybackRate(rate: (typeof playbackRates)[number]) {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }

  function seekToSentence(index: number) {
    const sentence = learningSentences[Math.max(0, Math.min(index, learningSentences.length - 1))];
    if (!sentence) return;

    if (usingNodeAudio) {
      const nodeIndex = narrationNodes.findIndex((node) => node.sentenceId === sentence.id);
      if (nodeIndex >= 0) seekToNode(nodeIndex);
      return;
    }

    seekTo(sentence.startSeconds);
  }

  function seekPreviousSentence() {
    if (usingNodeAudio) {
      const restartCurrent = currentNodeTime > 3;
      const nodeIndex = restartCurrent
        ? narrationNodes.findIndex((node) => node.sentenceId === currentNode?.sentenceId)
        : nextSentenceNodeIndex(narrationNodes, currentNodeIndex, -1);
      seekToNode(nodeIndex >= 0 ? nodeIndex : 0);
      return;
    }

    if (!activeSentence) {
      seekToSentence(0);
      return;
    }

    const restartCurrent = currentTime - activeSentence.startSeconds > 3;
    seekToSentence(restartCurrent ? activeSentenceIndex : activeSentenceIndex - 1);
  }

  function seekNextSentence() {
    if (usingNodeAudio) {
      seekToNode(nextSentenceNodeIndex(narrationNodes, currentNodeIndex, 1));
      return;
    }

    seekToSentence(activeSentenceIndex >= 0 ? activeSentenceIndex + 1 : 0);
  }

  function handleAudioTimeUpdate(event: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    const nextTime = audio.currentTime;

    if (usingNodeAudio) {
      const globalTime = globalTimeForNode(narrationNodes, currentNodeIndex, nextTime);
      setCurrentNodeTime(nextTime);
      setCurrentTime(globalTime);
      setFurthestTime((current) => Math.max(current, globalTime));
      return;
    }

    if (sentenceLoop && activeTimelineSegment && nextTime >= activeTimelineSegment.endSeconds - 0.12) {
      audio.currentTime = activeTimelineSegment.startSeconds;
      setCurrentTime(activeTimelineSegment.startSeconds);
      return;
    }

    setCurrentTime(nextTime);
    setFurthestTime((current) => Math.max(current, nextTime));
    const completedIndex = material
      ? material.sentences.filter((sentence) => nextTime >= sentence.endSeconds - 0.2).length - 1
      : -1;
    const completedIds = completedGuidedNodeIds(
      { restored: false, index: previousCompletedSentenceIndexRef.current },
      { restored: false, index: completedIndex },
      material?.sentences.map((sentence) => sentence.id) ?? []
    );
    for (const itemId of completedIds) {
      recordGuidedNode(itemId);
    }
    previousCompletedSentenceIndexRef.current = Math.max(
      previousCompletedSentenceIndexRef.current,
      completedIndex
    );
  }

  function handleAudioLoadedMetadata(event: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;

    if (usingNodeAudio) {
      const targetTime = Math.min(pendingNodeTimeRef.current, Number.isFinite(audio.duration) ? audio.duration : pendingNodeTimeRef.current);
      audio.currentTime = targetTime;
      audio.playbackRate = playbackRate;

      if (continuePlaybackRef.current) {
        continuePlaybackRef.current = false;
        void audio.play().catch((error) =>
          setToast(audioPlaybackErrorMessage(currentNode?.audioUrl ?? material?.audioUrl ?? "", error), "error")
        );
      }
      return;
    }

    if (Number.isFinite(audio.duration)) {
      setLoadedAudioDuration(audio.duration);
      if (currentTime > 0) audio.currentTime = Math.min(currentTime, audio.duration);
    }
  }

  function handleAudioEnded() {
    if (usingNodeAudio) {
      const sentenceId = currentNode?.sentenceId;
      if (currentNode) recordGuidedNode(currentNode.id);

      if (sentenceLoop && sentenceId) {
        const sentenceStart = narrationNodes.findIndex((node) => node.sentenceId === sentenceId);
        seekToNode(sentenceStart >= 0 ? sentenceStart : currentNodeIndex, 0, true);
        return;
      }

      if (currentNodeIndex < narrationNodes.length - 1) {
        seekToNode(currentNodeIndex + 1, 0, true);
        return;
      }

      if (loopPlayback) {
        setPlaybackCompleted(false);
        seekToNode(0, 0, true);
        return;
      }

      setIsPlaying(false);
      setCurrentNodeTime(currentNode?.durationMs ? currentNode.durationMs / 1000 : 0);
      setCurrentTime(durationSeconds);
      setFurthestTime(durationSeconds);
      setPlaybackCompleted(true);
      return;
    }

    if (loopPlayback) {
      seekTo(0);
      setPlaybackCompleted(false);
      if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
        void audioRef.current.play().catch((error) =>
          setToast(audioPlaybackErrorMessage(currentNode?.audioUrl ?? material?.audioUrl ?? "", error), "error")
        );
      }
      return;
    }
    setIsPlaying(false);
    setCurrentTime(durationSeconds);
    setFurthestTime(durationSeconds);
    setPlaybackCompleted(true);
  }

  function startPractice() {
    if (!material || material.questions.length === 0) {
      setToast("这份材料尚未生成练习，请返回制作页生成", "error");
      return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
    setStudyView("practice");
  }

  function showGuidedStudy() {
    setStudyView("guided");
  }

  function startDemonstration() {
    if (!material?.readAlong) {
      setToast("这份材料尚未生成示范诵读音频", "error");
      return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
    setStudyView("demonstration");
  }

  function startReadAlong() {
    if (!material?.readAlong) {
      setToast("这份材料尚未生成跟读训练，请返回制作页生成或上传音频", "error");
      return;
    }

    audioRef.current?.pause();
    setIsPlaying(false);
    setStudyView("readAlong");
  }

  function submitPractice() {
    if (activePracticeResult.unansweredQuestionIds.length > 0) {
      const missingId = activePracticeResult.unansweredQuestionIds[0];
      const missingIndex = practiceQuestions.findIndex((question) => question.id === missingId);
      if (missingIndex >= 0) setCurrentQuestionIndex(missingIndex);
      setToast(`还有 ${activePracticeResult.unansweredQuestionIds.length} 题未完成`, "error");
      return;
    }

    setSubmitted(true);
    setVisibleExplanations({});

    if (activePracticeResult.wrongQuestionIds.length > 0) {
      const firstWrong = practiceQuestions.findIndex(
        (question) => question.id === activePracticeResult.wrongQuestionIds[0]
      );
      if (firstWrong >= 0) setCurrentQuestionIndex(firstWrong);
      setToast(`本轮答对 ${activePracticeResult.correctCount} / ${practiceQuestions.length} 题`);
      return;
    }

    if (retryQuestionIds) {
      setRetryQuestionIds(null);
      setCurrentQuestionIndex(0);
    }
    setToast("全部答对，练习巩固已完成");
  }

  function answerQuestion(questionId: string, optionIndex: number) {
    if (submitted) return;
    setAnswers((current) => ({ ...current, [questionId]: optionIndex }));
    publishLearningEvent({
      type: "PRACTICE_SUBMITTED",
      partKey: "PRACTICE",
      itemId: questionId,
      selectedIndex: optionIndex
    });
  }

  function handleGuidedAudioPlay() {
    setIsPlaying(true);
    if (!usingNodeAudio && material) {
      previousCompletedSentenceIndexRef.current =
        material.sentences.filter((sentence) => currentTime >= sentence.endSeconds - 0.2).length - 1;
    }
  }

  function recordGuidedNode(itemId: string) {
    if (completedGuidedIdsRef.current.has(itemId)) return;
    completedGuidedIdsRef.current.add(itemId);
    publishLearningEvent({ type: "NODE_LEARNED", partKey: "GUIDED", itemId });
  }

  function startWrongRetry() {
    if (allPracticeResult.wrongQuestionIds.length === 0) return;
    const wrongIds = allPracticeResult.wrongQuestionIds;
    setAnswers((current) => {
      const next = { ...current };
      for (const questionId of wrongIds) delete next[questionId];
      return next;
    });
    setRetryQuestionIds(wrongIds);
    setSubmitted(false);
    setCurrentQuestionIndex(0);
    setVisibleExplanations({});
  }

  function goToNextPracticeQuestion() {
    if (safeQuestionIndex < practiceQuestions.length - 1) {
      setCurrentQuestionIndex(safeQuestionIndex + 1);
      return;
    }

    if (!submitted) submitPractice();
  }

  function findNextUnanswered() {
    const next = nextPracticeQuestionIndex(
      practiceQuestions.map((question) => question.id),
      answers,
      safeQuestionIndex
    );

    if (next === null) {
      submitPractice();
    } else {
      setCurrentQuestionIndex(next);
    }
  }

  function toggleExplanation(questionId: string) {
    setVisibleExplanations((current) => ({ ...current, [questionId]: !current[questionId] }));
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      setToast("学习页面链接已复制");
    } catch {
      setToast("浏览器暂不允许复制，请手动复制地址栏链接", "error");
    }
  }

  if (!material) {
    return (
      <section className="min-h-[calc(100vh-72px)] bg-[#f6f6f5] p-5">
        <div className="mx-auto flex min-h-[520px] max-w-3xl items-center justify-center">
          <Card className="w-full rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>学习材料不可用</CardTitle>
              <CardDescription>
                链接对应的{isGushiwen ? "古诗文带学" : "英文带学"}材料不存在，或讲解音频还没有生成完成。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={isGushiwen ? gushiwenHomePath : text2lessonHomePath}>
                  去生成{isGushiwen ? "古诗文带学" : "英文带学"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[#f6f6f5]">
      <ActionToast state={toastState} />
      <audio
        className="hidden"
        onEnded={handleAudioEnded}
        onLoadedMetadata={handleAudioLoadedMetadata}
        onPause={() => setIsPlaying(false)}
        onPlay={handleGuidedAudioPlay}
        onTimeUpdate={handleAudioTimeUpdate}
        preload="metadata"
        ref={audioRef}
        src={currentNode?.audioUrl ?? material.audioUrl ?? undefined}
      />
      {usingNodeAudio && narrationNodes[currentNodeIndex + 1]?.audioUrl ? (
        <audio className="hidden" preload="auto" src={narrationNodes[currentNodeIndex + 1]!.audioUrl} />
      ) : null}

      <div
        className={cn(
          "mx-auto grid min-h-[calc(100vh-72px)] max-w-[1440px] gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]"
        )}
      >
        <main
          className={cn(
            "min-w-0",
            studyView === "guided"
              ? "h-[calc(100dvh-112px)] min-h-[500px]"
              : "lg:min-h-[calc(100vh-112px)]"
          )}
        >
          <Card
            className={cn(
              "overflow-hidden rounded-2xl shadow-sm",
              studyView === "guided" ? "h-full min-h-0" : "min-h-full"
            )}
          >
            <CardContent
              className={cn(
                "p-5 md:p-8",
                studyView === "guided"
                  ? "flex h-full min-h-0 flex-col"
                  : "lg:flex lg:min-h-[calc(100vh-112px)] lg:flex-col"
              )}
            >
              <div className="mx-auto mb-6 flex w-full max-w-4xl shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
                    {studyView === "demonstration"
                      ? "示范诵读"
                      : studyView === "readAlong"
                        ? "跟读训练"
                        : studyView === "guided"
                          ? "语音带学"
                          : material.title}
                  </h1>
                  {studyView === "practice" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {material.level.standardName} · {material.level.optionLabel}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button onClick={() => router.back()} type="button" variant="outline">
                    <ChevronLeft />
                    返回
                  </Button>
                  <Button onClick={copyShareLink} type="button" variant="outline">
                    <Share2 />
                    分享
                  </Button>
                </div>
              </div>
              {studyView === "demonstration" && material.readAlong ? (
                <ReadAlongPanel
                  key="demonstration"
                  onPlaybackRange={(startSeconds, endSeconds, mediaDurationSeconds) => {
                    publishLearningEvent({
                      type: "MEDIA_PROGRESS",
                      partKey: "DEMONSTRATION",
                      startSeconds,
                      endSeconds,
                      mediaDurationSeconds
                    });
                  }}
                  settingsPortalTarget={readAlongSettingsPortalTarget}
                  track={material.readAlong}
                  variant="demonstration"
                />
              ) : studyView === "guided" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    className="min-h-0 flex-1 overscroll-contain overflow-y-auto pr-1"
                    ref={guidedDocumentScrollRef}
                  >
                    <OriginalDocument
                      activePoint={activePoint}
                      activeSentenceId={activeSentence?.id ?? null}
                      material={material}
                      sentences={learningSentences}
                    />
                  </div>
                  <GuidedAudioBar
                    currentTime={currentTime}
                    durationSeconds={durationSeconds}
                    isPlaying={isPlaying}
                    loopMode={loopMode}
                    onChangePlaybackRate={changePlaybackRate}
                    onNextSentence={seekNextSentence}
                    onPreviousSentence={seekPreviousSentence}
                    onSeek={seekTo}
                    onToggleLoopMode={() => setLoopMode((current) => current === "all" ? "sentence" : "all")}
                    onTogglePlayback={togglePlayback}
                    playbackRate={playbackRate}
                    positionLabel={playerPositionLabel}
                  />
                </div>
              ) : studyView === "practice" ? (
                <PracticePanel
                  allQuestions={material.questions}
                  allResult={allPracticeResult}
                  answers={answers}
                  currentQuestionIndex={safeQuestionIndex}
                  onAnswer={answerQuestion}
                  onFindNextUnanswered={findNextUnanswered}
                  onNext={goToNextPracticeQuestion}
                  onPrevious={() => setCurrentQuestionIndex((current) => Math.max(0, current - 1))}
                  onQuestionChange={setCurrentQuestionIndex}
                  onReturnGuided={showGuidedStudy}
                  onRetryWrong={startWrongRetry}
                  onSubmit={submitPractice}
                  onToggleExplanation={toggleExplanation}
                  questions={practiceQuestions}
                  retryMode={Boolean(retryQuestionIds)}
                  submitted={submitted}
                  visibleExplanations={visibleExplanations}
                />
              ) : material.readAlong ? (
                <ReadAlongPanel
                  key="read-along-practice"
                  onCueCompleted={(itemId) => {
                    publishLearningEvent({
                      type: "READ_ALONG_COMPLETED",
                      partKey: "READ_ALONG",
                      itemId
                    });
                  }}
                  settingsPortalTarget={readAlongSettingsPortalTarget}
                  track={material.readAlong}
                  variant="practice"
                />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  当前没有可用的跟读训练。
                </p>
              )}
            </CardContent>
          </Card>
        </main>

        <aside className="flex flex-col gap-5 self-start lg:sticky lg:top-20 lg:h-[calc(100vh-112px)]">
          <Card className="rounded-2xl shadow-sm lg:flex-1">
            <CardHeader className="px-5 py-4">
              <CardTitle className="text-base font-semibold">学习进度</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 text-sm">
              <LearningProgressStep
                active={studyView === "demonstration"}
                description={material.readAlong ? "完整播放跟读训练音频" : "尚未生成"}
                disabled={!material.readAlong}
                icon={Volume2}
                onClick={startDemonstration}
                title="示范诵读"
              />
              <LearningProgressStep
                active={studyView === "guided"}
                description={`已完成 ${completedSentenceCount} / ${learningSentences.length} 句`}
                icon={BookOpen}
                onClick={showGuidedStudy}
                title="语音带学"
              />
              <LearningProgressStep
                active={studyView === "practice"}
                description={
                  material.questions.length === 0
                    ? "尚未生成"
                    : retryQuestionIds
                      ? `已完成 ${practiceQuestions.length - activePracticeResult.unansweredQuestionIds.length} / ${practiceQuestions.length} 道错题`
                      : `已完成 ${answeredCount} / ${material.questions.length} 题`
                }
                disabled={material.questions.length === 0}
                icon={CheckCircle2}
                onClick={startPractice}
                title={retryQuestionIds ? "错题回炉" : "练习巩固"}
              />
              <LearningProgressStep
                active={studyView === "readAlong"}
                description={
                  material.readAlong
                    ? `已生成 ${material.readAlong.cues.length} 段同步字幕`
                    : "尚未生成"
                }
                disabled={!material.readAlong}
                icon={Mic2}
                onClick={startReadAlong}
                title="跟读训练"
              />
              {studyView === "guided" && activePoint ? (
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xl font-semibold leading-7 text-red-600">{activePoint.term}</p>
                  <p className="mt-1 text-sm font-medium">{activePoint.meaning}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activePoint.note}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {studyView === "demonstration" || studyView === "readAlong" ? (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-base font-semibold">操作设置</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div ref={setReadAlongSettingsPortalTarget} />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

    </section>
  );
}

function GuidedAudioBar({
  currentTime,
  durationSeconds,
  isPlaying,
  loopMode,
  onChangePlaybackRate,
  onNextSentence,
  onPreviousSentence,
  onSeek,
  onToggleLoopMode,
  onTogglePlayback,
  playbackRate,
  positionLabel
}: {
  currentTime: number;
  durationSeconds: number;
  isPlaying: boolean;
  loopMode: PlaybackLoopMode;
  onChangePlaybackRate: (rate: (typeof playbackRates)[number]) => void;
  onNextSentence: () => void;
  onPreviousSentence: () => void;
  onSeek: (time: number) => void;
  onToggleLoopMode: () => void;
  onTogglePlayback: () => void;
  playbackRate: (typeof playbackRates)[number];
  positionLabel: string;
}) {
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  useEffect(() => {
    if (!speedMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpeedMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [speedMenuOpen]);

  return (
    <div className="mt-auto grid shrink-0 gap-2 bg-background pt-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <p className="col-start-1 row-start-1 min-w-0 text-left text-xs font-medium text-muted-foreground">
            {positionLabel}
          </p>

          <div className="col-span-2 row-start-2 flex items-center justify-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <PlayerIconButton label="上一句" onClick={onPreviousSentence}><ChevronLeft /></PlayerIconButton>
            <Button aria-label={isPlaying ? "暂停讲解音频" : "播放讲解音频"} className="size-12 rounded-full px-0" onClick={onTogglePlayback} type="button">
              {isPlaying ? <Pause className="size-6" /> : <Play className="size-6" />}
            </Button>
            <PlayerIconButton label="下一句" onClick={onNextSentence}><ChevronRight /></PlayerIconButton>
          </div>

          <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 sm:col-start-3">
            <div className="relative">
              <PlayerIconButton
                active={speedMenuOpen}
                expanded={speedMenuOpen}
                label={`选择语速，当前 ${playbackRate} 倍速`}
                onClick={() => setSpeedMenuOpen((current) => !current)}
              >
                <Gauge />
              </PlayerIconButton>
              {speedMenuOpen ? (
                <div className="absolute bottom-11 right-0 z-10 grid min-w-24 gap-1 rounded-lg border border-border bg-background p-1 text-sm shadow-xl">
                  {playbackRates.map((rate) => (
                    <button
                      aria-pressed={playbackRate === rate}
                      className={cn(
                        "rounded-md px-3 py-2 text-left font-medium transition-colors hover:bg-secondary",
                        playbackRate === rate ? "bg-primary text-primary-foreground hover:bg-primary" : "text-foreground"
                      )}
                      key={rate}
                      onClick={() => { onChangePlaybackRate(rate); setSpeedMenuOpen(false); }}
                      type="button"
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <PlayerIconButton
              active
              label={loopMode === "all" ? "当前为整体循环，点击切换为单句循环" : "当前为单句循环，点击切换为整体循环"}
              onClick={onToggleLoopMode}
            >
              {loopMode === "all" ? <Repeat /> : <Repeat1 />}
            </PlayerIconButton>
          </div>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-xs font-medium text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <input
            aria-label="语音带学播放进度"
            className="block w-full accent-primary"
            max={Math.max(durationSeconds, 1)}
            min={0}
            onChange={(event) => onSeek(Number(event.target.value))}
            type="range"
            value={Math.min(currentTime, Math.max(durationSeconds, 1))}
          />
          <span>{formatTime(durationSeconds)}</span>
        </div>
    </div>
  );
}

function PlayerIconButton({
  active = false,
  children,
  disabled = false,
  expanded,
  label,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  expanded?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-full border transition-colors [&_svg]:size-4",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ReadAlongTimingHint() {
  return (
    <button
      aria-label="跟读时间说明"
      className="group relative inline-flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus:text-foreground"
      type="button"
    >
      <CircleHelp className="size-4" />
      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-64 rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs font-medium leading-5 text-popover-foreground shadow-xl group-hover:block group-focus:block">
        跟读时间为原句时长加上停顿时间
      </span>
    </button>
  );
}

function LearningProgressStep({
  active,
  description,
  disabled = false,
  icon: Icon,
  onClick,
  title
}: {
  active: boolean;
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex w-full gap-3 rounded-xl border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-50"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function OriginalDocument({
  activePoint,
  activeSentenceId,
  material,
  sentences
}: {
  activePoint: EnglishStudyPoint | null;
  activeSentenceId: string | null;
  material: EnglishGuidedStudyMaterial;
  sentences: EnglishStudySentence[];
}) {
  const documentLayout = useMemo(
    () => buildOriginalDocumentLayout(material.sourceText, sentences),
    [material.sourceText, sentences]
  );

  return (
    <article className="mx-auto w-full max-w-4xl px-1 py-2">
      {material.contentTitle || material.author ? (
        <header
          className="mb-8 text-center text-foreground"
          style={{ fontFamily: "var(--font-mulish), Arial, Helvetica, sans-serif" }}
        >
          {material.contentTitle ? (
            <h2 className="text-lg font-semibold leading-relaxed md:text-xl">
              {material.contentTitle}
            </h2>
          ) : null}
          {material.author ? (
            <p className={cn("text-base leading-relaxed md:text-lg", material.contentTitle && "mt-2")}>
              {material.author}
            </p>
          ) : null}
        </header>
      ) : null}
      <div
        className="whitespace-pre-line text-lg leading-9 text-foreground md:text-xl md:leading-10"
        style={{ fontFamily: "var(--font-mulish), Arial, Helvetica, sans-serif" }}
      >
        {sentences.map((sentence, index) => (
          <OriginalSentence
            activePoint={activeSentenceId === sentence.id ? activePoint : null}
            activeSentence={activeSentenceId === sentence.id}
            key={sentence.id}
            separatorAfter={documentLayout[index]?.separatorAfter ?? (index < sentences.length - 1 ? " " : "")}
            sentence={sentence}
            text={documentLayout[index]?.text ?? sentence.text}
          />
        ))}
      </div>
    </article>
  );
}

function OriginalSentence({
  activePoint,
  activeSentence,
  sentence,
  separatorAfter,
  text
}: {
  activePoint: EnglishStudyPoint | null;
  activeSentence: boolean;
  sentence: EnglishStudySentence;
  separatorAfter: "" | " " | "\n";
  text: string;
}) {
  return (
    <>
      <span
        aria-current={activeSentence ? "true" : undefined}
        className={cn("scroll-mt-32 box-decoration-clone rounded-sm px-1 py-0.5 transition-colors", activeSentence ? "bg-yellow-100 text-yellow-950 ring-1 ring-yellow-200" : "")}
        data-study-sentence-id={sentence.id}
      >
        {renderHighlightedText(text, activePoint)}
      </span>
      {separatorAfter}
    </>
  );
}

function renderReadAlongWords(
  cue: EnglishReadAlongTrack["cues"][number],
  activeWordIndex: number
) {
  if (cue.words.length === 0) return cue.text;

  const content: React.ReactNode[] = [];
  let cursor = 0;

  cue.words.forEach((word, index) => {
    if (word.startChar > cursor) {
      content.push(cue.text.slice(cursor, word.startChar));
    }

    content.push(
      <span
        aria-current={index === activeWordIndex ? "true" : undefined}
        className={cn(
          "box-decoration-clone rounded-sm px-0.5 transition-colors duration-75",
          index === activeWordIndex ? "bg-yellow-200 text-yellow-950" : ""
        )}
        key={`${cue.id}-${word.startChar}-${word.endChar}`}
      >
        {cue.text.slice(word.startChar, word.endChar)}
      </span>
    );
    cursor = word.endChar;
  });

  if (cursor < cue.text.length) content.push(cue.text.slice(cursor));
  return content;
}

function ReadAlongPanel({
  onCueCompleted,
  onPlaybackRange,
  settingsPortalTarget,
  track,
  variant
}: {
  onCueCompleted?: (itemId: string) => void;
  onPlaybackRange?: (
    startSeconds: number,
    endSeconds: number,
    mediaDurationSeconds: number
  ) => void;
  settingsPortalTarget: HTMLElement | null;
  track: EnglishReadAlongTrack;
  variant: "demonstration" | "practice";
}) {
  const [demonstrationMode, setDemonstrationMode] = useState<DemonstrationPlaybackMode>("once");
  const [readAlongPlaybackMode, setReadAlongPlaybackMode] = useState<ReadAlongPlaybackMode>("sentence-repeat");
  const [readAlongTimingMode, setReadAlongTimingMode] = useState<ReadAlongTimingMode>("pause");
  const [pauseExtraSeconds, setPauseExtraSeconds] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(1);
  const [cueIndex, setCueIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeWordIndexRef = useRef(-1);
  const cueIndexRef = useRef(0);
  const continuePlaybackRef = useRef(false);
  const followWaitTimerRef = useRef<number | null>(null);
  const pendingFollowCueIndexRef = useRef<number | null>(null);
  const pendingLocalTimeRef = useRef(0);
  const completedCueIdsRef = useRef(new Set<string>());
  const playbackRangeStartRef = useRef<number | null>(null);
  const playbackRangeEndRef = useRef<number | null>(null);
  const usesNodeAudio = track.source === "GENERATED" && track.nodes.length === track.cues.length;
  const cue = track.cues[cueIndex] ?? track.cues[0];
  const node = usesNodeAudio ? track.nodes[cueIndex] ?? track.nodes[0] : null;
  const audioUrl = node?.audioUrl ?? track.audioUrl;
  const durationSeconds = track.durationMs / 1000;
  const demonstrationSentenceLoop = variant === "demonstration" && demonstrationMode === "sentence";
  const readAlongSentenceLoop = variant === "practice" &&
    readAlongPlaybackMode === "sentence-repeat";
  const loopsCurrentCue = demonstrationSentenceLoop || readAlongSentenceLoop;
  const loopsWholeTrack = variant === "demonstration"
    ? demonstrationMode === "all"
    : readAlongPlaybackMode === "all-repeat";
  const sequentialPlayback = !loopsCurrentCue;

  useEffect(() => {
    if (followWaitTimerRef.current !== null) window.clearTimeout(followWaitTimerRef.current);
    followWaitTimerRef.current = null;
    continuePlaybackRef.current = false;
    pendingFollowCueIndexRef.current = null;
    cueIndexRef.current = 0;
    setCueIndex(0);
    setCurrentTime(0);
    setActiveWord(-1);
    setIsPlaying(false);
    setIsWaiting(false);
    pendingLocalTimeRef.current = 0;
    completedCueIdsRef.current.clear();
    playbackRangeStartRef.current = null;
    playbackRangeEndRef.current = null;
  }, [track]);

  useEffect(() => {
    cueIndexRef.current = cueIndex;
  }, [cueIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.load();
  }, [audioUrl]);

  useEffect(() => () => {
    audioRef.current?.pause();
    continuePlaybackRef.current = false;
    pendingFollowCueIndexRef.current = null;
    if (followWaitTimerRef.current !== null) window.clearTimeout(followWaitTimerRef.current);
    followWaitTimerRef.current = null;
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement === panelRef.current;
      setIsFullscreen(active);
      if (!active) setFullscreenControlsVisible(false);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen || document.fullscreenElement) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isPlaying || !cue) return;

    let frameId = 0;
    const updateWordHighlight = () => {
      const audio = audioRef.current;
      if (!audio) return;

      const globalTime = usesNodeAudio ? cue.startSeconds + audio.currentTime : audio.currentTime;

      if (
        variant === "practice" &&
        shouldWaitAtReadAlongBoundary(
          readAlongTimingMode,
          usesNodeAudio,
          globalTime,
          cue.endSeconds,
          cueIndexRef.current === cueIndex,
          loopsCurrentCue
        )
      ) {
        scheduleReadAlongAdvance();
        return;
      }

      const position = usesNodeAudio
        ? readAlongPlaybackPositionAtTime([cue], globalTime)
        : readAlongPlaybackPositionAtTime(track.cues, globalTime);
      const nextCueIndex = usesNodeAudio ? cueIndex : Math.max(0, position.cueIndex);
      if (nextCueIndex !== cueIndex) {
        cueIndexRef.current = nextCueIndex;
        setCueIndex(nextCueIndex);
      }
      setActiveWord(position.wordIndex);
      frameId = window.requestAnimationFrame(updateWordHighlight);
    };

    frameId = window.requestAnimationFrame(updateWordHighlight);
    return () => window.cancelAnimationFrame(frameId);
  }, [cue, cueIndex, delaySeconds, isPlaying, pauseExtraSeconds, readAlongPlaybackMode, readAlongTimingMode, track.cues, usesNodeAudio, variant]);

  function setActiveWord(index: number) {
    if (activeWordIndexRef.current === index) return;
    activeWordIndexRef.current = index;
    setActiveWordIndex(index);
  }

  function clearFollowWait(preservePendingCue = false) {
    if (followWaitTimerRef.current !== null) {
      window.clearTimeout(followWaitTimerRef.current);
    }
    followWaitTimerRef.current = null;
    if (!preservePendingCue) pendingFollowCueIndexRef.current = null;
    setIsWaiting(false);
  }

  function selectCue(nextIndex: number, keepPlaying = isPlaying, localTime = 0) {
    flushDemonstrationPlayback();
    clearFollowWait();
    const safeIndex = Math.max(0, Math.min(nextIndex, track.cues.length - 1));
    const nextCue = track.cues[safeIndex];
    const audio = audioRef.current;

    if (!nextCue || !audio) return;

    cueIndexRef.current = safeIndex;
    const globalTime = nextCue.startSeconds + Math.max(0, localTime);
    setActiveWord(readAlongPlaybackPositionAtTime([nextCue], globalTime).wordIndex);

    if (usesNodeAudio) {
      const safeLocalTime = Math.max(
        0,
        Math.min(localTime, (track.nodes[safeIndex]?.durationMs ?? 0) / 1000)
      );
      pendingLocalTimeRef.current = safeLocalTime;
      continuePlaybackRef.current = keepPlaying;
      setCurrentTime(nextCue.startSeconds + safeLocalTime);

      if (safeIndex === cueIndex) {
        continuePlaybackRef.current = false;
        audio.currentTime = safeLocalTime;

        if (keepPlaying) {
          void audio.play().catch(() => setIsPlaying(false));
        }
      } else {
        audio.pause();
        setCueIndex(safeIndex);
      }
      return;
    }

    setCueIndex(safeIndex);
    audio.currentTime = nextCue.startSeconds;
    setCurrentTime(nextCue.startSeconds);

    if (keepPlaying) {
      void audio.play().catch(() => setIsPlaying(false));
    }
  }

  function scheduleReadAlongAdvance() {
    if (!cue || followWaitTimerRef.current !== null) return;
    recordCompletedCue(cue);

    const audio = audioRef.current;
    const nextIndex = nextReadAlongCueIndex(cueIndex, track.cues.length, readAlongPlaybackMode);
    const waitSeconds = readAlongWaitSeconds(
      readAlongTimingMode,
      cue.endSeconds - cue.startSeconds,
      pauseExtraSeconds,
      delaySeconds
    );

    audio?.pause();
    setIsPlaying(false);
    setCurrentTime(cue.endSeconds);

    if (nextIndex === null) {
      pendingFollowCueIndexRef.current = null;
      setIsWaiting(false);
      return;
    }

    const resume = () => {
      followWaitTimerRef.current = null;
      pendingFollowCueIndexRef.current = null;
      setIsWaiting(false);
      selectCue(nextIndex, true, 0);
    };

    if (waitSeconds <= 0) {
      resume();
      return;
    }

    clearFollowWait();
    pendingFollowCueIndexRef.current = nextIndex;
    setIsWaiting(true);
    followWaitTimerRef.current = window.setTimeout(resume, waitSeconds * 1000);
  }

  function togglePlayback() {
    if (followWaitTimerRef.current !== null) {
      clearFollowWait(true);
      continuePlaybackRef.current = false;
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    const pendingCueIndex = pendingFollowCueIndexRef.current;
    if (pendingCueIndex !== null) {
      pendingFollowCueIndexRef.current = null;
      selectCue(pendingCueIndex, true, 0);
      return;
    }

    clearFollowWait();
    const audio = audioRef.current;
    if (!audio || !cue) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    if (usesNodeAudio) {
      if (
        sequentialPlayback &&
        sequentialPlaybackFinished(
          cueIndex,
          track.cues.length,
          audio.currentTime,
          (node?.durationMs ?? 0) / 1000
        )
      ) {
        if (track.cues.length === 1) {
          audio.currentTime = 0;
          setCurrentTime(0);
          void audio.play().catch(() => setIsPlaying(false));
          return;
        }

        continuePlaybackRef.current = true;
        pendingLocalTimeRef.current = 0;
        setCurrentTime(0);
        setCueIndex(0);
        return;
      }

      if (audio.currentTime >= (node?.durationMs ?? 0) / 1000 - 0.05) {
        audio.currentTime = 0;
        setCurrentTime(cue.startSeconds);
      }
    } else if (
      (loopsCurrentCue &&
        (audio.currentTime < cue.startSeconds || audio.currentTime >= cue.endSeconds - 0.05)) ||
      (sequentialPlayback && audio.currentTime >= durationSeconds - 0.05)
    ) {
      const startTime = loopsCurrentCue ? cue.startSeconds : 0;
      audio.currentTime = startTime;
      setCurrentTime(startTime);
    }

    void audio.play().catch(() => setIsPlaying(false));
  }

  function handleTimeUpdate(event: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;

    if (usesNodeAudio && cue) {
      const globalTime = cue.startSeconds + audio.currentTime;
      setCurrentTime(globalTime);
      setActiveWord(readAlongPlaybackPositionAtTime([cue], globalTime).wordIndex);
      trackDemonstrationPlayback(globalTime);
      return;
    }

    const nextTime = audio.currentTime;

    if (
      variant === "practice" &&
      cue &&
      shouldWaitAtReadAlongBoundary(
        readAlongTimingMode,
        usesNodeAudio,
        nextTime,
        cue.endSeconds,
        cueIndexRef.current === cueIndex,
        loopsCurrentCue
      )
    ) {
      scheduleReadAlongAdvance();
      return;
    }

    if (loopsCurrentCue && cue && nextTime >= cue.endSeconds - 0.06) {
      recordCompletedCue(cue);
      trackDemonstrationPlayback(nextTime);
      flushDemonstrationPlayback(nextTime);
      audio.currentTime = cue.startSeconds;
      setCurrentTime(cue.startSeconds);
      setActiveWord(readAlongPlaybackPositionAtTime([cue], cue.startSeconds).wordIndex);
      return;
    }

    setCurrentTime(nextTime);
    const position = readAlongPlaybackPositionAtTime(track.cues, nextTime);
    const activeIndex = position.cueIndex;

    if (activeIndex >= 0 && activeIndex !== cueIndex) {
      if (activeIndex > cueIndex && cue) recordCompletedCue(cue);
      cueIndexRef.current = activeIndex;
      setCueIndex(activeIndex);
    }
    setActiveWord(position.wordIndex);
    trackDemonstrationPlayback(nextTime);
  }

  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;

    if (usesNodeAudio) {
      audio.currentTime = Math.min(
        pendingLocalTimeRef.current,
        Number.isFinite(audio.duration) ? audio.duration : pendingLocalTimeRef.current
      );
    }

    if (continuePlaybackRef.current) {
      continuePlaybackRef.current = false;
      void audio.play().catch(() => setIsPlaying(false));
    }
  }

  function handleEnded() {
    if (cue) recordCompletedCue(cue);
    flushDemonstrationPlayback(cue?.endSeconds ?? durationSeconds);
    if (variant === "practice" && readAlongTimingMode !== "shadow") {
      scheduleReadAlongAdvance();
      return;
    }

    if (usesNodeAudio && sequentialPlayback && cueIndex < track.cues.length - 1) {
      continuePlaybackRef.current = true;
      pendingLocalTimeRef.current = 0;
      setCueIndex((current) => current + 1);
      return;
    }

    if (loopsCurrentCue && audioRef.current && cue) {
      audioRef.current.currentTime = usesNodeAudio ? 0 : cue.startSeconds;
      setCurrentTime(cue.startSeconds);
      setActiveWord(readAlongPlaybackPositionAtTime([cue], cue.startSeconds).wordIndex);
      void audioRef.current.play().catch(() => setIsPlaying(false));
      return;
    }

    if (loopsWholeTrack) {
      if (usesNodeAudio) {
        if (track.cues.length === 1 && audioRef.current) {
          audioRef.current.currentTime = 0;
          setCurrentTime(0);
          void audioRef.current.play().catch(() => setIsPlaying(false));
          return;
        }

        continuePlaybackRef.current = true;
        pendingLocalTimeRef.current = 0;
        setCurrentTime(0);
        setCueIndex(0);
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
        void audioRef.current.play().catch(() => setIsPlaying(false));
      }
      return;
    }

    setIsPlaying(false);
    setCurrentTime(cue?.endSeconds ?? durationSeconds);
    setActiveWord(cue
      ? readAlongPlaybackPositionAtTime([cue], cue.endSeconds).wordIndex
      : -1);
  }

  function seekGlobalTime(nextTime: number) {
    flushDemonstrationPlayback();
    clearFollowWait();
    continuePlaybackRef.current = false;
    const safeTime = Math.max(0, Math.min(nextTime, durationSeconds));
    const position = readAlongPlaybackPositionAtTime(track.cues, safeTime);
    const nextCueIndex = Math.max(0, position.cueIndex);
    const nextCue = track.cues[nextCueIndex];

    if (!nextCue) return;

    setActiveWord(position.wordIndex);

    if (usesNodeAudio) {
      selectCue(nextCueIndex, isPlaying, Math.max(0, safeTime - nextCue.startSeconds));
      return;
    }

    setCueIndex(nextCueIndex);
    setCurrentTime(safeTime);
    if (audioRef.current) audioRef.current.currentTime = safeTime;
  }

  function recordCompletedCue(completedCue: EnglishReadAlongTrack["cues"][number]) {
    if (variant !== "practice" || completedCueIdsRef.current.has(completedCue.id)) return;
    completedCueIdsRef.current.add(completedCue.id);
    onCueCompleted?.(completedCue.id);
  }

  function trackDemonstrationPlayback(globalTime: number) {
    if (variant !== "demonstration" || !isPlaying) return;
    const previous = playbackRangeEndRef.current;
    if (previous !== null && (globalTime < previous || globalTime - previous > 2)) {
      flushDemonstrationPlayback(previous);
      playbackRangeStartRef.current = globalTime;
    } else if (playbackRangeStartRef.current === null) {
      playbackRangeStartRef.current = globalTime;
    }
    playbackRangeEndRef.current = globalTime;
    if (globalTime - (playbackRangeStartRef.current ?? globalTime) >= 5) {
      flushDemonstrationPlayback(globalTime);
      playbackRangeStartRef.current = globalTime;
      playbackRangeEndRef.current = globalTime;
    }
  }

  function flushDemonstrationPlayback(endSeconds?: number) {
    const startSeconds = playbackRangeStartRef.current;
    const finalSeconds = endSeconds ?? playbackRangeEndRef.current;
    playbackRangeStartRef.current = null;
    playbackRangeEndRef.current = null;
    if (variant !== "demonstration" || startSeconds === null || finalSeconds === null) return;
    const range = flushGuidedStudyPlaybackRange(startSeconds, finalSeconds, true);
    if (range && durationSeconds > 0) {
      onPlaybackRange?.(range.startSeconds, range.endSeconds, durationSeconds);
    }
  }

  function changeReadAlongPlaybackMode(nextMode: ReadAlongPlaybackMode) {
    clearFollowWait();
    continuePlaybackRef.current = false;
    audioRef.current?.pause();
    setIsPlaying(false);
    setReadAlongPlaybackMode(nextMode);
    selectCue(nextMode === "sentence-repeat" ? cueIndex : 0, false);
  }

  function changeReadAlongTimingMode(nextMode: ReadAlongTimingMode) {
    clearFollowWait();
    continuePlaybackRef.current = false;
    audioRef.current?.pause();
    setIsPlaying(false);
    setReadAlongTimingMode(nextMode);
  }

  function changeDemonstrationMode(nextMode: DemonstrationPlaybackMode) {
    clearFollowWait();
    continuePlaybackRef.current = false;
    audioRef.current?.pause();
    setIsPlaying(false);
    setDemonstrationMode(nextMode);
    selectCue(nextMode === "sentence" ? cueIndex : 0, false);
  }

  function seekDisplayedTime(nextTime: number) {
    if (loopsCurrentCue && cue) {
      const safeGlobalTime = Math.min(
        Math.max(cue.startSeconds, nextTime),
        Math.max(cue.startSeconds, cue.endSeconds - 0.01)
      );
      seekGlobalTime(safeGlobalTime);
      return;
    }

    seekGlobalTime(nextTime);
  }

  async function toggleFullscreen() {
    const panel = panelRef.current;
    if (!panel) return;

    if (isFullscreen) {
      if (document.fullscreenElement === panel && typeof document.exitFullscreen === "function") {
        await document.exitFullscreen().catch(() => undefined);
      }
      setIsFullscreen(false);
      setFullscreenControlsVisible(false);
      return;
    }

    setFullscreenControlsVisible(false);

    if (typeof panel.requestFullscreen === "function") {
      try {
        await panel.requestFullscreen();
        setIsFullscreen(true);
        return;
      } catch {
        // 移动端浏览器拒绝原生全屏时使用页面内沉浸模式。
      }
    }

    setIsFullscreen(true);
  }

  if (!cue) {
    return <p className="py-12 text-center text-sm text-muted-foreground">当前没有可用的跟读字幕。</p>;
  }

  const displayedDuration = durationSeconds;
  const displayedCurrentTime = currentTime;
  const bodyCues = track.cues.filter((item) => item.unitType === "BODY");
  const bodyCueIndex = bodyCues.findIndex((item) => item.id === cue.id);
  const positionLabel = cue.unitType === "TITLE"
    ? "标题"
    : cue.unitType === "AUTHOR"
      ? "作者"
      : `第 ${Math.max(1, bodyCueIndex + 1)} / ${bodyCues.length} 句`;
  const playbackActive = isPlaying || isWaiting;
  const playbackActionButtons = (
    <>
      <PlayerIconButton
        disabled={cueIndex === 0}
        label="上一句"
        onClick={() => selectCue(cueIndex - 1)}
      >
        <ChevronLeft />
      </PlayerIconButton>
      <Button
        aria-label={playbackActive ? "暂停诵读音频" : "播放诵读音频"}
        className="size-12 rounded-full px-0"
        onClick={togglePlayback}
        type="button"
      >
        {playbackActive ? <Pause className="size-6" /> : <Play className="size-6" />}
      </Button>
      <PlayerIconButton
        disabled={cueIndex === track.cues.length - 1}
        label="下一句"
        onClick={() => selectCue(cueIndex + 1)}
      >
        <ChevronRight />
      </PlayerIconButton>
    </>
  );

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5",
        isFullscreen && "fixed inset-0 z-[2147483646] h-[100dvh] max-w-none gap-0 bg-background p-6"
      )}
      ref={panelRef}
    >
      {!isFullscreen && settingsPortalTarget
        ? createPortal(
          variant === "demonstration" ? (
            <div
              aria-label="示范诵读循环方式"
              className="grid w-full grid-cols-3 gap-1 rounded-lg bg-secondary p-1"
              role="group"
            >
              <button
                aria-pressed={demonstrationMode === "once"}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium transition-colors",
                  demonstrationMode === "once" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => changeDemonstrationMode("once")}
                type="button"
              >
                整体单次
              </button>
              <button
                aria-pressed={demonstrationMode === "sentence"}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium transition-colors",
                  demonstrationMode === "sentence" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => changeDemonstrationMode("sentence")}
                type="button"
              >
                单句循环
              </button>
              <button
                aria-pressed={demonstrationMode === "all"}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium transition-colors",
                  demonstrationMode === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => changeDemonstrationMode("all")}
                type="button"
              >
                整体循环
              </button>
            </div>
          ) : (
            <div className="grid gap-5">
              <div aria-label="跟读播放方式" className="grid w-full grid-cols-3 gap-1 rounded-lg bg-secondary p-1" role="group">
                {([
                  ["sentence-repeat", "单句重复"],
                  ["all-repeat", "整体重复"],
                  ["all-once", "整体播完"]
                ] as const).map(([value, label]) => (
                  <button
                    aria-pressed={readAlongPlaybackMode === value}
                    className={cn(
                      "h-9 rounded-md px-2 text-sm font-medium transition-colors",
                      readAlongPlaybackMode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                    key={value}
                    onClick={() => changeReadAlongPlaybackMode(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <span>跟读时间</span>
                  <ReadAlongTimingHint />
                </div>
                <div aria-label="跟读时间模式" className="grid w-full grid-cols-3 gap-1 rounded-lg bg-secondary p-1" role="group">
                  {([
                    ["pause", "停顿跟读"],
                    ["delay", "延迟跟读"],
                    ["shadow", "影子跟读"]
                  ] as const).map(([value, label]) => (
                    <button
                      aria-pressed={readAlongTimingMode === value}
                      className={cn(
                        "h-9 min-w-0 rounded-md px-1 text-xs font-medium transition-colors",
                        readAlongTimingMode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                      )}
                      key={value}
                      onClick={() => changeReadAlongTimingMode(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {readAlongTimingMode === "pause" ? (
                  <label className="grid gap-2 text-sm font-semibold">
                    <span>附加时长</span>
                    <Select aria-label="停顿跟读附加时长" onChange={(event) => setPauseExtraSeconds(Number(event.target.value))} value={pauseExtraSeconds}>
                      {Array.from({ length: 11 }, (_, seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
                    </Select>
                  </label>
                ) : readAlongTimingMode === "delay" ? (
                  <label className="grid gap-2 text-sm font-semibold">
                    <span>延迟时间</span>
                    <Select aria-label="延迟跟读时间" onChange={(event) => setDelaySeconds(Number(event.target.value))} value={delaySeconds}>
                      {Array.from({ length: 5 }, (_, index) => index + 1).map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
                    </Select>
                  </label>
                ) : null}
              </div>
            </div>
          ),
          settingsPortalTarget
        )
        : null}

      <div
        className={cn(
          "relative flex min-h-[280px] flex-1 flex-col items-center justify-center px-4 py-10 text-center",
          isFullscreen && "min-h-0 flex-1 cursor-pointer border-0"
        )}
        onClick={isFullscreen ? () => setFullscreenControlsVisible((visible) => !visible) : undefined}
      >
        <p
          className={cn(
            "max-w-3xl text-2xl leading-relaxed md:text-3xl",
            isFullscreen && "max-w-5xl text-4xl leading-relaxed md:text-6xl",
            cue.unitType === "TITLE" ? "font-bold" : cue.unitType === "AUTHOR" ? "font-medium" : "font-semibold"
          )}
          style={{ fontFamily: "var(--font-mulish), Arial, Helvetica, sans-serif" }}
        >
          {renderReadAlongWords(cue, activeWordIndex)}
        </p>
        {isFullscreen && fullscreenControlsVisible ? (
          <div
            className="absolute bottom-10 flex items-center gap-3 rounded-full border border-border bg-background/95 p-3 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            {playbackActionButtons}
            <PlayerIconButton label="退出全屏" onClick={() => void toggleFullscreen()}>
              <Minimize2 />
            </PlayerIconButton>
          </div>
        ) : null}
      </div>

      {!isFullscreen ? (
        <div className="mt-auto grid gap-2 pt-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <p className="col-start-1 row-start-1 min-w-0 text-left text-xs font-medium text-muted-foreground">
              {positionLabel}
            </p>
            <div className="col-span-2 row-start-2 flex items-center justify-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              {playbackActionButtons}
            </div>
            <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 sm:col-start-3">
              <PlayerIconButton label="全屏" onClick={() => void toggleFullscreen()}>
                <Maximize2 />
              </PlayerIconButton>
            </div>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-xs font-medium text-muted-foreground">
            <span>{formatTime(displayedCurrentTime)}</span>
            <input
              aria-label="跟读训练播放进度"
              className="block w-full accent-primary"
              max={Math.max(displayedDuration, 1)}
              min={0}
              onChange={(event) => seekDisplayedTime(Number(event.target.value))}
              step={0.05}
              type="range"
              value={Math.min(displayedCurrentTime, Math.max(displayedDuration, 1))}
            />
            <span>{formatTime(displayedDuration)}</span>
          </div>
        </div>
      ) : null}

      <audio
        className="hidden"
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => {
          flushDemonstrationPlayback();
          setIsPlaying(false);
        }}
        onPlay={() => {
          setIsWaiting(false);
          setIsPlaying(true);
          const startSeconds = usesNodeAudio && cue
            ? cue.startSeconds + (audioRef.current?.currentTime ?? 0)
            : (audioRef.current?.currentTime ?? 0);
          playbackRangeStartRef.current = startSeconds;
          playbackRangeEndRef.current = startSeconds;
        }}
        onSeeking={() => flushDemonstrationPlayback()}
        onTimeUpdate={handleTimeUpdate}
        preload="metadata"
        ref={audioRef}
        src={audioUrl}
      />
      {usesNodeAudio && track.nodes[cueIndex + 1]?.audioUrl ? (
        <audio className="hidden" preload="auto" src={track.nodes[cueIndex + 1]!.audioUrl} />
      ) : null}
    </div>
  );
}

function PracticePanel({
  allQuestions,
  allResult,
  answers,
  currentQuestionIndex,
  onAnswer,
  onFindNextUnanswered,
  onNext,
  onPrevious,
  onQuestionChange,
  onReturnGuided,
  onRetryWrong,
  onSubmit,
  onToggleExplanation,
  questions,
  retryMode,
  submitted,
  visibleExplanations
}: {
  allQuestions: EnglishStudyQuestion[];
  allResult: ReturnType<typeof practiceResult>;
  answers: Record<string, number>;
  currentQuestionIndex: number;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onFindNextUnanswered: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onQuestionChange: (index: number) => void;
  onReturnGuided: () => void;
  onRetryWrong: () => void;
  onSubmit: () => void;
  onToggleExplanation: (questionId: string) => void;
  questions: EnglishStudyQuestion[];
  retryMode: boolean;
  submitted: boolean;
  visibleExplanations: Record<string, boolean>;
}) {
  const question = questions[currentQuestionIndex];
  const currentResult = practiceResult(questions, answers);
  const answeredInRound = questions.length - currentResult.unansweredQuestionIds.length;

  if (!question) {
    return <p className="py-12 text-center text-sm text-muted-foreground">当前没有可用练习题。</p>;
  }

  const selected = answers[question.id];
  const isCorrect = submitted && selected === question.answer;
  const isWrong = submitted && selected !== undefined && selected !== question.answer;
  const allCorrect = submitted && allResult.unansweredQuestionIds.length === 0 && allResult.wrongQuestionIds.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">{retryMode ? "错题回炉" : "练习巩固"}</p>
          <p className="mt-1 text-sm text-muted-foreground">已完成 {answeredInRound} / {questions.length} 题</p>
        </div>
        {submitted ? <Badge>本轮答对 {currentResult.correctCount} / {questions.length}</Badge> : null}
      </div>

      <div aria-label="题号导航" className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {questions.map((item, index) => {
          const answered = answers[item.id] !== undefined;
          const correct = submitted && answers[item.id] === item.answer;
          const wrong = submitted && answered && !correct;

          return (
            <button
              aria-current={index === currentQuestionIndex ? "step" : undefined}
              aria-label={`第 ${index + 1} 题${answered ? "，已作答" : "，未作答"}`}
              className={cn(
                "h-9 rounded-md border text-sm font-semibold transition-colors",
                index === currentQuestionIndex ? "border-primary ring-2 ring-primary/20" : "border-border",
                answered && !submitted ? "bg-secondary" : "bg-card",
                correct ? "border-blue-200 bg-blue-50 text-blue-700" : "",
                wrong ? "border-red-200 bg-red-50 text-red-700" : ""
              )}
              key={item.id}
              onClick={() => onQuestionChange(index)}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      {submitted ? (
        <PracticeSummary
          allCorrect={allCorrect}
          allQuestions={allQuestions}
          allResult={allResult}
          onReturnGuided={onReturnGuided}
          onRetryWrong={onRetryWrong}
        />
      ) : null}

      <div className="rounded-lg border border-border bg-background p-4 md:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold">{currentQuestionIndex + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="font-medium leading-7">{question.question}</p>
              {isCorrect ? <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600"><CheckCircle2 className="size-4" />正确</span> : null}
              {isWrong ? <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600"><XCircle className="size-4" />错误</span> : null}
            </div>
            <div className="mt-4 grid gap-2">
              {question.options.map((option, optionIndex) => {
                const selectedOption = selected === optionIndex;
                const correctOption = submitted && question.answer === optionIndex;
                const wrongOption = submitted && selectedOption && question.answer !== optionIndex;

                return (
                  <button
                    aria-pressed={selectedOption}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
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
                    {correctOption ? <CheckCircle2 className="size-4 shrink-0 text-blue-600" /> : null}
                    {wrongOption ? <XCircle className="size-4 shrink-0 text-red-600" /> : null}
                  </button>
                );
              })}
            </div>
            {submitted && isWrong ? <p className="mt-3 text-sm font-medium text-blue-600">正确答案：{question.options[question.answer]}</p> : null}
            {submitted ? (
              <div className="mt-4">
                <Button onClick={() => onToggleExplanation(question.id)} size="sm" variant="outline">
                  {visibleExplanations[question.id] ? "收起讲解" : "查看讲解"}
                </Button>
                {visibleExplanations[question.id] ? (
                  <p className="mt-3 rounded-md bg-secondary p-3 text-sm leading-6 text-muted-foreground">{question.explanation}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button disabled={currentQuestionIndex === 0} onClick={onPrevious} type="button" variant="outline">
          <ChevronLeft />上一题
        </Button>
        {!submitted && currentResult.unansweredQuestionIds.length === 0 ? (
          <Button onClick={onSubmit} type="button"><CheckCircle2 />提交练习</Button>
        ) : currentQuestionIndex < questions.length - 1 ? (
          <Button onClick={onNext} type="button">下一题<ChevronRight /></Button>
        ) : !submitted ? (
          <Button onClick={onFindNextUnanswered} type="button">检查未答题<ChevronRight /></Button>
        ) : (
          <Button disabled type="button" variant="outline">已到最后一题</Button>
        )}
      </div>
    </div>
  );
}

function PracticeSummary({
  allCorrect,
  allQuestions,
  allResult,
  onReturnGuided,
  onRetryWrong
}: {
  allCorrect: boolean;
  allQuestions: EnglishStudyQuestion[];
  allResult: ReturnType<typeof practiceResult>;
  onReturnGuided: () => void;
  onRetryWrong: () => void;
}) {
  const wrongQuestions = allQuestions.filter((question) => allResult.wrongQuestionIds.includes(question.id));

  return (
    <div className={cn("rounded-lg border p-4", allCorrect ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{allCorrect ? "练习巩固已完成" : `还需要复习 ${wrongQuestions.length} 个知识点`}</p>
          <p className="mt-1 text-sm text-muted-foreground">总成绩 {allResult.correctCount} / {allQuestions.length}</p>
        </div>
        {allCorrect ? (
          <Button onClick={onReturnGuided} size="sm" type="button" variant="outline"><Volume2 />返回带学</Button>
        ) : (
          <Button onClick={onRetryWrong} size="sm" type="button"><RotateCcw />重做错题</Button>
        )}
      </div>
      {wrongQuestions.length > 0 ? (
        <div className="mt-3 border-t border-amber-200 pt-3">
          <p className="text-xs font-semibold text-muted-foreground">建议重点复习</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {wrongQuestions.slice(0, 3).map((question) => <li key={question.id}>· {question.question}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function findActiveTimelineSegment(timeline: EnglishAudioTimelineSegment[], currentTime: number) {
  return timeline.find((segment) => currentTime >= segment.startSeconds && currentTime < segment.endSeconds) ?? null;
}

function findActiveSentence(
  sentences: EnglishStudySentence[],
  activeTimelineSegment: EnglishAudioTimelineSegment | null,
  currentTime: number
) {
  if (activeTimelineSegment) {
    return sentences.find((sentence) => sentence.id === activeTimelineSegment.sentenceId) ?? null;
  }

  return sentences.find((sentence) => currentTime >= sentence.startSeconds && currentTime < sentence.endSeconds)
    ?? sentences[0]
    ?? null;
}

function findActivePoint(
  sentence: EnglishStudySentence | null,
  activeTimelineSegment: EnglishAudioTimelineSegment | null,
  currentTime: number
) {
  if (!sentence) return null;
  const activeTerm = activeTimelineSegment?.terms.find((term) => currentTime >= term.startSeconds && currentTime < term.endSeconds);
  if (activeTerm) {
    return sentence.points.find((point) => point.id === activeTerm.pointId || point.term === activeTerm.term) ?? null;
  }
  return sentence.points.find((point) => currentTime >= point.startSeconds && currentTime < point.endSeconds) ?? null;
}

function findNodeFocusPoint(sentence: EnglishStudySentence | null, node: EnglishNarrationNode | null) {
  if (!sentence || !node?.focus) return null;
  const focusText = node.focus.text.trim().toLowerCase();

  return sentence.points.find((point) =>
    (node.focus?.pointId && point.id === node.focus.pointId) ||
    point.term.trim().toLowerCase() === focusText
  ) ?? null;
}

function completedNodeSentenceCount(nodes: EnglishNarrationNode[], furthestTime: number) {
  const sentenceEndTimes = new Map<string, number>();
  let elapsed = 0;

  for (const node of nodes) {
    elapsed += node.durationMs / 1000;
    if (node.sentenceId) sentenceEndTimes.set(node.sentenceId, elapsed);
  }

  return Array.from(sentenceEndTimes.values()).filter((endTime) => furthestTime >= endTime - 0.05).length;
}

function renderHighlightedText(text: string, activePoint: EnglishStudyPoint | null) {
  if (!activePoint) return text;
  const lower = text.toLowerCase();
  const term = activePoint.term.toLowerCase();
  const index = lower.indexOf(term);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <strong className="font-semibold text-red-600">{text.slice(index, index + activePoint.term.length)}</strong>
      {text.slice(index + activePoint.term.length)}
    </>
  );
}

function progressStorageKey(materialId: string) {
  return `xueleai:english-guided-study:progress:${materialId}`;
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
