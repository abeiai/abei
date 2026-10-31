"use client";

import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PictureBookGuide } from "@/lib/picture-book-guide";
import styles from "./picture-book-player.module.css";

export function PictureBookGuidePlayer({ guide, initialPage, onClose }: { guide: PictureBookGuide; initialPage: number; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, guide.pages.findIndex(page => page.pageNumber === initialPage)));
  const [playing, setPlaying] = useState(false);
  const [autoTurn, setAutoTurn] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const playerRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const page = guide.pages[index];

  useEffect(() => { dialogRef.current?.showModal(); }, []);
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
    <main ref={playerRef} className={`${styles.player} text-foreground`} data-controls="true" data-close="true" data-previous="true" data-next="true" style={{ "--image-ratio": 1.5 } as CSSProperties}>
      <header className={styles.header}><button type="button" className={styles.back} onClick={close}><X className="size-5" />返回导读</button><h1 className="truncate text-base font-semibold sm:text-xl">{guide.title}</h1><span /></header>
      {fullscreen ? <button type="button" aria-label="关闭播放并返回导读" className={styles.closePlayer} onClick={close}><X /></button> : null}
      {page ? <>
        <div className={styles.stage}>
          <article className={styles.sheet} data-layout="subtitle" data-cover="false" aria-label={`第 ${index + 1} 页`}>
            <div className={styles.artwork}><img src={page.imageUrl} alt={`${guide.title}第 ${index + 1} 页`} className={styles.image} /></div>
            {page.script ? <div className={styles.caption}><p>{page.script}</p></div> : null}
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
            <select aria-label="跳转页面" className={styles.pageSelect} value={index} onChange={event => goTo(Number(event.target.value))}>{guide.pages.map((item, i) => <option key={item.pageNumber} value={i}>{i + 1} / {guide.pages.length}</option>)}</select>
            <label className="flex items-center gap-1 whitespace-nowrap text-sm"><input type="checkbox" checked={autoTurn} onChange={event => setAutoTurn(event.target.checked)} />自动翻页</label>
            {typeof document !== "undefined" && document.fullscreenEnabled ? <button type="button" aria-label={fullscreen ? "退出全屏" : "全屏观看"} onClick={() => { const action = fullscreen ? document.exitFullscreen() : playerRef.current?.requestFullscreen(); void action?.catch(() => setError("无法切换全屏")); }}>{fullscreen ? <Minimize /> : <Maximize />}</button> : null}
          </nav>
        </footer>
        {!page.audioUrl ? <p role="status" className="pb-4 text-center text-sm text-muted-foreground">本页还没有带读语音</p> : null}
      </> : null}
    </main>
  </dialog>;
}
