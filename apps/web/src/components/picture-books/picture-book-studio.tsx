"use client";

import { CreatorWorkMetadata, type CreatorSync } from "@/components/creator/work-metadata";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, History, ImagePlus, LibraryBig, LoaderCircle, MessageCircle, Mic2, Plus, Play, Save, Send, Sparkles, Volume2, WandSparkles, X } from "lucide-react";
import { pictureBookPageImageSource, waitForPictureBookImage } from "@/lib/picture-book-images";
import { publicPictureBookHref } from "@/lib/picture-book-public-slug";
import { PictureBookImage } from "./picture-book-image";
import { pictureBookPageAudioSource, waitForPictureBookAudio } from "@/lib/picture-book-audio";
import { PictureBookAudio } from "./picture-book-audio";
import { pictureBookLanguageChoices, pictureBookLanguageName } from "@/lib/picture-book-languages";
import { acknowledgePictureBookDraft, patchPictureBookPage, pictureBookGenerationKey, pictureBookTranslationBaseline, type PictureBookPageDraft } from "@/lib/picture-book-background";
import { loadPictureBookStyles, selectedPictureBookStyle, type PictureBookStyle } from "@/lib/picture-book-styles";
import { PictureBookStylePicker } from "./picture-book-style-picker";
import { PictureBookRatioPicker, type PictureBookAspectRatio } from "./picture-book-ratio-picker";
import { PictureBookCharacterPicker, type StoryCharacter } from "./picture-book-character-picker";
import { VoicePicker } from "@/components/audio/voice-picker";
import { usePictureBookGenerationConfirmation } from "./picture-book-generation-confirmation";
import type { VoiceAsset } from "@/lib/audio-api";
import type { VoicePickerOption } from "@/lib/voice-picker";

