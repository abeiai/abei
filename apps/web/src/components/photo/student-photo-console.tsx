"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { History, Sparkles, Upload, X } from "lucide-react";
import { StudentPhotoCropCard } from "@/components/photo/student-photo-crop-card";
import { calculateStudentPhotoCrop } from "@/lib/student-photo-crop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import type { ExperienceImageModel } from "@/lib/experience-api";

type PhotoFile = { name: string; mimeType: string; size: number; dataUrl: string };
type PhotoResult = { id: string; images: Array<{ id: string; url: string; alt: string; downloadToken?: string }> };
type LocalCropImage = { id: string; url: string; alt: string };
type HistoryItem = PhotoResult & { createdAt: string; widthMm: number; heightMm: number };
type PendingRequest = { id: string; startedAt: number };
const queueMessage = "当前生成任务较多，预计排队5分钟。已提交生成，可以离开页面，进来后继续查看。";
type Outfit = "NAVY_SUIT" | "WHITE_SHIRT_SCARF" | "CUSTOM";
const sizes = [
  { label: "学籍照", width: 26, height: 32 },
  { label: "小一寸", width: 22, height: 32 },
  { label: "一寸", width: 25, height: 35 },
  { label: "大一寸", width: 33, height: 48 },
  { label: "小二寸", width: 35, height: 45 }
];
const backgrounds = [
  { label: "浅蓝", value: "#95c9eb" },
  { label: "深蓝", value: "#164c87" },
  { label: "红色", value: "#ce3039" },
  { label: "白色", value: "#ffffff" }
];
const photoModels = [
  { modelName: "Qwen-Image-2.1", providerKey: "abeiai" },
  { modelName: "doubao-seedream-5-0-pro-260628", providerKey: "volcengine_ark_image" }
] as const;

