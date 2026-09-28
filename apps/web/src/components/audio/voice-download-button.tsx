"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchVoiceDownload, formatVoiceDownloadSize, type VoiceDownloadFormat, type VoiceDownloadTarget } from "@/lib/voice-download";

export function VoiceDownloadButton({ target, label = "下载音频" }: {
  target: VoiceDownloadTarget; label?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sizes, setSizes] = useState<Partial<Record<VoiceDownloadFormat, number | null>>>({});
  const files = useRef<Partial<Record<VoiceDownloadFormat, Awaited<ReturnType<typeof fetchVoiceDownload>>>>>({});
  const active = useRef<AbortController | null>(null);
  const key = JSON.stringify(target);
  useEffect(() => { setError(""); setMenuOpen(false); setSizes({}); files.current = {}; return () => active.current?.abort(); }, [key]);
  useEffect(() => {
    if (!menuOpen) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError("");
    void Promise.all((["mp3", "wav"] as const).map(async format => {
      if (files.current[format]) return;
      setSizes(previous => ({ ...previous, [format]: undefined }));
      try {
        const currentTarget = JSON.parse(key) as VoiceDownloadTarget;
        const query = new URLSearchParams({ ...("task" in currentTarget ? { task: currentTarget.task } : { project: currentTarget.project, revision: String(currentTarget.revision) }), format });
        const file = await fetchVoiceDownload(`/voice/download?${query}`, format, controller.signal);
        if (controller.signal.aborted) return;
        files.current[format] = file;
        setSizes(previous => ({ ...previous, [format]: file.blob.size }));
      } catch (failure) {
        if (!controller.signal.aborted) {
          setSizes(previous => ({ ...previous, [format]: null }));
          setError(failure instanceof Error ? failure.message : "音频下载失败，请稍后重试");
        }
      }
    })).finally(() => { if (active.current === controller) setPending(false); });
    return () => { controller.abort(); if (active.current === controller) { active.current = null; setPending(false); } };
  }, [key, menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    container.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);
  const download = (format: VoiceDownloadFormat) => {
    const file = files.current[format];
    if (!file) return;
    setMenuOpen(false);
    trigger.current?.focus();
    setError("");
    try {
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "音频下载失败，请稍后重试");
    }
  };
  return (
    <div className="relative flex min-w-0 flex-col items-end gap-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }} ref={container}>
      <Button aria-busy={pending} aria-controls={menuId} aria-expanded={menuOpen} aria-haspopup="menu" aria-label={label} className="size-9 shrink-0 px-0" onClick={() => setMenuOpen(open => !open)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setMenuOpen(true); } }} ref={trigger} size="sm" title={label} type="button" variant="outline">
        {pending ? <LoaderCircle className="animate-spin" /> : <Download />}
      </Button>
      {menuOpen ? <div aria-label="下载格式" className="absolute bottom-full right-0 z-40 mb-2 w-48 rounded-lg border border-border bg-background p-1 shadow-lg" id={menuId} onKeyDown={event => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
        }
      }} role="menu">{(["mp3", "wav"] as const).map(format => {
        const size = sizes[format];
        return <button aria-disabled={!size} className="flex h-9 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm hover:bg-secondary focus:bg-secondary focus:outline-none" key={format} onClick={() => download(format)} role="menuitem" type="button">
          <span>{format.toUpperCase()}</span>
          <span aria-live="polite" className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {size ? formatVoiceDownloadSize(size) : size === null ? "读取失败" : "读取中..."}
          </span>
        </button>;
      })}</div> : null}
      {error ? <p className="max-w-[240px] text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
