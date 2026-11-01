"use client";

import { Captions, ChevronLeft, ChevronRight, EyeOff, Maximize, Minimize, PanelLeft, PanelsTopLeft, Pause, Play, SkipBack, SkipForward, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { guidePlaybackPage, type PictureBookGuide } from "@/lib/picture-book-guide";
import type { PictureBookPlaybackLayout } from "@/lib/picture-book-layout";
import styles from "./picture-book-player.module.css";

const layouts = [
  { value: "subtitle", label: "底部字幕", icon: Captions },
  { value: "side", label: "左文右图", icon: PanelLeft },
  { value: "below", label: "上图下文", icon: PanelsTopLeft },
  { value: "hidden", label: "隐藏文字", icon: EyeOff },
] as const;

export function PictureBookGuidePlayer({ guide, initialPage, onClose }: { guide: PictureBookGuide; initialPage: number; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, guide.pages.findIndex(page => page.pageNumber === initialPage)));
  const [playing, setPlaying] = useState(false);
  const [autoTurn, setAutoTurn] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [layout, setLayout] = useState<PictureBookPlaybackLayout>("subtitle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageRatio, setImageRatio] = useState(1.5);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const playerRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const page = guide.pages[index];
  const hasCover = Boolean(guide.pdfName && guide.pages[0]?.pdfAnalysis && !guide.pages[0]?.pdfNeedsAnalysis);
  const display = page ? guidePlaybackPage(page, index, hasCover) : null;

  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => {
    const dialog = settingsRef.current;
    if (settingsOpen && dialog && !dialog.open) dialog.showModal();
    if (!settingsOpen && dialog?.open) dialog.close();
  }, [settingsOpen]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    const audio = audioRef.current;
    if (!playing) { audio?.pause(); return; }
    if (!page?.audioUrl) { setPlaying(false); setError("本页还没有带读语音"); return; }
    let cancelled = false;
    void audio?.play().catch(() => { if (!cancelled) { setPlaying(false); setError("语音播放失败，请重试"); } });
    return () => { cancelled = true; audio?.pause(); };
  }, [index, page?.audioUrl, playing]);

  function goTo(next: number) {
    if (next < 0 || next >= guide.pages.length) return;
    audioRef.current?.pause(); setError(""); setIndex(next);
  }
  function close() {
    audioRef.current?.pause();
    if (document.fullscreenElement === playerRef.current) void document.exitFullscreen().catch(() => undefined);
    onClose();
  }

  return <dialog ref={dialogRef} aria-label="播放绘本导读" onCancel={event => { event.preventDefault(); close(); }} className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 p-0 backdrop:bg-black/60">
    <main ref={playerRef} className={`${styles.player} text-foreground`} data-controls="true" data-close="true" data-previous="true" data-next="true" style={{ "--image-ratio": imageRatio } as CSSProperties}>
      <header className={styles.header}><button type="button" className={styles.back} onClick={close}><X className="size-5" />返回导读</button><h1 className="truncate text-base font-semibold sm:text-xl">{guide.title}</h1><span /></header>
      {fullscreen ? <button type="button" aria-label="关闭播放并返回导读" className={styles.closePlayer} onClick={close}><X /></button> : null}
      {page && display ? <>
        <div className={styles.stage}>
          <article className={styles.sheet} data-layout={layout} data-cover={display.cover} aria-label={display.label}>
            <div className={styles.artwork}><img src={page.imageUrl} alt={`${guide.title}${display.label}`} className={styles.image} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setImageRatio(image.naturalWidth / image.naturalHeight); }} /></div>
            {display.text && !display.cover ? <div className={layout === "hidden" ? "sr-only" : styles.caption}><p>{display.text}</p></div> : null}
          </article>
          <button type="button" aria-label="上一页" className={`${styles.pageArrow} ${styles.previous}`} disabled={index === 0} onClick={() => goTo(index - 1)}><ChevronLeft /></button>
          <button type="button" aria-label="下一页" className={`${styles.pageArrow} ${styles.next}`} disabled={index === guide.pages.length - 1} onClick={() => goTo(index + 1)}><ChevronRight /></button>
        </div>
        {page.audioUrl ? <audio ref={audioRef} key={page.audioUrl} src={page.audioUrl} preload="auto" onError={() => { setPlaying(false); setError("语音加载失败，请重试"); }} onEnded={() => { if (autoTurn && index < guide.pages.length - 1) goTo(index + 1); else setPlaying(false); }} /> : null}
        <footer className={styles.footer}>
          {error ? <div role="alert" className={styles.feedback}>{error}</div> : null}
          <nav aria-label="导读播放控制" className={styles.toolbar}>
            <button type="button" aria-label="上一页" disabled={index === 0} onClick={() => goTo(index - 1)}><SkipBack /></button>
            <button type="button" className={styles.play} aria-label={playing ? "暂停播放" : "播放导读"} disabled={!page.audioUrl} onClick={() => { if (audioRef.current?.error) audioRef.current.load(); setError(""); setPlaying(!playing); }}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
            <button type="button" aria-label="下一页" disabled={index === guide.pages.length - 1} onClick={() => goTo(index + 1)}><SkipForward /></button>
            <button type="button" title="播放设置" aria-label="播放设置" onClick={() => setSettingsOpen(true)}><SlidersHorizontal /></button>
            <select aria-label="跳转页面" className={styles.pageSelect} value={index} onChange={event => goTo(Number(event.target.value))}>{guide.pages.map((item, i) => <option key={item.pageNumber} value={i}>{i + 1} / {guide.pages.length}</option>)}</select>
            <label className="flex items-center gap-1 whitespace-nowrap text-sm"><input type="checkbox" checked={autoTurn} onChange={event => setAutoTurn(event.target.checked)} />自动翻页</label>
            {typeof document !== "undefined" && document.fullscreenEnabled ? <button type="button" aria-label={fullscreen ? "退出全屏" : "全屏观看"} onClick={() => { const action = fullscreen ? document.exitFullscreen() : playerRef.current?.requestFullscreen(); void action?.catch(() => setError("无法切换全屏")); }}>{fullscreen ? <Minimize /> : <Maximize />}</button> : null}
          </nav>
        </footer>
        {!page.audioUrl ? <p role="status" className="pb-4 text-center text-sm text-muted-foreground">本页还没有带读语音</p> : null}
      </> : null}
      <dialog ref={settingsRef} aria-labelledby="guide-reader-settings-title" className={styles.settings} onCancel={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)} onClick={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <div className="mb-5 flex items-center justify-between"><h2 id="guide-reader-settings-title" className="text-lg font-semibold">播放设置</h2><button aria-label="关闭播放设置" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" onClick={() => setSettingsOpen(false)} type="button"><X className="size-5" /></button></div>
        <fieldset className="rounded-2xl bg-background p-5"><legend className="sr-only">图文版式</legend><p className="mb-4 text-sm font-semibold">图文版式</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {layouts.map(item => <button key={item.value} aria-pressed={layout === item.value} className={`flex flex-col items-center gap-3 rounded-xl border px-1 py-4 text-sm ${layout === item.value ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-muted"}`} onClick={() => setLayout(item.value)} type="button"><item.icon className="size-7" />{item.label}</button>)}
        </div></fieldset>
      </dialog>
    </main>
  </dialog>;
}
