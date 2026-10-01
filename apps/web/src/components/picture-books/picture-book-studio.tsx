"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, ImagePlus, LibraryBig, LoaderCircle, MessageCircle, Mic2, Plus, Save, Send, Sparkles, Volume2, WandSparkles, X } from "lucide-react";

type Page = { position: number; caption: string; imagePrompt: string; narration: string; imageUrl: string | null; audioUrl: string | null };
type Character = { id?: string; name: string; description: string; imageUrl: string | null };
type Book = { id: string; title: string; brief: string; theme: string; audience: string; plot: string; style: string; aspectRatio: "1:1" | "3:2" | "2:3"; pageCount: number; status: string; messages: Array<{ role: "user" | "assistant"; content: string }>; characters: Character[]; pages: Page[]; updatedAt: string };
type BookSummary = Pick<Book, "id" | "title" | "theme" | "pageCount" | "status" | "updatedAt"> & { coverUrl: string | null };
type ImageModel = { id: string; displayName: string; isMock: boolean };
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

async function getImageModels(): Promise<ImageModel[]> {
  const response = await fetch("/api/ai/image/models", { credentials: "include", cache: "no-store" });
  const payload = await response.json() as { data?: ImageModel[] };
  return (payload.data ?? []).filter((model) => !model.isMock);
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
  const [imageModels, setImageModels] = useState<ImageModel[]>([]);
  const [voices, setVoices] = useState<VoiceList>({ systemVoices: [], platformVoices: [], customVoices: [] });
  const [modelId, setModelId] = useState("");
  const [storyModelReady, setStoryModelReady] = useState(false);
  const [voiceKey, setVoiceKey] = useState("");
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("3—6 岁");
  const [style, setStyle] = useState(styles[0]!);
  const [count, setCount] = useState(8);
  const [ratio, setRatio] = useState<"1:1" | "3:2" | "2:3">("1:1");
  const [chatInput, setChatInput] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [position, setPosition] = useState(1);
  const [draft, setDraft] = useState({ caption: "", imagePrompt: "", narration: "" });
  const [busy, setBusy] = useState("");
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
    setPosition(loaded.pages[0]?.position ?? 1);
    setPreview(false);
    window.history.replaceState(null, "", `/picture-books?book=${loaded.id}`);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    Promise.allSettled([api<BookSummary[]>(""), api<Character[]>("/characters"), getImageModels(), getVoices(), hasStoryModel()]).then(async (results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setBooks(results[0].value);
      else setError(results[0].reason instanceof Error ? results[0].reason.message : "无法读取绘本作品");
      if (results[1].status === "fulfilled") setCharacters(results[1].value);
      if (results[2].status === "fulfilled") { setImageModels(results[2].value); setModelId(results[2].value[0]?.id ?? ""); }
      if (results[3].status === "fulfilled") {
        const list = results[3].value;
        setVoices(list);
        setVoiceKey(list.defaultVoice?.voiceAssetId ? `asset:${list.defaultVoice.voiceAssetId}` : list.defaultVoice?.systemVoiceId ? `system:${list.defaultVoice.systemVoiceId}` : list.systemVoices[0]?.providerVoiceId ? `system:${list.systemVoices[0].providerVoiceId}` : "");
      }
      if (results[4].status === "fulfilled") setStoryModelReady(results[4].value);
      if (initialBookId) {
        try { await openBook(initialBookId); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "作品加载失败"); }
      }
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [signedIn, initialBookId, openBook]);

  const page = book?.pages.find((item) => item.position === position);
  useEffect(() => { setDraft(page ? { caption: page.caption, imagePrompt: page.imagePrompt, narration: page.narration } : { caption: "", imagePrompt: "", narration: "" }); }, [page]);
  const dirty = Boolean(page && (draft.caption !== page.caption || draft.imagePrompt !== page.imagePrompt || draft.narration !== page.narration));
  const selectedIds = useMemo(() => new Set(book?.characters.map((item) => item.id ?? item.name) ?? []), [book?.characters]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!leavingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(label: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试"); }
    finally { setBusy(""); }
  }

  async function refreshList() { setBooks(await api<BookSummary[]>("")); }
  async function createBook() {
    if (brief.trim().length < 2) { setError("请先写下至少两个字的故事想法"); return; }
    await run("create", async () => {
      const created = await api<Book>("", "POST", { brief: brief.trim(), audience, style, pageCount: count, aspectRatio: ratio });
      setBook(created); setPosition(1); setNotice("作品已创建，可以继续讨论故事或生成分镜。");
      window.history.replaceState(null, "", `/picture-books?book=${created.id}`);
      await refreshList();
    });
  }

  async function saveBook(patch: Record<string, unknown>) {
    if (!book) return;
    const updated = await api<Book>(`/${book.id}`, "PATCH", patch);
    setBook(updated);
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
    if (!modelId) { setError("当前没有可用的图片模型，请先在后台配置图片生成模型。"); return; }
    await run("character-image", async () => {
      const updated = await api<Character>(`/characters/${characterId}/image`, "POST", { modelInstanceId: modelId });
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
    if (!book || !chatInput.trim() || !storyModelReady) return;
    const message = chatInput.trim(); setChatInput("");
    await run("discuss", async () => { setBook(await api<Book>(`/${book.id}/discuss`, "POST", { message })); });
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
    await run("complete", async () => { await savePage(); setBook(await api<Book>(`/${book.id}/complete`, "POST")); await refreshList(); setNotice("作品已保存，可以预览和继续编辑。"); });
  }

  async function leaveBook(destination: "library" | "tools") {
    await run("leave", async () => {
      await savePage();
      if (destination === "tools") { leavingRef.current = true; window.location.assign("/tools"); }
      else { setBook(null); window.history.replaceState(null, "", "/picture-books"); await refreshList(); }
    });
  }

  async function openPreview() {
    await run("preview", async () => { await savePage(); setPreviewPosition(book?.pages[0]?.position ?? 1); setPreview(true); });
  }

  async function savePage(): Promise<Book | null> {
    if (!book || !page) return null;
    if (!dirty) return book;
    const updated = await api<Book>(`/${book.id}/pages/${position}`, "PATCH", draft);
    setBook(updated); setNotice("本页修改已保存。");
    return updated;
  }

  async function goToPage(next: number) {
    if (!book?.pages.some((item) => item.position === next)) return;
    await run("page", async () => { await savePage(); setPosition(next); });
  }

  async function generateImage() {
    if (!book || !page) return;
    if (!modelId) { setError("当前没有可用的图片模型，请先在后台配置图片生成模型。"); return; }
    await run("image", async () => { await savePage(); setBook(await api<Book>(`/${book.id}/pages/${position}/image`, "POST", { modelInstanceId: modelId })); setNotice("本页图片已生成。"); });
  }

  async function uploadPageImage(file: File) {
    if (!book || !page) return;
    await run("upload", async () => {
      await savePage();
      setBook(await upload<Book>(`/${book.id}/pages/${position}/upload`, file));
      setNotice("本页图片已上传。");
    });
  }

  async function generateAudio() {
    if (!book || !page) return;
    await run("audio", async () => {
      await savePage();
      const payload = voiceKey.startsWith("asset:") ? { voiceAssetId: voiceKey.slice(6) } : voiceKey.startsWith("system:") ? { voice: voiceKey.slice(7) } : {};
      setBook(await api<Book>(`/${book.id}/pages/${position}/audio`, "POST", payload)); setNotice("本页讲解语音已生成。");
    });
  }

  if (!signedIn) return <div className="flex min-h-screen items-center justify-center bg-[#f7f6f4] p-6"><div className="max-w-md rounded-3xl border bg-white p-10 text-center shadow-sm"><BookOpen className="mx-auto mb-5 size-12 text-[#ff7b3b]" /><h1 className="text-2xl font-semibold">绘本创作</h1><p className="mt-3 text-sm leading-6 text-gray-500">登录后保存故事构想、角色与每一页的创作内容。</p><Link href="/login?next=%2Fpicture-books" className="mt-6 inline-flex rounded-xl bg-[#ff7b3b] px-6 py-3 text-sm font-semibold text-white">登录后开始</Link></div></div>;

  return <div className="min-h-screen bg-[#f7f6f4] text-[#26282d]">
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-[#e9e7e4] bg-white px-4 py-3 shadow-sm md:px-6">
      {book ? <button onClick={() => void leaveBook("tools")} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-50"><ArrowLeft className="size-4" />返回应用</button> : <Link href="/tools" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-50"><ArrowLeft className="size-4" />返回应用</Link>}
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#ff7b3b] text-white"><BookOpen className="size-5" /></span>
      <span className="text-lg font-semibold">绘本创作</span>
      {book ? <><span className="hidden text-gray-300 md:inline">/</span><input aria-label="作品名称" value={book.title} onChange={(event) => setBook({ ...book, title: event.target.value })} onBlur={() => void run("title", () => saveBook({ title: book.title }))} className="min-w-0 max-w-48 rounded-md px-2 py-1 text-sm outline-none hover:bg-gray-50 focus:bg-gray-50" /><span className="ml-auto hidden text-xs text-gray-400 md:block">{book.pages.length ? `${book.pages[0]?.position === 0 ? "封面 + " : ""}${book.pageCount} 页 · 逐页保存` : "构思故事"}</span><Button kind="quiet" disabled={Boolean(busy)} onClick={() => void leaveBook("library")}><LibraryBig className="size-4" />作品库</Button>{book.pages.length ? <><Button disabled={Boolean(busy)} onClick={() => void openPreview()}><BookOpen className="size-4" />预览</Button><Button kind="primary" disabled={Boolean(busy)} onClick={() => void completeBook()}><Save className="size-4" />保存为作品</Button></> : null}</> : null}
    </header>

    {error || notice ? <div role={error ? "alert" : "status"} className={`mx-auto mt-4 flex max-w-[1600px] items-center justify-between rounded-xl px-4 py-3 text-sm ${error ? "border border-red-200 bg-red-50 text-red-700" : "border border-[#ffddc8] bg-[#fff8f3] text-[#a34e1d]"}`}><span>{error || notice}</span><button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><X className="size-4" /></button></div> : null}

    {loading ? <div className="flex h-[60vh] items-center justify-center"><LoaderCircle className="size-7 animate-spin text-[#ff7b3b]" /></div> : !book ? <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-14">
      <div><div className="mb-9"><span className="text-sm font-semibold tracking-widest text-[#ed7137]">从一个故事想法开始</span><h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">一起创作一本绘本</h1><p className="mt-4 text-base text-gray-500">一句话、一段故事，或一份详细设定，都可以作为起点。</p></div>
        <div className="rounded-3xl border border-[#ebe7e3] bg-white p-5 shadow-sm md:p-8"><Field label="你想讲一个什么故事？" value={brief} onChange={setBrief} rows={8} maxLength={30000} placeholder="例如：一只害怕下雨的小狐狸，在雨天帮助迷路的小鸟找到家。想让 4 岁的孩子感受到勇气和友谊。" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-semibold">适合人群<input value={audience} maxLength={100} onChange={(event) => setAudience(event.target.value)} className="block w-full rounded-xl border border-[#e8e6e3] px-3 py-3 text-sm font-normal outline-none focus:border-[#ff8c55]" placeholder="例如：3—6 岁" /></label><label className="space-y-2 text-sm font-semibold">绘画风格<select value={style} onChange={(event) => setStyle(event.target.value)} className="block w-full rounded-xl border border-[#e8e6e3] bg-white px-3 py-3 text-sm font-normal outline-none focus:border-[#ff8c55]">{styles.map((item) => <option key={item}>{item}</option>)}</select></label><label className="space-y-2 text-sm font-semibold">页数<select value={count} onChange={(event) => setCount(Number(event.target.value))} className="block w-full rounded-xl border border-[#e8e6e3] bg-white px-3 py-3 text-sm font-normal outline-none focus:border-[#ff8c55]">{pageCounts.map((item) => <option key={item} value={item}>{item} 页</option>)}</select></label><label className="space-y-2 text-sm font-semibold">画面比例<select value={ratio} onChange={(event) => setRatio(event.target.value as typeof ratio)} className="block w-full rounded-xl border border-[#e8e6e3] bg-white px-3 py-3 text-sm font-normal outline-none focus:border-[#ff8c55]"><option value="1:1">方形 1:1</option><option value="3:2">横版 3:2</option><option value="2:3">竖版 2:3</option></select></label></div>
          <div className="mt-8 flex flex-wrap items-center gap-3"><Button kind="primary" disabled={Boolean(busy)} onClick={() => void createBook()}><Sparkles className="size-4" />创建绘本</Button><span className="text-xs text-gray-400">创建后可以与 AI 讨论，也可以直接编辑分镜。</span></div>
        </div></div>
      <aside className="rounded-3xl border border-[#ebe7e3] bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h2 className="text-base font-semibold">我的作品</h2><span className="text-xs text-gray-400">{books.length} 本</span></div>{books.length ? <div className="space-y-3">{books.map((item) => <button key={item.id} onClick={() => void run("open", () => openBook(item.id))} className="flex w-full gap-3 rounded-2xl border border-[#eee9e4] p-3 text-left transition hover:border-[#ffb18b]"><span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#fff3e8] text-[#ff7b3b]">{item.coverUrl ? <img src={item.coverUrl} alt="" className="size-full object-cover" /> : <BookOpen className="size-6" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.title}</strong><small className="mt-1 block text-xs text-gray-400">{item.pageCount} 页 · {item.status === "COMPLETED" ? "已保存" : item.status === "EDITING" ? "制作中" : "构思中"}</small></span><ChevronRight className="mt-4 size-4 text-gray-300" /></button>)}</div> : <p className="rounded-xl bg-[#faf8f6] px-4 py-8 text-center text-sm text-gray-400">还没有绘本，写下第一个故事吧。</p>}</aside>
    </main> : !book.pages.length ? <main className="mx-auto grid max-w-[1440px] gap-5 px-5 py-6 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
      <aside className="space-y-5 rounded-2xl border border-[#ebe7e3] bg-white p-5"><div><h2 className="text-base font-semibold">故事设定</h2><p className="mt-1 text-xs text-gray-400">准备好后生成逐页分镜</p></div><Field label="最初想法" value={book.brief} onChange={() => {}} rows={6} readOnly /><label className="block space-y-2 text-sm font-semibold">适合人群<input value={book.audience} onChange={(event) => setBook({ ...book, audience: event.target.value })} onBlur={() => void run("settings", () => saveBook({ audience: book.audience }))} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" /></label><label className="block space-y-2 text-sm font-semibold">画风<select value={book.style} onChange={(event) => void run("settings", () => saveBook({ style: event.target.value }))} className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal">{styles.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block space-y-2 text-sm font-semibold">页数<select value={book.pageCount} onChange={(event) => void run("settings", () => saveBook({ pageCount: Number(event.target.value) }))} className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal">{pageCounts.map((item) => <option key={item}>{item} 页</option>)}</select></label><label className="block space-y-2 text-sm font-semibold">画面比例<select value={book.aspectRatio} onChange={(event) => void run("settings", () => saveBook({ aspectRatio: event.target.value }))} className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal"><option value="1:1">方形 1:1</option><option value="3:2">横版 3:2</option><option value="2:3">竖版 2:3</option></select></label></aside>
      <section className="flex min-h-[650px] flex-col rounded-2xl border border-[#ebe7e3] bg-white"><div className="flex items-center gap-2 border-b px-6 py-5"><MessageCircle className="size-5 text-[#ff7b3b]" /><h2 className="font-semibold">一起构思故事</h2></div><div className="flex-1 space-y-5 overflow-y-auto p-6"><div className="max-w-[85%] rounded-2xl rounded-tl-md bg-[#fff3eb] px-5 py-4 text-sm leading-7">我已经记下你的故事想法。你可以直接生成分镜，也可以先聊聊主题、角色和情节。</div>{book.messages.map((item, index) => <div key={index} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-5 py-4 text-sm leading-7 ${item.role === "user" ? "ml-auto rounded-tr-md bg-[#ff7b3b] text-white" : "rounded-tl-md bg-[#fff3eb]"}`}>{item.content}</div>)}</div><div className="border-t p-5"><div className="flex gap-3"><textarea aria-label="讨论故事" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && storyModelReady) { event.preventDefault(); void discuss(); } }} rows={2} placeholder="例如：我希望主角是一只怕黑的小熊，结尾温暖一些……" className="min-h-16 flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none focus:border-[#ff8c55]" /><Button kind="primary" disabled={!storyModelReady || !chatInput.trim() || Boolean(busy)} onClick={() => void discuss()} title="发送"><Send className="size-4" /></Button></div><p className="mt-2 text-xs text-gray-400">{storyModelReady ? "Enter 发送，Shift + Enter 换行" : "AI 故事模型尚未配置，可先建立空白分镜。"}</p></div></section>
      <aside className="space-y-5"><div className="rounded-2xl border border-[#ebe7e3] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">出场角色</h2><Button kind="quiet" className="!px-2" onClick={() => setShowLibrary(true)}><LibraryBig className="size-4" />角色库</Button></div><div className="mt-4 flex flex-wrap gap-2">{book.characters.length ? book.characters.map((item) => <span key={item.id ?? item.name} className="rounded-full border border-[#ffceb5] bg-[#fff6ef] px-3 py-1.5 text-sm">{item.name}</span>) : <span className="text-sm text-gray-400">还没有指定角色</span>}</div></div><div className="rounded-2xl border border-[#ebe7e3] bg-white p-5"><h2 className="mb-4 font-semibold">进入分镜</h2><p className="mb-5 text-sm leading-6 text-gray-500">{storyModelReady ? "AI 会根据当前故事设定和讨论，安排每页的画面与展示文字。" : "AI 故事模型尚未配置，你仍可从空白分镜开始创作。"}</p><Button kind="primary" className="w-full" disabled={!storyModelReady || Boolean(busy)} onClick={() => void makeOutline()}>{busy === "outline" ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}生成分镜</Button><Button className="mt-3 w-full" disabled={Boolean(busy)} onClick={() => void makeBlank()}><Plus className="size-4" />先建空白分镜</Button></div></aside>
    </main> : <main className="grid min-h-[calc(100vh-73px)] gap-4 p-4 lg:grid-cols-[180px_minmax(0,1fr)_340px] xl:grid-cols-[210px_minmax(0,1fr)_380px]">
      <aside className="max-h-64 overflow-y-auto rounded-2xl border border-[#e9e7e4] bg-white p-3 lg:max-h-[calc(100vh-105px)]"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-sm font-semibold">页面</h2><span className="text-xs text-gray-400">{book.pages[0]?.position === 0 ? `封面 + ${book.pageCount} 页` : `${book.pages.length} 页`}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:block lg:space-y-2">{book.pages.map((item) => <button key={item.position} onClick={() => void goToPage(item.position)} className={`w-full overflow-hidden rounded-xl border-2 text-left transition ${position === item.position ? "border-[#ff7b3b]" : "border-[#eeeae6] hover:border-[#ffbf9f]"}`}><div className="relative flex aspect-[1.5] items-center justify-center bg-[#f5f3f0]">{item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : <BookOpen className="size-6 text-[#d0c9c3]" />}<span className="absolute left-2 top-2 rounded-md bg-[#26282d]/75 px-2 py-0.5 text-xs text-white">{item.position === 0 ? "封面" : String(item.position).padStart(2, "0")}</span></div><p className="line-clamp-2 min-h-12 px-3 py-2 text-xs leading-5 text-gray-600">{item.caption}</p></button>)}</div></aside>
      <section className="flex min-w-0 flex-col gap-4"><div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e9e7e4] bg-white px-5 py-3"><span className="text-sm font-semibold">{position === 0 ? "封面" : `第 ${position} 页`}</span><span className="text-sm text-gray-400">/ {book.pageCount} 页</span><span className="ml-auto text-xs text-gray-400">{dirty ? "有未保存的修改" : "已保存"}</span><Button disabled={!dirty || Boolean(busy)} onClick={() => void run("save", async () => { await savePage(); })}><Save className="size-4" />保存本页</Button></div>
        <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#e9e7e4] bg-white shadow-sm"><div className="flex flex-1 items-center justify-center bg-[#f4f3f1] p-6">{page?.imageUrl ? <img src={page.imageUrl} alt={`第 ${position} 页插画`} className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md" /> : <div className="text-center"><ImagePlus className="mx-auto size-12 text-[#c9c6c2]" /><p className="mt-4 text-sm text-gray-400">这一页还没有插画</p><Button className="mt-5" disabled={!modelId || Boolean(busy)} onClick={() => void generateImage()}><WandSparkles className="size-4" />生成本页图片</Button><label className="mx-auto mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-[#ddd9d4] bg-white px-4 py-2 text-sm">上传图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPageImage(file); }} /></label></div>}</div><div className="bg-[#33363b] px-5 py-4 text-center text-base leading-8 text-white">{draft.caption || "填写本页展示文字"}</div></div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e9e7e4] bg-white px-4 py-3"><Button disabled={position === book.pages[0]?.position || Boolean(busy)} onClick={() => void goToPage(position - 1)}><ChevronLeft className="size-4" />上一页</Button><Button disabled={position === book.pages.at(-1)?.position || Boolean(busy)} onClick={() => void goToPage(position + 1)}>下一页<ChevronRight className="size-4" /></Button><span className="ml-auto flex items-center gap-2 text-sm text-gray-500"><Volume2 className="size-4" />讲解语音</span>{page?.audioUrl ? <audio key={page.audioUrl} controls src={page.audioUrl} className="h-9 max-w-full md:w-56" /> : <span className="text-xs text-gray-400">尚未生成</span>}</div>
      </section>
      <aside className="max-h-[calc(100vh-105px)] space-y-5 overflow-y-auto rounded-2xl border border-[#e9e7e4] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">本页设置</h2><span className="text-xs text-gray-400">{book.aspectRatio} · {book.style}</span></div><details className="rounded-xl border border-[#eee9e4] bg-[#faf8f6] p-3 text-sm"><summary className="cursor-pointer font-semibold">故事概要</summary><div className="mt-3 space-y-2 leading-6 text-gray-600"><p><strong className="text-[#26282d]">主题：</strong>{book.theme || book.brief}</p><p><strong className="text-[#26282d]">适合：</strong>{book.audience || "未指定"}</p><p><strong className="text-[#26282d]">情节：</strong>{book.plot || book.brief}</p></div></details><Field label="画面展示文字" value={draft.caption} onChange={(caption) => setDraft({ ...draft, caption, narration: draft.narration === draft.caption ? caption : draft.narration })} rows={3} maxLength={500} /><div className="border-t pt-5"><Field label="画面生成提示词" value={draft.imagePrompt} onChange={(imagePrompt) => setDraft({ ...draft, imagePrompt })} rows={6} maxLength={2000} /><p className="mt-1 text-xs text-gray-400">修改提示词后，已生成的插画需要重新生成。</p><label className="mt-4 block space-y-2 text-sm font-semibold">图片模型<select value={modelId} onChange={(event) => setModelId(event.target.value)} className="w-full rounded-xl border border-[#e8e6e3] bg-white px-3 py-2 text-sm font-normal"><option value="">{imageModels.length ? "选择图片模型" : "暂无可用图片模型"}</option>{imageModels.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><Button kind="primary" className="mt-4 w-full" disabled={!modelId || Boolean(busy)} onClick={() => void generateImage()}>{busy === "image" ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}{page?.imageUrl ? "重新生成图片" : "生成图片"}</Button><label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e8e6e3] px-4 py-2 text-sm font-medium"><ImagePlus className="size-4" />上传或替换图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPageImage(file); }} /></label></div><div className="border-t pt-5"><Field label="讲解语音文稿" value={draft.narration} onChange={(narration) => setDraft({ ...draft, narration })} rows={4} maxLength={1000} /><p className="mt-1 text-xs text-gray-400">默认与展示文字相同，可单独修改。</p><label className="mt-4 block space-y-2 text-sm font-semibold">讲解声音<select value={voiceKey} onChange={(event) => setVoiceKey(event.target.value)} className="w-full rounded-xl border border-[#e8e6e3] bg-white px-3 py-2 text-sm font-normal"><option value="">使用默认声音</option>{voices.systemVoices.map((item) => <option key={item.providerVoiceId ?? item.id} value={`system:${item.providerVoiceId ?? item.id}`}>{item.name}</option>)}{[...voices.platformVoices, ...voices.customVoices].filter((item) => item.status === "READY").map((item) => <option key={item.id} value={`asset:${item.id}`}>{item.name}</option>)}</select></label><Button className="mt-4 w-full" disabled={Boolean(busy)} onClick={() => void generateAudio()}>{busy === "audio" ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}{page?.audioUrl ? "重新生成语音" : "生成讲解语音"}</Button></div><div className="border-t pt-5"><h3 className="mb-2 text-sm font-semibold">固定角色</h3><div className="flex flex-wrap gap-2">{book.characters.map((item) => <span key={item.id ?? item.name} className="rounded-full bg-[#fff4ed] px-3 py-1 text-xs text-[#bd5a28]">{item.name}</span>)}</div><Button kind="quiet" className="mt-3" onClick={() => setShowLibrary(true)}><LibraryBig className="size-4" />管理角色</Button></div></aside>
    </main>}

    {showLibrary && book ? <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLibrary(false); }}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">角色库</h2><p className="mt-1 text-sm text-gray-500">选择固定角色，后续每页插画会沿用角色外观。</p></div><button aria-label="关闭角色库" onClick={() => setShowLibrary(false)}><X className="size-5" /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{characters.map((item) => <div key={item.id ?? item.name} className={`rounded-2xl border p-3 ${selectedIds.has(item.id ?? item.name) ? "border-[#ff8b50] bg-[#fff7f1]" : "border-[#ece9e5]"}`}><button disabled={Boolean(busy)} onClick={() => void toggleCharacter(item)} className="flex w-full gap-3 text-left"><span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f5efe8] text-2xl">{item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : "✦"}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.name}</strong><small className="mt-1 block text-xs leading-5 text-gray-500">{item.description}</small></span>{selectedIds.has(item.id ?? item.name) ? <Check className="size-4 text-[#ff7b3b]" /> : null}</button>{item.id && !item.id.startsWith("preset:") ? <Button kind="quiet" className="mt-2 !min-h-8 !px-2 !py-1 text-xs" disabled={!modelId || Boolean(busy)} onClick={() => void generateCharacterImage(item)}><ImagePlus className="size-3" />{item.imageUrl ? "重新生成形象" : "生成角色形象"}</Button> : null}{item.id && !item.id.startsWith("preset:") ? <label className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"><ImagePlus className="size-3" />上传形象<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadCharacterImage(item, file); }} /></label> : null}</div>)}</div><div className="mt-6 border-t pt-5"><h3 className="mb-3 text-sm font-semibold">新增角色</h3><div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]"><input value={characterName} onChange={(event) => setCharacterName(event.target.value)} maxLength={80} placeholder="角色名称" className="rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#ff8c55]" /><input value={characterDescription} onChange={(event) => setCharacterDescription(event.target.value)} maxLength={1000} placeholder="外观、衣着和性格描述" className="rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#ff8c55]" /></div><Button className="mt-3" disabled={Boolean(busy)} onClick={() => void addCharacter()}><Plus className="size-4" />加入角色库</Button></div></div></div> : null}

    {preview && book ? <div className="fixed inset-0 z-40 flex flex-col bg-[#1e2024] text-white"><div className="flex items-center justify-between border-b border-white/10 px-5 py-3"><span className="font-semibold">{book.title} <span className="ml-2 text-sm font-normal text-gray-400">{previewPosition === 0 ? "封面" : `第 ${previewPosition} 页`} / {book.pageCount} 页</span></span><button onClick={() => setPreview(false)} aria-label="关闭预览"><X className="size-5" /></button></div>{(() => { const current = book.pages.find((item) => item.position === previewPosition); return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-5"><div className="flex min-h-0 flex-1 items-center justify-center">{current?.imageUrl ? <img src={current.imageUrl} alt={`第 ${previewPosition} 页`} className="max-h-full max-w-full object-contain" /> : <div className="flex aspect-square w-72 items-center justify-center rounded-xl bg-white/10 text-sm text-gray-400">暂无插画</div>}</div><p className="max-w-3xl text-center text-lg leading-8">{current?.caption}</p>{current?.audioUrl ? <audio key={current.audioUrl} controls src={current.audioUrl} className="h-9" /> : null}</div>; })()}<div className="flex items-center justify-center gap-4 border-t border-white/10 p-3"><Button disabled={previewPosition === book.pages[0]?.position} onClick={() => setPreviewPosition(previewPosition - 1)}><ChevronLeft className="size-4" />上一页</Button><Button disabled={previewPosition === book.pages.at(-1)?.position} onClick={() => setPreviewPosition(previewPosition + 1)}>下一页<ArrowRight className="size-4" /></Button></div></div> : null}
  </div>;
}
