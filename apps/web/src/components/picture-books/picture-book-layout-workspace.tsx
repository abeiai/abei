"use client";

import { useEffect, useMemo, useState } from "react";
import { pictureBookPageImageSource } from "@/lib/picture-book-images";
import { pictureBookLayoutHref, pictureBookPageNeighbors, pictureBookStudioHref } from "@/lib/picture-book-layout-navigation";
import type { PictureBookTextLayout } from "@/lib/picture-book-text-layout";
import type { VoiceAsset } from "@/lib/audio-api";
import type { VoicePickerOption } from "@/lib/voice-picker";
import { PictureBookTextEditor } from "./picture-book-text-editor";
import { usePictureBookGenerationConfirmation } from "./picture-book-generation-confirmation";

type Page = { position: number; caption?: string | null; imageUrl: string | null; textLayout?: PictureBookTextLayout };
type Book = { id: string; pages: Page[] };
type VoiceList = { systemVoices: VoiceAsset[]; platformVoices: VoiceAsset[]; customVoices: VoiceAsset[]; defaultVoice?: { voiceAssetId: string | null; systemVoiceId: string | null } };
const emptyVoices: VoiceList = { systemVoices: [], platformVoices: [], customVoices: [] };
const button = "rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/picture-books${path}`, { method, credentials: "include", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok || payload?.code !== 0 || payload.data === undefined) throw new Error(payload?.message || "请求失败，请稍后重试");
  return payload.data;
}

export function PictureBookLayoutWorkspace({ bookId, initialPosition }: { bookId: string; initialPosition: number | null }) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voices, setVoices] = useState<VoiceList>(emptyVoices);
  const [voiceKey, setVoiceKey] = useState("");
  const generationConfirmation = usePictureBookGenerationConfirmation();
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [loaded, voiceResponse] = await Promise.all([api<Book>(`/${encodeURIComponent(bookId)}`), fetch("/api/audio/voices", { credentials: "include", cache: "no-store" }).then(response => response.ok ? response.json() : null).catch(() => null)]);
        if (!active) return;
        setBook(loaded);
        const list = (voiceResponse?.data ?? emptyVoices) as VoiceList;
        setVoices(list);
        setVoiceKey(list.defaultVoice?.voiceAssetId ? `voice:${list.defaultVoice.voiceAssetId}` : list.defaultVoice?.systemVoiceId ? `system:${list.defaultVoice.systemVoiceId}` : list.systemVoices[0]?.providerVoiceId ? `system:${list.systemVoices[0].providerVoiceId}` : "");
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "绘本加载失败，请稍后重试"); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [bookId]);
  const voiceOptions = useMemo<VoicePickerOption[]>(() => [
    { value: "", name: "使用默认声音", badge: "默认声音" },
    ...voices.systemVoices.map(voice => ({ ...voice, value: `system:${voice.providerVoiceId ?? voice.id}`, badge: "官方系统音色" })),
    ...voices.platformVoices.filter(voice => voice.status === "READY").map(voice => ({ ...voice, value: `voice:${voice.id}`, badge: voice.type === "SYSTEM" ? "平台系统音色" : voice.type === "CLONED" ? "平台复刻音色" : "平台设计音色" })),
    ...voices.customVoices.filter(voice => voice.status === "READY").map(voice => ({ ...voice, value: `voice:${voice.id}`, badge: voice.typeName }))
  ], [voices]);
  const position = initialPosition ?? book?.pages[0]?.position ?? 1;
  const page = book?.pages.find(item => item.position === position);
  const bookLayoutEnabled = Boolean(book?.pages.some(item => item.textLayout?.enabled));
  const needsBookLayoutSync = Boolean(book?.pages.some(item => Boolean(item.textLayout?.enabled) !== bookLayoutEnabled));
  const neighbors = pictureBookPageNeighbors(book?.pages ?? [], position);
  const navigate = (target: number) => window.location.assign(pictureBookLayoutHref(bookId, target));
  const back = () => window.location.assign(pictureBookStudioHref(bookId, position));

  if (loading) return <main className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground" role="status">正在加载绘本…</main>;
  if (error || !page) return <main className="p-6"><p role="alert" className="text-sm text-destructive">{error || "未找到该绘本页面"}</p><button type="button" className={`${button} mt-4`} onClick={back}>返回绘本</button></main>;
  if (!page.imageUrl) return <main className="min-h-dvh bg-[#f6f6f5]"><header className="flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3"><button type="button" className={button} onClick={back}>返回绘本</button><h1 className="text-lg font-semibold">图文编排 · {position === 0 ? "封面" : `第 ${position} 页`}</h1><button type="button" className={button} disabled={neighbors.previous === null} onClick={() => neighbors.previous !== null && navigate(neighbors.previous)}>上一页</button><button type="button" className={button} disabled={neighbors.next === null} onClick={() => neighbors.next !== null && navigate(neighbors.next)}>下一页</button></header><p className="p-6 text-sm text-muted-foreground">本页还没有图片，请先返回绘本生成或上传图片。</p></main>;
  return <>{generationConfirmation.dialog}<PictureBookTextEditor key={`${bookId}-${position}`} bookId={bookId} position={position} imageUrl={pictureBookPageImageSource(bookId, position, page.imageUrl)} initial={page.textLayout} bookLayoutEnabled={bookLayoutEnabled} needsBookLayoutSync={needsBookLayoutSync} legacyCaption={page.caption ?? ""} voiceKey={voiceKey} voiceOptions={voiceOptions} onVoiceChange={setVoiceKey} onClose={back} previous={neighbors.previous} next={neighbors.next} onNavigate={navigate} onSaved={textLayout => setBook(current => current ? { ...current, pages: current.pages.map(item => ({ ...item, textLayout: item.position === position ? textLayout : { ...(item.textLayout ?? { versions: [{ language: "original", boxes: [], audioUrl: null }] }), enabled: textLayout.enabled } })) } : current)} save={async (textLayout, baseline) => {
    const updated = await api<Book>(`/${encodeURIComponent(bookId)}/pages/${position}`, "PATCH", { textLayout, expectedTextLayout: baseline });
    const result = updated.pages.find(item => item.position === position)?.textLayout;
    if (!result) throw new Error("图文编排保存失败");
    return result;
  }} generate={async (language, selectedVoice, narration) => {
    const voice = selectedVoice.startsWith("voice:") ? { voiceAssetId: selectedVoice.slice(6) } : selectedVoice.startsWith("system:") ? { voice: selectedVoice.slice(7) } : {};
    const payload = { textLayout: true, expectedLayoutNarration: narration, ...(language === "original" ? {} : { language }), ...voice };
    if (!await generationConfirmation.confirm({ label: "图文编排语音生成", path: `/${encodeURIComponent(bookId)}/generation-cost`, body: { kind: "audio", position, ...payload } })) return null;
    const updated = await api<Book>(`/${encodeURIComponent(bookId)}/pages/${position}/audio`, "POST", payload);
    const result = updated.pages.find(item => item.position === position)?.textLayout;
    if (!result) throw new Error("语音生成失败");
    return result;
  }} /></>;
}
