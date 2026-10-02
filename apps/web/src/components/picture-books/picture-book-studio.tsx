"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, History, ImagePlus, LibraryBig, LoaderCircle, MessageCircle, Mic2, Plus, Play, Save, Send, Sparkles, Volume2, WandSparkles, X } from "lucide-react";
import { pictureBookPageImageSource, waitForPictureBookImage } from "@/lib/picture-book-images";
import { PictureBookImage } from "./picture-book-image";
import { pictureBookPageAudioSource, waitForPictureBookAudio } from "@/lib/picture-book-audio";
import { PictureBookAudio } from "./picture-book-audio";
import { acknowledgePictureBookDraft, patchPictureBookPage, pictureBookGenerationKey, type PictureBookPageDraft } from "@/lib/picture-book-background";

type Page = { position: number; caption: string; imagePrompt: string; narration: string; imageUrl: string | null; audioUrl: string | null };
type Character = { id?: string; name: string; description: string; imageUrl: string | null };
type Book = { id: string; title: string; brief: string; theme: string; audience: string; plot: string; style: string; aspectRatio: "1:1" | "3:2" | "2:3"; pageCount: number; status: string; messages: Array<{ role: "user" | "assistant"; content: string }>; characters: Character[]; pages: Page[]; updatedAt: string };
type BookSummary = Pick<Book, "id" | "title" | "theme" | "pageCount" | "status" | "updatedAt"> & { coverUrl: string | null };
type ChatModel = { isMock: boolean; aliases: Array<{ aliasKey: string }> };
type Voice = { id: string; name: string; providerVoiceId?: string; status?: string };
type VoiceList = { systemVoices: Voice[]; platformVoices: Voice[]; customVoices: Voice[]; defaultVoice?: { voiceAssetId: string | null; systemVoiceId: string | null } };