type Translation = { language: string; caption: string; audioUrl: string | null };
type Page = { position: number; caption: string; imagePrompt: string; narration: string; imageUrl: string | null; audioUrl: string | null; translations?: Translation[] };
type Character = StoryCharacter;
type AspectRatio = PictureBookAspectRatio;
function SpreadSelect({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="block space-y-2 text-sm font-semibold">是否跨页<select value={value ? "yes" : "no"} disabled={disabled} onChange={event => onChange(event.target.value === "yes")} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"><option value="no">否</option><option value="yes">是</option></select></label>;
}
type Submission = { status: "PENDING" | "APPROVED" | "REJECTED"; reviewNote: string | null };
function submissionLabel(submission?: Submission | null, sharedViaAlbum = false) { return sharedViaAlbum ? "已通过专辑分享" : submission?.status === "PENDING" ? "公开分享审核中" : submission?.status === "APPROVED" ? "公开分享已通过" : submission?.status === "REJECTED" ? "公开分享未通过" : ""; }
type Book = { creatorSync?: CreatorSync; submission?: Submission | null; sharedViaAlbum?: boolean; id: string; title: string; brief: string; theme: string; audience: string; plot: string; style: string; aspectRatio: AspectRatio; isSpread: boolean; pageCount: number; status: string; messages: Array<{ role: "user" | "assistant"; content: string }>; characters: Character[]; pages: Page[]; updatedAt: string };
type BookSummary = Pick<Book, "id" | "title" | "theme" | "pageCount" | "status" | "updatedAt" | "submission" | "creatorSync" | "sharedViaAlbum"> & { coverUrl: string | null };
type ChatModel = { isMock: boolean; aliases: Array<{ aliasKey: string }> };
type Voice = VoiceAsset;
type VoiceList = { systemVoices: Voice[]; platformVoices: Voice[]; customVoices: Voice[]; defaultVoice?: { voiceAssetId: string | null; systemVoiceId: string | null } };

const pageCounts = [4, 6, 8, 10, 12, 16, 20, 24];
const audiences = ["婴儿期0-1岁", "幼儿期1-3岁", "幼儿园", "一二年级", "三四年级", "五六年级", "初中", "高中及以上"];

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/picture-books${path}`, {
    method, credentials: "include", cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok || payload?.code !== 0 || payload.data === undefined) throw new Error(payload?.message || "请求失败，请稍后重试");
  return payload.data;
}

async function upload<T>(path: string, file: File): Promise<T> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error("请选择 10MB 以内的 JPG、PNG 或 WebP 图片");
  }
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(`/api/picture-books${path}`, { method: "POST", credentials: "include", body });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok || payload?.code !== 0 || payload.data === undefined) throw new Error(payload?.message || "图片上传失败");
  return payload.data;
}

async function hasStoryModel(): Promise<boolean> {
  const response = await fetch("/api/ai/chat/models", { credentials: "include", cache: "no-store" });
  const payload = await response.json() as { data?: ChatModel[] };
  return (payload.data ?? []).some((model) => !model.isMock && model.aliases.some((alias) => ["default-chat", "fast-chat"].includes(alias.aliasKey)));
}

async function getVoices(): Promise<VoiceList> {
  const response = await fetch("/api/audio/voices", { credentials: "include", cache: "no-store" });
  const payload = await response.json() as { data?: VoiceList };
  return payload.data ?? { systemVoices: [], platformVoices: [], customVoices: [] };
}

function Button({ children, onClick, disabled, kind = "neutral", className = "", title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: "neutral" | "primary" | "quiet"; className?: string; title?: string }) {
  const tone = kind === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/95 border-primary" : kind === "quiet" ? "border-transparent bg-transparent text-muted-foreground hover:bg-secondary" : "border-border bg-background text-foreground hover:border-primary/35 hover:text-primary";
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`xueleai-button inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${className}`}>{children}</button>;
}

function Field({ label, value, onChange, rows = 3, placeholder, maxLength, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; maxLength?: number; readOnly?: boolean }) {
  return <label className="block space-y-2"><span className="text-sm font-semibold text-[#272a30]">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={rows} maxLength={maxLength} placeholder={placeholder} className="w-full resize-y rounded-xl border border-[#e8e6e3] bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-[#ff8c55] focus:ring-2 focus:ring-[#ff8c55]/15 read-only:bg-[#f8f7f5]" /></label>;
}

export function PictureBookStudio({ signedIn, initialBookId, initialPrompt = "", returnPath = "/storybook" }: { signedIn: boolean; initialBookId: string; initialPrompt?: string; returnPath?: string }) {
  const generationConfirmation = usePictureBookGenerationConfirmation();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [draftCharacters, setDraftCharacters] = useState<Character[]>([]);
  const [voices, setVoices] = useState<VoiceList>({ systemVoices: [], platformVoices: [], customVoices: [] });
  const [storyModelReady, setStoryModelReady] = useState(false);
  const [voiceKey, setVoiceKey] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const voiceOptions = useMemo<VoicePickerOption[]>(() => [
    { value: "", name: "使用默认声音", badge: "默认声音" },
    ...voices.systemVoices.map(voice => ({
      ...voice, value: `system:${voice.providerVoiceId ?? voice.id}`, badge: "官方系统音色"
    })),
    ...voices.platformVoices.filter(voice => voice.status === "READY").map(voice => ({
      ...voice, value: `voice:${voice.id}`,
      badge: voice.type === "SYSTEM" ? "平台系统音色" : voice.type === "CLONED" ? "平台复刻音色" : "平台设计音色"
    })),
    ...voices.customVoices.filter(voice => voice.status === "READY").map(voice => ({
      ...voice, value: `voice:${voice.id}`, badge: voice.typeName
    }))
  ], [voices]);
  const [audience, setAudience] = useState("幼儿园");
  const [style, setStyle] = useState("水彩");
  const [styleChoices, setStyleChoices] = useState<PictureBookStyle[]>([]);
  const [count, setCount] = useState(8);
  const [ratio, setRatio] = useState<AspectRatio>("1:1");
  const [isSpread, setIsSpread] = useState(false);
  const [chatInput, setChatInput] = useState(initialBookId ? "" : initialPrompt);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(1);
  const [pageDrafts, setPageDrafts] = useState<Record<string, PictureBookPageDraft>>({});
  const saveQueueRef = useRef(new Map<string, Promise<Book | null>>());
  const [busy, setBusy] = useState("");
  const [generationKeys, setGenerationKeys] = useState<string[]>([]);
  const generationRef = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(1);
  const [loading, setLoading] = useState(signedIn);
  const leavingRef = useRef(false);

  const openBook = useCallback(async (id: string) => {
    const loaded = await api<Book>(`/${id}`);
    setBook(loaded);
    setChatInput("");
    setPosition(loaded.pages[0]?.position ?? 1);
    setPreview(false);
    window.history.replaceState(null, "", `/storybook?book=${loaded.id}`);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    Promise.allSettled([api<BookSummary[]>(""), Promise.resolve(null), getVoices(), hasStoryModel(), loadPictureBookStyles()]).then(async (results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setBooks(results[0].value);
      else setError(results[0].reason instanceof Error ? results[0].reason.message : "无法读取绘本作品");
      if (results[2].status === "fulfilled") {
        const list = results[2].value;
        setVoices(list);
        setVoiceKey(list.defaultVoice?.voiceAssetId ? `voice:${list.defaultVoice.voiceAssetId}` : list.defaultVoice?.systemVoiceId ? `system:${list.defaultVoice.systemVoiceId}` : list.systemVoices[0]?.providerVoiceId ? `system:${list.systemVoices[0].providerVoiceId}` : "");
      }
      if (results[3].status === "fulfilled") setStoryModelReady(results[3].value);
      if (results[4].status === "fulfilled") {
        const list = results[4].value; setStyleChoices(list);
        setStyle(list.find(item => item.enabled && item.id === "watercolor")?.id ?? list.find(item => item.enabled)!.id);
      } else setError(results[4].reason instanceof Error ? results[4].reason.message : "绘画风格加载失败");
      if (initialBookId) {
        try { await openBook(initialBookId); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "作品加载失败"); }
      }
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [signedIn, initialBookId, openBook]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [book?.id, book?.messages.length, busy]);

  const page = book?.pages.find((item) => item.position === position);
  const previewIndex = book?.pages.findIndex(item => item.position === previewPosition) ?? -1;
  const previewPages = previewIndex < 0 ? [] : book!.pages.slice(previewIndex, previewIndex + 2);
  const caption = page?.caption ?? "", imagePrompt = page?.imagePrompt ?? "", narration = page?.narration ?? "";
  const draftKey = `${book?.id}:${position}`;
  const savedTranslations = page?.translations?.map(item => ({ language: item.language, caption: item.caption })) ?? [];
  const draft = pageDrafts[draftKey] ?? { caption, imagePrompt, narration, translations: savedTranslations };
  function setDraft(next: PictureBookPageDraft) {
    setPageDrafts(current => {
      const changed = { ...current, [draftKey]: { ...next, translationBaseline: pictureBookTranslationBaseline(current[draftKey], page?.translations ?? []) } };
      return saveQueueRef.current.has(draftKey) ? changed : acknowledgePictureBookDraft(changed, draftKey, { caption, imagePrompt, narration, translations: savedTranslations });
    });
  }
  const imagePending = Boolean(book && generationKeys.includes(pictureBookGenerationKey(book.id, position, "image")));
  const audioPending = Boolean(book && generationKeys.includes(pictureBookGenerationKey(book.id, position, "audio")));
  const translationsDirty = JSON.stringify(draft.translations ?? []) !== JSON.stringify(savedTranslations);
  const dirty = Boolean(page && (draft.caption !== page.caption || draft.imagePrompt !== page.imagePrompt || draft.narration !== page.narration || translationsDirty));
  const remainingLanguages = pictureBookLanguageChoices.filter(item => !draft.translations?.some(translation => translation.language === item.code));
  const addLanguage = remainingLanguages.some(item => item.code === newLanguage) ? newLanguage : remainingLanguages[0]?.code ?? "";
  const hasUnsavedDrafts = Object.keys(pageDrafts).length > 0;
  useEffect(() => {
    if (!signedIn || book) return;
    let active = true;
    api<Character[]>(`/characters?style=${encodeURIComponent(style)}`).then(library => {
      if (active) setDraftCharacters(current => current.map(item => ({ ...item, referenceName: library.find(role => role.id === item.id)?.name ?? item.referenceName, imageUrl: library.find(role => role.id === item.id)?.imageUrl ?? null })));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "角色加载失败"); });
    return () => { active = false; };
  }, [style, book, signedIn]);

  useEffect(() => {
    if (!hasUnsavedDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { if (!leavingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedDrafts]);

  async function run(label: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试"); }
    finally { setBusy(""); }
  }

  async function refreshList() { setBooks(await api<BookSummary[]>("")); }
  function startNewBook() {
    setBook(null); setDraftCharacters([]); setChatInput(""); setError(""); setNotice("");
    setAudience("幼儿园"); setStyle(styleChoices.find(item => item.enabled && item.id === "watercolor")?.id ?? styleChoices.find(item => item.enabled)?.id ?? "watercolor"); setCount(8); setRatio("1:1"); setIsSpread(false);
    window.history.replaceState(null, "", "/storybook");
  }

  async function saveBook(patch: Record<string, unknown>) {
    if (!book) return;
    const updated = await api<Book>(`/${book.id}`, "PATCH", patch);
    setBook(current => current?.id === updated.id ? { ...updated, pages: current.pages, submission: current.submission } : current);
    await refreshList();
  }

  function changeSpread(value: boolean) {
    if (!book) { setIsSpread(value); return; }
    void run("settings", async () => {
      await saveBook({ isSpread: value });
      if (book.pages.some(item => item.position > 0 && item.imageUrl)) setNotice("跨页设置已保存，已有内页插画需重新生成以采用新比例。");
    });
  }

  async function changeCharacters(next: Character[]) {
    if (book) await saveBook({ characters: next });
    else setDraftCharacters(next);
  }

  async function discuss() {
    if (busy || !chatInput.trim() || (book && !storyModelReady)) return;
    const message = chatInput.trim();
    if (!book && message.length < 2) { setError("请先写下至少两个字的故事想法"); return; }
    await run("discuss", async () => {
      let currentBook = book;
      if (!currentBook) {
        currentBook = await api<Book>("", "POST", { brief: message, audience, style, pageCount: count, aspectRatio: ratio, isSpread, characters: draftCharacters });
        setBook(currentBook); setPosition(1);
        window.history.replaceState(null, "", `/storybook?book=${currentBook.id}`);
        await refreshList();
      }
      if (storyModelReady) setBook(await api<Book>(`/${currentBook.id}/discuss`, "POST", { message: message.length > 10000 ? "请根据我的原始创作要求，和我一起完善主题、适合人群、情节和角色。" : message }));
      setChatInput("");
    });
  }

  async function makeOutline() {
    if (!book || !storyModelReady || busy) return;
    if (!await generationConfirmation.confirm({ label: "生成分镜", path: `/${book.id}/generation-cost`, body: { kind: "outline" }, warning: book.pages.length ? "重新生成分镜会替换当前所有页面内容。" : undefined })) return;
    await run("outline", async () => { const updated = await api<Book>(`/${book.id}/outline`, "POST"); setBook(updated); setPosition(updated.pages[0]?.position ?? 1); setNotice("分镜已生成，可以逐页修改内容并制作图片和语音。"); await refreshList(); });
  }

  async function makeBlank() {
    if (!book || busy) return;
    if (!await generationConfirmation.confirm({ label: "建立空白分镜", path: `/${book.id}/generation-cost`, body: { kind: "blank" }, warning: book.pages.length ? "新建空白分镜会替换当前所有页面内容。" : undefined })) return;
    await run("blank", async () => { const updated = await api<Book>(`/${book.id}/blank`, "POST"); setBook(updated); setPosition(updated.pages[0]?.position ?? 1); setNotice("空白分镜已建立，请逐页填写内容。"); await refreshList(); });
  }

  async function completeBook() {
    if (!book) return;
    await run("complete", async () => { await savePage(); const updated = await api<Book>(`/${book.id}/complete`, "POST"); setBook(current => current?.id === updated.id ? { ...updated, pages: current.pages, submission: current.submission } : current); await refreshList(); setNotice("作品已保存，可以预览和继续编辑。"); });
  }

  async function submitBook() {
    if (!book || busy) return;
    if (book.sharedViaAlbum) { setError("本作品已经通过专辑分享，请不要重复分享"); return; }
    if (book.submission?.status === "PENDING") return;
    if (!window.confirm("公开分享审核通过后，绘本图文和语音将在绘本馆公开展示。请确认你有权发布这些内容。")) return;
    await run("submit", async () => {
      await savePage();
      await api<Book>(`/${book.id}/complete`, "POST");
      const submission = await api<Submission>(`/${book.id}/submit`, "POST");
      const updated = await api<Book>(`/${book.id}`);
      setBook({ ...updated, submission });
      await refreshList();
      setNotice(submission.status === "APPROVED" ? "这版绘本已通过审核，可在绘本馆阅读。" : "公开分享申请已提交，正在等待后台审核。");
    });
  }

  async function leaveBook(destination: "library" | "tools") {
    await run("leave", async () => {
      await savePage();
      if (destination === "tools") { leavingRef.current = true; window.location.assign("/tools"); }
      else { setBook(null); window.history.replaceState(null, "", "/storybook"); await refreshList(); }
    });
  }

  async function openPreview() {
    await run("preview", async () => { await savePage(); setPreviewPosition(book?.pages[0]?.position ?? 1); setPreview(true); });
  }

  async function savePage(): Promise<Book | null> {
    if (!book || !page) return null;
    const pending = saveQueueRef.current.get(draftKey);
    if (!dirty) return pending ?? book;
    const save = (pending ?? Promise.resolve(null)).catch(() => null).then(async () => {
      const updated = await api<Book>(`/${book.id}/pages/${position}`, "PATCH", {
        caption: draft.caption, imagePrompt: draft.imagePrompt, narration: draft.narration,
        ...(translationsDirty ? { translations: draft.translations ?? [], expectedTranslations: pictureBookTranslationBaseline(draft, page.translations ?? []) } : {})
      });
      const saved = updated.pages.find(item => item.position === position);
      setBook(current => patchPictureBookPage(current, book.id, position, {
        ...draft,
        translations: saved?.translations ?? [],
        ...(draft.imagePrompt !== page.imagePrompt ? { imageUrl: saved?.imageUrl ?? null } : {}),
        ...(draft.narration !== page.narration ? { audioUrl: saved?.audioUrl ?? null } : {})
      }));
      setPageDrafts(current => {
        const remaining = acknowledgePictureBookDraft(current, draftKey, draft);
        if (translationsDirty && remaining[draftKey] && saved) return { ...remaining, [draftKey]: { ...remaining[draftKey], translationBaseline: pictureBookTranslationBaseline(undefined, saved.translations ?? []) } };
        return remaining;
      });
      setNotice(`${position === 0 ? "封面" : `第 ${position} 页`}修改已保存。`);
      return updated;
    });
    saveQueueRef.current.set(draftKey, save);
    const clear = () => { if (saveQueueRef.current.get(draftKey) === save) saveQueueRef.current.delete(draftKey); };
    void save.then(clear, clear);
    return save;
  }

  async function runPageGeneration(kind: "image" | "audio", payload: Record<string, unknown>, language?: string) {
    if (!book || !page || busy) return;
    const key = pictureBookGenerationKey(book.id, position, kind, language);
    if (generationRef.current.has(key)) return;
    const label = `${book.title} · ${position === 0 ? "封面" : `第 ${position} 页`} · ${language ? `${pictureBookLanguageName(language)}语音` : kind === "image" ? "图片" : "讲解语音"}`;
    generationRef.current.add(key); setGenerationKeys([...generationRef.current]); setError(""); setNotice("");
    try {
      await savePage();
      const updated = await api<Book>(`/${book.id}/pages/${position}/${kind}`, "POST", payload);
      const field = kind === "image" ? "imageUrl" : "audioUrl";
      const updatedPage = updated.pages.find(item => item.position === position);
      const url = language ? updatedPage?.translations?.find(item => item.language === language)?.audioUrl : updatedPage?.[field];
      if (!url) throw new Error("生成失败，请稍后重试。");
      setBook(current => {
        if (!language) return patchPictureBookPage(current, book.id, position, { [field]: url });
        const existing = current?.pages.find(item => item.position === position);
        const savedTranslation = updatedPage?.translations?.find(item => item.language === language);
        if (!existing || !savedTranslation || !current || current.id !== book.id) return current;
        return patchPictureBookPage(current, book.id, position, { translations: (existing.translations ?? []).map(item => item.language === language && item.caption === savedTranslation.caption ? { ...item, audioUrl: url } : item) });
      });
      setNotice(`${label}已生成并保存，正在加载。`);
      if (kind === "image") await waitForPictureBookImage(pictureBookPageImageSource(book.id, position, url));
      else await waitForPictureBookAudio(pictureBookPageAudioSource(book.id, position, url, "private", language));
      setNotice(`${label}已生成。`);
    } catch (cause) { setNotice(""); setError(`${label}：${cause instanceof Error ? cause.message : "生成失败，请稍后重试"}`); }
    finally { generationRef.current.delete(key); setGenerationKeys([...generationRef.current]); }
  }

  async function goToPage(next: number) {
    if (next === position || !book?.pages.some((item) => item.position === next)) return;
    setPosition(next);
    if (dirty) void savePage().catch(cause => setError(`${position === 0 ? "封面" : `第 ${position} 页`}修改未保存：${cause instanceof Error ? cause.message : "请稍后重试"}`));
  }

  async function generateImage() {
    if (!book || !page || busy || imagePending) return;
    if (!await generationConfirmation.confirm({ label: `${position === 0 ? "封面" : `第 ${position} 页`}图片生成`, path: `/${book.id}/generation-cost`, body: { kind: "image", position } })) return;
    await runPageGeneration("image", {});
  }

  async function uploadPageImage(file: File) {
    if (!book || !page) return;
    await run("upload", async () => {
      await savePage();
      const updated = await upload<Book>(`/${book.id}/pages/${position}/upload`, file);
      setBook(current => patchPictureBookPage(current, book.id, position, { imageUrl: updated.pages.find(item => item.position === position)?.imageUrl ?? null }));
      setNotice("本页图片已上传。");
    });
  }

  async function generateAudio() {
    if (!book || !page || busy || audioPending) return;
    const payload = voiceKey.startsWith("voice:") ? { voiceAssetId: voiceKey.slice(6) } : voiceKey.startsWith("system:") ? { voice: voiceKey.slice(7) } : {};
    if (!await generationConfirmation.confirm({ label: `${position === 0 ? "封面" : `第 ${position} 页`}讲解语音生成`, path: `/${book.id}/generation-cost`, body: { kind: "audio", position, narration: draft.narration, ...payload } })) return;
    await runPageGeneration("audio", payload);
  }

  async function generateTranslatedAudio(language: string) {
    if (!book || !page || busy || generationRef.current.has(pictureBookGenerationKey(book.id, position, "audio", language))) return;
    const translation = draft.translations?.find(item => item.language === language);
    if (!translation?.caption.trim()) { setError("请先填写该语种的展示文字"); return; }
    const payload = voiceKey.startsWith("voice:") ? { voiceAssetId: voiceKey.slice(6) } : voiceKey.startsWith("system:") ? { voice: voiceKey.slice(7) } : {};
    if (!await generationConfirmation.confirm({ label: `${position === 0 ? "封面" : `第 ${position} 页`}${pictureBookLanguageName(language)}语音生成`, path: `/${book.id}/generation-cost`, body: { kind: "audio", position, language, narration: translation.caption, ...payload } })) return;
    await runPageGeneration("audio", { language, ...payload }, language);
  }

  if (!signedIn) return <div className="min-h-screen bg-[#f7f6f4] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><h1 className="text-2xl font-semibold">绘本创作</h1>{initialPrompt ? <p className="mt-5 whitespace-pre-wrap rounded-2xl border border-border bg-background p-5 text-base leading-8">{initialPrompt}</p> : null}<Link href={`/login?next=${encodeURIComponent(returnPath)}`} className="mt-4 inline-flex rounded-xl bg-[#ff7b3b] px-6 py-3 text-sm font-semibold text-white">登录后开始创作</Link></div></div>;

  return <div className="min-h-[calc(100vh-72px)] bg-[#f6f6f5] text-foreground">
    {generationConfirmation.dialog}
    {book?.pages.length ? <header className="sticky top-[4.5rem] z-20 flex flex-wrap items-center gap-3 border-b border-[#e9e7e4] bg-white px-4 py-3 shadow-sm md:px-6">
      {book ? <button onClick={() => void leaveBook("tools")} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-50"><ArrowLeft className="size-4" />返回应用</button> : <Link href="/tools" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-50"><ArrowLeft className="size-4" />返回应用</Link>}
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#ff7b3b] text-white"><BookOpen className="size-5" /></span>
      <span className="text-lg font-semibold">绘本创作</span>
      {book ? <><span className="hidden text-gray-300 md:inline">/</span><input aria-label="作品名称" value={book.title} onChange={(event) => setBook({ ...book, title: event.target.value })} onBlur={() => void run("title", () => saveBook({ title: book.title }))} className="min-w-0 max-w-48 rounded-md px-2 py-1 text-sm outline-none hover:bg-gray-50 focus:bg-gray-50" /><span className="ml-auto hidden text-xs text-gray-400 md:block">{book.pages.length ? `${book.pages[0]?.position === 0 ? "封面 + " : ""}${book.pageCount} 页 · 逐页保存` : "构思故事"}</span><Button kind="quiet" disabled={Boolean(busy)} onClick={() => void leaveBook("library")}><LibraryBig className="size-4" />作品库</Button>{book.pages.length ? <><Button disabled={Boolean(busy)} onClick={() => void openPreview()}><BookOpen className="size-4" />预览</Button><Link href={`/picture-books/${encodeURIComponent(book.id)}/play`} className="inline-flex items-center gap-1 rounded-lg border border-[#e9e7e4] px-3 py-2 text-sm hover:bg-gray-50"><Play className="size-4" />观看播放</Link><Button kind="primary" disabled={Boolean(busy)} onClick={() => void completeBook()}><Save className="size-4" />保存为作品</Button><Button disabled={Boolean(busy) || book.submission?.status === "PENDING" || generationKeys.some(key => key.startsWith(`${book.id}:`))} onClick={() => void submitBook()}><Send className="size-4" />{book.submission?.status === "PENDING" ? "审核中" : book.submission?.status === "APPROVED" ? "更新公开分享" : "公开分享"}</Button></> : null}</> : null}
    </header> : null}

    {book?.creatorSync ? <div className="mx-auto mt-3 max-w-[1600px] px-5"><CreatorWorkMetadata sync={book.creatorSync} /></div> : null}
    {book && (book.submission || book.sharedViaAlbum) ? <div className="mx-auto mt-3 flex max-w-[1600px] flex-wrap items-center gap-3 px-5 text-sm"><span className="text-muted-foreground">{submissionLabel(book.submission, book.sharedViaAlbum)}</span>{book.submission?.status === "REJECTED" && book.submission?.reviewNote ? <span className="text-destructive">未通过原因：{book.submission?.reviewNote}</span> : null}{book.submission?.status === "APPROVED" ? <Link className="underline" href={publicPictureBookHref(book.id)}>查看公开绘本</Link> : null}</div> : null}

    {book?.pages.length && (error || notice) ? <div role={error ? "alert" : "status"} className={`mx-auto mt-4 flex max-w-[1600px] items-center justify-between rounded-xl px-4 py-3 text-sm ${error ? "border border-red-200 bg-red-50 text-red-700" : "border border-[#ffddc8] bg-[#fff8f3] text-[#a34e1d]"}`}><span>{error || notice}</span><button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><X className="size-4" /></button></div> : null}

    {loading ? <div className="flex h-[60vh] items-center justify-center"><LoaderCircle className="size-7 animate-spin" /></div> : !book?.pages.length ? <section className="grid min-h-[calc(100vh-72px)] grid-cols-1 bg-[#f6f6f5] lg:h-[calc(100vh-72px)] lg:min-h-0 lg:grid-cols-[292px_minmax(0,1fr)] lg:overflow-hidden">
      <aside aria-label="绘本创作历史" className="flex max-h-[50vh] min-h-0 flex-col border-b border-border bg-background lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="flex h-16 shrink-0 items-center gap-2 px-5"><BookOpen className="size-7" /><h1 className="text-2xl font-semibold tracking-normal">绘本创作</h1></div>
        <div className="px-4 pb-5"><Button className="h-11 w-full border-border shadow-sm" disabled={Boolean(busy)} onClick={startNewBook}><Sparkles className="size-4" />新建绘本</Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><History className="size-4" /><span>绘本创作历史</span><span className="ml-auto">{books.length} 本</span></div>
          {books.length ? <div className="space-y-2">{books.map(item => <button key={item.id} disabled={Boolean(busy)} onClick={() => void run("open", () => openBook(item.id))} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-secondary disabled:opacity-50 ${book?.id === item.id ? "border-foreground/20 bg-secondary" : "border-transparent"}`}>
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">{item.coverUrl ? <PictureBookImage src={pictureBookPageImageSource(item.id, 0, item.coverUrl)} alt="" compact usage="thumbnail" className="size-full object-cover" /> : <BookOpen className="size-6 text-muted-foreground" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><CreatorWorkMetadata sync={item.creatorSync} /><span className="mt-1 block text-xs text-muted-foreground">{item.pageCount} 页 · {submissionLabel(item.submission, item.sharedViaAlbum) || (item.status === "COMPLETED" ? "已保存" : item.status === "EDITING" ? "制作中" : "构思中")}</span></span>
          </button>)}</div> : <p className="rounded-xl border border-dashed border-border px-3 py-5 text-sm leading-6 text-muted-foreground">还没有绘本，写下第一个故事吧。</p>}
        </div>
      </aside>
      <main className="min-h-0 p-5 lg:overflow-hidden">
        <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section aria-label="故事对话" className="flex min-h-[600px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm lg:min-h-0">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4"><MessageCircle className="size-5" /><h2 className="text-base font-semibold">一起构思故事</h2></div>
            {error || notice ? <div role={error ? "alert" : "status"} className={`m-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-secondary text-muted-foreground"}`}><span>{error || notice}</span><button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><X className="size-4" /></button></div> : null}
            <div ref={conversationRef} role="log" aria-label="故事讨论记录" aria-live="polite" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-secondary px-4 py-3 text-base leading-8">你想创作一本怎样的绘本？告诉我主题、主角或故事想法，我们一起完善。</div>
              {book && book.messages[0]?.content !== book.brief ? <div className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-base leading-8 text-primary-foreground">{book.brief}</div> : null}
              {book?.messages.map((item, index) => <div key={index} className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-base leading-8 ${item.role === "user" ? "ml-auto rounded-tr-md bg-primary text-primary-foreground" : "rounded-tl-md bg-secondary"}`}>{item.content}</div>)}
              {busy === "discuss" ? <>{(!book || book.messages.length > 0 || book.brief !== chatInput.trim()) && chatInput.trim() ? <div className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-base leading-8 text-primary-foreground">{chatInput.trim()}</div> : null}<div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在构思故事…</div></> : null}
            </div>
            <div className="shrink-0 border-t border-border p-5">
              <div className="flex items-end gap-3"><textarea aria-label="创作要求" value={chatInput} disabled={Boolean(busy)} onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void discuss(); } }} rows={3} maxLength={book ? 10000 : 30000} placeholder="写下你的创作要求，可以是一句话，也可以是完整的故事设定…" className="min-h-24 min-w-0 flex-1 resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-8 outline-none focus:border-foreground/40 disabled:opacity-60" /><Button kind="primary" className="!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90" disabled={!chatInput.trim() || Boolean(busy) || Boolean(book && !storyModelReady)} onClick={() => void discuss()} title="发送创作要求"><Send className="size-4" /></Button></div>
              <p className="mt-2 text-xs text-muted-foreground">{storyModelReady ? "Enter 发送，Shift + Enter 换行" : "AI 故事模型尚未配置，可保存创作要求并建立空白分镜。"}</p>
            </div>
          </section>
          <aside aria-label="绘本设置" className="min-h-0 space-y-5 lg:overflow-y-auto">
            <section className="space-y-4 rounded-2xl border border-border bg-background p-5 shadow-sm">
              <h2 className="text-base font-semibold">绘本设置</h2>
              {book ? <label className="block space-y-2 text-sm font-semibold">绘本名称<input value={book.title} disabled={Boolean(busy)} maxLength={100} onChange={event => setBook({ ...book, title: event.target.value })} onBlur={() => void run("title", () => saveBook({ title: book.title }))} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-normal" /></label> : null}
              <label className="block space-y-2 text-sm font-semibold">适合人群<select value={book?.audience ?? audience} disabled={Boolean(busy)} onChange={event => book ? void run("settings", () => saveBook({ audience: event.target.value })) : setAudience(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal">{audiences.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
              <PictureBookStylePicker value={book?.style ?? style} styles={styleChoices} onStylesChange={setStyleChoices} disabled={Boolean(busy)} onChange={value => book ? void run("settings", () => saveBook({ style: value })) : setStyle(value)} />
              <label className="block space-y-2 text-sm font-semibold">页数<select value={book?.pageCount ?? count} disabled={Boolean(busy)} onChange={event => book ? void run("settings", () => saveBook({ pageCount: Number(event.target.value) })) : setCount(Number(event.target.value))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal">{pageCounts.map(item => <option key={item} value={item}>{item} 页</option>)}</select></label>
              <PictureBookRatioPicker value={book?.aspectRatio ?? ratio} disabled={Boolean(busy)} onChange={value => book ? void run("settings", () => saveBook({ aspectRatio: value })) : setRatio(value)} />
              <SpreadSelect value={book?.isSpread ?? isSpread} disabled={Boolean(busy)} onChange={changeSpread} />
            </section>
            <section className="rounded-2xl border border-border bg-background p-5 shadow-sm"><h2 className="mb-4 text-base font-semibold">故事信息</h2><dl className="space-y-3 text-sm leading-6"><div><dt className="font-semibold">主题</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{book?.theme || "待确定"}</dd></div><div><dt className="font-semibold">主要情节</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{book?.plot || book?.brief || "待讨论"}</dd></div></dl><div className="mt-4 border-t border-border pt-4"><PictureBookCharacterPicker value={book?.characters ?? draftCharacters} style={book?.style ?? style} styleName={selectedPictureBookStyle(book?.style ?? style, styleChoices)?.name ?? "当前风格"} disabled={Boolean(busy)} onChange={changeCharacters} /></div></section>
            <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-sm"><h2 className="text-base font-semibold">分镜制作</h2><Button kind="primary" className="w-full !border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90" disabled={!book || !storyModelReady || Boolean(busy)} onClick={() => void makeOutline()}>{busy === "outline" ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}生成分镜</Button><Button className="w-full" disabled={!book || Boolean(busy)} onClick={() => void makeBlank()}><Plus className="size-4" />先建空白分镜</Button></section>
          </aside>
        </div>
      </main>
    </section> : <main className="grid min-h-[calc(100vh-73px)] gap-4 p-4 lg:grid-cols-[180px_minmax(0,1fr)_340px] xl:grid-cols-[210px_minmax(0,1fr)_380px]">
      <aside className="max-h-64 overflow-y-auto rounded-2xl border border-[#e9e7e4] bg-white p-3 lg:max-h-[calc(100vh-105px)]"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-sm font-semibold">页面</h2><span className="text-xs text-gray-400">{book.pages[0]?.position === 0 ? `封面 + ${book.pageCount} 页` : `${book.pages.length} 页`}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:block lg:space-y-2">{book.pages.map((item) => <button key={item.position} onClick={() => void goToPage(item.position)} className={`w-full overflow-hidden rounded-xl border-2 text-left transition ${position === item.position ? "border-[#ff7b3b]" : "border-[#eeeae6] hover:border-[#ffbf9f]"}`}><div className="relative flex aspect-[1.5] items-center justify-center bg-[#f5f3f0]">{item.imageUrl ? <PictureBookImage src={pictureBookPageImageSource(book.id, item.position, item.imageUrl)} alt="" compact usage="thumbnail" className="size-full object-cover" /> : <BookOpen className="size-6 text-[#d0c9c3]" />}<span className="absolute left-2 top-2 rounded-md bg-[#26282d]/75 px-2 py-0.5 text-xs text-white">{item.position === 0 ? "封面" : String(item.position).padStart(2, "0")}</span></div><p className="line-clamp-2 min-h-12 px-3 py-2 text-xs leading-5 text-gray-600">{item.caption}</p>{(["image", "audio"] as const).filter(kind => generationKeys.includes(pictureBookGenerationKey(book.id, item.position, kind))).map(kind => <span key={kind} className="flex items-center gap-1 px-3 pb-2 text-xs text-[#d6642d]"><LoaderCircle className="size-3 animate-spin" />{kind === "image" ? "图片生成中" : "语音生成中"}</span>)}</button>)}</div></aside>
      <section className="flex min-w-0 flex-col gap-4"><div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e9e7e4] bg-white px-5 py-3"><span className="text-sm font-semibold">{position === 0 ? "封面" : `第 ${position} 页`}</span><span className="text-sm text-gray-400">/ {book.pageCount} 页</span><span className="ml-auto text-xs text-gray-400">{dirty ? "有未保存的修改" : "已保存"}</span><Button disabled={!dirty || Boolean(busy)} onClick={() => void run("save", async () => { await savePage(); })}><Save className="size-4" />保存本页</Button></div>
        <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#e9e7e4] bg-white shadow-sm"><div className="flex flex-1 items-center justify-center bg-[#f4f3f1] p-6">{page?.imageUrl ? <PictureBookImage src={pictureBookPageImageSource(book.id, position, page.imageUrl)} alt={`第 ${position} 页插画`} className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md" /> : <div className="text-center"><ImagePlus className="mx-auto size-12 text-[#c9c6c2]" /><p className="mt-4 text-sm text-gray-400">这一页还没有插画</p><Button className="mt-5" disabled={Boolean(busy) || imagePending} onClick={() => void generateImage()}><WandSparkles className="size-4" />生成本页图片</Button><label className="mx-auto mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-[#ddd9d4] bg-white px-4 py-2 text-sm">上传图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy) || imagePending} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPageImage(file); }} /></label></div>}</div><div className="bg-[#33363b] px-5 py-4 text-center text-base leading-8 text-white">{draft.caption || "填写本页展示文字"}</div></div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e9e7e4] bg-white px-4 py-3"><Button disabled={position === book.pages[0]?.position} onClick={() => void goToPage(position - 1)}><ChevronLeft className="size-4" />上一页</Button><Button disabled={position === book.pages.at(-1)?.position} onClick={() => void goToPage(position + 1)}>下一页<ChevronRight className="size-4" /></Button><span className="ml-auto flex items-center gap-2 text-sm text-gray-500"><Volume2 className="size-4" />讲解语音</span>{page?.audioUrl ? <PictureBookAudio src={pictureBookPageAudioSource(book.id, position, page.audioUrl)} className="h-9 max-w-full md:w-56" /> : <span className="text-xs text-gray-400">尚未生成</span>}</div>
      </section>
      <aside className="max-h-[calc(100vh-105px)] space-y-5 overflow-y-auto rounded-2xl border border-[#e9e7e4] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">本页设置</h2><span className="text-xs text-gray-400">{book.aspectRatio} · {selectedPictureBookStyle(book.style, styleChoices)?.name ?? book.style}</span></div><PictureBookStylePicker value={book.style} styles={styleChoices} onStylesChange={setStyleChoices} disabled={Boolean(busy)} onChange={value => void run("settings", () => saveBook({ style: value }))} /><PictureBookRatioPicker value={book.aspectRatio} disabled={Boolean(busy)} onChange={value => void run("settings", () => saveBook({ aspectRatio: value }))} /><SpreadSelect value={book.isSpread ?? false} disabled={Boolean(busy)} onChange={changeSpread} /><details className="rounded-xl border border-[#eee9e4] bg-[#faf8f6] p-3 text-sm"><summary className="cursor-pointer font-semibold">故事概要</summary><div className="mt-3 space-y-2 leading-6 text-gray-600"><p><strong className="text-[#26282d]">主题：</strong>{book.theme || book.brief}</p><p><strong className="text-[#26282d]">适合：</strong>{book.audience || "未指定"}</p><p><strong className="text-[#26282d]">情节：</strong>{book.plot || book.brief}</p></div></details><Field label="画面展示文字" value={draft.caption} onChange={(caption) => setDraft({ ...draft, caption, narration: draft.narration === draft.caption ? caption : draft.narration })} rows={3} maxLength={500} /><div className="border-t pt-5"><Field label="画面生成提示词" value={draft.imagePrompt} onChange={(imagePrompt) => setDraft({ ...draft, imagePrompt })} rows={6} maxLength={2000} /><p className="mt-1 text-xs text-gray-400">修改提示词后，已生成的插画需要重新生成。</p><Button kind="primary" className="mt-4 w-full" disabled={Boolean(busy) || imagePending} onClick={() => void generateImage()}>{imagePending ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}{imagePending ? "图片生成中" : page?.imageUrl ? "重新生成图片" : "生成图片"}</Button><label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e8e6e3] px-4 py-2 text-sm font-medium"><ImagePlus className="size-4" />上传或替换图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy) || imagePending} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPageImage(file); }} /></label></div><div className="border-t pt-5"><Field label="讲解语音文稿" value={draft.narration} onChange={(narration) => setDraft({ ...draft, narration })} rows={4} maxLength={1000} /><p className="mt-1 text-xs text-gray-400">默认与展示文字相同，可单独修改。</p><div className="mt-4"><VoicePicker label="讲解声音" value={voiceKey} voices={voiceOptions} onChange={setVoiceKey} /></div><Button className="mt-4 w-full" disabled={Boolean(busy) || audioPending} onClick={() => void generateAudio()}>{audioPending ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}{audioPending ? "语音生成中" : page?.audioUrl ? "重新生成语音" : "生成讲解语音"}</Button></div><div className="border-t pt-5">
        <h3 className="mb-3 text-sm font-semibold">多语种内容</h3>
        <div className="flex gap-2">
          <select aria-label="新增语种" value={addLanguage} onChange={event => setNewLanguage(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#e8e6e3] bg-white px-3 py-2 text-sm">
            {remainingLanguages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
          <Button disabled={Boolean(busy) || !addLanguage} onClick={() => {
            if (addLanguage) setDraft({ ...draft, translations: [...(draft.translations ?? []), { language: addLanguage, caption: "" }] });
          }}><Plus className="size-4" />添加</Button>
        </div>
        <div className="mt-3 space-y-3">{draft.translations?.map(translation => {
          const generated = page?.translations?.find(item => item.language === translation.language);
          const pending = generationKeys.includes(pictureBookGenerationKey(book.id, position, "audio", translation.language));
          return <section key={translation.language} className="rounded-xl border border-[#e8e6e3] p-3">
            <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold">{pictureBookLanguageName(translation.language)}</h4><button type="button" aria-label={`删除${pictureBookLanguageName(translation.language)}译文`} onClick={() => setDraft({ ...draft, translations: draft.translations?.filter(item => item.language !== translation.language) })} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="size-4" /></button></div>
            <Field label="显示文字" value={translation.caption} onChange={caption => setDraft({ ...draft, translations: draft.translations?.map(item => item.language === translation.language ? { ...item, caption } : item) })} rows={3} maxLength={1000} placeholder={`填写${pictureBookLanguageName(translation.language)}译文`} />
            {generated?.audioUrl && generated.caption === translation.caption ? <PictureBookAudio src={pictureBookPageAudioSource(book.id, position, generated.audioUrl, "private", translation.language)} className="mt-3 h-9 w-full" /> : null}
            <Button className="mt-3 w-full" disabled={Boolean(busy) || pending || !translation.caption.trim()} onClick={() => void generateTranslatedAudio(translation.language)}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}{pending ? "语音生成中" : generated?.audioUrl && generated.caption === translation.caption ? "重新生成语音" : "合成语音"}</Button>
          </section>;
        })}</div>
      </div><div className="border-t pt-5"><PictureBookCharacterPicker value={book.characters} style={book.style} styleName={selectedPictureBookStyle(book.style, styleChoices)?.name ?? "当前风格"} disabled={Boolean(busy)} onChange={changeCharacters} /></div></aside>
    </main>}

    {preview && book ? <div className="fixed inset-0 z-40 flex flex-col bg-[#1e2024] text-white"><div className="flex items-center justify-between border-b border-white/10 px-5 py-3"><span className="font-semibold">{book.title} <span className="ml-2 text-sm font-normal text-gray-400">{previewPosition === 0 ? "封面" : `第 ${previewPosition} 页`} / {book.pageCount} 页</span></span><button onClick={() => setPreview(false)} aria-label="关闭预览"><X className="size-5" /></button></div>{(() => { const current = book.pages.find((item) => item.position === previewPosition); return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-5"><div className="flex min-h-0 flex-1 items-center justify-center">{previewPages.map(item => item.imageUrl ? <PictureBookImage key={item.position} hidden={item.position !== previewPosition} src={pictureBookPageImageSource(book.id, item.position, item.imageUrl)} alt={`第 ${item.position} 页`} className="max-h-full max-w-full object-contain" /> : null)}{!current?.imageUrl ? <div className="flex aspect-square w-72 items-center justify-center rounded-xl bg-white/10 text-sm text-gray-400">暂无插画</div> : null}</div><p className="max-w-3xl text-center text-lg leading-8">{current?.caption}</p>{previewPages.map(item => item.audioUrl ? <PictureBookAudio key={item.position} hidden={item.position !== previewPosition} preload="auto" src={pictureBookPageAudioSource(book.id, item.position, item.audioUrl)} className="h-9" /> : null)}</div>; })()}<div className="flex items-center justify-center gap-4 border-t border-white/10 p-3"><Button disabled={previewPosition === book.pages[0]?.position} onClick={() => setPreviewPosition(previewPosition - 1)}><ChevronLeft className="size-4" />上一页</Button><Button disabled={previewPosition === book.pages.at(-1)?.position} onClick={() => setPreviewPosition(previewPosition + 1)}>下一页<ArrowRight className="size-4" /></Button></div></div> : null}
  </div>;
}
