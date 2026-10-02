"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { publishLearningContext, publishLearningEvent } from "@/components/learning/learner-learning-provider";

type Page = { position: number; caption: string; narration: string; imageUrl: string | null; audioUrl: string | null };
type Book = { id: string; title: string; style: string; aspectRatio: string; pages: Page[] };

export function PictureBookPlayer({ bookId, courseId, courseRevisionItemId, learnerMode }: { bookId: string; courseId?: string; courseRevisionItemId?: string; learnerMode: boolean }) {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoTurn, setAutoTurn] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/picture-books/${encodeURIComponent(bookId)}/play`, { credentials: "include", signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { code?: number; message?: string; data?: Book };
        if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "绘本加载失败");
        setBook(result.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "绘本加载失败");
      });
    return () => controller.abort();
  }, [bookId]);

  const pages = book?.pages ?? [];
  const page = pages[index];

  useEffect(() => {
    if (!book || !learnerMode || !courseId || !courseRevisionItemId) return;
    const timer = window.setTimeout(() => {
      publishLearningContext({ isLearning: true, courseId, courseRevisionItemId, materialType: "PICTURE_BOOK", materialId: bookId, partKey: "READING" });
      publishLearningEvent({ type: "MATERIAL_STARTED", partKey: "READING" });
    });
    return () => { window.clearTimeout(timer); publishLearningContext({ isLearning: false }); };
  }, [book, bookId, courseId, courseRevisionItemId, learnerMode]);

  useEffect(() => {
    if (!page || !learnerMode || !courseId || !courseRevisionItemId) return;
    const timer = window.setTimeout(() => publishLearningEvent({ type: "NODE_LEARNED", partKey: "READING", itemId: String(page.position) }), 1200);
    return () => window.clearTimeout(timer);
  }, [courseId, courseRevisionItemId, learnerMode, page]);
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= pages.length) return;
    audioRef.current?.pause();
    setPlaying(false);
    setIndex(next);
  }, [pages.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, index]);

  useEffect(() => {
    if (!autoTurn || !page?.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [autoTurn, page?.audioUrl, index]);

  async function toggleAudio() {
    const audio = audioRef.current;
    if (!audio || !page?.audioUrl) return;
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f6f5] text-foreground">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-8">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/storybook"><ArrowLeft className="size-4" />返回绘本</Link>
        <h1 className="truncate text-base font-semibold sm:text-lg">{book?.title || "绘本播放"}</h1>
        <span className="min-w-16 text-right text-sm tabular-nums text-muted-foreground">{pages.length ? `${index + 1} / ${pages.length}` : ""}</span>
      </header>

      {error ? <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-background p-8 text-center text-sm">{error}</div> : null}
      {!book && !error ? <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />正在打开绘本…</div> : null}
      {book && !page ? <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-background p-8 text-center text-sm">这本绘本还没有页面</div> : null}

      {page ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-6 sm:px-8 sm:py-8">
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-background shadow-sm" style={{ minHeight: "min(64vh, 680px)" }}>
            {page.imageUrl ? <img alt={`${book?.title}第 ${index + 1} 页`} className="max-h-[68vh] w-full object-contain" src={page.imageUrl} /> : <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">这一页还没有图片</div>}
            <button aria-label="上一页" className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow disabled:opacity-30 sm:left-4" disabled={index === 0} onClick={() => goTo(index - 1)} type="button"><ChevronLeft className="size-6" /></button>
            <button aria-label="下一页" className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow disabled:opacity-30 sm:right-4" disabled={index === pages.length - 1} onClick={() => goTo(index + 1)} type="button"><ChevronRight className="size-6" /></button>
          </div>

          <p className="max-w-3xl text-center text-base leading-8 sm:text-xl">{page.caption || "　"}</p>
          <audio key={page.position} muted={muted} onEnded={() => { setPlaying(false); if (autoTurn && index < pages.length - 1) goTo(index + 1); }} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} ref={audioRef} src={page.audioUrl ?? undefined} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button aria-label={playing ? "暂停讲解" : "播放讲解"} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!page.audioUrl} onClick={toggleAudio} type="button">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? "暂停" : page.audioUrl ? "播放讲解" : "暂无讲解语音"}</button>
            <button aria-label={muted ? "开启声音" : "静音"} className="flex size-10 items-center justify-center rounded-full border bg-background" onClick={() => setMuted(!muted)} type="button">{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
            <button aria-pressed={autoTurn} className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm ${autoTurn ? "border-primary bg-primary/10" : "bg-background"}`} onClick={() => setAutoTurn(!autoTurn)} type="button"><RotateCcw className="size-4" />自动翻页</button>
          </div>
          {page.narration && page.narration !== page.caption ? <p className="max-w-3xl text-center text-sm leading-6 text-muted-foreground">讲解：{page.narration}</p> : null}
          <nav aria-label="绘本页面" className="flex max-w-full gap-2 overflow-x-auto pb-2">
            {pages.map((item, pageIndex) => <button aria-current={pageIndex === index ? "page" : undefined} aria-label={`第 ${pageIndex + 1} 页`} className={`size-9 shrink-0 rounded-lg border text-xs tabular-nums ${pageIndex === index ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`} key={`${item.position}-${pageIndex}`} onClick={() => goTo(pageIndex)} type="button">{pageIndex + 1}</button>)}
          </nav>
        </div>
      ) : null}
    </main>
  );
}
