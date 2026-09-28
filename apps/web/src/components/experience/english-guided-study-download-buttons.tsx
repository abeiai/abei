"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EnglishGuidedStudyMaterial } from "@/lib/english-guided-study-data";
import { courseSubtitleDownload, fetchCourseAudioDownload, type CourseAudioDownloadKind } from "@/lib/english-guided-study-download";

export function EnglishGuidedStudyDownloadButtons({ material, disabled }: { material: EnglishGuidedStudyMaterial | null; disabled: boolean }) {
  const [pending, setPending] = useState<CourseAudioDownloadKind | null>(null);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const subtitles = { narration: courseSubtitleDownload(material, "narration"), demonstration: courseSubtitleDownload(material, "demonstration") };
  const version = JSON.stringify([material?.id, material?.audioUrl, material?.narrationTimelineV2?.nodes.map(node => node.audioUrl),
    material?.readAlong?.audioUrl, material?.readAlong?.nodes.map(node => node.audioUrl)]);
  useEffect(() => {
    setPending(null);
    setError("");
    return () => { active.current?.abort(); active.current = null; };
  }, [version]);

  async function download(kind: CourseAudioDownloadKind, subtitle = false) {
    if (!material || active.current) return;
    const captions = subtitles[kind];
    if (subtitle && !captions) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(kind);
    setError("");
    try {
      const file = subtitle && captions
        ? { blob: new Blob(["\uFEFF", captions.text], { type: "text/plain;charset=utf-8" }), filename: captions.filename }
        : await fetchCourseAudioDownload(material.id, kind, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "音频下载失败，请稍后重试");
    } finally {
      if (active.current === controller) { active.current = null; setPending(null); }
    }
  }

  return <div className="grid gap-2">
    {(["narration", "demonstration"] as const).map(kind => {
      const available = kind === "narration" ? Boolean(material?.audioUrl) : Boolean(material?.readAlong?.audioUrl);
      const busy = pending === kind;
      const original = kind === "demonstration" && material?.readAlong?.source === "UPLOAD";
      return <Button aria-busy={busy} className="w-full bg-white text-black hover:bg-neutral-100" disabled={disabled || !available || pending !== null}
        key={kind} onClick={() => void download(kind)} type="button" variant="outline">
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        {busy ? original ? "正在下载…" : "正在合并音频…" : kind === "narration" ? "讲解语音下载" : "示范语音下载"}
      </Button>;
    })}
    {(["narration", "demonstration"] as const).map(kind => <Button
      className="w-full bg-white text-black hover:bg-neutral-100" disabled={disabled || !subtitles[kind] || pending !== null}
      key={`${kind}-subtitles`} onClick={() => void download(kind, true)} type="button" variant="outline">
      <Captions />{kind === "narration" ? "讲解字幕下载" : "示范字幕下载"}
    </Button>)}
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
  </div>;
}
