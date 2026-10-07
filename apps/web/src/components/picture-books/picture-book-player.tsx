"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { publishLearningContext, publishLearningEvent } from "@/components/learning/learner-learning-provider";
import { pictureBookPageImageSource } from "@/lib/picture-book-images";
import { PictureBookImage } from "./picture-book-image";
import { pictureBookPageAudioSource } from "@/lib/picture-book-audio";

type Page = { position: number; caption: string; narration: string; imageUrl: string | null; audioUrl: string | null };
type Book = { id: string; title: string; style: string; aspectRatio: string; pages: Page[] };

export function PictureBookPlayer({ bookId, courseId, courseRevisionItemId, learnerMode, initialBook, onClose }: { bookId: string; courseId?: string; courseRevisionItemId?: string; learnerMode: boolean; initialBook?: Book; onClose?: () => void }) {
  const [book, setBook] = useState<Book | null>(initialBook ?? null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoTurn, setAutoTurn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [audioRetry, setAudioRetry] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialBook) return;
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
  }, [bookId, initialBook]);

  const pages = book?.pages ?? [];
  const page = pages[index];
  const hasCover = pages[0]?.position === 0;
  const pageLabel = (pageIndex: number) => hasCover && pageIndex === 0 ? "封面" : `第 ${pageIndex + 1 - Number(hasCover)} 页`;
  // Stable page keys keep the next page's downloaded media when it becomes current.
  const preloadPages = pages.slice(index, index + 2);

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
    setAudioError("");
    setAudioRetry(0);
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
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.error) { setAudioError("语音加载失败"); return; }
    if (!autoTurn || !page?.audioUrl) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [autoTurn, page?.audioUrl, index, audioRetry]);

  async function toggleAudio() {
    const audio = audioRef.current;
    if (!audio || !page?.audioUrl) return;
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); } catch { setPlaying(false); setAudioError("语音播放失败，请重试加载。"); }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f6f5] text-foreground" data-public-theme="default">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-8">
        {onClose ? <button type="button" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={onClose}><ArrowLeft className="size-4" />返回示范绘本</button> : <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/storybook"><ArrowLeft className="size-4" />返回绘本</Link>}
        <h1 className="truncate text-base font-semibold sm:text-lg">{book?.title || "绘本播放"}</h1>
        <span className="min-w-16 text-right text-sm tabular-nums text-muted-foreground">{pages.length ? hasCover && index === 0 ? "封面" : `${index + 1 - Number(hasCover)} / ${pages.length - Number(hasCover)}` : ""}</span>
      </header>

      {error ? <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-background p-8 text-center text-sm">{error}</div> : null}
      {!book && !error ? <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />正在打开绘本…</div> : null}
      {book && !page ? <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-background p-8 text-center text-sm">这本绘本还没有页面</div> : null}

      {page ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-6 sm:px-8 sm:py-8">
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-background shadow-sm" style={{ minHeight: "min(64vh, 680px)" }}>
            {preloadPages.map(item => item.imageUrl ? <PictureBookImage key={item.position} hidden={item.position !== page.position} alt={`${book?.title}${pageLabel(pages.indexOf(item))}`} className="max-h-[68vh] w-full object-contain" src={pictureBookPageImageSource(bookId, item.position, item.imageUrl)} /> : null)}
            {!page.imageUrl ? <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">这一页还没有图片</div> : null}
            <button aria-label="上一页" className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow disabled:opacity-30 sm:left-4" disabled={index === 0} onClick={() => goTo(index - 1)} type="button"><ChevronLeft className="size-6" /></button>
            <button aria-label="下一页" className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow disabled:opacity-30 sm:right-4" disabled={index === pages.length - 1} onClick={() => goTo(index + 1)} type="button"><ChevronRight className="size-6" /></button>
          </div>

          {page.caption ? <p className="max-w-3xl text-center text-base leading-8 sm:text-xl">{page.caption}</p> : null}
          {preloadPages.map(item => {
            const current = item.position === page.position;
            const source = item.audioUrl ? pictureBookPageAudioSource(bookId, item.position, item.audioUrl) : undefined;
            const retry = current ? audioRetry : 0;
            return <audio key={`${item.position}-${retry}`} hidden={!current} muted={muted} preload="auto"
              onError={current ? () => { setPlaying(false); setAudioError("语音加载失败"); } : undefined}
              onEnded={current ? () => { setPlaying(false); if (autoTurn && index < pages.length - 1) goTo(index + 1); } : undefined}
              onPause={current ? () => setPlaying(false) : undefined}
              onPlay={current ? () => { setPlaying(true); setAudioError(""); } : undefined}
              ref={current ? audioRef : undefined}
              src={source && retry ? `${source}${source.includes("?") ? "&" : "?"}retry=${retry}` : source} />;
          })}
          {audioError ? <div role="alert" className="flex items-center gap-2 text-sm text-red-600">{audioError}<button className="rounded-lg border bg-background px-3 py-2 text-foreground" onClick={() => { setAudioError(""); setAudioRetry(audioRetry + 1); }} type="button">重试加载</button></div> : null}
          {pages.some(item => item.audioUrl) ? <div className="flex flex-wrap items-center justify-center gap-2">
            <button aria-label={playing ? "暂停讲解" : "播放讲解"} className="xueleai-button inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!page.audioUrl} onClick={toggleAudio} type="button">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? "暂停" : page.audioUrl ? "播放讲解" : "暂无讲解语音"}</button>
            <button aria-label={muted ? "开启声音" : "静音"} className="flex size-10 items-center justify-center rounded-full border bg-background" onClick={() => setMuted(!muted)} type="button">{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
            <button aria-pressed={autoTurn} className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm ${autoTurn ? "border-primary bg-primary/10" : "bg-background"}`} onClick={() => setAutoTurn(!autoTurn)} type="button"><RotateCcw className="size-4" />自动翻页</button>
          </div> : null}
          {page.narration && page.narration !== page.caption ? <p className="max-w-3xl text-center text-sm leading-6 text-muted-foreground">讲解：{page.narration}</p> : null}
          <nav aria-label="绘本页面" className="flex max-w-full gap-2 overflow-x-auto pb-2">
            {pages.map((item, pageIndex) => <button aria-current={pageIndex === index ? "page" : undefined} aria-label={pageLabel(pageIndex)} className={`h-9 min-w-9 shrink-0 rounded-lg border px-2 text-xs tabular-nums ${pageIndex === index ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`} key={`${item.position}-${pageIndex}`} onClick={() => goTo(pageIndex)} type="button">{hasCover && pageIndex === 0 ? "封面" : pageIndex + 1 - Number(hasCover)}</button>)}
          </nav>
        </div>
      ) : null}
    </main>
  );
}
