"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent, type WheelEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Download, Grid3X3, ImagePlus, RotateCcw, ScanFace, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { calculateStudentPhotoCrop, clampStudentPhotoAdjustment } from "@/lib/student-photo-crop";
import { cropLocalStudentPhoto } from "@/lib/student-photo-local-export";
import type { StudentPhotoFormat } from "@/lib/student-photo-export";

interface CropImage {
  id: string;
  url: string;
  alt: string;
  downloadToken?: string;
}

type FaceBox = { x: number; y: number; width: number; height: number };
type Adjustment = { zoom: number; verticalPosition: number; horizontalPosition: number };
let faceDetectorPromise: Promise<import("@mediapipe/tasks-vision").FaceDetector> | null = null;

function loadFaceDetector() {
  faceDetectorPromise ??= import("@mediapipe/tasks-vision").then(async ({ FaceDetector, FilesetResolver }) => {
    const wasm = await FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
    return FaceDetector.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: "/mediapipe/models/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.55
    });
  }).catch((error: unknown) => { faceDetectorPromise = null; throw error; });
  return faceDetectorPromise;
}

export function StudentPhotoCropCard({ image, widthMm, heightMm, onUpload, isLocal = false, isSource = false, onAdjustmentChange }: {
  image: CropImage | null;
  widthMm: number;
  heightMm: number;
  onUpload(file: File): void;
  isLocal?: boolean;
  isSource?: boolean;
  onAdjustmentChange?: (value: Adjustment) => void;
}) {
  const previewImage = image ?? { url: "/photo/student-photo-crop-example.jpg", alt: "学生证照裁剪示例" };
  const cropWidth = image ? widthMm : 3;
  const cropHeight = image ? heightMm : 4;
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1.15);
  const [verticalPosition, setVerticalPosition] = useState(0);
  const [horizontalPosition, setHorizontalPosition] = useState(0);
  const [showGuides, setShowGuides] = useState(true);
  const drag = useRef<{ pointerId: number; x: number; y: number; horizontal: number; vertical: number; zoom: number; mode: "move" | "zoom" } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const localDownloadRef = useRef<HTMLButtonElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [exportFormat, setExportFormat] = useState<StudentPhotoFormat>("jpg");
  const [isWechat, setIsWechat] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [face, setFace] = useState<FaceBox | null>(null);
  const crop = sourceSize
    ? calculateStudentPhotoCrop(sourceSize.width, sourceSize.height, cropWidth, cropHeight, zoom, verticalPosition, horizontalPosition)
    : null;
  const stored = image?.url.match(/^\/api\/ai\/image\/student-photo\/history\/([a-zA-Z0-9_-]+)\/images\/([12])$/);
  const downloadQuery = stored ? `taskId=${stored[1]}&index=${stored[2]}` : image?.downloadToken
    ? `token=${encodeURIComponent(image.downloadToken)}` : null;
  const downloadHref = !isLocal && downloadQuery && sourceSize && !loadError
    ? `/api/ai/image/student-photo/download?${downloadQuery}&zoom=${zoom}&vertical=${verticalPosition}&horizontal=${horizontalPosition}&widthMm=${widthMm}&heightMm=${heightMm}&format=${exportFormat}`
    : null;
  const originalHref = !isLocal && downloadQuery && sourceSize && !loadError
    ? `/api/ai/image/student-photo/download?${downloadQuery}&original=1` : null;
  const previewHref = downloadHref ? `${downloadHref}&preview=1` : null;
  const previewImageHref = localPreviewUrl ?? (previewHref ? `${previewHref}&attempt=${previewAttempt}` : null);

  useEffect(() => {
    setIsWechat(/MicroMessenger/i.test(navigator.userAgent));
  }, []);

  useEffect(() => () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  useEffect(() => {
    if (!previewOpen) return;
    previewCloseRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewOpen(false);
        setLocalPreviewUrl(null);
        (isLocal ? localDownloadRef : previewTriggerRef).current?.focus();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [previewOpen, isLocal]);

  useEffect(() => {
    onAdjustmentChange?.({ zoom, verticalPosition, horizontalPosition });
  }, [zoom, verticalPosition, horizontalPosition, onAdjustmentChange]);

  async function inspectImage(element: HTMLImageElement) {
    setSourceSize({ width: element.naturalWidth, height: element.naturalHeight });
    if (!isSource) return;
    try {
      const detector = await loadFaceDetector();
      const faces = detector.detect(element).detections;
      const box = faces[0]?.boundingBox;
      if (faces.length === 1 && box) {
        setFace({ x: box.originX, y: box.originY, width: box.width, height: box.height });
      } else { setFace(null); }
    } catch { setFace(null); }
  }

  function alignFace() {
    if (!face || !sourceSize) return;
    const baseCrop = calculateStudentPhotoCrop(sourceSize.width, sourceSize.height, widthMm, heightMm, 1, 0, 0);
    const nextZoom = Math.max(1, Math.min(2.5, baseCrop.height * 0.55 / face.height));
    const nextCrop = calculateStudentPhotoCrop(sourceSize.width, sourceSize.height, widthMm, heightMm, nextZoom, 0, 0);
    const availableX = sourceSize.width - nextCrop.width;
    const availableY = sourceSize.height - nextCrop.height;
    setZoom(nextZoom);
    setHorizontalPosition(availableX > 0 ? clampStudentPhotoAdjustment(nextZoom, 0, 2 * (face.x + face.width / 2 - nextCrop.width / 2) / availableX - 1).horizontalPosition : 0);
    setVerticalPosition(availableY > 0 ? clampStudentPhotoAdjustment(nextZoom, 2 * (face.y + face.height / 2 - nextCrop.height * 0.4) / availableY - 1).verticalPosition : 0);
  }

  function wheelZoom(event: WheelEvent<HTMLDivElement>) {
    if (!sourceSize) return;
    event.preventDefault();
    setZoom((value) => clampStudentPhotoAdjustment(value + (event.deltaY < 0 ? 0.08 : -0.08), 0).zoom);
  }

  function resetCrop() {
    setZoom(1.15);
    setVerticalPosition(0);
    setHorizontalPosition(0);
  }

  const cropControls = [
    { label: "放大", icon: ZoomIn, action: () => setZoom((value) => clampStudentPhotoAdjustment(value + 0.05, 0).zoom) },
    { label: "缩小", icon: ZoomOut, action: () => setZoom((value) => clampStudentPhotoAdjustment(value - 0.05, 0).zoom) },
    { label: "上移", icon: ArrowUp, action: () => setVerticalPosition((value) => clampStudentPhotoAdjustment(zoom, value + 0.1).verticalPosition) },
    { label: "下移", icon: ArrowDown, action: () => setVerticalPosition((value) => clampStudentPhotoAdjustment(zoom, value - 0.1).verticalPosition) },
    { label: "左移", icon: ArrowLeft, action: () => setHorizontalPosition((value) => clampStudentPhotoAdjustment(zoom, 0, value + 0.1).horizontalPosition) },
    { label: "右移", icon: ArrowRight, action: () => setHorizontalPosition((value) => clampStudentPhotoAdjustment(zoom, 0, value - 0.1).horizontalPosition) },
    ...(isSource ? [{ label: "人脸居中", icon: ScanFace, action: alignFace }] : [])
  ];

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  }

  async function downloadLocalCrop() {
    if (!imageRef.current || !sourceSize || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await cropLocalStudentPhoto(imageRef.current, widthMm, heightMm, zoom, verticalPosition, horizontalPosition, exportFormat);
      const url = URL.createObjectURL(blob);
      if (isWechat) {
        setLocalPreviewUrl(url);
        setPreviewLoaded(false);
        setPreviewError(false);
        setPreviewOpen(true);
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = `student-photo-cropped.${exportFormat}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "照片导出失败，请重试");
    } finally {
      setDownloading(false);
    }
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!sourceSize || !crop) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, horizontal: horizontalPosition, vertical: verticalPosition,
      zoom, mode: (event.target as HTMLElement).dataset.cropHandle ? "zoom" : "move" };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!sourceSize || !crop || drag.current?.pointerId !== event.pointerId) return;
    const frame = event.currentTarget.getBoundingClientRect();
    if (drag.current.mode === "zoom") {
      setZoom(clampStudentPhotoAdjustment(drag.current.zoom - (event.clientY - drag.current.y) * 1.5 / frame.height, 0).zoom);
      return;
    }
    const availableY = sourceSize.height - crop.height;
    const availableX = sourceSize.width - crop.width;
    if (availableY > 0) {
      const deltaY = event.clientY - drag.current.y;
      setVerticalPosition(clampStudentPhotoAdjustment(
        zoom, drag.current.vertical - deltaY * 2 * crop.height / (frame.height * availableY)
      ).verticalPosition);
    }
    if (availableX > 0) {
      const deltaX = event.clientX - drag.current.x;
      setHorizontalPosition(clampStudentPhotoAdjustment(
        zoom, 0, drag.current.horizontal - deltaX * 2 * crop.width / (frame.width * availableX)
      ).horizontalPosition);
    }
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{isSource ? "调整上传照片" : isLocal ? "本地照片" : image ? "生成结果" : "照片画布（示例）"}</p>
        <span className="text-xs text-muted-foreground">{image ? `${widthMm} × ${heightMm} mm` : "3:4"}</span>
      </div>
      <div className="flex min-h-72 items-center justify-center gap-3 rounded-xl bg-[#edf0f3] p-5">
        <div
          aria-label="证照裁剪预览，可拖动位置、滚轮缩放"
          className="relative w-[260px] min-w-0 cursor-move overflow-hidden border border-white shadow-md"
          style={{ aspectRatio: `${cropWidth} / ${cropHeight}`, touchAction: "none" }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onWheel={wheelZoom}
        >
          <img
            ref={imageRef}
            src={previewImage.url}
            alt={previewImage.alt}
            draggable={false}
            onLoad={(event) => void inspectImage(event.currentTarget)}
            onError={() => { setLoadError(true); setSourceSize(null); }}
            className="absolute select-none"
            style={crop && sourceSize ? {
              left: `${-crop.left / crop.width * 100}%`,
              top: `${-crop.top / crop.height * 100}%`,
              width: `${sourceSize.width / crop.width * 100}%`,
              height: `${sourceSize.height / crop.height * 100}%`,
              maxWidth: "none",
              pointerEvents: "none"
            } : { inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
          />
          <div className="pointer-events-none absolute inset-0 text-[10px] font-semibold text-white" aria-hidden="true">
            {showGuides ? <>
              <div className="absolute inset-x-0 top-[10%] border-t border-dashed border-white/90"><span className="absolute right-1 -top-4 rounded bg-black/35 px-1">头顶安全区</span></div>
              <div className="absolute inset-x-0 top-[38%] border-t border-dashed border-white/90"><span className="absolute right-1 -top-4 rounded bg-black/35 px-1">眼平线</span></div>
              <div className="absolute inset-x-0 top-[80%] border-t border-dashed border-white/60" />
              <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-white/80" />
              <div className="absolute inset-3 border border-white/65" />
            </> : null}
            {["left-1 top-1", "right-1 top-1", "left-1 bottom-1", "right-1 bottom-1"].map((position) => <div key={position} data-crop-handle="true" className={"pointer-events-auto absolute size-3 cursor-nwse-resize rounded-sm border border-[#276b94] bg-white shadow " + position} />)}
          </div>
          {!image ? <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => fileInputRef.current?.click()} className="absolute left-1/2 top-1/2 z-10 flex w-44 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl bg-white/95 px-4 py-4 text-[#175c84] shadow-lg transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ImagePlus className="mb-2 size-8" aria-hidden="true" /><span className="text-sm font-semibold">上传照片</span><span className="mt-1 text-xs text-[#60758a]">手机可从相册选择</span></button> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2" role="group" aria-label="裁剪画布操作">
          <button type="button" aria-label={showGuides ? "隐藏参考线" : "显示参考线"} title={showGuides ? "隐藏参考线" : "显示参考线"} aria-pressed={showGuides} onClick={() => setShowGuides((value) => !value)} className="relative flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:size-10"><Grid3X3 className="size-4" aria-hidden="true" />{!showGuides ? <span className="absolute h-px w-6 -rotate-45 bg-current" aria-hidden="true" /> : null}</button>
          <button type="button" aria-label="重置" title="重置" onClick={resetCrop} className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:size-10"><RotateCcw className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
      {sourceSize && !loadError ? <div role="group" aria-label="照片裁剪微调" className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {cropControls.map(({ label, icon: Icon, action }) => <button key={label} type="button" aria-label={label} title={label} onClick={action}
          className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:size-10">
          <Icon className="size-4" aria-hidden="true" />
        </button>)}
      </div> : null}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="选择要裁剪的本地照片" onChange={chooseFile} />
      <button type="button" onClick={() => fileInputRef.current?.click()} className={"mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium " + (image ? "border border-border hover:bg-secondary" : "bg-[#17628d] text-white hover:bg-[#124e71]")}><Upload className="size-4" />{!image ? "上传照片" : isSource ? "更换照片" : "直接上传已有照片裁剪"}</button>
      {loadError ? <p className="mt-2 text-sm text-destructive">图片加载失败，请稍后刷新页面。</p> : null}
      {image ? <>
      <div role="group" aria-label="下载格式" className="mt-4 flex items-center gap-2">
        <span className="mr-1 text-sm font-medium">下载格式</span>
        {(["jpg", "png"] as const).map((format) => <button key={format} type="button" aria-pressed={exportFormat === format}
          onClick={() => setExportFormat(format)}
          className={`rounded-lg border px-4 py-1.5 text-sm font-semibold uppercase ${exportFormat === format ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>{format}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {downloadHref && isWechat ? <button ref={previewTriggerRef} type="button" onClick={() => { setPreviewLoaded(false); setPreviewError(false); setPreviewOpen(true); }} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"><Download className="size-4" />下载裁剪图</button> : null}
        {downloadHref && !isWechat ? <a href={downloadHref} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"><Download className="size-4" />下载裁剪图</a> : null}
        {isLocal && sourceSize && !loadError ? <button ref={localDownloadRef} type="button" onClick={() => void downloadLocalCrop()} disabled={downloading} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Download className="size-4" />{downloading ? "正在导出…" : "下载裁剪图"}</button> : null}
        {originalHref ? <a href={originalHref} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"><Download className="size-4" />下载原图</a> : null}
      </div>
      {downloadError ? <p role="alert" className="mt-2 text-sm text-destructive">{downloadError}</p> : null}</> : null}
      {previewOpen && previewImageHref ? <div role="dialog" aria-modal="true" aria-label="保存裁剪照片" className="fixed inset-0 z-50 flex flex-col bg-black/95 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <p className="text-base font-semibold">长按照片，选择保存图片</p>
          <button ref={previewCloseRef} type="button" aria-label="关闭预览" onClick={() => { setPreviewOpen(false); setLocalPreviewUrl(null); (isLocal ? localDownloadRef : previewTriggerRef).current?.focus(); }} className="flex size-10 items-center justify-center rounded-full bg-white/15"><X className="size-5" /></button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center py-5">
          {!previewLoaded && !previewError ? <p className="absolute text-sm text-white/75">正在生成裁剪图…</p> : null}
          {previewError ? <div role="alert" className="flex flex-col items-center gap-3 text-sm"><p>图片加载失败，请重试。</p><button type="button" onClick={() => { setPreviewError(false); setPreviewLoaded(false); setPreviewAttempt((value) => value + 1); }} className="rounded-lg border border-white/50 px-4 py-2">重新加载</button></div> : null}
          {!previewError ? <img key={previewAttempt} src={previewImageHref} alt="裁剪好的学生证照，长按保存" onLoad={() => setPreviewLoaded(true)} onError={() => setPreviewError(true)} className={`max-h-full max-w-full object-contain ${previewLoaded ? "" : "opacity-0"}`} /> : null}
        </div>
        {previewLoaded ? <a href={downloadHref ?? previewImageHref} download={localPreviewUrl ? `student-photo-cropped.${exportFormat}` : undefined} className="mx-auto flex h-11 w-full max-w-lg items-center justify-center rounded-lg border border-white/40 text-sm font-medium">尝试下载文件</a> : null}
      </div> : null}
    </div>
  );
}
