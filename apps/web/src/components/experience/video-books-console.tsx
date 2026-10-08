"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Check, ChevronLeft, ChevronRight, Download, Eraser, FileText, Film, History, ImagePlus, Info, LoaderCircle, Plus, Upload, Video, Volume2, X } from "lucide-react";
import { GuideBookPicker } from "@/components/picture-books/guide-book-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ExperienceImageModel, ExperienceVideoModel } from "@/lib/experience-api";
import { guideRequest, type GuideBookChoice, type PictureBookGuide } from "@/lib/picture-book-guide";
import { createVideoBookProject, pendingVideoBookPages, readVideoBookFrame, readVideoBookReference, validateVideoBookReferences, validateVideoBookSettings, videoBookAttachment, videoBookFrame, videoBookMotions, videoBookPrompt, videoBookRequest,
  type VideoBookClip, type VideoBookPage, type VideoBookProject } from "@/lib/video-books";
import { loadVideoBooks, removeVideoBook, saveVideoBook } from "@/lib/video-books-storage";
import { cn } from "@/lib/utils";

type Props = { userId: string; initialBookId: string; models: ExperienceVideoModel[]; imageModels: ExperienceImageModel[] };
type VideoResult = Pick<VideoBookClip, "providerTaskId" | "status" | "videoUrl" | "errorMessage"> & { id: string; modelName: string; createdAt: string };
type TaskResult = Pick<VideoBookClip, "status" | "videoUrl" | "errorMessage">;
const panel = "min-w-0 rounded-2xl border border-border bg-background p-5 shadow-sm";

function Help({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  return <span className="group relative inline-flex">
    <button type="button" aria-label={`${label}说明`} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} className="rounded p-1 text-muted-foreground"><Info className="size-4" /></button>
    <span role="tooltip" className={cn("absolute right-0 top-7 z-30 w-64 rounded-xl border border-border bg-background p-3 text-sm font-normal leading-6 shadow-lg", open ? "block" : "hidden group-hover:block group-focus-within:block")}>{children}</span>
  </span>;
}

