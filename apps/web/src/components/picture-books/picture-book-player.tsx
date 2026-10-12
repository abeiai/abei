"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Captions, ChevronLeft, ChevronRight, EyeOff, LoaderCircle, Maximize, Minimize, PanelLeft, PanelsTopLeft, Pause, Play, SkipBack, SkipForward, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { publishLearningContext, publishLearningEvent } from "@/components/learning/learner-learning-provider";
import { pictureBookPageImageSource } from "@/lib/picture-book-images";
import { pictureBookPageRatio, pictureBookPlaybackLayout } from "@/lib/picture-book-layout";
import { PictureBookImage } from "./picture-book-image";
import { pictureBookPageAudioSource } from "@/lib/picture-book-audio";
import { PICTURE_BOOK_COVER_PAUSE_MS, pictureBookAfterPage, pictureBookAlbumEntries, pictureBookFullscreenZones, pictureBookSilentPageDuration, pictureBookSpreadTurn, type PictureBookAlbumEntry, type PictureBookLoopMode } from "@/lib/picture-book-player-controls";
import type { CoursePageResult } from "@/lib/course-types";
import styles from "./picture-book-player.module.css";

type Page = { position: number; caption: string; narration: string; imageUrl: string | null; audioUrl: string | null; textInImage?: boolean };
type Book = { id: string; title: string; style: string; aspectRatio: string; isSpread?: boolean; pages: Page[] };
type PageTurn = { from: number; to: number; direction: "forward" | "backward" };
const layouts = [
  { value: "subtitle", label: "底部字幕", icon: Captions },
  { value: "side", label: "左文右图", icon: PanelLeft },
  { value: "below", label: "上图下文", icon: PanelsTopLeft },
  { value: "hidden", label: "隐藏文字", icon: EyeOff },
] as const;

