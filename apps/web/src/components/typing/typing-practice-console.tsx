"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Headphones,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Volume2,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  advanceTypingSession,
  finishTypingSession,
  getTypingSession,
  pauseTypingSession,
  requestTypingHint,
  resumeTypingSession,
  submitTypingAttempt,
  type TypingQuestion,
  type TypingSession
} from "@/lib/typing-api";
import {
  assembleTypingAnswer,
  buildTypingCharacterFeedback,
  focusTypingInput,
  initialTypingPracticeState,
  isEnglishTypingInput,
  typingPracticeReducer,
  type TypingCharacterError,
  type TypingPracticeErrorResult
} from "@/lib/typing-practice-state";
import { parseTypingVoice, typingVoiceKey, typingVoices, typingAudioUrl, type TypingVoice, parseTypingPracticeMode, typingPracticeModeKey, typingPracticeModes, typingPracticePresentation, type TypingPracticeMode } from "@/lib/typing-practice-mode";
import { cn } from "@/lib/utils";

export function TypingPracticeConsole({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [practice, dispatch] = useReducer(typingPracticeReducer, initialTypingPracticeState);
  const [session, setSession] = useState<TypingSession | null>(null);
  const [mode, setMode] = useState<TypingPracticeMode>("BEGINNER");
  const presentation = typingPracticePresentation(mode, practice.phase === "CORRECT_REVEAL");
  const [voice, setVoice] = useState<TypingVoice>("uk-female");
  const audioUrl = typingAudioUrl(session?.question?.audioUrls, voice);
  const [words, setWords] = useState<string[]>([]);
  const [inputNotice, setInputNotice] = useState("");
  const [compositionDraft, setCompositionDraft] = useState<{ index: number; value: string } | null>(null);
  const composing = useRef(false);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [showPause, setShowPause] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioReplayCount, setAudioReplayCount] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const questionStartedAt = useRef(Date.now());

  const applySession = useCallback((next: TypingSession, freshQuestion = false) => {
    setInputNotice("");
    setCompositionDraft(null);
    composing.current = false;
    setSession(next);
    setActiveSeconds(next.activeSeconds);
    if (next.status === "COMPLETED" || !next.question) {
      dispatch({ type: "COMPLETED" });
      return;
    }
    const changed = freshQuestion || next.question.id !== practice.questionId;
    dispatch(changed
      ? { type: "QUESTION_CHANGED", questionId: next.question.id }
      : { type: "LOADED", sessionId: next.id, questionId: next.question.id });
    if (!next.question.requiresAnswer) dispatch({ type: "CORRECT" });
    const wordCount = next.question.slots.filter((slot) => slot.kind === "WORD").length;
    const saved = changed ? "" : sessionStorage.getItem(draftKey(next.id, next.question.id)) ?? "";
    setWords(splitDraft(saved, wordCount));
    setAudioReplayCount(0);
    questionStartedAt.current = Date.now();
  }, [practice.questionId]);

  useEffect(() => {
    let cancelled = false;
    setMode(parseTypingPracticeMode(localStorage.getItem(typingPracticeModeKey(sessionId))));
    setVoice(parseTypingVoice(localStorage.getItem(typingVoiceKey(sessionId))));
    void getTypingSession(sessionId)
      .then((next) => {
        if (cancelled) return;
        setSession(next);
        setActiveSeconds(next.activeSeconds);
        dispatch({ type: "LOADED", sessionId: next.id, questionId: next.question?.id ?? null });
        if (next.question && !next.question.requiresAnswer) dispatch({ type: "CORRECT" });
        if (next.status === "PAUSED") {
          dispatch({ type: "PAUSED" });
          setShowPause(true);
        }
        const wordCount = next.question?.slots.filter((slot) => slot.kind === "WORD").length ?? 0;
        const saved = next.question
          ? sessionStorage.getItem(draftKey(next.id, next.question.id)) ?? ""
          : "";
        setWords(splitDraft(saved, wordCount));
      })
      .catch((cause) => {
        if (!cancelled) dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "练习加载失败" });
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (practice.phase === "PAUSED" || practice.phase === "COMPLETED") return;
    const timer = window.setInterval(() => setActiveSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [practice.phase]);

  useEffect(() => {
    if (showPause || showSettings) return;
    if (practice.phase !== "READY" && practice.phase !== "INCORRECT") return;
    const targetIndex = practice.phase === "INCORRECT"
      ? practice.result.find((item) => item.status !== "CORRECT")?.tokenIndex ?? 0
      : 0;
    const frame = window.requestAnimationFrame(() => {
      focusTypingInput(inputs.current[targetIndex] ?? null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [practice.phase, practice.questionId, practice.result, showPause, showSettings]);

  const playAudio = useCallback((countReplay = false) => {
    if (!presentation.audioEnabled || !audio.current) return;
    audio.current.currentTime = 0;
    void audio.current.play().catch(() => undefined);
    if (countReplay) setAudioReplayCount((value) => value + 1);
  }, [presentation.audioEnabled]);

  useEffect(() => {
    if (!presentation.audioEnabled || !audioUrl) return;
    const timer = window.setTimeout(() => playAudio(false), 180);
    return () => window.clearTimeout(timer);
  }, [session?.question?.id, audioUrl, playAudio, presentation.audioEnabled]);

  useEffect(() => {
    const nextMedia = session?.nextMedia;
    if (!nextMedia) return;
    const image = nextMedia.imageUrl ? new Image() : null;
    if (image) image.src = nextMedia.imageUrl!;
    const nextAudioUrl = presentation.audioEnabled ? typingAudioUrl(nextMedia.audioUrls, voice) : null;
    const nextAudio = nextAudioUrl ? new Audio() : null;
    if (nextAudio && nextAudioUrl) {
      nextAudio.preload = "auto";
      nextAudio.src = nextAudioUrl;
      nextAudio.load();
    }
    return () => {
      if (image) image.removeAttribute("src");
      if (nextAudio) { nextAudio.removeAttribute("src"); nextAudio.load(); }
    };
  }, [session?.nextMedia?.id, session?.nextMedia?.imageUrl, session?.nextMedia?.audioUrls[voice], voice, presentation.audioEnabled]);

  useEffect(() => {
    if (!session?.question) return;
    sessionStorage.setItem(draftKey(session.id, session.question.id), words.join(" "));
  }, [session?.id, session?.question, words]);

  const answer = useMemo(
    () => assembleTypingAnswer(session?.question?.slots ?? [], words),
    [session?.question?.slots, words]
  );

  async function submit() {
    if (!session?.question || practice.phase === "CHECKING") return;
    if (practice.phase === "CORRECT_REVEAL") {
      await next();
      return;
    }
    dispatch({ type: "SUBMITTING" });
    try {
      const result = await submitTypingAttempt(session.id, {
        clientAttemptId: crypto.randomUUID(),
        answer,
        durationMs: Date.now() - questionStartedAt.current,
        audioReplayCount
      });
      setSession(result.session);
      if (result.correct) {
        dispatch({ type: "CORRECT" });
        sessionStorage.removeItem(draftKey(session.id, session.question.id));
        window.setTimeout(() => playAudio(false), 80);
      } else {
        dispatch({ type: "INCORRECT", result: result.result });
      }
    } catch (cause) {
      dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "答案提交失败" });
    }
  }

  async function next() {
    if (!session) return;
    try {
      const nextSession = await advanceTypingSession(session.id);
      applySession(nextSession, true);
    } catch (cause) {
      dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "下一题加载失败" });
    }
  }

  async function hint() {
    if (!session || practice.phase === "CORRECT_REVEAL") return;
    try {
      const nextSession = await requestTypingHint(session.id);
      setSession(nextSession);
      dispatch({ type: "RESUMED" });
      window.requestAnimationFrame(() => focusTypingInput(inputs.current[0] ?? null));
    } catch (cause) {
      dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "提示加载失败" });
    }
  }

  async function pause() {
    if (!session || session.status !== "ACTIVE") {
      setShowPause(true);
      return;
    }
    try {
      const paused = await pauseTypingSession(session.id, activeSeconds);
      setSession(paused);
      dispatch({ type: "PAUSED" });
      setShowPause(true);
    } catch (cause) {
      dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "暂停失败" });
    }
  }

  async function resume() {
    if (!session) return;
    try {
      const resumed = await resumeTypingSession(session.id);
      setSession(resumed);
      setShowPause(false);
      dispatch({ type: "RESUMED" });
      window.requestAnimationFrame(() => focusTypingInput(inputs.current[0] ?? null));
    } catch (cause) {
      dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "恢复失败" });
    }
  }

  async function finish() {
    if (!session) return;
    try {
      await finishTypingSession(session.id, activeSeconds);
      router.push("/typing");
    } catch (cause) {
      dispatch({ type: "FAILED", error: cause instanceof Error ? cause.message : "退出失败" });
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || composing.current || event.keyCode === 229) return;
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === " " && event.shiftKey) {
        event.preventDefault();
        playAudio(true);
      } else if (event.key === "/" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void hint();
      } else if (event.key === "Escape") {
        event.preventDefault();
        void pause();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!session && practice.phase === "LOADING") {
    return <TypingLoading />;
  }

  if (practice.phase === "COMPLETED" && session) {
    return <TypingCompleted session={session} onBack={() => router.push("/typing")} />;
  }

  const question = session?.question;
  const wordSlots = question?.slots.filter((slot) => slot.kind === "WORD") ?? [];

  return (
    <main data-public-theme="default" className="relative flex h-dvh flex-col overflow-hidden bg-[#f6f6f5] text-[#33445e]">
      <header className="relative z-10 grid h-18 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b border-[#e5eaf0] bg-white/95 px-4 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#66758a] hover:bg-[#f0f3f7] sm:size-10" onClick={() => void pause()} type="button">
            <ArrowLeft className="size-5" />
            <span className="sr-only">暂停并退出</span>
          </button>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold text-[#34445d]">{session?.library.title}</div>
            <div className="truncate text-xs text-[#8a97a8]">{session?.unit?.title ?? "全册练习"} · {typingPracticeModes.find((item) => item.value === mode)?.label}</div>
          </div>
        </div>
        <div className="whitespace-nowrap text-center text-xs font-semibold tracking-wide text-[#91a0b5]">
          第 {(session?.currentIndex ?? 0) + 1} 题 / 共 {session?.totalItems ?? 0} 题
        </div>
        <div className="flex min-w-0 items-center justify-end sm:gap-3">
          <div className="hidden items-center gap-3 text-sm text-[#6f7d90] lg:flex">
            <Headphones className="size-4" />
            <span>{formatDuration(activeSeconds)}</span>
          </div>
          <button className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#66758a] hover:bg-[#f0f3f7] sm:size-10" onClick={() => setShowSettings(true)} type="button">
            <Settings className="size-5" />
            <span className="sr-only">练习设置</span>
          </button>
          <button className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#66758a] hover:bg-[#f0f3f7] sm:size-10" onClick={() => void pause()} type="button">
            <Pause className="size-5" />
            <span className="sr-only">暂停</span>
          </button>
        </div>
      </header>

      <div className="h-1 shrink-0 bg-[#e9edf3]">
        <div className="h-full bg-[#4a83e4] transition-[width] duration-500" style={{ width: `${session?.progressPercent ?? 0}%` }} />
      </div>

      <section className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-4 [&>*]:shrink-0">
        {question?.imageUrl && presentation.showImage ? (
          <div className="relative mb-4 min-h-20 max-h-[420px] w-full max-w-[560px] flex-[1_1_420px]" style={{ flexShrink: 1 }}>
            <img
              alt={`${question.prompt}的情景图片`}
              className="absolute inset-0 h-full w-full rounded-2xl object-contain"
              src={question.imageUrl}
            />
          </div>
        ) : practice.phase !== "CORRECT_REVEAL" && presentation.audioEnabled ? (
          <div className="mb-4 flex h-16 items-center gap-2 rounded-2xl bg-white px-6 text-sm text-[#8795a8] shadow-sm">
            <Volume2 className="size-5 text-[#5d8ddb]" /> 请听读音并输入英文
          </div>
        ) : null}

        <h1 className="max-w-4xl text-center text-[clamp(2rem,4vw,3.5rem)] font-normal leading-[1.25] tracking-tight text-[#34445d]">
          {presentation.showTranslation ? question?.prompt ?? "题目加载中…" : "请听读音，输入单词"}
        </h1>

        {presentation.audioEnabled && audioUrl ? <audio preload="auto" ref={audio} src={audioUrl} /> : null}

        {practice.phase !== "CORRECT_REVEAL" ? (
        <div className="mt-6 flex max-w-[calc(100vw-2rem)] flex-wrap items-end justify-center gap-x-5 gap-y-6">
          {question?.slots.map((slot, slotIndex) => {
            if (slot.kind === "PUNCTUATION") {
              return <span className="pb-1 text-4xl text-[#61718a]" key={`punctuation-${slotIndex}`}>{slot.text}</span>;
            }
            const wordIndex = wordIndexAt(question, slotIndex);
            const error = practice.result.find((item) => item.tokenIndex === wordIndex && item.status !== "CORRECT");
            const placeholder = hintPlaceholder(question, wordIndex);
            const word = words[wordIndex] ?? "";
            const characterFeedback = error
              ? buildTypingCharacterFeedback(word, characterErrorsFor(error, word))
              : [];
            return (
              <div className="relative" key={`word-${slotIndex}`}>
                <input
                  aria-label={`第 ${wordIndex + 1} 个单词，共 ${wordSlots.length} 个单词`}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  className={cn(
                    "h-16 border-0 border-b-[3px] bg-transparent px-1 text-center text-[clamp(1.8rem,4vw,3rem)] text-[#34445d] outline-none transition placeholder:text-[#a9b7ca] focus:border-primary",
                    error && "border-red-400 text-transparent caret-[#34445d] focus:border-red-500",
                    practice.phase === "CORRECT_REVEAL" && "border-emerald-400 text-emerald-700"
                  )}
                  disabled={practice.phase === "CHECKING" || practice.phase === "CORRECT_REVEAL"}
                  lang="en"
                  inputMode="text"
                  aria-describedby={inputNotice ? "typing-input-notice" : undefined}
                  maxLength={Math.max(slot.length + 5, 12)}
                  onChange={(event) => {
                    if (composing.current) setCompositionDraft({ index: wordIndex, value: event.target.value });
                    else changeWord(wordIndex, event.target.value);
                  }}
                  onCompositionStart={(event) => {
                    composing.current = true;
                    setCompositionDraft({ index: wordIndex, value: event.currentTarget.value });
                  }}
                  onCompositionEnd={(event) => {
                    composing.current = false;
                    setCompositionDraft(null);
                    changeWord(wordIndex, event.currentTarget.value);
                  }}
                  onKeyDown={(event) => inputKeyDown(event, wordIndex)}
                  placeholder={placeholder}
                  ref={(element) => { inputs.current[wordIndex] = element; }}
                  spellCheck={false}
                  style={{ width: `${Math.max(92, Math.min(260, slot.length * 31))}px` }}
                  value={compositionDraft?.index === wordIndex ? compositionDraft.value : word}
                />
                {error ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 flex h-16 items-center justify-center whitespace-pre px-1 text-[clamp(1.8rem,4vw,3rem)]"
                    >
                      {characterFeedback.map((item, index) => (
                        <span
                          className={cn(
                            "text-[#34445d]",
                            item.status !== "CORRECT" && "font-semibold text-red-600"
                          )}
                          key={`${item.status}-${index}`}
                        >
                          {item.character}
                        </span>
                      ))}
                    </span>
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-red-500">
                      {errorLabel(error)}
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        ) : null}

        {inputNotice ? <p className="mt-8 text-center text-sm text-amber-700" id="typing-input-notice" role="status">{inputNotice}</p> : null}

        {presentation.audioEnabled && question && !audioUrl ? <p className="mt-8 text-center text-sm text-amber-700">当前单词暂无{typingVoices.find((item) => item.value === voice)?.label}语音，可使用提示继续练习。</p> : null}

        {practice.phase === "INCORRECT" ? (
          <div className="mt-12 flex max-w-xl items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
            <X className="mt-0.5 size-4 shrink-0" />
            <span>{incorrectMessage(practice.result)}，请修改后再次按回车。</span>
          </div>
        ) : null}

        {practice.phase === "CORRECT_REVEAL" && question?.explanation ? (
          <TypingCorrectReveal explanation={question.explanation} />
        ) : null}

        {question?.explanation && question.requiresAnswer ? (
          <div className="mt-9 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center text-sm text-amber-800">
            完整答案：<strong>{question.explanation.text}</strong>。请重新完整输入一次。
          </div>
        ) : null}

        {practice.error ? (
          <div className="mt-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{practice.error}</div>
        ) : null}
      </section>

      <footer className="relative z-20 shrink-0 border-t border-[#e5eaf0] bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-3 sm:justify-between">
          {presentation.audioEnabled ? (
          <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dfe5ed] bg-white px-4 text-sm font-semibold text-[#64738a] hover:bg-[#f5f7fa]" disabled={!audioUrl} onClick={() => playAudio(true)} type="button">
            <Volume2 className="size-4" /> <span className="hidden sm:inline">重新播放</span>
            <kbd className="hidden rounded bg-[#f0f3f7] px-1.5 py-0.5 text-[10px] text-[#8290a4] lg:inline">Shift Space</kbd>
          </button>
          ) : null}
          {practice.phase !== "CORRECT_REVEAL" ? (
            <Button className="h-11 rounded-xl bg-primary px-7 text-white hover:bg-primary/95" disabled={practice.phase === "CHECKING"} onClick={() => void submit()}>
              {practice.phase === "CHECKING" ? "正在检查…" : "提交答案"}
            </Button>
          ) : (
            <Button className="h-11 rounded-xl bg-primary px-7 text-white hover:bg-primary/95" onClick={() => void next()}>
              下一题 <span className="text-xs opacity-70">Enter</span>
            </Button>
          )}
          <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dfe5ed] bg-white px-4 text-sm font-semibold text-[#64738a] hover:bg-[#f5f7fa] disabled:opacity-40" disabled={practice.phase === "CORRECT_REVEAL"} onClick={() => void hint()} type="button">
            <Lightbulb className="size-4" /> <span className="hidden sm:inline">查看提示</span>
            <kbd className="hidden rounded bg-[#f0f3f7] px-1.5 py-0.5 text-[10px] text-[#8290a4] lg:inline">⌘ /</kbd>
          </button>
        </div>
      </footer>

      {showPause ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#24334a]/45 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary"><Pause className="size-6" /></span>
            <h2 className="mt-5 text-2xl font-semibold text-[#34445d]">练习已暂停</h2>
            <p className="mt-2 text-sm text-[#7c899c]">当前进度已经保存，可以继续或返回词库。</p>
            <Button className="mt-6 h-11 w-full rounded-xl bg-primary text-white hover:bg-primary/95" onClick={() => void resume()}>
              <Play className="size-4 fill-current" /> 继续练习
            </Button>
            <Button className="mt-3 h-11 w-full rounded-xl" onClick={() => void finish()} variant="outline">结束本轮并返回</Button>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="fixed inset-0 z-50 bg-[#24334a]/25" onClick={() => setShowSettings(false)}>
          <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#34445d]">练习设置</h2>
              <button className="flex size-9 items-center justify-center rounded-full hover:bg-[#f0f3f7]" onClick={() => setShowSettings(false)} type="button"><X className="size-4" /></button>
            </div>
            <div className="mt-6 space-y-4 text-sm text-[#64738a]">
              {presentation.audioEnabled ? <p className="rounded-2xl bg-[#f5f7fa] p-4">当前语音：{typingVoices.find((item) => item.value === voice)?.label}。</p> : null}
              <p className="flex items-center gap-2"><CircleHelp className="size-4" /> Enter 提交答案或进入下一题</p>
              {presentation.audioEnabled ? <p className="flex items-center gap-2"><RotateCcw className="size-4" /> Shift + Space 重播读音</p> : null}
              <p className="flex items-center gap-2"><Lightbulb className="size-4" /> Ctrl/⌘ + / 查看提示</p>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );

  function changeWord(index: number, value: string) {
    if (!isEnglishTypingInput(value)) {
      setInputNotice("请切换到英文输入法，仅支持英文、数字和半角符号。");
      return;
    }
    setInputNotice("");
    const pieces = value.split(/\s+/u);
    setWords((current) => {
      const nextWords = [...current];
      pieces.forEach((piece, offset) => {
        if (index + offset < wordSlots.length) nextWords[index + offset] = piece;
      });
      dispatch({ type: "INPUT_CHANGED", answer: assembleTypingAnswer(question?.slots ?? [], nextWords) });
      return nextWords;
    });
    if (pieces.length > 1) {
      window.requestAnimationFrame(() => {
        focusTypingInput(inputs.current[Math.min(wordSlots.length - 1, index + pieces.length - 1)] ?? null);
      });
    }
  }

  function inputKeyDown(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
    if (event.key === " " && !event.shiftKey) {
      event.preventDefault();
      focusTypingInput(inputs.current[Math.min(wordSlots.length - 1, index + 1)] ?? null);
    }
    if (event.key === "Backspace" && !words[index] && index > 0) {
      focusTypingInput(inputs.current[index - 1] ?? null);
    }
  }
}

function TypingLoading() {
  return (
    <main data-public-theme="default" className="grid min-h-screen place-items-center bg-[#f6f6f5] text-[#728197]">
      <div className="text-center"><span className="mx-auto block size-9 animate-spin rounded-full border-2 border-[#d5deea] border-t-primary" /><p className="mt-4 text-sm">正在准备练习…</p></div>
    </main>
  );
}

function TypingCompleted({ session, onBack }: { session: TypingSession; onBack: () => void }) {
  return (
    <main data-public-theme="default" className="grid min-h-screen place-items-center bg-[#f6f6f5] p-5">
      <div className="w-full max-w-lg rounded-3xl border border-[#e0e6ee] bg-white p-8 text-center shadow-[0_24px_70px_rgba(37,52,77,0.12)]">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-8" /></span>
        <h1 className="mt-5 text-3xl font-semibold text-[#34445d]">本轮练习完成</h1>
        <p className="mt-2 text-sm text-[#7b899c]">做得很好，错词已经进入后续复习安排。</p>
        <div className="mt-7 grid grid-cols-3 gap-3">
          <Summary label="答对" value={session.correctCount} />
          <Summary label="错词" value={session.wrongCount} />
          <Summary label="提示" value={session.hintedCount} />
        </div>
        <Button className="mt-7 h-11 w-full rounded-xl bg-primary text-white hover:bg-primary/95" onClick={onBack}>返回词库</Button>
      </div>
    </main>
  );
}

function TypingCorrectReveal({
  explanation
}: {
  explanation: NonNullable<TypingQuestion["explanation"]>;
}) {
  const wordCount = explanation.tokens.filter((item) => item.kind === "WORD").length;
  return (
    <div className="mt-12 w-full max-w-5xl text-center sm:mt-16">
      <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-7">
        {explanation.tokens.map((token, index) => token.kind === "PUNCTUATION" ? (
          <span className="pt-12 text-5xl text-[#34445d]" key={`${token.text}-${index}`}>{token.text}</span>
        ) : (
          <div className="min-w-28" key={`${token.text}-${index}`}>
            {explanation.partOfSpeech && wordCount === 1 ? (
              <span className="inline-flex rounded-lg bg-primary px-3 py-1 text-sm font-semibold text-white">
                {explanation.partOfSpeech}
              </span>
            ) : <span className="block h-7" />}
            <div className="mt-3 border-b-[3px] border-primary px-2 pb-2 text-[clamp(2.8rem,6vw,5rem)] font-medium leading-none tracking-tight text-[#34445d]">
              {token.text}
            </div>
            {explanation.britishPhonetic && wordCount === 1 ? (
              <div className="mt-3 text-xl font-semibold text-[#9aa8bc]">{formatPhonetic(explanation.britishPhonetic)}</div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="size-5" /> 回答正确
      </div>
      <div className="mt-3 text-2xl text-[#34445d]">{explanation.translation}</div>
      {explanation.britishPhonetic && wordCount > 1 ? (
        <div className="mt-3 text-lg font-semibold text-[#9aa8bc]">{formatPhonetic(explanation.britishPhonetic)}</div>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-[#f4f7fa] p-4"><strong className="block text-2xl text-[#34445d]">{value}</strong><span className="mt-1 block text-xs text-[#8491a3]">{label}</span></div>;
}

function draftKey(sessionId: string, questionId: string) {
  return `typing-draft:${sessionId}:${questionId}`;
}

function splitDraft(value: string, count: number) {
  const values = value.trim() ? value.trim().split(/\s+/u) : [];
  return Array.from({ length: count }, (_, index) => values[index] ?? "");
}

function wordIndexAt(question: TypingQuestion, slotIndex: number) {
  return question.slots.slice(0, slotIndex).filter((slot) => slot.kind === "WORD").length;
}

function hintPlaceholder(question: TypingQuestion, wordIndex: number) {
  if (question.hint?.level === 1) {
    const word = question.hint.words.find((item) => item.tokenIndex === wordIndex);
    return word ? `${word.initial}${"·".repeat(Math.max(0, word.length - 1))}` : "";
  }
  if (question.hint?.level === 2 && question.hint.tokenIndex === wordIndex) return question.hint.word;
  return "";
}

function characterErrorsFor(error: TypingPracticeErrorResult, value: string): TypingCharacterError[] {
  if (error.characterErrors?.length) return error.characterErrors;
  return error.charErrors.map((actualIndex) => ({
    type: error.status === "CASE_ERROR"
      ? "CASE"
      : error.status === "INCOMPLETE"
        ? "MISSING"
        : "SUBSTITUTION",
    expectedIndex: actualIndex,
    actualIndex: error.status === "INCOMPLETE" ? Math.min(actualIndex, value.length) : actualIndex
  }));
}

function errorLabel(error: TypingPracticeErrorResult) {
  const characterError = error.characterErrors?.[0];
  if (characterError) {
    const position = characterError.actualIndex + 1;
    if (characterError.type === "MISSING") return `第 ${position} 个位置缺少字母`;
    if (characterError.type === "EXTRA") return `第 ${position} 个字母多余`;
    if (characterError.type === "CASE") return `第 ${position} 个字母大小写不正确`;
    return `第 ${position} 个字母不正确`;
  }
  return ({
    SPELLING_ERROR: "拼写不正确",
    CASE_ERROR: "大小写不正确",
    PUNCTUATION_ERROR: "标点不正确",
    WHITESPACE_ERROR: "空格不正确",
    INCOMPLETE: "请补充完整"
  } as Record<string, string>)[error.status] ?? "请修改";
}

function incorrectMessage(result: TypingPracticeErrorResult[]) {
  const first = result.find((item) => item.status !== "CORRECT");
  if (!first) return "答案中有需要修改的位置";
  return `第 ${first.tokenIndex + 1} 个单词：${errorLabel(first)}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remain = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remain}`;
}

function formatPhonetic(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (trimmed.startsWith("/") && trimmed.endsWith("/"))) return trimmed;
  return `/${trimmed}/`;
}
