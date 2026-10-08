"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, Check, ChevronLeft, ChevronRight, FileText, History, Info, LoaderCircle, Plus, Save, Sparkles, Trash2, Upload, Volume2 } from "lucide-react";
import { VoicePicker } from "@/components/audio/voice-picker";
import { GuideBookPicker } from "@/components/picture-books/guide-book-picker";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { VoiceLibrary } from "@/lib/audio-api";
import { defaultGuideVoice, guideAudioExtension, guideAudioSelection, guideRequest, type GuideBookChoice, type GuideOptions, type GuideSummary, type PictureBookGuide } from "@/lib/picture-book-guide";
import type { VoicePickerOption } from "@/lib/voice-picker";

function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return <span className="group relative inline-flex">
    <button type="button" aria-label="查看带读风格说明" aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><Info className="size-4" /></button>
    <span role="tooltip" className={`${open ? "block" : "hidden group-hover:block group-focus-within:block"} absolute right-0 top-8 z-20 w-72 rounded-xl border border-border bg-background p-3 text-left text-sm font-normal leading-6 shadow-lg`}>{text}</span>
  </span>;
}

export function PictureBookGuideConsole({ signedIn, initialGuideId }: { signedIn: boolean; initialGuideId: string }) {
  const [history, setHistory] = useState<GuideSummary[]>([]);
  const [guide, setGuide] = useState<PictureBookGuide | null>(null);
  const guideRef = useRef<PictureBookGuide | null>(null);
  const [options, setOptions] = useState<GuideOptions>({ audiences: [], styles: [] });
  const [voices, setVoices] = useState<VoiceLibrary | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [audience, setAudience] = useState("幼儿园");
  const [style, setStyle] = useState("interactive");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(0.95);
  const [script, setScript] = useState("");
  const preserveDraft = useRef(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const closeBookPicker = useCallback(() => setBookPickerOpen(false), []);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const page = guide?.pages.find(item => item.pageNumber === pageNumber);
  const disabled = Boolean(busy || guide?.busy);
  const dirty = Boolean(page && script.trim() !== page.script);
  const settingsDirty = Boolean(guide && (guide.audience !== audience || guide.style !== style));
  const selectedStyle = options.styles.find(item => item.value === style);
  const allScripts = Boolean(guide && guide.scriptCount === guide.pageCount);

  const voiceOptions = useMemo<VoicePickerOption[]>(() => [
    ...(voices?.systemVoices ?? []).filter(item => item.status === "READY" && item.providerVoiceId).map(item => ({ ...item, value: `system:${item.providerVoiceId}`, badge: "官方系统音色" })),
    ...(voices?.platformVoices ?? []).filter(item => item.status === "READY").map(item => ({ ...item, value: `voice:${item.id}`, badge: "平台音色" })),
    ...(voices?.customVoices ?? []).filter(item => item.status === "READY").map(item => ({ ...item, value: `voice:${item.id}`, badge: item.typeName }))
  ], [voices]);

  const accept = useCallback((next: PictureBookGuide) => { guideRef.current = next; setGuide(next); }, []);
  const refreshHistory = useCallback(async () => setHistory(await guideRequest<GuideSummary[]>()), []);
  const openGuide = useCallback(async (id: string) => {
    const next = await guideRequest<PictureBookGuide>(`/${encodeURIComponent(id)}`);
    preserveDraft.current = false;
    accept(next); setPageNumber(1); setAudience(next.audience); setStyle(next.style); setAutoPlay(false);
    window.history.replaceState(null, "", `/picture-book-guide?guide=${encodeURIComponent(id)}`);
  }, [accept]);

  useEffect(() => {
    active.current = true;
    if (signedIn) {
      void Promise.allSettled([
        guideRequest<GuideOptions>("/options").then(setOptions),
        refreshHistory(),
        fetch("/api/audio/voices", { credentials: "include" }).then(async response => {
          const payload = await response.json() as { code: number; data: VoiceLibrary };
          if (response.ok && payload.code === 0) { setVoices(payload.data); setVoice(current => current || defaultGuideVoice(payload.data)); }
        }),
        initialGuideId ? openGuide(initialGuideId) : Promise.resolve()
      ]).then(results => { const failure = results.find(result => result.status === "rejected"); if (failure?.status === "rejected") setError(failure.reason instanceof Error ? failure.reason.message : "导读记录加载失败"); });
    }
    return () => { active.current = false; };
  }, [signedIn, initialGuideId, openGuide, refreshHistory]);

  useEffect(() => { if (!preserveDraft.current) setScript(page?.script ?? ""); }, [guide?.id, page?.pageNumber, page?.script]);
  useEffect(() => {
    if (!guide?.busy || busy) return;
    const timer = window.setInterval(() => {
      void guideRequest<PictureBookGuide>(`/${guide.id}`).then(accept).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [guide?.busy, guide?.id, busy, accept]);
  useEffect(() => {
    if (autoPlay && page?.audioUrl && !dirty && !settingsDirty) void audioRef.current?.play().catch(() => { setAutoPlay(false); setNotice("点击播放继续带读"); });
  }, [autoPlay, page?.audioUrl, dirty, settingsDirty]);

  async function run(label: string, action: () => Promise<void>) {
    if (disabled) return;
    setBusy(label); setError(""); setNotice(""); setAutoPlay(false);
    try { await action(); await refreshHistory(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
      const current = guideRef.current;
      if (current) { try { accept(await guideRequest<PictureBookGuide>(`/${current.id}`)); } catch { /* Preserve the current draft if refresh fails. */ } }
    } finally { setBusy(""); }
  }

  async function upload(file: File) {
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 200 * 1024 * 1024) { setError("请选择 200MB 以内、1—80 页的 PDF 绘本"); return; }
    await run("正在解析 PDF…", async () => {
      const form = new FormData(); form.set("file", file);
      const next = await guideRequest<PictureBookGuide>("", "POST", form);
      preserveDraft.current = false;
      accept(next); setPageNumber(1); setAudience(next.audience); setStyle(next.style);
      setSpeed(options.styles.find(item => item.value === next.style)?.speed ?? 0.95);
      window.history.replaceState(null, "", `/picture-book-guide?guide=${next.id}`);
    });
  }
  async function selectBook(book: GuideBookChoice) {
    closeBookPicker();
    await run("正在载入绘本…", async () => {
      const next = await guideRequest<PictureBookGuide>("/books", "POST", { bookId: book.bookId, scope: book.scope });
      preserveDraft.current = false;
      accept(next); setPageNumber(1); setAudience(next.audience); setStyle(next.style);
      setSpeed(options.styles.find(item => item.value === next.style)?.speed ?? 0.95);
      window.history.replaceState(null, "", `/picture-book-guide?guide=${next.id}`);
    });
  }
  async function saveDraft(current: PictureBookGuide) {
    if (!dirty || !page) return current;
    try {
      const next = await guideRequest<PictureBookGuide>(`/${current.id}/pages/${pageNumber}`, "PATCH", { script, version: current.version });
      preserveDraft.current = false;
      accept(next); return next;
    } catch (cause) {
      preserveDraft.current = true;
      throw new Error(`${cause instanceof Error ? cause.message : "保存失败"}。已保留未保存文稿，请检查后重试。`, { cause });
    }
  }
  async function generateScripts(onlyPage?: number) {
    setResetDialog(false);
    await run("正在生成带读文稿…", async () => {
      let current = guideRef.current!;
      if (settingsDirty) { current = await guideRequest<PictureBookGuide>(`/${current.id}`, "PATCH", { audience, style, version: current.version }); accept(current); }
      else current = await saveDraft(current);
      const targets = onlyPage ? [onlyPage] : current.pages.filter(item => !item.script).map(item => item.pageNumber);
      for (const target of targets) {
        if (!active.current) break;
        setBusy(`正在生成第 ${target} / ${current.pageCount} 页文稿…`); setPageNumber(target);
        current = await guideRequest<PictureBookGuide>(`/${current.id}/pages/${target}/script`, "POST", { version: current.version });
        accept(current);
      }
      if (active.current) setNotice(targets.length ? "带读文稿已保存，可逐页编辑后生成语音" : "全部页面已有文稿，可逐页重新生成");
    });
  }
  async function generateAudio(onlyPage?: number) {
    await run("正在生成带读语音…", async () => {
      let current = await saveDraft(guideRef.current!);
      const selection = voice || "default";
      const targets = onlyPage ? [onlyPage] : current.pages.filter(item => !item.audioUrl || item.audioVoice !== selection || item.audioSpeed !== speed).map(item => item.pageNumber);
      for (const target of targets) {
        if (!active.current) break;
        setBusy(`正在生成第 ${target} / ${current.pageCount} 页语音…`); setPageNumber(target);
        current = await guideRequest<PictureBookGuide>(`/${current.id}/pages/${target}/audio`, "POST", { ...guideAudioSelection(voice, speed), version: current.version });
        accept(current);
      }
      if (active.current) setNotice(targets.length ? "带读语音已按页保存" : "全部页面已有当前声音和语速的语音");
    });
  }
  function requestScripts(onlyPage?: number) {
    if (settingsDirty && guide?.scriptCount) { setResetDialog(true); return; }
    void generateScripts(onlyPage);
  }
  function newGuide() {
    acceptEmpty(); window.history.replaceState(null, "", "/picture-book-guide");
  }
  function acceptEmpty() { preserveDraft.current = false; guideRef.current = null; setGuide(null); setPageNumber(1); setScript(""); setAutoPlay(false); setError(""); setNotice(""); }
  const loginHref = `/login?next=${encodeURIComponent(initialGuideId ? `/picture-book-guide?guide=${initialGuideId}` : "/picture-book-guide")}`;

  return <div className="min-h-[calc(100vh-72px)] bg-[#f6f6f5] p-5">
    <div className="grid items-start gap-5 lg:grid-cols-[292px_minmax(0,1fr)_360px]">
      <aside aria-label="绘本导读历史" className="flex max-h-[50vh] flex-col lg:sticky lg:top-5 lg:max-h-[calc(100vh-112px)]">
        <div className="mb-5 flex items-center gap-3"><BookOpenText className="size-7 text-primary" /><h1 className="text-2xl font-semibold tracking-normal">绘本导读</h1></div>
        <Button className="mb-5 w-full" variant="outline" disabled={disabled || dirty} onClick={newGuide}><Plus className="size-4" />新建导读</Button>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><History className="size-4" />导读历史<span className="ml-auto">{history.length} 本</span></div>
        <div className="min-h-0 space-y-2 overflow-y-auto">
          {history.map(item => <button key={item.id} type="button" disabled={disabled || dirty} onClick={() => void run("正在打开绘本…", () => openGuide(item.id))} className={`w-full rounded-xl border p-3 text-left disabled:opacity-50 ${guide?.id === item.id ? "border-primary/25 bg-background shadow-sm" : "border-transparent hover:bg-background/70"}`}>
            <span className="block truncate text-sm font-medium">{item.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{item.pageCount} 页 · 文稿 {item.scriptCount}/{item.pageCount} · 语音 {item.audioCount}/{item.pageCount}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{item.audience} · {options.styles.find(value => value.value === item.style)?.label ?? "带读"}</span>
          </button>)}
          {!history.length ? <p className="p-3 text-sm leading-6 text-muted-foreground">暂无导读记录</p> : null}
        </div>
      </aside>

      <main className="min-w-0 space-y-5">
        {error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
        {notice ? <div role="status" className="rounded-xl border border-primary/20 bg-background p-4 text-sm">{notice}</div> : null}
        {busy || guide?.busy ? <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-background p-4 text-sm"><LoaderCircle className="size-4 animate-spin" />{busy || "本绘本正在生成中…"}</div> : null}
        {!guide ? <div className="grid gap-5 md:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-border bg-background p-5 shadow-sm">
          <h2 className="text-base font-semibold">上传绘本</h2>
          <div className="mt-5 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center">
            <FileText className="mb-4 size-12 text-muted-foreground" />
            <p className="text-base font-medium">选择 PDF 绘本文档</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">PDF · 最大 200MB · 最多 80 页</p>
            {signedIn ? <Button className="mt-6" disabled={disabled} onClick={() => inputRef.current?.click()}><Upload className="size-4" />上传 PDF</Button> : <Button className="mt-6" asChild><Link href={loginHref}>登录后上传绘本</Link></Button>}
          </div>
          </section>
          <section className="min-w-0 rounded-2xl border border-border bg-background p-5 shadow-sm">
            <h2 className="text-base font-semibold">本站绘本</h2>
            <div className="mt-5 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center">
              <BookOpenText className="mb-4 size-12 text-muted-foreground" />
              <p className="text-base font-medium">选择本站绘本</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">资源中心 · 我的绘本</p>
              {signedIn ? <Button className="mt-6" disabled={disabled} onClick={() => setBookPickerOpen(true)}><BookOpenText className="size-4" />选择绘本</Button> : <Button className="mt-6" asChild><Link href={loginHref}>登录后选择绘本</Link></Button>}
            </div>
          </section>
        </div> : <>
          <section className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0"><h2 className="truncate text-base font-semibold">{guide.title}</h2><p className="mt-1 text-xs text-muted-foreground">第 {pageNumber} / {guide.pageCount} 页</p></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" asChild><a href={guide.pdfUrl} target="_blank" rel="noreferrer">查看 PDF</a></Button><Button size="sm" variant="ghost" disabled={disabled} aria-label="删除导读" onClick={() => setDeleteDialog(true)}><Trash2 className="size-4" /></Button></div>
            </div>
            {page ? <div className="flex min-h-72 items-center justify-center bg-secondary/20 p-4">
              {/* Private PDF previews require the authenticated image endpoint. */}
              <img key={page.imageUrl} src={page.imageUrl} alt={`绘本第 ${pageNumber} 页`} className="max-h-[48vh] w-auto max-w-full object-contain" />
            </div> : null}
            <div className="flex items-center justify-between gap-3 border-t border-border p-4">
              <Button variant="outline" size="sm" disabled={pageNumber <= 1 || disabled || dirty} onClick={() => { preserveDraft.current = false; setAutoPlay(false); setPageNumber(pageNumber - 1); }}><ChevronLeft className="size-4" />上一页</Button>
              <label className="flex items-center gap-2 text-sm"><span className="sr-only">跳转页码</span><select aria-label="跳转页码" value={pageNumber} disabled={disabled || dirty} onChange={event => { preserveDraft.current = false; setAutoPlay(false); setPageNumber(Number(event.target.value)); }} className="rounded-lg border border-border bg-background px-3 py-2">{guide.pages.map(item => <option key={item.pageNumber} value={item.pageNumber}>第 {item.pageNumber} 页{item.audioUrl ? " · 有语音" : item.script ? " · 有文稿" : ""}</option>)}</select></label>
              <Button variant="outline" size="sm" disabled={pageNumber >= guide.pageCount || disabled || dirty} onClick={() => { preserveDraft.current = false; setAutoPlay(false); setPageNumber(pageNumber + 1); }}>下一页<ChevronRight className="size-4" /></Button>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">本页带读文稿</h2><Button size="sm" variant="outline" disabled={disabled || settingsDirty} onClick={() => requestScripts(pageNumber)}><Sparkles className="size-4" />{page?.script ? "重新生成本页" : "生成本页文稿"}</Button></div>
            <textarea aria-label="本页带读文稿" rows={7} maxLength={2000} disabled={disabled || settingsDirty} value={script} onChange={event => { if (event.target.value.trim() === page?.script) preserveDraft.current = false; setScript(event.target.value); setAutoPlay(false); }} placeholder="先生成带读文稿，再逐页确认和编辑。" className="w-full resize-y rounded-xl border border-border bg-background p-4 text-base leading-8 outline-none focus:border-primary" />
            <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{script.length}/2000{dirty ? " · 未保存" : page?.script ? " · 已保存" : ""}</span><Button size="sm" variant="outline" disabled={!dirty || !script.trim() || disabled || settingsDirty} onClick={() => void run("正在保存文稿…", async () => { await saveDraft(guideRef.current!); setNotice("本页文稿已保存，请重新生成本页语音"); })}><Save className="size-4" />保存文稿</Button></div>
            {page?.sourceText ? <details className="mt-4 border-t border-border pt-4"><summary className="cursor-pointer text-sm text-muted-foreground">查看本页提取文字</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{page.sourceText}</p></details> : null}
          </section>
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">本页带读语音</h2><Button size="sm" variant="outline" disabled={disabled || !allScripts || settingsDirty || !script.trim() || !voice} onClick={() => void generateAudio(pageNumber)}><Volume2 className="size-4" />{page?.audioUrl ? "重新生成本页语音" : "生成本页语音"}</Button></div>
            {page?.audioUrl && !dirty && !settingsDirty ? <>
              <audio ref={audioRef} key={page.audioUrl} src={page.audioUrl} controls preload="metadata" className="w-full" onEnded={() => { if (autoPlay && guide.pages[pageNumber]?.audioUrl) setPageNumber(pageNumber + 1); else setAutoPlay(false); }} />
              <div className="mt-3 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoPlay} onChange={event => setAutoPlay(event.target.checked)} />连续带读，自动翻页</label><a href={page.audioUrl} download={`${guide.title}-第${pageNumber}页.${guideAudioExtension(page.audioMimeType)}`} className="text-sm text-primary">下载本页语音</a></div>
            </> : <p className="text-sm leading-6 text-muted-foreground">{dirty || settingsDirty ? "文稿或设置已修改，保存后重新生成语音。" : "完成全部页文稿后，即可生成带读语音。"}</p>}
          </section>
        </>}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" aria-label="上传 PDF 绘本" className="sr-only" disabled={disabled || !signedIn} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      </main>

      <aside aria-label="带读设置" className="min-w-0 space-y-5 rounded-2xl border border-border bg-background p-5 shadow-sm lg:sticky lg:top-5 lg:w-[360px]">
        <h2 className="text-base font-semibold">带读设置</h2>
        <label className="block space-y-2 text-sm font-semibold">适用对象<Select value={audience} disabled={!guide || disabled || !options.audiences.length} onChange={event => { setAudience(event.target.value); setAutoPlay(false); }}>{options.audiences.length ? options.audiences.map(value => <option key={value} value={value}>{value}</option>) : <option>幼儿园</option>}</Select></label>
        <div className="space-y-2"><div className="flex items-center justify-between"><label htmlFor="guide-style" className="text-sm font-semibold">带读风格</label>{selectedStyle ? <Help text={selectedStyle.description} /> : null}</div><Select id="guide-style" value={style} disabled={!guide || disabled || !options.styles.length} onChange={event => { setStyle(event.target.value); setSpeed(options.styles.find(item => item.value === event.target.value)?.speed ?? 1); setAutoPlay(false); }}>{options.styles.length ? options.styles.map(item => <option key={item.value} value={item.value}>{item.label}</option>) : <option value="interactive">交互启发型</option>}</Select></div>
        <div className="space-y-3 border-t border-border pt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">1. 生成带读文稿</h3>{allScripts && !settingsDirty ? <Check className="size-4 text-primary" /> : null}</div><Button className="w-full" disabled={!guide || disabled || !options.styles.length || (dirty && !script.trim())} onClick={() => requestScripts()}><Sparkles className="size-4" />{settingsDirty ? "按新设置生成全部文稿" : guide?.scriptCount && !allScripts ? "继续生成剩余文稿" : "生成全部文稿"}</Button><p className="text-xs text-muted-foreground">已生成 {guide?.scriptCount ?? 0} / {guide?.pageCount ?? 0} 页</p></div>
        <div className="space-y-4 border-t border-border pt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">2. 生成带读语音</h3>{guide && guide.audioCount === guide.pageCount ? <Check className="size-4 text-primary" /> : null}</div><VoicePicker label="带读声音" value={voice} voices={voiceOptions} disabled={disabled || !signedIn} onChange={setVoice} /><label className="block space-y-2 text-sm font-semibold">语速<Select value={speed} disabled={disabled} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 0.75, 0.85, 0.9, 0.95, 1, 1.1, 1.25, 1.5].map(value => <option key={value} value={value}>{value} 倍</option>)}</Select></label><Button className="w-full" variant="outline" disabled={!allScripts || disabled || settingsDirty || !script.trim() || !voice} onClick={() => void generateAudio()}><Volume2 className="size-4" />生成全部语音</Button><p className="text-xs text-muted-foreground">已生成 {guide?.audioCount ?? 0} / {guide?.pageCount ?? 0} 页</p></div>
      </aside>
    </div>
    {bookPickerOpen ? <GuideBookPicker onClose={closeBookPicker} onSelect={book => void selectBook(book)} /> : null}
    {resetDialog || deleteDialog ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5"><div role="dialog" aria-modal="true" aria-labelledby="guide-confirm-title" className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl"><h2 id="guide-confirm-title" className="text-base font-semibold">{deleteDialog ? "删除这份导读？" : "按新设置重新生成？"}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{deleteDialog ? "绘本文件、逐页文稿和带读语音将从导读记录中删除。" : "原有文稿和语音将失效，所有页面会按新的适用对象与带读风格重新生成文稿。"}</p><div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => { setResetDialog(false); setDeleteDialog(false); }}>取消</Button><Button onClick={() => { if (deleteDialog) { setDeleteDialog(false); void run("正在删除导读…", async () => { await guideRequest(`/${guide!.id}`, "DELETE"); newGuide(); }); } else void generateScripts(); }}>{deleteDialog ? "删除" : "重新生成"}</Button></div></div></div> : null}
  </div>;
}