export function VideoBooksConsole({ userId, initialBookId, models, imageModels }: Props) {
  const [projects, setProjects] = useState<VideoBookProject[]>([]);
  const [project, setProject] = useState<VideoBookProject | null>(null);
  const projectRef = useRef<VideoBookProject | null>(null);
  const [ready, setReady] = useState(!userId);
  const [pageNumber, setPageNumber] = useState(1);
  const [removeText, setRemoveText] = useState(false);
  const [bookPicker, setBookPicker] = useState(false);
  const [leftTab, setLeftTab] = useState<"pages" | "history">("pages");
  const [previewTab, setPreviewTab] = useState<"frame" | "video">("frame");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const stopRef = useRef(false);
  const activeRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);
  const [saveState, setSaveState] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const closeBookPicker = useCallback(() => setBookPicker(false), []);
  const page = project?.pages.find(item => item.pageNumber === pageNumber);
  const model = models.find(item => item.id === project?.modelId);
  const imageModel = imageModels.find(item => !item.isMock && item.maxReferenceImages > 0 && item.modelName === "Qwen-Image-2.1")
    ?? imageModels.find(item => !item.isMock && item.maxReferenceImages > 0);
  const completed = project?.pages.filter(item => item.clip?.status === "SUCCEEDED").length ?? 0;
  const hasRunning = Boolean(project?.pages.some(item => item.clip?.status === "RUNNING"));
  const disabled = Boolean(busy) || !ready;
  const loginHref = `/login?next=${encodeURIComponent(initialBookId ? `/video-books?book=${initialBookId}` : "/video-books")}`;

  useEffect(() => {
    activeRef.current = true;
    if (userId) {
      void loadVideoBooks(userId).then(items => {
        if (!activeRef.current) return;
        setProjects(items);
        if (initialBookId) {
          const initial = items.find(item => item.id === initialBookId);
          if (initial) { projectRef.current = initial; setProject(initial); setPageNumber(initial.pages[0]?.pageNumber ?? 1); }
          else setNotice("当前浏览器中没有找到此作品，请重新导入绘本");
        }
      }).catch(cause => { if (activeRef.current) setError(cause instanceof Error ? cause.message : "作品记录加载失败"); })
        .finally(() => { if (activeRef.current) setReady(true); });
    }
    return () => { activeRef.current = false; stopRef.current = true; abortRef.current?.abort(); };
  }, [userId, initialBookId]);

  function commit(next: VideoBookProject) {
    projectRef.current = next;
    setProject(next);
    setProjects(items => [next, ...items.filter(item => item.id !== next.id)]);
    const version = ++saveVersion.current;
    setSaveState("保存中…");
    const operation = saveQueue.current.catch(() => undefined).then(() => saveVideoBook(userId, next));
    saveQueue.current = operation;
    void operation.then(() => { if (activeRef.current && version === saveVersion.current) setSaveState("已保存"); })
      .catch(cause => { if (activeRef.current) { setSaveState("保存失败"); setError(cause instanceof Error ? cause.message : "作品保存失败"); } });
    return operation;
  }

  function patchProject(patch: Partial<VideoBookProject>) {
    const current = projectRef.current;
    if (current) void commit({ ...current, ...patch, updatedAt: new Date().toISOString() });
  }

  function patchPage(number: number, patch: Partial<VideoBookPage>, projectId = projectRef.current?.id) {
    const current = projectRef.current;
    if (!current || current.id !== projectId) return;
    void commit({ ...current, pages: current.pages.map(item => item.pageNumber === number ? { ...item, ...patch } : item), updatedAt: new Date().toISOString() });
  }

  // Resume polling submitted tasks after a reload without submitting them again.
  useEffect(() => {
    if (!project || busy || !hasRunning) return;
    let active = true;
    const controller = new AbortController();
    const pending = project.pages.filter(item => item.clip?.status === "RUNNING" && item.clip.providerTaskId);
    let querying = false;
    const timer = window.setInterval(() => {
      if (querying) return;
      querying = true;
      void Promise.allSettled(pending.map(async item => {
        const clip = item.clip!;
        const result = await videoBookRequest<TaskResult>(`/api/ai/video/tasks/${encodeURIComponent(clip.providerTaskId!)}`, undefined, controller.signal);
        if (active && result.status !== "RUNNING") patchPage(item.pageNumber, { clip: { ...clip, ...result } }, project.id);
      })).then(results => {
        querying = false;
        const failure = results.find(result => result.status === "rejected");
        if (active && failure?.status === "rejected") setNotice("视频任务仍保留在作品中，暂时无法查询进度，请稍后重试");
      });
    }, 5000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [project, busy, hasRunning]);

  useEffect(() => {
    if (!deleteDialog) return;
    deleteButton.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleteDialog(false);
      if (event.key === "Tab") {
        const buttons = document.querySelectorAll<HTMLButtonElement>('[data-video-book-delete] button');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [deleteDialog]);

  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    stopRef.current = false;
    abortRef.current = new AbortController();
    setBusy(label); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { if (activeRef.current) setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试"); }
    finally { busyRef.current = false; if (activeRef.current) setBusy(""); }
  }

  function activate(next: VideoBookProject | null) {
    saveVersion.current++;
    projectRef.current = next; setProject(next); setPageNumber(next?.pages[0]?.pageNumber ?? 1);
    setPreviewTab("frame"); setLeftTab("pages"); setError(""); setNotice(""); setSaveState("");
    window.history.replaceState(null, "", next ? `/video-books?book=${encodeURIComponent(next.id)}` : "/video-books");
  }

  async function importGuide(guide: PictureBookGuide) {
    if (!activeRef.current) return;
    const next = { ...createVideoBookProject(guide, models[0]), removeText };
    activate(next);
    await commit(next);
  }

  async function uploadPdf(file?: File) {
    if (!file || !userId) return;
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 200 * 1024 * 1024) { setError("请选择 200MB 以内、1—80 页的 PDF 绘本"); return; }
    await run("正在解析绘本文档…", async () => {
      const form = new FormData(); form.set("file", file);
      await importGuide(await guideRequest<PictureBookGuide>("", "POST", form));
    });
  }

  async function selectBook(book: GuideBookChoice) {
    closeBookPicker();
    await run("正在载入本站绘本…", async () => importGuide(await guideRequest<PictureBookGuide>("/books", "POST", { bookId: book.bookId, scope: book.scope })));
  }

  async function cleanFrame(target: VideoBookPage) {
    if (target.cleanImageUrl) return target;
    if (!imageModel) throw new Error("暂无支持去字的图片模型，请先在后台配置参考生图模型，或取消去除页面文字");
    setBusy(`正在去除第 ${target.pageNumber} 页文字…`);
    const reference = await readVideoBookFrame(target.imageUrl, target.pageNumber, abortRef.current?.signal);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const scale = 1024 / Math.max(image.naturalWidth, image.naturalHeight);
        resolve({ width: Math.max(256, Math.round(image.naturalWidth * scale)), height: Math.max(256, Math.round(image.naturalHeight * scale)) });
      };
      image.onerror = () => reject(new Error("首帧图片无法读取"));
      image.src = reference.dataUrl;
    });
    const result = await videoBookRequest<{ images: Array<{ url: string }> }>("/api/ai/image/generate", {
      prompt: "编辑这张绘本图片：仅去除画面中的文字、对白、页码和文字背景框，用周围插画自然填补。保持角色、构图、配色和插画风格，不裁切画面，不增加文字或水印。",
      modelInstanceId: imageModel.id, billingContext: "PERSONAL", count: 1, ...dimensions,
      referenceImages: [videoBookAttachment(reference)]
    }, abortRef.current?.signal);
    const cleanImageUrl = result.images[0]?.url;
    if (!cleanImageUrl) throw new Error("去字处理没有返回图片，请重试");
    patchPage(target.pageNumber, { cleanImageUrl });
    return { ...target, cleanImageUrl };
  }

  async function addReference(files: FileList | null) {
    const current = projectRef.current;
    const target = current?.pages.find(item => item.pageNumber === pageNumber);
    if (!files?.length || !current || !target || !model) return;
    await run("正在读取参考文件…", async () => {
      const additions = await Promise.all(Array.from(files).map(readVideoBookReference));
      const references = [...target.references, ...additions];
      validateVideoBookReferences(references, model);
      patchPage(target.pageNumber, { references });
    });
  }

  function changeModel(id: string) {
    const selected = models.find(item => item.id === id);
    if (!selected || !project) return;
    patchProject({ modelId: id,
      ratio: selected.supportedRatios.includes(project.ratio) ? project.ratio : selected.supportedRatios[0],
      resolution: selected.supportedResolutions.includes(project.resolution) ? project.resolution : selected.defaultResolution,
      duration: selected.supportedDurations.includes(project.duration) ? project.duration : selected.defaultDuration });
  }

  async function generatePage(current: VideoBookProject, target: VideoBookPage, selected: ExperienceVideoModel) {
    if (target.clip?.status === "RUNNING") return;
    let clip: VideoBookClip | null = null;
    try {
      const prompt = videoBookPrompt(target, current.removeText);
      validateVideoBookReferences(target.references, selected);
      const framePage = current.removeText ? await cleanFrame(target) : target;
      const firstFrame = await readVideoBookFrame(videoBookFrame(framePage, current.removeText), target.pageNumber, abortRef.current?.signal);
      setBusy(`正在提交第 ${target.pageNumber} 页视频…`);
      const result = await videoBookRequest<VideoResult>("/api/ai/video/generate", {
        prompt, modelInstanceId: selected.id, billingContext: "PERSONAL", ratio: current.ratio,
        resolution: current.resolution, duration: current.duration, referenceFiles: [firstFrame, ...target.references].map(videoBookAttachment)
      }, abortRef.current?.signal);
      clip = { ...result, ratio: current.ratio, duration: current.duration, prompt };
      if (clip.status === "SUCCEEDED" && !clip.videoUrl) throw new Error("视频任务未返回可播放文件，请稍后重试");
      patchPage(target.pageNumber, { clip }, current.id);
      await saveQueue.current;
      const taskId = clip.providerTaskId;
      if (clip.status === "RUNNING" && !taskId) throw new Error("任务已提交但未返回查询编号，请在生成记录中查看进度");
      for (let attempt = 0; clip.status === "RUNNING" && attempt < 120 && !stopRef.current && activeRef.current; attempt++) {
        setBusy(`正在生成第 ${target.pageNumber} 页视频…`);
        await new Promise(resolve => window.setTimeout(resolve, 5000));
        if (stopRef.current || !activeRef.current) break;
        const result = await videoBookRequest<TaskResult>(`/api/ai/video/tasks/${encodeURIComponent(taskId!)}`, undefined, abortRef.current?.signal);
        clip = { ...clip, ...result };
        patchPage(target.pageNumber, { clip }, current.id);
      }
      if (clip.status === "FAILED" || clip.status === "CANCELLED") throw new Error(clip.errorMessage || "本页视频生成失败，请重试");
      if (clip.status === "RUNNING" && !stopRef.current) throw new Error("本页仍在生成中，已保留任务；请稍后查看结果");
    } catch (cause) {
      if (clip?.status === "RUNNING") throw cause; // A query failure must never trigger a second paid submission.
      const message = cause instanceof Error ? cause.message : "本页视频生成失败";
      patchPage(target.pageNumber, { clip: clip ? { ...clip, status: "FAILED", errorMessage: message } : {
        id: crypto.randomUUID(), providerTaskId: null, status: "FAILED", videoUrl: null, errorMessage: message,
        modelName: selected.displayName, ratio: current.ratio, duration: current.duration, prompt: target.prompt, createdAt: new Date().toISOString()
      } }, current.id);
      throw cause;
    }
  }

  async function generate(all = false) {
    const current = projectRef.current;
    if (!current || !model || !page) return;
    const targets = all ? pendingVideoBookPages(current) : [page];
    if (!targets.length) { setNotice("全部页面已有视频或正在生成中"); return; }
    // Validate the entire selection before any paid request is submitted.
    try {
      validateVideoBookSettings(current, model);
      for (const target of targets) { videoBookPrompt(target, current.removeText); validateVideoBookReferences(target.references, model); }
      if (current.removeText && !imageModel && targets.some(target => !target.cleanImageUrl)) throw new Error("暂无支持去字的图片模型，请取消去除文字或在后台配置模型");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请检查生成参数"); return; }
    await run("准备生成视频…", async () => {
      setPreviewTab("video");
      let finished = 0;
      for (const target of targets) {
        if (stopRef.current || !activeRef.current) break;
        setPageNumber(target.pageNumber);
        await generatePage(current, target, model);
        finished++;
      }
      if (activeRef.current) setNotice(stopRef.current ? "已停止后续生成，已提交的任务会继续执行" : `已完成 ${finished} 页视频生成`);
    });
  }

  function removeTextControl(value: boolean) {
    return <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1 text-sm font-semibold">去除页面文字<Help label="去除页面文字">生成视频前先用图片模型去除文字，会产生图片生成费用。处理后的图片可在首帧中查看，原图会保留。</Help></span>
      <input type="checkbox" aria-label="是否去除页面文字" className="size-4 accent-primary" checked={value} disabled={disabled} onChange={event => project ? patchProject({ removeText: event.target.checked }) : setRemoveText(event.target.checked)} />
    </div>;
  }

  return <div className="min-h-[calc(100vh-72px)] bg-[#f6f6f5] p-5">
    <input ref={pdfInput} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="上传绘本文档" onChange={event => { void uploadPdf(event.target.files?.[0]); event.target.value = ""; }} />
    <input ref={referenceInput} type="file" multiple accept={model?.acceptedReferenceTypes.join(",") || "image/*,audio/*,video/*"} className="hidden" aria-label="上传参考素材" onChange={event => { void addReference(event.target.files); event.target.value = ""; }} />
    <div className="grid items-start gap-5 lg:grid-cols-[292px_minmax(0,1fr)_360px]">
      <aside aria-label="视频作品和绘本页面" className="flex max-h-[50vh] min-w-0 flex-col lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-112px)]">
        <div className="mb-5 flex items-center gap-3"><Film className="size-7 text-primary" /><h1 className="text-2xl font-semibold tracking-normal">绘本转视频</h1></div>
        <Button variant="outline" className="mb-5 w-full" disabled={disabled} onClick={() => activate(null)}><Plus className="size-4" />新建视频</Button>
        {project?.editing ? <div className="mb-3 flex gap-2"><Button size="sm" variant={leftTab === "pages" ? "default" : "ghost"} aria-pressed={leftTab === "pages"} onClick={() => setLeftTab("pages")}><BookOpenText className="size-4" />分镜页面</Button><Button size="sm" variant={leftTab === "history" ? "default" : "ghost"} aria-pressed={leftTab === "history"} onClick={() => setLeftTab("history")}><History className="size-4" />历史</Button></div> : <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><History className="size-4" />视频作品历史<span className="ml-auto">{projects.length} 本</span></div>}
        <div className="min-h-0 space-y-2 overflow-y-auto">
          {project?.editing && leftTab === "pages" ? project.pages.map(item => <button key={item.pageNumber} type="button" disabled={disabled} onClick={() => { setPageNumber(item.pageNumber); setPreviewTab("frame"); }} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50", item.pageNumber === pageNumber ? "border-primary/30 bg-background shadow-sm" : "border-transparent hover:bg-background/70")}>
            <img src={project.removeText && item.cleanImageUrl ? item.cleanImageUrl : item.imageUrl} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-lg bg-secondary object-contain" /><span className="min-w-0"><span className="block text-sm font-medium">第 {item.pageNumber} 页</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.description || "待编辑描述"}</span><span className={cn("mt-1 block text-xs", item.clip?.status === "FAILED" ? "text-destructive" : "text-muted-foreground")}>{item.clip?.status === "SUCCEEDED" ? "视频已生成" : item.clip?.status === "RUNNING" ? "视频生成中" : item.clip?.status === "FAILED" ? "生成失败" : "待生成"}</span></span>
          </button>) : projects.length ? projects.map(item => <button key={item.id} type="button" disabled={disabled} onClick={() => activate(item)} className={cn("w-full rounded-xl border p-3 text-left disabled:opacity-50", project?.id === item.id ? "border-primary/30 bg-background shadow-sm" : "border-transparent hover:bg-background/70")}><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.pages.length} 页 · 视频 {item.pages.filter(value => value.clip?.status === "SUCCEEDED").length}/{item.pages.length}</span></button>) : <p className="p-3 text-sm leading-6 text-muted-foreground">暂无视频作品</p>}
        </div>
        <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">作品记录<Help label="作品记录">作品和参考素材保存在当前浏览器，按登录账号区分。更换浏览器后需要重新导入；原绘本素材仍可在绘本导读中找到。</Help></div>
      </aside>

      <main className="min-w-0 space-y-5">
        {error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
        {notice ? <div role="status" className="rounded-xl border border-border bg-background p-4 text-sm">{notice}</div> : null}
        {busy ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-4 text-sm"><LoaderCircle className="size-4 animate-spin" />{busy}{project?.editing && busy.includes("视频") ? <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { stopRef.current = true; setNotice("当前已提交任务会继续执行，完成后停止后续页面"); }}>停止后续生成</Button> : null}</div> : null}
        {!project ? <div className="grid gap-5 md:grid-cols-2">
          <section className={panel}><h2 className="text-base font-semibold">上传绘本</h2><div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) void uploadPdf(event.dataTransfer.files[0]); }} className="mt-5 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center"><FileText className="mb-4 size-12 text-muted-foreground" /><p className="text-base font-medium">选择 PDF 绘本文档</p><p className="mt-2 text-sm leading-6 text-muted-foreground">PDF · 最大 200MB · 最多 80 页</p>{userId ? <Button className="mt-6" disabled={disabled} onClick={() => pdfInput.current?.click()}><Upload className="size-4" />上传绘本</Button> : <Button asChild className="mt-6"><Link href={loginHref}>登录后上传绘本</Link></Button>}</div></section>
          <section className={panel}><h2 className="text-base font-semibold">本站绘本</h2><div className="mt-5 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center"><BookOpenText className="mb-4 size-12 text-muted-foreground" /><p className="text-base font-medium">选择本站绘本</p><p className="mt-2 text-sm leading-6 text-muted-foreground">资源中心 · 我的绘本</p>{userId ? <Button className="mt-6" disabled={disabled} onClick={() => setBookPicker(true)}><BookOpenText className="size-4" />选择绘本</Button> : <Button asChild className="mt-6"><Link href={loginHref}>登录后选择绘本</Link></Button>}</div></section>
        </div> : <>
          <section className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-5">
              {project.editing ? <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { patchProject({ editing: false }); setPreviewTab("frame"); }}><ArrowLeft className="size-4" />返回导入</Button> : null}
              <Input aria-label="视频作品名称" maxLength={100} disabled={disabled} value={project.title} onChange={event => patchProject({ title: event.target.value })} className="w-auto min-w-0 flex-1 border-transparent bg-transparent font-semibold" />
              <span className="text-xs text-muted-foreground">{saveState}</span>
              <Button variant="ghost" size="sm" aria-label="删除视频作品" disabled={disabled || hasRunning} onClick={() => setDeleteDialog(true)}><X className="size-4" /></Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
              {project.editing ? <><Button size="sm" variant={previewTab === "frame" ? "default" : "ghost"} aria-pressed={previewTab === "frame"} onClick={() => setPreviewTab("frame")}>视频首帧</Button><Button size="sm" variant={previewTab === "video" ? "default" : "ghost"} aria-pressed={previewTab === "video"} onClick={() => setPreviewTab("video")}>生成视频</Button></> : <span className="text-sm font-semibold">绘本预览</span>}
              <span className="ml-auto text-xs text-muted-foreground">第 {pageNumber} / {project.pages.length} 页</span>
            </div>
            {page ? <div className="flex min-h-80 flex-col items-center justify-center bg-secondary/20 p-5">
              {previewTab === "video" && project.editing ? page.clip?.status === "SUCCEEDED" && page.clip.videoUrl ? <video key={page.clip.id} src={page.clip.videoUrl} poster={project.removeText ? page.cleanImageUrl ?? page.imageUrl : page.imageUrl} controls playsInline preload="metadata" className="max-h-[50vh] w-full rounded-xl bg-black" style={{ aspectRatio: page.clip.ratio.replace(":", "/") }} /> : <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">{page.clip?.status === "RUNNING" ? <LoaderCircle className="size-8 animate-spin" /> : <Video className="size-10" />}<p>{page.clip?.status === "RUNNING" ? "本页视频生成中，稍后会自动更新" : page.clip?.errorMessage || "尚未生成本页视频"}</p></div> : <><img src={project.removeText && page.cleanImageUrl ? page.cleanImageUrl : page.imageUrl} alt={`绘本第 ${pageNumber} 页视频首帧`} className="max-h-[50vh] w-auto max-w-full object-contain" />{project.removeText ? <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">{page.cleanImageUrl ? <><Check className="size-3" />已去除文字</> : <><Eraser className="size-3" />生成前处理文字</>}</span> : null}</>}
            </div> : null}
            <div className="flex items-center justify-between gap-3 border-t border-border p-4"><Button variant="outline" size="sm" disabled={disabled || pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}><ChevronLeft className="size-4" />上一页</Button><Select aria-label="跳转绘本页面" className="h-9 w-auto" disabled={disabled} value={pageNumber} onChange={event => setPageNumber(Number(event.target.value))}>{project.pages.map(item => <option key={item.pageNumber} value={item.pageNumber}>第 {item.pageNumber} 页</option>)}</Select><Button variant="outline" size="sm" disabled={disabled || pageNumber >= project.pages.length} onClick={() => setPageNumber(pageNumber + 1)}>下一页<ChevronRight className="size-4" /></Button></div>
          </section>
          {project.editing && page ? <section className={cn(panel, "space-y-4")}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">本页视频描述</h2><span className="text-xs text-muted-foreground">第 {pageNumber} 页</span></div>
            <label className="block space-y-2 text-sm font-semibold">画面描述<Textarea aria-label="本页画面描述" maxLength={1000} value={page.description} disabled={disabled} onChange={event => patchPage(pageNumber, { description: event.target.value })} placeholder="描述角色、场景和这一页发生的故事" className="min-h-24 text-base leading-8" /></label>
            <label className="block space-y-2 text-sm font-semibold">动态描述<Select aria-label="动态描述" value={page.motion} disabled={disabled} onChange={event => patchPage(pageNumber, { motion: event.target.value as VideoBookPage["motion"] })}>{videoBookMotions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></label>
            <label className="block space-y-2 text-sm font-semibold">视频提示词<Textarea aria-label="视频提示词" maxLength={800} value={page.prompt} disabled={disabled} onChange={event => patchPage(pageNumber, { prompt: event.target.value })} placeholder="补充角色动作、镜头运动、声音或细节要求" className="min-h-32 text-base leading-8" /></label>
            {page.clip?.status === "SUCCEEDED" && page.clip.videoUrl ? <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">{page.clip.modelName} · {page.clip.ratio} · {page.clip.duration} 秒</span><Button asChild size="sm" variant="outline" className="ml-auto"><a href={page.clip.videoUrl} download={`${project.title}-第${pageNumber}页.mp4`} target="_blank" rel="noreferrer"><Download className="size-4" />下载本页视频</a></Button></div> : null}
          </section> : null}
        </>}
      </main>

      <aside className="min-w-0 space-y-5 lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto">
        {!project?.editing ? <section className={cn(panel, "space-y-5")}><h2 className="text-base font-semibold">视频制作</h2>{removeTextControl(project?.removeText ?? removeText)}{project ? <dl className="space-y-3 border-t border-border pt-4 text-sm"><div className="flex gap-3"><dt className="shrink-0 text-muted-foreground">绘本</dt><dd className="min-w-0 break-words">{project.title}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">页面</dt><dd>{project.pages.length} 页</dd></div></dl> : null}<Button className="w-full" disabled={disabled || !project?.pages.length} onClick={() => { patchProject({ editing: true }); setLeftTab("pages"); }}><Film className="size-4" />编辑视频</Button></section> : <>
          <section className={cn(panel, "space-y-4")}><h2 className="text-base font-semibold">视频设置</h2>
            <label className="block space-y-2 text-sm font-semibold">视频模型<Select aria-label="视频模型" disabled={disabled || !models.length} value={project.modelId} onChange={event => changeModel(event.target.value)}>{!model ? <option value={project.modelId}>{project.modelId ? "原模型不可用，请重新选择" : "暂无可用图生视频模型"}</option> : null}{models.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</Select></label>
            <label className="block space-y-2 text-sm font-semibold">视频比例<Select aria-label="视频比例" disabled={disabled || !model} value={project.ratio} onChange={event => patchProject({ ratio: event.target.value })}>{(model?.supportedRatios ?? [project.ratio]).map(value => <option key={value} value={value}>{value}{value === "16:9" ? " · 横屏" : value === "9:16" ? " · 竖屏" : value === "1:1" ? " · 方形" : ""}</option>)}</Select></label>
            <div className="grid grid-cols-2 gap-3"><label className="block space-y-2 text-sm font-semibold">分辨率<Select aria-label="视频分辨率" disabled={disabled || !model} value={project.resolution} onChange={event => patchProject({ resolution: event.target.value })}>{(model?.supportedResolutions ?? [project.resolution]).map(value => <option key={value}>{value}</option>)}</Select></label><label className="block space-y-2 text-sm font-semibold">每页时长<Select aria-label="每页视频时长" disabled={disabled || !model} value={project.duration} onChange={event => patchProject({ duration: Number(event.target.value) })}>{(model?.supportedDurations ?? [project.duration]).map(value => <option key={value} value={value}>{value} 秒</option>)}</Select></label></div>
            {removeTextControl(project.removeText)}
            {project.removeText && page && !page.cleanImageUrl ? <Button variant="outline" className="w-full" disabled={disabled || !imageModel} onClick={() => void run("正在处理首帧…", async () => { await cleanFrame(page); setPreviewTab("frame"); setNotice("首帧文字已处理，请检查画面后生成视频"); })}><Eraser className="size-4" />先处理本页文字</Button> : null}
            {!models.length ? <p className="text-sm leading-6 text-muted-foreground">暂无可用图生视频模型，请在后台配置后刷新页面。</p> : null}
          </section>
          <section className={cn(panel, "space-y-4")}><div className="flex items-center justify-between"><h2 className="text-base font-semibold">参考素材</h2><Help label="参考素材">每页绘本图片自动作为首帧。附加图片作为尾帧，语音作为驱动音频；可用类型和数量以当前视频模型为准。</Help></div>
            {page?.references.map(file => <div key={file.id} className="rounded-xl border border-border p-3"><div className="flex items-center gap-2">{file.type === "image" ? <ImagePlus className="size-4 shrink-0" /> : file.type === "audio" ? <Volume2 className="size-4 shrink-0" /> : <Video className="size-4 shrink-0" />}<span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><Button variant="ghost" size="sm" aria-label={`移除${file.name}`} disabled={disabled} onClick={() => patchPage(pageNumber, { references: page.references.filter(item => item.id !== file.id) })}><X className="size-4" /></Button></div>{file.type === "image" ? <img src={file.dataUrl} alt={file.name} className="mt-2 max-h-32 w-full rounded-lg object-contain" /> : file.type === "audio" ? <audio controls src={file.dataUrl} preload="metadata" className="mt-2 h-9 w-full" /> : <video controls playsInline src={file.dataUrl} preload="metadata" className="mt-2 max-h-32 w-full rounded-lg" />}</div>)}
            <Button variant="outline" className="w-full" disabled={disabled || !model || (page?.references.length ?? 0) + 1 >= model.maxReferenceFiles} onClick={() => referenceInput.current?.click()}><Plus className="size-4" />添加参考素材</Button>
            <p className="text-xs leading-5 text-muted-foreground">{model && model.maxReferenceFiles > 1 ? `可添加${model.acceptedReferenceTypes.map(type => type === "image/*" ? "图片" : type === "audio/*" ? "语音" : "视频").join(" / ")} · 每个不超过 10MB` : "当前模型仅接收绘本首帧"}</p>
          </section>
          <section className={cn(panel, "space-y-3")}><div className="flex items-center justify-between"><h2 className="text-base font-semibold">生成视频</h2><span className="text-xs text-muted-foreground">{completed}/{project.pages.length} 页</span></div><Button className="w-full" disabled={disabled || !model || page?.clip?.status === "RUNNING"} onClick={() => void generate()}>{page?.clip?.status === "RUNNING" ? <LoaderCircle className="size-4 animate-spin" /> : <Film className="size-4" />}{page?.clip?.status === "SUCCEEDED" ? "重新生成本页" : "生成本页视频"}</Button><Button variant="outline" className="w-full" disabled={disabled || !model || hasRunning || completed === project.pages.length} onClick={() => void generate(true)}>生成全部未完成页</Button><p className="text-xs leading-5 text-muted-foreground">生成会按所选模型消耗个人账户点数。</p></section>
        </>}
        {project && !project.editing ? <section className={cn(panel, "space-y-3")}><h2 className="text-base font-semibold">绘本素材</h2><Button variant="outline" className="w-full" disabled={disabled} onClick={() => pdfInput.current?.click()}><Upload className="size-4" />重新上传绘本</Button><Button variant="outline" className="w-full" disabled={disabled} onClick={() => setBookPicker(true)}><BookOpenText className="size-4" />选择其他绘本</Button><Button asChild variant="ghost" className="w-full"><a href={project.pdfUrl} target="_blank" rel="noreferrer">查看原始 PDF</a></Button></section> : null}
      </aside>
    </div>
    {bookPicker ? <GuideBookPicker onClose={closeBookPicker} onSelect={book => void selectBook(book)} /> : null}
    {deleteDialog && project ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-5"><div data-video-book-delete role="dialog" aria-modal="true" aria-labelledby="video-book-delete-title" className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-5 shadow-xl"><h2 id="video-book-delete-title" className="text-base font-semibold">删除视频作品？</h2><p className="text-sm leading-6 text-muted-foreground">将删除当前浏览器中的作品记录和参考素材，原绘本仍会保留。</p><div className="flex justify-end gap-2"><Button ref={deleteButton} variant="outline" onClick={() => setDeleteDialog(false)}>取消</Button><Button onClick={() => { const id = project.id; setDeleteDialog(false); void run("正在删除作品…", async () => { await saveQueue.current.catch(() => undefined); await removeVideoBook(userId, id); setProjects(items => items.filter(item => item.id !== id)); activate(null); }); }}>删除</Button></div></div></div> : null}
  </div>;
}