export function StudentPhotoConsole({ currentUser, models }: { currentUser: PublicUser | null; models: ExperienceImageModel[] }) {
  const [outfit, setOutfit] = useState<Outfit>("NAVY_SUIT");
  const eligibleModels = photoModels.flatMap(({ modelName, providerKey }) => {
    const model = models.find((item) => item.modelName === modelName && item.providerKey === providerKey &&
      !item.isMock && item.maxReferenceImages >= (outfit === "CUSTOM" ? 2 : 1));
    return model ? [model] : [];
  });
  const [source, setSource] = useState<PhotoFile | null>(null);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [cropAdjustment, setCropAdjustment] = useState({ zoom: 1.15, verticalPosition: 0, horizontalPosition: 0 });
  const [outfitImage, setOutfitImage] = useState<PhotoFile | null>(null);
  const outfitFileInputRef = useRef<HTMLInputElement>(null);
  const [sizeIndex, setSizeIndex] = useState(0);
  const [widthMm, setWidthMm] = useState(26);
  const [heightMm, setHeightMm] = useState(32);
  const [background, setBackground] = useState("#95c9eb");
  const [naturalRetouchStrength, setNaturalRetouchStrength] = useState(20);
  const [blemishRemovalStrength, setBlemishRemovalStrength] = useState(0);
  const [otherRequirements, setOtherRequirements] = useState("");
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [localCropImage, setLocalCropImage] = useState<LocalCropImage | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [message, setMessage] = useState("");
  const validSize = Number.isFinite(widthMm) && Number.isFinite(heightMm) &&
    widthMm >= 15 && widthMm <= 100 && heightMm >= 15 && heightMm <= 100;
  const canvasImage = result?.images[0] ?? localCropImage ?? (source ? { id: `${source.name}-${sourceRevision}`, url: source.dataUrl, alt: "上传的孩子照片" } : null);
  const isSourceCanvas = !!source && !result && !localCropImage;

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    void fetch("/api/ai/image/student-photo/history", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { code: number; message: string; data?: { items: HistoryItem[]; nextCursor: string | null } };
        if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.message || "历史记录加载失败");
        if (active) {
          setHistory((existing) => {
            const fetchedIds = new Set(payload.data!.items.map((item) => item.id));
            return [...existing.filter((item) => !fetchedIds.has(item.id)), ...payload.data!.items];
          });
          setHistoryCursor(payload.data.nextCursor);
        }
      }).catch((error: unknown) => { if (active) setHistoryError(error instanceof Error ? error.message : "历史记录加载失败"); });
    return () => { active = false; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const key = `student-photo-pending:${currentUser.id}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as PendingRequest | null;
      if (saved && /^[0-9a-f-]{36}$/i.test(saved.id) && Number.isFinite(saved.startedAt)) setPendingRequest(saved);
    } catch { localStorage.removeItem(key); }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !pendingRequest) return;
    const key = `student-photo-pending:${currentUser.id}`;
    let active = true;
    async function checkStatus() {
      try {
        const response = await fetch(`/api/ai/image/student-photo/status/${pendingRequest!.id}`, { cache: "no-store" });
        const payload = await response.json() as { code: number; message: string; data?: { status: string; item?: HistoryItem; message?: string } };
        if (!active || !response.ok || payload.code !== 0 || !payload.data) return;
        if (payload.data.status === "SUCCEEDED" && payload.data.item) {
          const item = payload.data.item;
          setResult(item);
          setLocalCropImage(null);
          setHistory((items) => [item, ...items.filter((existing) => existing.id !== item.id)]);
          setWidthMm(item.widthMm); setHeightMm(item.heightMm);
          const index = sizes.findIndex((size) => size.width === item.widthMm && size.height === item.heightMm);
          setSizeIndex(index < 0 ? sizes.length : index);
          setMessage("已生成证照，消耗 50 点");
          setPendingRequest(null); setBusy(false); localStorage.removeItem(key);
        } else if (payload.data.status === "FAILED" ||
          (payload.data.status === "NOT_FOUND" && Date.now() - pendingRequest!.startedAt > 60_000)) {
          setMessage(payload.data.message || "生成任务未提交成功，请重新尝试");
          setPendingRequest(null); setBusy(false); localStorage.removeItem(key);
        }
      } catch { /* A temporary connection failure should not erase a submitted task. */ }
    }
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [currentUser?.id, pendingRequest?.id, pendingRequest?.startedAt]);

  async function loadMoreHistory() {
    if (!historyCursor || historyBusy) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/ai/image/student-photo/history?cursor=${encodeURIComponent(historyCursor)}`, { cache: "no-store" });
      const payload = await response.json() as { code: number; message: string; data?: { items: HistoryItem[]; nextCursor: string | null } };
      if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.message || "历史记录加载失败");
      setHistory((items) => [...items, ...payload.data!.items]);
      setHistoryCursor(payload.data.nextCursor);
      setHistoryError("");
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "历史记录加载失败"); }
    finally { setHistoryBusy(false); }
  }

  function selectHistory(item: HistoryItem) {
    if (!item.images.length) return;
    setLocalCropImage(null);
    setResult(item);
    setHistoryOpen(false);
    setWidthMm(item.widthMm);
    setHeightMm(item.heightMm);
    setSizeIndex(sizes.findIndex((size) => size.width === item.widthMm && size.height === item.heightMm) >= 0
      ? sizes.findIndex((size) => size.width === item.widthMm && size.height === item.heightMm) : sizes.length);
  }

  async function uploadForCrop(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage("请上传 10 MB 以内的 JPG、PNG 或 WebP 图片");
      return;
    }
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("照片读取失败，请重新上传"));
        reader.readAsDataURL(file);
      });
      setLocalCropImage({ id: `local-${Date.now()}`, url, alt: file.name });
      setResult(null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "照片读取失败，请重新上传");
    }
  }

  async function uploadOutfit(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage("请上传 10 MB 以内的 JPG、PNG 或 WebP 图片");
      return;
    }
    try {
      const image = await readImage(file);
      setOutfitImage(image); setOutfit("CUSTOM");
      setResult(null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "照片读取失败，请重新上传");
    }
  }

  async function uploadDropped(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage("请上传 10 MB 以内的 JPG、PNG 或 WebP 图片");
      return;
    }
    try {
      setSource(await readImage(file));
      setSourceRevision((value) => value + 1);
      setCropAdjustment({ zoom: 1.15, verticalPosition: 0, horizontalPosition: 0 });
      setResult(null); setLocalCropImage(null); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "照片读取失败，请重新上传"); }
  }

  function dropSource(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void uploadDropped(file);
  }

  function chooseSize(value: number) {
    setSizeIndex(value);
    if (value < sizes.length) {
      setWidthMm(sizes[value].width);
      setHeightMm(sizes[value].height);
    }
  }

  async function generate() {
    if (busy || pendingRequest) return;
    if (!currentUser) { setMessage("请先登录，再生成学生证照"); return; }
    if (!source) return;
    if (outfit === "CUSTOM" && !outfitImage) { setMessage("请上传服装参考图"); return; }
    if (!eligibleModels.length) { setMessage("暂无支持证照制作的图片模型，请稍后再试"); return; }
    if (!validSize) {
      setMessage("宽高须在 15–100 毫米之间"); return;
    }
    setBusy(true);
    setLocalCropImage(null);
    setResult(null);
    setMessage("正在准备照片…");
    let submitted = false;
    let definitiveFailure = false;
    try {
      const sourceForModel = await prepareSourceForGeneration(source, background, widthMm, heightMm, cropAdjustment);
      const request = { id: crypto.randomUUID(), startedAt: Date.now() };
      localStorage.setItem(`student-photo-pending:${currentUser.id}`, JSON.stringify(request));
      setPendingRequest(request);
      submitted = true;
      const response = await fetch("/api/ai/image/student-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: request.id,
          sourceImage: { ...sourceForModel, type: "image" },
          outfit,
          ...(outfit === "CUSTOM" && outfitImage ? { outfitImage: { ...outfitImage, type: "image" } } : {}),
          widthMm, heightMm, backgroundColor: background,
          naturalRetouchStrength, blemishRemovalStrength, otherRequirements
        })
      });
      const payload = await response.json() as { code: number; message: string; data: PhotoResult | null };
      if (!response.ok || payload.code !== 0 || !payload.data || payload.data.images.length !== 1) {
        definitiveFailure = true;
        throw new Error(payload.message || "生成失败，请稍后重试");
      }
      setResult(payload.data);
      setHistory((items) => [{ ...payload.data!, createdAt: new Date().toISOString(), widthMm, heightMm }, ...items.filter((item) => item.id !== payload.data!.id)]);
      setMessage("已生成证照，消耗 50 点");
      setPendingRequest(null);
      localStorage.removeItem(`student-photo-pending:${currentUser.id}`);
    } catch (error) {
      if (submitted && definitiveFailure) {
        setPendingRequest(null);
        localStorage.removeItem(`student-photo-pending:${currentUser.id}`);
        setMessage(error instanceof Error ? error.message : "生成失败，请稍后重试");
      } else if (!submitted) setMessage(error instanceof Error ? error.message : "生成失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#f3f7fb] text-[#142338]">
      <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">学生证照</h1><p className="mt-1 text-sm text-[#60758a]">支持换服装、改规格和AI优化</p></div>
          <button type="button" onClick={() => setHistoryOpen(true)} className="flex items-center gap-2 rounded-full border border-[#ccdbe7] bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-[#f8fbff]"><History className="size-4" />生成记录{history.length ? <span className="rounded-full bg-[#e8f2fa] px-2 text-xs">{history.length}</span> : null}</button>
        </header>
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_310px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 rounded-[28px] border border-[#d7e3ed] bg-white p-4 shadow-sm md:p-6">
            {canvasImage ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">{result ? "证照已生成" : localCropImage ? "裁剪已有照片" : "调整照片构图"}</h2><p className="mt-1 text-sm text-[#60758a]">{result ? "确认构图后，在下方下载裁剪图或原图" : "拖动照片调整位置，滚轮缩放"}</p></div>{result && source ? <button type="button" onClick={() => setResult(null)} className="rounded-full border border-[#ccdbe7] px-4 py-2 text-sm font-medium">返回调整</button> : null}</div> : null}
            {validSize ? <div onDragOver={!canvasImage ? (event) => { event.preventDefault(); setDragOver(true); } : undefined} onDragLeave={!canvasImage ? () => setDragOver(false) : undefined} onDrop={!canvasImage ? dropSource : undefined} className={"mx-auto max-w-[640px] rounded-xl " + (dragOver && !canvasImage ? "ring-2 ring-[#276b94]" : "")}><StudentPhotoCropCard key={canvasImage?.id ?? "empty"} image={canvasImage} widthMm={widthMm} heightMm={heightMm} isLocal={!!localCropImage} isSource={isSourceCanvas} onAdjustmentChange={isSourceCanvas ? setCropAdjustment : undefined} onUpload={(file) => !canvasImage || isSourceCanvas ? void uploadDropped(file) : void uploadForCrop(file)} /></div> : <p className="text-sm text-red-600">请输入 15–100 毫米的宽高。</p>}
            {!result && !localCropImage ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5edf3] pt-5"><p className="text-xs text-[#60758a]">已有证照？可直接上传，免费裁剪成指定规格。</p><button type="button" onClick={() => document.getElementById("photo-direct-upload")?.click()} className="rounded-xl border border-[#bfd4e2] px-4 py-2.5 text-sm font-semibold text-[#245a78]">直接上传已有照片裁剪</button><input id="photo-direct-upload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadForCrop(file); }} /></div> : null}
          </main>
          <aside className="rounded-[28px] border border-[#d7e3ed] bg-white p-5 shadow-sm md:sticky md:top-20">
            <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">证照设置</h2><span className="rounded-full bg-[#ecf4fa] px-2.5 py-1 text-xs font-semibold text-[#3d708f]">1 张 · 50 点</span></div>
            <div className="space-y-5">
              <div><div className="mb-2 text-sm font-semibold">服装</div><div className="grid grid-cols-3 gap-2">{(["NAVY_SUIT", "WHITE_SHIRT_SCARF", "CUSTOM"] as const).map((value) => <button key={value} type="button" aria-pressed={outfit === value} onClick={() => { if (value === "CUSTOM") outfitFileInputRef.current?.click(); else { setOutfit(value); setResult(null); } }} className={"min-w-0 rounded-xl border p-2 text-xs font-medium " + (outfit === value ? "border-[#2171a0] bg-[#eef7fc] text-[#175c84]" : "border-[#d9e5ed]")}>{value === "CUSTOM" ? outfitImage ? <img src={outfitImage.dataUrl} alt="" className="mx-auto h-16 w-full rounded-md object-cover" /> : <div className="flex h-16 items-center justify-center rounded-md bg-[#edf4f8] text-[#4780a2]"><Upload className="size-5" /></div> : <img src={value === "NAVY_SUIT" ? "/photo/outfits/navy-suit-red-tie.png" : "/photo/outfits/white-shirt-red-scarf.png"} alt="" className="mx-auto h-16 w-full rounded-md bg-[#e8f2fa] object-cover" />}<span className="mt-1 block truncate">{value === "NAVY_SUIT" ? "藏青西装" : value === "WHITE_SHIRT_SCARF" ? "白衬衫红领巾" : "自选服装"}</span></button>)}</div><input ref={outfitFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadOutfit(event)} /></div>
              <div><label htmlFor="photo-size" className="mb-2 block text-sm font-semibold">照片规格</label><Select id="photo-size" value={sizeIndex} onChange={(event) => chooseSize(Number(event.target.value))}>{sizes.map((size, index) => <option value={index} key={size.label}>{size.label} · {size.width} × {size.height} mm</option>)}<option value={sizes.length}>自定义规格</option></Select>{sizeIndex === sizes.length ? <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-[#60758a]">宽度 mm<Input type="number" min={15} max={100} value={widthMm} onChange={(event) => setWidthMm(Number(event.target.value))} /></label><label className="text-xs text-[#60758a]">高度 mm<Input type="number" min={15} max={100} value={heightMm} onChange={(event) => setHeightMm(Number(event.target.value))} /></label></div> : null}</div>
              <div><span className="mb-2 block text-sm font-semibold">背景颜色</span><div className="grid grid-cols-4 gap-2">{backgrounds.map((item) => <button type="button" key={item.value} aria-pressed={background.toLowerCase() === item.value} onClick={() => { setBackground(item.value); setResult(null); }} className={"rounded-xl border p-1.5 text-xs " + (background.toLowerCase() === item.value ? "border-[#2171a0] bg-[#eef7fc]" : "border-[#d9e5ed]")}><span className="mx-auto mb-1 block size-6 rounded-full border border-black/10" style={{ background: item.value }} />{item.label}</button>)}</div><label className="mt-2 flex items-center gap-2 text-xs text-[#60758a]">自定义<input type="color" aria-label="选择其他背景颜色" value={background} onChange={(event) => { setBackground(event.target.value); setResult(null); }} className="h-7 w-10" />{background.toUpperCase()}</label></div>
              <div className="space-y-4 border-t border-[#e5edf3] pt-4"><div><label htmlFor="retouch" className="mb-1 flex justify-between text-sm font-semibold"><span>自然修容</span><span>{naturalRetouchStrength}%</span></label><input id="retouch" type="range" min={0} max={100} step={5} value={naturalRetouchStrength} onChange={(event) => { setNaturalRetouchStrength(Number(event.target.value)); setResult(null); }} className="w-full accent-[#17628d]" /><p className="text-xs text-[#60758a]">默认轻度，保留真实肤色与五官</p></div><div><label htmlFor="blemish" className="mb-1 flex justify-between text-sm font-semibold"><span>智能去瑕疵</span><span>{blemishRemovalStrength}%</span></label><input id="blemish" type="range" min={0} max={100} step={5} value={blemishRemovalStrength} onChange={(event) => { setBlemishRemovalStrength(Number(event.target.value)); setResult(null); }} className="w-full accent-[#17628d]" /><p className="text-xs text-[#60758a]">淡化痘印、整理碎发</p></div><Textarea value={otherRequirements} maxLength={300} onChange={(event) => { setOtherRequirements(event.target.value); setResult(null); }} placeholder="其他要求（选填）" className="min-h-16" /></div>
            </div>
            <div className="mt-5 border-t border-[#e5edf3] pt-5"><Button type="button" onClick={() => void generate()} disabled={busy || !!pendingRequest || !source || !validSize || !eligibleModels.length} className="h-12 w-full rounded-xl bg-[#17628d] text-sm font-bold hover:bg-[#124e71]"><Sparkles className="size-4" />{pendingRequest ? "证照生成中…" : busy ? "正在准备照片…" : "消耗 50 点数 · 一键生成标准照"}</Button>{pendingRequest ? <p role="status" className="mt-3 text-sm text-[#60758a]">{queueMessage}</p> : message ? <p role="status" className="mt-3 text-sm text-[#60758a]">{message}</p> : null}{!currentUser ? <Link href="/login?next=%2Fphoto" className="mt-3 block text-center text-sm text-[#17628d] underline">登录后生成</Link> : null}{!eligibleModels.length ? <p className="mt-2 text-xs text-[#60758a]">暂无可用证照模型</p> : null}</div>
          </aside>
        </div>
      </div>
      {historyOpen ? <div className="fixed inset-0 z-50 flex justify-end"><button type="button" aria-label="关闭生成记录" onClick={() => setHistoryOpen(false)} className="absolute inset-0 bg-[#142338]/45" /><aside className="relative flex h-full w-full max-w-[390px] flex-col bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">生成记录</h2><p className="text-xs text-[#60758a]">最新记录在上方</p></div><button type="button" aria-label="关闭" onClick={() => setHistoryOpen(false)} className="rounded-full p-2 hover:bg-[#f0f5f9]"><X className="size-5" /></button></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{history.map((item) => <button key={item.id} type="button" onClick={() => selectHistory(item)} disabled={!item.images.length} className="flex w-full items-center gap-3 rounded-xl border border-[#d9e5ed] p-2 text-left hover:bg-[#f7fbff]">{item.images[0] ? <img src={item.images[0].url} alt="" className="h-20 w-15 shrink-0 rounded-md object-cover" /> : <div className="flex h-20 w-15 shrink-0 items-center justify-center rounded-md bg-[#f0f5f9] text-xs">待归档</div>}<span className="min-w-0"><span className="block text-sm font-semibold">学生证照</span><span className="mt-1 block text-xs text-[#60758a]">{new Date(item.createdAt).toLocaleString("zh-CN")}</span><span className="block text-xs text-[#60758a]">{item.widthMm} × {item.heightMm} mm</span></span></button>)}{historyCursor ? <button type="button" onClick={() => void loadMoreHistory()} disabled={historyBusy} className="w-full rounded-xl border border-[#d9e5ed] py-2 text-sm">{historyBusy ? "加载中…" : "加载更多"}</button> : null}{historyError ? <p role="alert" className="text-sm text-red-600">{historyError}</p> : null}{!history.length && !historyError ? <p className="py-8 text-center text-sm text-[#60758a]">{currentUser ? "暂无生成记录" : "登录后查看生成记录"}</p> : null}</div></aside></div> : null}
    </div>
  );
}

async function readImage(file: File): Promise<PhotoFile> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("照片处理失败");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("照片处理失败")), "image/jpeg", 0.86)
    );
    if (blob.size > 4 * 1024 * 1024) throw new Error("照片压缩后仍过大，请换一张照片");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { name: file.name, mimeType: "image/jpeg", size: blob.size, dataUrl };
  } finally {
    bitmap.close();
  }
}

async function prepareSourceForGeneration(source: PhotoFile, background: string, widthMm: number, heightMm: number, adjustment: {
  zoom: number; verticalPosition: number; horizontalPosition: number;
}): Promise<PhotoFile> {
  const bitmap = await createImageBitmap(await (await fetch(source.dataUrl)).blob());
  try {
    const crop = calculateStudentPhotoCrop(bitmap.width, bitmap.height, widthMm, heightMm,
      adjustment.zoom, adjustment.verticalPosition, adjustment.horizontalPosition);
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("照片处理失败");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / crop.width, canvas.height / crop.height);
    const width = crop.width * scale;
    const height = crop.height * scale;
    context.drawImage(bitmap, crop.left, crop.top, crop.width, crop.height,
      (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("照片处理失败")), "image/jpeg", 0.9)
    );
    return readImage(new File([blob], source.name, { type: "image/jpeg" }));
  } finally {
    bitmap.close();
  }
}