export function PictureBookPlayer({ bookId, courseId, courseRevisionItemId, learnerMode, publicMode = false }: { bookId: string; courseId?: string; courseRevisionItemId?: string; learnerMode: boolean; publicMode?: boolean }) {
  const router = useRouter();
  const albumId = useSearchParams().get("album");
  const [entry, setEntry] = useState({ bookId, revisionItemId: courseRevisionItemId });
  const [album, setAlbum] = useState<PictureBookAlbumEntry[]>([]);
  const [loopMode, setLoopMode] = useState<PictureBookLoopMode>("none");
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [pageTurn, setPageTurn] = useState<PageTurn | null>(null);
  const [playing, setPlaying] = useState(false);
  const [running, setRunning] = useState(true);
  const [coverNarrationEnded, setCoverNarrationEnded] = useState(false);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const [autoTurn, setAutoTurn] = useState(true);
  const [volume, setVolume] = useState(1);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeId = useId();
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const [audioError, setAudioError] = useState("");
  const [audioRetry, setAudioRetry] = useState(0);
  const [layout, setLayout] = useState<typeof layouts[number]["value"] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [viewError, setViewError] = useState("");
  const [zones, setZones] = useState({ controls: false, close: false, previous: false, next: false });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pageTurnRef = useRef<PageTurn | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDialogElement | null>(null);
  const activeBookId = entry.bookId;
  const activeRevisionItemId = entry.revisionItemId;
  const albumIndex = album.findIndex(item => item.bookId === activeBookId && (!activeRevisionItemId || item.revisionItemId === activeRevisionItemId));
  const albumAvailable = albumIndex >= 0;
  const returnHref = courseId ? `/c/${encodeURIComponent(courseId)}` : publicMode ? "/library" : "/storybook";

  useEffect(() => {
    if (!albumId || albumId !== courseId || publicMode) return;
    const controller = new AbortController();
    fetch(`/api/public/courses/${encodeURIComponent(albumId)}`, { credentials: "include", signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const result = await response.json() as { code?: number; data?: CoursePageResult };
        if (!response.ok || result.code !== 0 || result.data?.state !== "AVAILABLE") return;
        setAlbum(pictureBookAlbumEntries(albumId, result.data.course.items));
      }).catch(() => { /* 专辑加载失败时仅禁用多本循环，当前绘本仍可播放。 */ });
    return () => controller.abort();
  }, [albumId, courseId, publicMode]);

  useEffect(() => {
    if (!volumeOpen) return;
    const dismiss = (event: PointerEvent) => { if (!volumeRef.current?.contains(event.target as Node)) setVolumeOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [volumeOpen]);

  useEffect(() => {
    setFullscreenAvailable(Boolean(document.fullscreenEnabled));
    const update = () => { setFullscreen(document.fullscreenElement === playerRef.current); setZones({ controls: false, close: false, previous: false, next: false }); setVolumeOpen(false); };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    const dialog = settingsRef.current;
    if (settingsOpen && dialog && !dialog.open) dialog.showModal();
    if (!settingsOpen && dialog?.open) dialog.close();
  }, [settingsOpen]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(activeRevisionItemId && !publicMode ? `/api/creator-media/items/${encodeURIComponent(activeRevisionItemId)}/play` : `/api/${publicMode ? "public/" : ""}picture-books/${encodeURIComponent(activeBookId)}/play`, { credentials: "include", signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { code?: number; message?: string; data?: Book };
        if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "绘本加载失败");
        setBook(result.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "绘本加载失败");
      });
    return () => controller.abort();
  }, [activeBookId, activeRevisionItemId, publicMode]);

  const pages = book?.pages ?? [];
  const page = pages[index];
  const hasCover = pages[0]?.position === 0;
  const cover = hasCover && index === 0;
  const imageRatio = pictureBookPageRatio(book?.aspectRatio || "1:1", book?.isSpread, page?.position ?? 0);
  const activeLayout = pictureBookPlaybackLayout(layout ?? "subtitle", book?.isSpread, layout === null && page?.textInImage === true);
  const pageLabel = (pageIndex: number) => hasCover && pageIndex === 0 ? "封面" : `第 ${pageIndex + 1 - Number(hasCover)} 页`;
  // Stable page keys keep the next page's downloaded media when it becomes current.
  const preloadPages = pages.slice(index, index + 2);
  const imagePages = pages.slice(Math.max(0, index - 1), index + 2);
  const turningPage = pageTurn ? pages[pageTurn.to] : null;
  const imageSource = (item: Page) => pictureBookPageImageSource(activeBookId, item.position, item.imageUrl!, publicMode ? "public" : "private");

  useEffect(() => {
    if (!book || !learnerMode || !courseId || !activeRevisionItemId) return;
    const timer = window.setTimeout(() => {
      publishLearningContext({ isLearning: true, courseId, courseRevisionItemId: activeRevisionItemId, materialType: "PICTURE_BOOK", materialId: activeBookId, partKey: "READING" });
      publishLearningEvent({ type: "MATERIAL_STARTED", partKey: "READING" });
    });
    return () => { window.clearTimeout(timer); publishLearningContext({ isLearning: false }); };
  }, [book, activeBookId, courseId, activeRevisionItemId, learnerMode]);

  useEffect(() => {
    if (!page || !learnerMode || !courseId || !activeRevisionItemId) return;
    const timer = window.setTimeout(() => publishLearningEvent({ type: "NODE_LEARNED", partKey: "READING", itemId: String(page.position) }), 1200);
    return () => window.clearTimeout(timer);
  }, [courseId, activeRevisionItemId, learnerMode, page]);
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= pages.length) return;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlaying(false);
    setRunning(autoTurn && running);
    setCoverNarrationEnded(false);
    setPlaybackVersion(value => value + 1);
    setAudioError("");
    setAudioRetry(0);
    setIndex(next);
  }, [pages.length, autoTurn, running]);

  const turnTo = useCallback((next: number) => {
    if (next < 0 || next >= pages.length || pageTurnRef.current) return;
    const direction = pictureBookSpreadTurn(pages, Boolean(book?.isSpread), index, next, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (direction) {
      const turn: PageTurn = { from: index, to: next, direction };
      audioRef.current?.pause();
      setPlaying(false);
      pageTurnRef.current = turn;
      setPageTurn(turn);
      return;
    }
    goTo(next);
  }, [book?.isSpread, goTo, index, pages]);

  const completePageTurn = useCallback(() => {
    const turn = pageTurnRef.current;
    if (!turn) return;
    pageTurnRef.current = null;
    setPageTurn(null);
    goTo(turn.to);
  }, [goTo]);

  const finishPage = useCallback(() => {
    const next = pictureBookAfterPage({ autoTurn, mode: loopMode, pageIndex: index, pageCount: pages.length, albumIndex, albumCount: album.length });
    setPlaying(false);
    setCoverNarrationEnded(false);
    if (next && "page" in next) { turnTo(next.page); return; }
    if (next && "album" in next) {
      const selected = album[next.album]!;
      if (selected.bookId === activeBookId && selected.revisionItemId === activeRevisionItemId) { goTo(0); return; }
      setBook(null); setError(""); setAudioError(""); setAudioRetry(0); setIndex(0);
      setEntry(selected);
      window.history.replaceState(window.history.state, "", selected.href);
      return;
    }
    setRunning(false);
  }, [autoTurn, loopMode, index, pages.length, albumIndex, album, activeBookId, activeRevisionItemId, goTo, turnTo]);

  useEffect(() => {
    if (!page || page.audioUrl || !running || !autoTurn || pageTurn) return;
    const timer = window.setTimeout(finishPage, pictureBookSilentPageDuration(page.caption, cover));
    return () => window.clearTimeout(timer);
  }, [page, cover, running, autoTurn, pageTurn, finishPage]);

  useEffect(() => {
    if (!cover || !coverNarrationEnded || !running || !autoTurn) return;
    const timer = window.setTimeout(finishPage, PICTURE_BOOK_COVER_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [cover, coverNarrationEnded, running, autoTurn, finishPage]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (settingsRef.current?.open) return;
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === "Escape" && volumeOpen) setVolumeOpen(false);
      if (event.key === "ArrowLeft") { event.preventDefault(); turnTo(index - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); turnTo(index + 1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [turnTo, index, volumeOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!running) { audio.pause(); return; }
    if (!page?.audioUrl || (cover && coverNarrationEnded)) return;
    if (audio.error) { setAudioError("语音加载失败"); setRunning(false); return; }
    let cancelled = false;
    audio.play().catch(() => { if (!cancelled) { setPlaying(false); setRunning(false); } });
    return () => { cancelled = true; audio.pause(); };
  }, [running, page?.audioUrl, cover, coverNarrationEnded, activeBookId, index, audioRetry, playbackVersion]);

  async function toggleAudio() {
    const audio = audioRef.current;
    if (cover && coverNarrationEnded) { setRunning(!running); return; }
    if (!page?.audioUrl) { setRunning(!running); return; }
    if (!audio) return;
    if (!running || audio.paused) {
      try { await audio.play(); setRunning(true); } catch { setPlaying(false); setRunning(false); setAudioError("语音播放失败，请重试加载。"); }
    } else {
      setRunning(false);
      audio.pause();
      setPlaying(false);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen();
      setViewError("");
    } catch { setViewError("无法进入全屏，请使用浏览器的全屏功能。"); }
  }

  async function closePlayer() {
    audioRef.current?.pause();
    setRunning(false);
    if (document.fullscreenElement === playerRef.current) await document.exitFullscreen().catch(() => undefined);
    if (window.history.length > 1) router.back();
    else router.replace(returnHref);
  }

  return (
    <main ref={playerRef} className={`${styles.player} text-foreground`} data-public-theme="default" data-controls={zones.controls || volumeOpen || Boolean(audioError || viewError)} data-close={zones.close} data-previous={zones.previous} data-next={zones.next} onPointerMove={event => { if (fullscreen) { const rect = event.currentTarget.getBoundingClientRect(); const nextZones = pictureBookFullscreenZones(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height); setZones(nextZones); if (!nextZones.controls && !volumeRef.current?.contains(event.target as Node)) setVolumeOpen(false); } }} onPointerLeave={() => { setZones({ controls: false, close: false, previous: false, next: false }); setVolumeOpen(false); }} style={{ "--image-ratio": imageRatio } as CSSProperties}>
      <header className={styles.header}>
        <Link className={styles.back} href={returnHref}><ArrowLeft className="size-5" /><span>{courseId ? "返回资源" : "返回绘本"}</span></Link>
        <h1 className="truncate text-base font-semibold sm:text-xl">{book?.title || "绘本播放"}</h1>
        <span aria-hidden="true" />
      </header>
      {fullscreen ? <button className={styles.closePlayer} aria-label="关闭播放并返回" title="关闭播放并返回" onClick={() => void closePlayer()} type="button"><X /></button> : null}

      {error ? <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-background p-8 text-center text-sm">{error}</div> : null}
      {!book && !error ? <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />正在打开绘本…</div> : null}
      {book && !page ? <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-background p-8 text-center text-sm">这本绘本还没有页面</div> : null}

      {page ? (
        <>
          <div className={styles.stage}>
            <article className={styles.sheet} data-layout={activeLayout} data-cover={cover} aria-label={pageLabel(index)}>
              <div className={styles.artwork}>
                {imagePages.map(item => item.imageUrl ? <PictureBookImage key={`${activeBookId}-${item.position}`} hidden={item.position !== page.position} alt={`${book?.title}${pageLabel(pages.indexOf(item))}`} className={styles.image} src={pictureBookPageImageSource(activeBookId, item.position, item.imageUrl, publicMode ? "public" : "private")} /> : null)}
                {!page.imageUrl ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">这一页还没有图片</div> : null}
                {pageTurn && turningPage && page.imageUrl && turningPage.imageUrl ? (
                  <div className={styles.pageTurn} data-direction={pageTurn.direction} aria-hidden="true">
                    <PictureBookImage src={imageSource(turningPage)} alt="" compact className={styles.turnUnderlay} />
                    <div className={styles.turnStatic}><PictureBookImage src={imageSource(page)} alt="" compact className={`${styles.turnHalfImage} ${pageTurn.direction === "backward" ? styles.turnRightImage : ""}`} /></div>
                    <div className={styles.turnLeaf} onAnimationEnd={completePageTurn}>
                      <div className={styles.turnFront}><PictureBookImage src={imageSource(page)} alt="" compact className={`${styles.turnHalfImage} ${pageTurn.direction === "forward" ? styles.turnRightImage : ""}`} /></div>
                      <div className={styles.turnBack}><PictureBookImage src={imageSource(turningPage)} alt="" compact className={`${styles.turnHalfImage} ${pageTurn.direction === "backward" ? styles.turnRightImage : ""}`} /></div>
                    </div>
                  </div>
                ) : null}
              </div>
              {page.caption && !cover ? <div className={activeLayout === "hidden" ? "sr-only" : styles.caption}><p>{page.caption}</p></div> : null}
            </article>
            <button aria-label="上一页" className={`${styles.pageArrow} ${styles.previous}`} disabled={index === 0 || Boolean(pageTurn)} onClick={() => turnTo(index - 1)} type="button"><ChevronLeft /></button>
            <button aria-label="下一页" className={`${styles.pageArrow} ${styles.next}`} disabled={index === pages.length - 1 || Boolean(pageTurn)} onClick={() => turnTo(index + 1)} type="button"><ChevronRight /></button>
          </div>
          {preloadPages.map(item => {
            const current = item.position === page.position;
            const source = item.audioUrl ? pictureBookPageAudioSource(activeBookId, item.position, item.audioUrl, publicMode ? "public" : "private") : undefined;
            const retry = current ? audioRetry : 0;
            return <audio key={`${activeBookId}-${item.position}-${retry}`} hidden={!current} muted={volume === 0} preload="auto"
              onError={current ? () => { setPlaying(false); setRunning(false); setAudioError("语音加载失败"); } : undefined}
              onEnded={current ? () => { if (cover && autoTurn) { setPlaying(false); setCoverNarrationEnded(true); } else finishPage(); } : undefined}
              onPause={current ? () => setPlaying(false) : undefined}
              onPlay={current ? () => { setPlaying(true); setAudioError(""); } : undefined}
              ref={audio => { if (audio) audio.volume = volume; if (current) audioRef.current = audio; }}
              src={source && retry ? `${source}${source.includes("?") ? "&" : "?"}retry=${retry}` : source} />;
          })}
          <footer className={styles.footer}>
            {audioError || viewError ? <div role="alert" className={styles.feedback}>{audioError || viewError}{audioError ? <button className="ml-2 underline" onClick={() => { setAudioError(""); setRunning(true); setAudioRetry(audioRetry + 1); }} type="button">重试加载</button> : null}</div> : null}
            <nav aria-label="绘本播放控制" className={styles.toolbar}>
              <button title="上一页" aria-label="上一页" disabled={index === 0 || Boolean(pageTurn)} onClick={() => turnTo(index - 1)} type="button"><SkipBack /></button>
              <button title={playing || running ? "暂停播放" : "播放绘本"} aria-label={playing || running ? "暂停播放" : "播放绘本"} className={styles.play} onClick={toggleAudio} type="button">{playing || running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
              <button title="下一页" aria-label="下一页" disabled={index === pages.length - 1 || Boolean(pageTurn)} onClick={() => turnTo(index + 1)} type="button"><SkipForward /></button>
              <button title="播放设置" aria-label="播放设置" onClick={() => setSettingsOpen(true)} type="button"><SlidersHorizontal /></button>
              {fullscreenAvailable ? <button title={fullscreen ? "退出全屏" : "全屏观看"} aria-label={fullscreen ? "退出全屏" : "全屏观看"} onClick={toggleFullscreen} type="button">{fullscreen ? <Minimize /> : <Maximize />}</button> : null}
              <div ref={volumeRef} className={styles.volume} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setVolumeOpen(false); } }}>
                <button title="调节音量" aria-label="调节音量" aria-expanded={volumeOpen} aria-controls={volumeId} onClick={() => setVolumeOpen(!volumeOpen)} type="button">{volume === 0 ? <VolumeX /> : <Volume2 />}</button>
                {volumeOpen ? <div id={volumeId} className={styles.volumePopover}><input aria-label="音量" aria-valuetext={volume === 0 ? "静音" : `${Math.round(volume * 100)}%`} type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setVolume(Number(event.target.value))} /><span>{Math.round(volume * 100)}%</span></div> : null}
              </div>
              <select aria-label="跳转页面" title="跳转页面" className={styles.pageSelect} value={index} disabled={Boolean(pageTurn)} onChange={event => turnTo(Number(event.target.value))}>
                {pages.map((item, pageIndex) => <option key={item.position} value={pageIndex}>{hasCover && pageIndex === 0 ? "封面" : pageIndex + 1 - Number(hasCover)} / {pages.length - Number(hasCover)}</option>)}
              </select>
            </nav>
          </footer>
        </>
      ) : null}
      <dialog ref={settingsRef} aria-labelledby="reader-settings-title" className={styles.settings} onCancel={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)} onClick={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <div className="mb-5 flex items-center justify-between"><h2 id="reader-settings-title" className="text-lg font-semibold">播放设置</h2><button aria-label="关闭播放设置" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" onClick={() => setSettingsOpen(false)} type="button"><X className="size-5" /></button></div>
        <fieldset className="rounded-2xl bg-background p-5"><legend className="sr-only">图文版式</legend><p className="mb-4 text-sm font-semibold">图文版式</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {layouts.map(item => <button key={item.value} aria-pressed={activeLayout === item.value} disabled={Boolean(book?.isSpread && item.value === "side")} title={book?.isSpread && item.value === "side" ? "跨页绘本不支持左文右图" : undefined} className={`flex flex-col items-center gap-3 rounded-xl border px-1 py-4 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${activeLayout === item.value ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-muted"}`} onClick={() => setLayout(pictureBookPlaybackLayout(item.value, book?.isSpread))} type="button"><item.icon className="size-7" />{item.label}</button>)}
        </div></fieldset>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-background p-5"><span id="reader-auto-turn-label" className="text-sm font-semibold">自动翻页</span><button role="switch" aria-labelledby="reader-auto-turn-label" aria-checked={autoTurn} className={`h-6 w-11 rounded-full p-0.5 transition-colors ${autoTurn ? "bg-primary" : "bg-black/20"}`} onClick={() => setAutoTurn(!autoTurn)} type="button"><span className={`block size-5 rounded-full bg-white transition-transform ${autoTurn ? "translate-x-5" : "translate-x-0"}`} /></button></div>
        <div className="mt-4 rounded-2xl bg-background p-5"><label htmlFor="reader-loop-mode" className="mb-3 block text-sm font-semibold">循环模式</label><select id="reader-loop-mode" className="w-full rounded-xl border border-border bg-background p-3 text-sm" value={loopMode} onChange={event => setLoopMode(event.target.value as PictureBookLoopMode)}><option value="none">不循环</option><option value="book">单本循环</option><option value="album" disabled={!albumAvailable}>多本循环{albumAvailable ? "" : "（从专辑进入后可用）"}</option></select></div>
      </dialog>
    </main>
  );
}