const styles = ["温暖水彩", "卡通插画", "彩色铅笔", "柔和黏土", "童话剪纸", "国风绘本"];
const pageCounts = [4, 6, 8, 10, 12, 16, 20, 24];

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
  const tone = kind === "primary" ? "bg-[#ff7b3b] text-white hover:bg-[#ea6526] border-[#ff7b3b]" : kind === "quiet" ? "border-transparent bg-transparent text-[#4e5157] hover:bg-[#f6f4f2]" : "border-[#e9e7e4] bg-white text-[#31343a] hover:border-[#ffae84] hover:text-[#e96931]";
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${className}`}>{children}</button>;
}

function Field({ label, value, onChange, rows = 3, placeholder, maxLength, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; maxLength?: number; readOnly?: boolean }) {
  return <label className="block space-y-2"><span className="text-sm font-semibold text-[#272a30]">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={rows} maxLength={maxLength} placeholder={placeholder} className="w-full resize-y rounded-xl border border-[#e8e6e3] bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-[#ff8c55] focus:ring-2 focus:ring-[#ff8c55]/15 read-only:bg-[#f8f7f5]" /></label>;
}

export function PictureBookStudio({ signedIn, initialBookId }: { signedIn: boolean; initialBookId: string }) {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [voices, setVoices] = useState<VoiceList>({ systemVoices: [], platformVoices: [], customVoices: [] });
  const [storyModelReady, setStoryModelReady] = useState(false);
  const [voiceKey, setVoiceKey] = useState("");
  const [audience, setAudience] = useState("3—6 岁");
  const [style, setStyle] = useState(styles[0]!);
  const [count, setCount] = useState(8);
  const [ratio, setRatio] = useState<"1:1" | "3:2" | "2:3">("1:1");
  const [chatInput, setChatInput] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const [characterName, setCharacterName] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [position, setPosition] = useState(1);
  const [pageDrafts, setPageDrafts] = useState<Record<string, PictureBookPageDraft>>({});
  const saveQueueRef = useRef(new Map<string, Promise<Book | null>>());
  const [busy, setBusy] = useState("");
  const [generationKeys, setGenerationKeys] = useState<string[]>([]);
  const generationRef = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
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
    Promise.allSettled([api<BookSummary[]>(""), api<Character[]>("/characters"), getVoices(), hasStoryModel()]).then(async (results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setBooks(results[0].value);
      else setError(results[0].reason instanceof Error ? results[0].reason.message : "无法读取绘本作品");
      if (results[1].status === "fulfilled") setCharacters(results[1].value);
      if (results[2].status === "fulfilled") {
        const list = results[2].value;
        setVoices(list);
        setVoiceKey(list.defaultVoice?.voiceAssetId ? `asset:${list.defaultVoice.voiceAssetId}` : list.defaultVoice?.systemVoiceId ? `system:${list.defaultVoice.systemVoiceId}` : list.systemVoices[0]?.providerVoiceId ? `system:${list.systemVoices[0].providerVoiceId}` : "");
      }
      if (results[3].status === "fulfilled") setStoryModelReady(results[3].value);
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
  const draft = pageDrafts[draftKey] ?? { caption, imagePrompt, narration };
  function setDraft(next: PictureBookPageDraft) {
    setPageDrafts(current => {
      const changed = { ...current, [draftKey]: next };
      return saveQueueRef.current.has(draftKey) ? changed : acknowledgePictureBookDraft(changed, draftKey, { caption, imagePrompt, narration });
    });
  }
  const imagePending = Boolean(book && generationKeys.includes(pictureBookGenerationKey(book.id, position, "image")));
  const audioPending = Boolean(book && generationKeys.includes(pictureBookGenerationKey(book.id, position, "audio")));
  const dirty = Boolean(page && (draft.caption !== page.caption || draft.imagePrompt !== page.imagePrompt || draft.narration !== page.narration));
  const hasUnsavedDrafts = Object.keys(pageDrafts).length > 0;
  const selectedIds = useMemo(() => new Set(book?.characters.map((item) => item.id ?? item.name) ?? []), [book?.characters]);

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
    setBook(null); setChatInput(""); setError(""); setNotice("");
    setAudience("3—6 岁"); setStyle(styles[0]!); setCount(8); setRatio("1:1");
    window.history.replaceState(null, "", "/storybook");
  }

  async function saveBook(patch: Record<string, unknown>) {
    if (!book) return;
    const updated = await api<Book>(`/${book.id}`, "PATCH", patch);
    setBook(current => current?.id === updated.id ? { ...updated, pages: current.pages } : current);
    await refreshList();
  }

  async function toggleCharacter(character: Character) {
    if (!book) return;
    await run("character", async () => {
      const key = character.id ?? character.name;
      const next = selectedIds.has(key) ? book.characters.filter((item) => (item.id ?? item.name) !== key) : [...book.characters, { ...(character.id ? { id: character.id } : {}), name: character.name, description: character.description, imageUrl: character.imageUrl }];
      await saveBook({ characters: next });
    });
  }

  async function addCharacter() {
    if (!characterName.trim() || characterDescription.trim().length < 2) { setError("填写角色名称和外观描述后再添加"); return; }
    await run("new-character", async () => {
      const created = await api<Character>("/characters", "POST", { name: characterName.trim(), description: characterDescription.trim() });
      setCharacters((current) => [...current, created]); setCharacterName(""); setCharacterDescription("");
      if (book) await saveBook({ characters: [...book.characters, { id: created.id, name: created.name, description: created.description, imageUrl: created.imageUrl }] });
      setNotice("角色已加入角色库，并添加到当前绘本。");
    });
  }

  async function generateCharacterImage(character: Character) {
    if (!character.id || character.id.startsWith("preset:")) return;
    const characterId = character.id;
    await run("character-image", async () => {
      const updated = await api<Character>(`/characters/${characterId}/image`, "POST", {});
      setCharacters((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (book && selectedIds.has(characterId)) {
        await saveBook({ characters: book.characters.map((item) => item.id === characterId ? { ...item, imageUrl: updated.imageUrl } : item) });
      }
      setNotice("角色形象已生成；绘本插画会使用角色的外观描述保持一致。");
    });
  }

  async function uploadCharacterImage(character: Character, file: File) {
    if (!character.id || character.id.startsWith("preset:")) return;
    await run("character-upload", async () => {
      const updated = await upload<Character>(`/characters/${character.id}/upload`, file);
      setCharacters((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (book && selectedIds.has(character.id!)) {
        await saveBook({ characters: book.characters.map((item) => item.id === character.id ? { ...item, imageUrl: updated.imageUrl } : item) });
      }
      setNotice("角色形象已上传。");
    });
  }

  async function discuss() {
    if (busy || !chatInput.trim() || (book && !storyModelReady)) return;
    const message = chatInput.trim();
    if (!book && message.length < 2) { setError("请先写下至少两个字的故事想法"); return; }
    await run("discuss", async () => {
      let currentBook = book;
      if (!currentBook) {
        currentBook = await api<Book>("", "POST", { brief: message, audience, style, pageCount: count, aspectRatio: ratio });
        setBook(currentBook); setPosition(1);
        window.history.replaceState(null, "", `/storybook?book=${currentBook.id}`);
        await refreshList();
      }
      if (storyModelReady) setBook(await api<Book>(`/${currentBook.id}/discuss`, "POST", { message: message.length > 10000 ? "请根据我的原始创作要求，和我一起完善主题、适合人群、情节和角色。" : message }));
      setChatInput("");
    });
  }

  async function makeOutline() {
    if (!book || !storyModelReady) return;
    if (book.pages.length && !window.confirm("重新生成分镜会替换当前所有页面内容。确定继续吗？")) return;
    await run("outline", async () => { const updated = await api<Book>(`/${book.id}/outline`, "POST"); setBook(updated); setPosition(updated.pages[0]?.position ?? 1); setNotice("分镜已生成，可以逐页修改内容并制作图片和语音。"); await refreshList(); });
  }

  async function makeBlank() {
    if (!book) return;
    if (book.pages.length && !window.confirm("新建空白分镜会替换当前所有页面内容。确定继续吗？")) return;
    await run("blank", async () => { const updated = await api<Book>(`/${book.id}/blank`, "POST"); setBook(updated); setPosition(updated.pages[0]?.position ?? 1); setNotice("空白分镜已建立，请逐页填写内容。"); await refreshList(); });
  }

  async function completeBook() {
    if (!book) return;
    await run("complete", async () => { await savePage(); const updated = await api<Book>(`/${book.id}/complete`, "POST"); setBook(current => current?.id === updated.id ? { ...updated, pages: current.pages } : current); await refreshList(); setNotice("作品已保存，可以预览和继续编辑。"); });
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
      const updated = await api<Book>(`/${book.id}/pages/${position}`, "PATCH", draft);
      const saved = updated.pages.find(item => item.position === position);
      setBook(current => patchPictureBookPage(current, book.id, position, {
        ...draft,
        ...(draft.imagePrompt !== page.imagePrompt ? { imageUrl: saved?.imageUrl ?? null } : {}),
        ...(draft.narration !== page.narration ? { audioUrl: saved?.audioUrl ?? null } : {})
      }));
      setPageDrafts(current => acknowledgePictureBookDraft(current, draftKey, draft));
      setNotice(`${position === 0 ? "封面" : `第 ${position} 页`}修改已保存。`);
      return updated;
    });
    saveQueueRef.current.set(draftKey, save);
    const clear = () => { if (saveQueueRef.current.get(draftKey) === save) saveQueueRef.current.delete(draftKey); };
    void save.then(clear, clear);
    return save;
  }

  async function runPageGeneration(kind: "image" | "audio", payload: Record<string, unknown>) {
    if (!book || !page || busy) return;
    const key = pictureBookGenerationKey(book.id, position, kind);
    if (generationRef.current.has(key)) return;
    const label = `${book.title} · ${position === 0 ? "封面" : `第 ${position} 页`} · ${kind === "image" ? "图片" : "讲解语音"}`;
    generationRef.current.add(key); setGenerationKeys([...generationRef.current]); setError(""); setNotice("");
    try {
      await savePage();
      const updated = await api<Book>(`/${book.id}/pages/${position}/${kind}`, "POST", payload);
      const field = kind === "image" ? "imageUrl" : "audioUrl";
      const url = updated.pages.find(item => item.position === position)?.[field];
      if (!url) throw new Error("生成失败，请稍后重试。");
      setBook(current => patchPictureBookPage(current, book.id, position, { [field]: url }));
      setNotice(`${label}已生成并保存，正在加载。`);
      if (kind === "image") await waitForPictureBookImage(pictureBookPageImageSource(book.id, position, url));
      else await waitForPictureBookAudio(pictureBookPageAudioSource(book.id, position, url));
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
    if (!book || !page) return;
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
    if (!book || !page) return;
    const payload = voiceKey.startsWith("asset:") ? { voiceAssetId: voiceKey.slice(6) } : voiceKey.startsWith("system:") ? { voice: voiceKey.slice(7) } : {};
    await runPageGeneration("audio", payload);
  }

  if (!signedIn) return <div className="flex min-h-screen items-center justify-center bg-[#f7f6f4] p-6"><div className="max-w-md rounded-3xl border bg-white p-10 text-center shadow-sm"><BookOpen className="mx-auto mb-5 size-12 text-[#ff7b3b]" /><h1 className="text-2xl font-semibold">绘本创作</h1><p className="mt-3 text-sm leading-6 text-gray-500">登录后保存故事构想、角色与每一页的创作内容。</p><Link href={`/login?next=${encodeURIComponent(initialBookId ? `/storybook?book=${encodeURIComponent(initialBookId)}` : "/storybook")}`} className="mt-6 inline-flex rounded-xl bg-[#ff7b3b] px-6 py-3 text-sm font-semibold text-white">登录后开始</Link></div></div>;

  return <div className="min-h-[calc(100vh-72px)] bg-[#f6f6f5] text-foreground">
    {book?.pages.length ? <header className="sticky top-[4.5rem] z-20 flex flex-wrap items-center gap-3 border-b border-[#e9e7e4] bg-white px-4 py-3 shadow-sm md:px-6">
      {book ? <button onClick={() => void leaveBook("tools")} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-50"><ArrowLeft className="size-4" />返回应用</button> : <Link href="/tools" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-50"><ArrowLeft className="size-4" />返回应用</Link>}
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#ff7b3b] text-white"><BookOpen className="size-5" /></span>
      <span className="text-lg font-semibold">绘本创作</span>
      {book ? <><span className="hidden text-gray-300 md:inline">/</span><input aria-label="作品名称" value={book.title} onChange={(event) => setBook({ ...book, title: event.target.value })} onBlur={() => void run("title", () => saveBook({ title: book.title }))} className="min-w-0 max-w-48 rounded-md px-2 py-1 text-sm outline-none hover:bg-gray-50 focus:bg-gray-50" /><span className="ml-auto hidden text-xs text-gray-400 md:block">{book.pages.length ? `${book.pages[0]?.position === 0 ? "封面 + " : ""}${book.pageCount} 页 · 逐页保存` : "构思故事"}</span><Button kind="quiet" disabled={Boolean(busy)} onClick={() => void leaveBook("library")}><LibraryBig className="size-4" />作品库</Button>{book.pages.length ? <><Button disabled={Boolean(busy)} onClick={() => void openPreview()}><BookOpen className="size-4" />预览</Button><Link href={`/picture-books/${encodeURIComponent(book.id)}/play`} className="inline-flex items-center gap-1 rounded-lg border border-[#e9e7e4] px-3 py-2 text-sm hover:bg-gray-50"><Play className="size-4" />观看播放</Link><Button kind="primary" disabled={Boolean(busy)} onClick={() => void completeBook()}><Save className="size-4" />保存为作品</Button></> : null}</> : null}
    </header> : null}

    {book?.pages.length && (error || notice) ? <div role={error ? "alert" : "status"} className={`mx-auto mt-4 flex max-w-[1600px] items-center justify-between rounded-xl px-4 py-3 text-sm ${error ? "border border-red-200 bg-red-50 text-red-700" : "border border-[#ffddc8] bg-[#fff8f3] text-[#a34e1d]"}`}><span>{error || notice}</span><button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><X className="size-4" /></button></div> : null}

    {loading ? <div className="flex h-[60vh] items-center justify-center"><LoaderCircle className="size-7 animate-spin" /></div> : !book?.pages.length ? <section className="grid min-h-[calc(100vh-72px)] grid-cols-1 bg-[#f6f6f5] lg:h-[calc(100vh-72px)] lg:min-h-0 lg:grid-cols-[292px_minmax(0,1fr)] lg:overflow-hidden">
      <aside aria-label="绘本创作历史" className="flex max-h-[50vh] min-h-0 flex-col border-b border-border bg-background lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="flex h-16 shrink-0 items-center gap-2 px-5"><BookOpen className="size-7" /><h1 className="text-2xl font-semibold tracking-normal">绘本创作</h1></div>
        <div className="px-4 pb-5"><Button className="h-11 w-full !rounded-full border-border shadow-sm" disabled={Boolean(busy)} onClick={startNewBook}><Sparkles className="size-4" />新建绘本</Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><History className="size-4" /><span>绘本创作历史</span><span className="ml-auto">{books.length} 本</span></div>
          {books.length ? <div className="space-y-2">{books.map(item => <button key={item.id} disabled={Boolean(busy)} onClick={() => void run("open", () => openBook(item.id))} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-secondary disabled:opacity-50 ${book?.id === item.id ? "border-foreground/20 bg-secondary" : "border-transparent"}`}>
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">{item.coverUrl ? <PictureBookImage src={pictureBookPageImageSource(item.id, 0, item.coverUrl)} alt="" compact className="size-full object-cover" /> : <BookOpen className="size-6 text-muted-foreground" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.pageCount} 页 · {item.status === "COMPLETED" ? "已保存" : item.status === "EDITING" ? "制作中" : "构思中"}</span></span>
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
              <label className="block space-y-2 text-sm font-semibold">适合人群<input value={book?.audience ?? audience} disabled={Boolean(busy)} maxLength={100} onChange={event => book ? setBook({ ...book, audience: event.target.value }) : setAudience(event.target.value)} onBlur={() => { if (book) void run("settings", () => saveBook({ audience: book.audience })); }} placeholder="例如：3—6 岁" className="w-full rounded-xl border border-border px-3 py-2 text-sm font-normal" /></label>
              <label className="block space-y-2 text-sm font-semibold">绘画风格<select value={book?.style ?? style} disabled={Boolean(busy)} onChange={event => book ? void run("settings", () => saveBook({ style: event.target.value })) : setStyle(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal">{styles.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="block space-y-2 text-sm font-semibold">页数<select value={book?.pageCount ?? count} disabled={Boolean(busy)} onChange={event => book ? void run("settings", () => saveBook({ pageCount: Number(event.target.value) })) : setCount(Number(event.target.value))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal">{pageCounts.map(item => <option key={item} value={item}>{item} 页</option>)}</select></label>
              <label className="block space-y-2 text-sm font-semibold">画面比例<select value={book?.aspectRatio ?? ratio} disabled={Boolean(busy)} onChange={event => book ? void run("settings", () => saveBook({ aspectRatio: event.target.value })) : setRatio(event.target.value as typeof ratio)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"><option value="1:1">方形 1:1</option><option value="3:2">横版 3:2</option><option value="2:3">竖版 2:3</option></select></label>
            </section>
            <section className="rounded-2xl border border-border bg-background p-5 shadow-sm"><h2 className="mb-4 text-base font-semibold">故事信息</h2><dl className="space-y-3 text-sm leading-6"><div><dt className="font-semibold">主题</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{book?.theme || "待确定"}</dd></div><div><dt className="font-semibold">主要情节</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{book?.plot || book?.brief || "待讨论"}</dd></div></dl><div className="mt-4 border-t border-border pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">出场角色</h3><Button kind="quiet" className="!px-2" disabled={!book || Boolean(busy)} onClick={() => setShowLibrary(true)}><LibraryBig className="size-4" />角色库</Button></div><div className="mt-2 flex flex-wrap gap-2">{book?.characters.length ? book.characters.map(item => <span key={item.id ?? item.name} className="rounded-full bg-secondary px-3 py-1 text-xs">{item.name}</span>) : <span className="text-sm text-muted-foreground">未选择角色</span>}</div></div></section>
            <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-sm"><h2 className="text-base font-semibold">分镜制作</h2><Button kind="primary" className="w-full !border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90" disabled={!book || !storyModelReady || Boolean(busy)} onClick={() => void makeOutline()}>{busy === "outline" ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}生成分镜</Button><Button className="w-full" disabled={!book || Boolean(busy)} onClick={() => void makeBlank()}><Plus className="size-4" />先建空白分镜</Button></section>
          </aside>
        </div>
      </main>
    </section> : <main className="grid min-h-[calc(100vh-73px)] gap-4 p-4 lg:grid-cols-[180px_minmax(0,1fr)_340px] xl:grid-cols-[210px_minmax(0,1fr)_380px]">
      <aside className="max-h-64 overflow-y-auto rounded-2xl border border-[#e9e7e4] bg-white p-3 lg:max-h-[calc(100vh-105px)]"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-sm font-semibold">页面</h2><span className="text-xs text-gray-400">{book.pages[0]?.position === 0 ? `封面 + ${book.pageCount} 页` : `${book.pages.length} 页`}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:block lg:space-y-2">{book.pages.map((item) => <button key={item.position} onClick={() => void goToPage(item.position)} className={`w-full overflow-hidden rounded-xl border-2 text-left transition ${position === item.position ? "border-[#ff7b3b]" : "border-[#eeeae6] hover:border-[#ffbf9f]"}`}><div className="relative flex aspect-[1.5] items-center justify-center bg-[#f5f3f0]">{item.imageUrl ? <PictureBookImage src={pictureBookPageImageSource(book.id, item.position, item.imageUrl)} alt="" compact className="size-full object-cover" /> : <BookOpen className="size-6 text-[#d0c9c3]" />}<span className="absolute left-2 top-2 rounded-md bg-[#26282d]/75 px-2 py-0.5 text-xs text-white">{item.position === 0 ? "封面" : String(item.position).padStart(2, "0")}</span></div><p className="line-clamp-2 min-h-12 px-3 py-2 text-xs leading-5 text-gray-600">{item.caption}</p>{(["image", "audio"] as const).filter(kind => generationKeys.includes(pictureBookGenerationKey(book.id, item.position, kind))).map(kind => <span key={kind} className="flex items-center gap-1 px-3 pb-2 text-xs text-[#d6642d]"><LoaderCircle className="size-3 animate-spin" />{kind === "image" ? "图片生成中" : "语音生成中"}</span>)}</button>)}</div></aside>
      <section className="flex min-w-0 flex-col gap-4"><div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e9e7e4] bg-white px-5 py-3"><span className="text-sm font-semibold">{position === 0 ? "封面" : `第 ${position} 页`}</span><span className="text-sm text-gray-400">/ {book.pageCount} 页</span><span className="ml-auto text-xs text-gray-400">{dirty ? "有未保存的修改" : "已保存"}</span><Button disabled={!dirty || Boolean(busy)} onClick={() => void run("save", async () => { await savePage(); })}><Save className="size-4" />保存本页</Button></div>
        <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#e9e7e4] bg-white shadow-sm"><div className="flex flex-1 items-center justify-center bg-[#f4f3f1] p-6">{page?.imageUrl ? <PictureBookImage src={pictureBookPageImageSource(book.id, position, page.imageUrl)} alt={`第 ${position} 页插画`} className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md" /> : <div className="text-center"><ImagePlus className="mx-auto size-12 text-[#c9c6c2]" /><p className="mt-4 text-sm text-gray-400">这一页还没有插画</p><Button className="mt-5" disabled={Boolean(busy) || imagePending} onClick={() => void generateImage()}><WandSparkles className="size-4" />生成本页图片</Button><label className="mx-auto mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-[#ddd9d4] bg-white px-4 py-2 text-sm">上传图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy) || imagePending} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPageImage(file); }} /></label></div>}</div><div className="bg-[#33363b] px-5 py-4 text-center text-base leading-8 text-white">{draft.caption || "填写本页展示文字"}</div></div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e9e7e4] bg-white px-4 py-3"><Button disabled={position === book.pages[0]?.position} onClick={() => void goToPage(position - 1)}><ChevronLeft className="size-4" />上一页</Button><Button disabled={position === book.pages.at(-1)?.position} onClick={() => void goToPage(position + 1)}>下一页<ChevronRight className="size-4" /></Button><span className="ml-auto flex items-center gap-2 text-sm text-gray-500"><Volume2 className="size-4" />讲解语音</span>{page?.audioUrl ? <PictureBookAudio src={pictureBookPageAudioSource(book.id, position, page.audioUrl)} className="h-9 max-w-full md:w-56" /> : <span className="text-xs text-gray-400">尚未生成</span>}</div>
      </section>
      <aside className="max-h-[calc(100vh-105px)] space-y-5 overflow-y-auto rounded-2xl border border-[#e9e7e4] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">本页设置</h2><span className="text-xs text-gray-400">{book.aspectRatio} · {book.style}</span></div><details className="rounded-xl border border-[#eee9e4] bg-[#faf8f6] p-3 text-sm"><summary className="cursor-pointer font-semibold">故事概要</summary><div className="mt-3 space-y-2 leading-6 text-gray-600"><p><strong className="text-[#26282d]">主题：</strong>{book.theme || book.brief}</p><p><strong className="text-[#26282d]">适合：</strong>{book.audience || "未指定"}</p><p><strong className="text-[#26282d]">情节：</strong>{book.plot || book.brief}</p></div></details><Field label="画面展示文字" value={draft.caption} onChange={(caption) => setDraft({ ...draft, caption, narration: draft.narration === draft.caption ? caption : draft.narration })} rows={3} maxLength={500} /><div className="border-t pt-5"><Field label="画面生成提示词" value={draft.imagePrompt} onChange={(imagePrompt) => setDraft({ ...draft, imagePrompt })} rows={6} maxLength={2000} /><p className="mt-1 text-xs text-gray-400">修改提示词后，已生成的插画需要重新生成。</p><Button kind="primary" className="mt-4 w-full" disabled={Boolean(busy) || imagePending} onClick={() => void generateImage()}>{imagePending ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}{imagePending ? "图片生成中" : page?.imageUrl ? "重新生成图片" : "生成图片"}</Button><label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e8e6e3] px-4 py-2 text-sm font-medium"><ImagePlus className="size-4" />上传或替换图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy) || imagePending} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPageImage(file); }} /></label></div><div className="border-t pt-5"><Field label="讲解语音文稿" value={draft.narration} onChange={(narration) => setDraft({ ...draft, narration })} rows={4} maxLength={1000} /><p className="mt-1 text-xs text-gray-400">默认与展示文字相同，可单独修改。</p><label className="mt-4 block space-y-2 text-sm font-semibold">讲解声音<select value={voiceKey} onChange={(event) => setVoiceKey(event.target.value)} className="w-full rounded-xl border border-[#e8e6e3] bg-white px-3 py-2 text-sm font-normal"><option value="">使用默认声音</option>{voices.systemVoices.map((item) => <option key={item.providerVoiceId ?? item.id} value={`system:${item.providerVoiceId ?? item.id}`}>{item.name}</option>)}{[...voices.platformVoices, ...voices.customVoices].filter((item) => item.status === "READY").map((item) => <option key={item.id} value={`asset:${item.id}`}>{item.name}</option>)}</select></label><Button className="mt-4 w-full" disabled={Boolean(busy) || audioPending} onClick={() => void generateAudio()}>{audioPending ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}{audioPending ? "语音生成中" : page?.audioUrl ? "重新生成语音" : "生成讲解语音"}</Button></div><div className="border-t pt-5"><h3 className="mb-2 text-sm font-semibold">固定角色</h3><div className="flex flex-wrap gap-2">{book.characters.map((item) => <span key={item.id ?? item.name} className="rounded-full bg-[#fff4ed] px-3 py-1 text-xs text-[#bd5a28]">{item.name}</span>)}</div><Button kind="quiet" className="mt-3" onClick={() => setShowLibrary(true)}><LibraryBig className="size-4" />管理角色</Button></div></aside>
    </main>}

    {showLibrary && book ? <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLibrary(false); }}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">角色库</h2><p className="mt-1 text-sm text-gray-500">选择固定角色，后续每页插画会沿用角色外观。</p></div><button aria-label="关闭角色库" onClick={() => setShowLibrary(false)}><X className="size-5" /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{characters.map((item) => <div key={item.id ?? item.name} className={`rounded-2xl border p-3 ${selectedIds.has(item.id ?? item.name) ? "border-[#ff8b50] bg-[#fff7f1]" : "border-[#ece9e5]"}`}><button disabled={Boolean(busy)} onClick={() => void toggleCharacter(item)} className="flex w-full gap-3 text-left"><span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f5efe8] text-2xl">{item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : "✦"}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.name}</strong><small className="mt-1 block text-xs leading-5 text-gray-500">{item.description}</small></span>{selectedIds.has(item.id ?? item.name) ? <Check className="size-4 text-[#ff7b3b]" /> : null}</button>{item.id && !item.id.startsWith("preset:") ? <Button kind="quiet" className="mt-2 !min-h-8 !px-2 !py-1 text-xs" disabled={Boolean(busy)} onClick={() => void generateCharacterImage(item)}><ImagePlus className="size-3" />{item.imageUrl ? "重新生成形象" : "生成角色形象"}</Button> : null}{item.id && !item.id.startsWith("preset:") ? <label className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"><ImagePlus className="size-3" />上传形象<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadCharacterImage(item, file); }} /></label> : null}</div>)}</div><div className="mt-6 border-t pt-5"><h3 className="mb-3 text-sm font-semibold">新增角色</h3><div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]"><input value={characterName} onChange={(event) => setCharacterName(event.target.value)} maxLength={80} placeholder="角色名称" className="rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#ff8c55]" /><input value={characterDescription} onChange={(event) => setCharacterDescription(event.target.value)} maxLength={1000} placeholder="外观、衣着和性格描述" className="rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#ff8c55]" /></div><Button className="mt-3" disabled={Boolean(busy)} onClick={() => void addCharacter()}><Plus className="size-4" />加入角色库</Button></div></div></div> : null}

    {preview && book ? <div className="fixed inset-0 z-40 flex flex-col bg-[#1e2024] text-white"><div className="flex items-center justify-between border-b border-white/10 px-5 py-3"><span className="font-semibold">{book.title} <span className="ml-2 text-sm font-normal text-gray-400">{previewPosition === 0 ? "封面" : `第 ${previewPosition} 页`} / {book.pageCount} 页</span></span><button onClick={() => setPreview(false)} aria-label="关闭预览"><X className="size-5" /></button></div>{(() => { const current = book.pages.find((item) => item.position === previewPosition); return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-5"><div className="flex min-h-0 flex-1 items-center justify-center">{previewPages.map(item => item.imageUrl ? <PictureBookImage key={item.position} hidden={item.position !== previewPosition} src={pictureBookPageImageSource(book.id, item.position, item.imageUrl)} alt={`第 ${item.position} 页`} className="max-h-full max-w-full object-contain" /> : null)}{!current?.imageUrl ? <div className="flex aspect-square w-72 items-center justify-center rounded-xl bg-white/10 text-sm text-gray-400">暂无插画</div> : null}</div><p className="max-w-3xl text-center text-lg leading-8">{current?.caption}</p>{previewPages.map(item => item.audioUrl ? <PictureBookAudio key={item.position} hidden={item.position !== previewPosition} preload="auto" src={pictureBookPageAudioSource(book.id, item.position, item.audioUrl)} className="h-9" /> : null)}</div>; })()}<div className="flex items-center justify-center gap-4 border-t border-white/10 p-3"><Button disabled={previewPosition === book.pages[0]?.position} onClick={() => setPreviewPosition(previewPosition - 1)}><ChevronLeft className="size-4" />上一页</Button><Button disabled={previewPosition === book.pages.at(-1)?.position} onClick={() => setPreviewPosition(previewPosition + 1)}>下一页<ArrowRight className="size-4" /></Button></div></div> : null}
  </div>;
}
