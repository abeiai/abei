"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Eye, ImagePlus, LoaderCircle, Palette, X } from "lucide-react";
import { loadPictureBookStyles, pictureBookStyleImageSource, selectedPictureBookStyle, type PictureBookStyle } from "@/lib/picture-book-styles";

export function PictureBookStylePicker({ value, styles, disabled, onChange, onStylesChange }: {
  value: string; styles: PictureBookStyle[]; disabled?: boolean; onChange(value: string): void; onStylesChange(styles: PictureBookStyle[]): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PictureBookStyle | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [options, setOptions] = useState(styles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [customValue, setCustomValue] = useState(value.startsWith("custom:") ? value : "");
  const selected = selectedPictureBookStyle(value, options);
  const custom = selectedPictureBookStyle(customValue, options);
  useEffect(() => { setOptions(styles); }, [styles]);
  useEffect(() => { if (value.startsWith("custom:")) setCustomValue(value); }, [value]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
    if (!open) setPreview(null);
  }, [open]);
  useEffect(() => {
    if (preview && !previewDialog.current?.open) previewDialog.current?.showModal();
    if (!preview && previewDialog.current?.open) previewDialog.current.close();
  }, [preview]);

  function showPreview(style: PictureBookStyle) {
    setPreviewError(false); setPreview(style);
  }

  async function show() {
    setOpen(true); setCustomizing(false); setError(""); setLoading(true);
    try { const loaded = await loadPictureBookStyles(); setOptions(loaded); onStylesChange(loaded); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "绘画风格加载失败"); }
    finally { setLoading(false); }
  }

  async function uploadReference(file: File) {
    setUploading(true); setError("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) { setError("请选择 10MB 以内的 JPG、PNG 或 WebP 图片"); return; }
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/picture-books/style-reference", { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.code !== 0 || !selectedPictureBookStyle(payload.data?.style ?? "", [])) { setError(payload?.message || "风格参考图上传失败，请稍后重试"); return; }
      setCustomValue(payload.data.style); onChange(payload.data.style); setOpen(false);
    } catch { setError("风格参考图上传失败，请稍后重试"); }
    finally { setUploading(false); }
  }

  return <>
    <div className="space-y-2"><span className="text-sm font-semibold">绘画风格</span>
      <button type="button" aria-label={`绘画风格：${selected?.name ?? value}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => void show()} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2 text-left text-sm disabled:opacity-50">
        {selected ? <img src={pictureBookStyleImageSource(selected)} alt="" className="size-12 rounded-lg object-cover" /> : <Palette className="m-3 size-6 text-muted-foreground" />}
        <span className="flex-1 font-medium">{selected?.name ?? value}</span><ChevronDown className="mr-2 size-4 text-muted-foreground" />
      </button>
    </div>
    <dialog ref={dialog} aria-labelledby="picture-book-style-title" onCancel={event => { if (uploading) event.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)} onClick={event => { if (!uploading && event.target === event.currentTarget) setOpen(false); }} className="m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
      <div className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><h2 id="picture-book-style-title" className="text-lg font-semibold">{customizing ? "自定义风格" : "选择绘画风格"}</h2><button type="button" aria-label="关闭绘画风格" disabled={uploading} onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-secondary disabled:opacity-50"><X className="size-5" /></button></div>
        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
        {loading ? <div role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在加载绘画风格…</div> : null}
        {customizing ? <div className="mx-auto max-w-sm space-y-4">
          {custom ? <img src={pictureBookStyleImageSource(custom)} alt="自定义风格参考图" className="mx-auto size-56 rounded-xl border border-border object-contain" /> : <div className="mx-auto flex size-56 items-center justify-center rounded-xl border border-dashed border-border bg-secondary"><ImagePlus className="size-10 text-muted-foreground" /></div>}
          <label className="block space-y-2 text-sm font-semibold">{custom ? "替换风格参考图" : "上传风格参考图"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} className="block w-full text-sm font-normal" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadReference(file); }} /></label>
          {uploading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />风格参考图上传中…</p> : null}
          {custom ? <button type="button" disabled={uploading} onClick={() => { onChange(customValue); setOpen(false); }} className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">使用此风格</button> : null}
          <button type="button" disabled={uploading} onClick={() => { setCustomizing(false); setError(""); }} className="w-full rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50">返回风格列表</button>
        </div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <div className="relative">
            <button type="button" aria-label="自定义风格" aria-pressed={selected?.id.startsWith("custom:") ?? false} onClick={() => { setCustomizing(true); setError(""); }} className={`w-full overflow-hidden rounded-xl border text-left transition hover:border-primary ${selected?.id.startsWith("custom:") ? "border-primary ring-2 ring-primary/15" : "border-border"}`}>
              {custom ? <img src={pictureBookStyleImageSource(custom)} alt="" className="aspect-square w-full object-cover" /> : <span className="flex aspect-square w-full items-center justify-center bg-secondary"><ImagePlus className="size-10 text-muted-foreground" /></span>}<span className={`flex items-center justify-between gap-2 px-3 py-3 text-sm font-medium ${custom ? "pr-12" : ""}`}>自定义风格{selected?.id.startsWith("custom:") ? <Check className="size-4 shrink-0" /> : null}</span>
            </button>
            {custom ? <button type="button" aria-label="预览自定义风格图片" aria-haspopup="dialog" title="预览大图" onClick={() => showPreview(custom)} className="absolute bottom-1.5 right-1.5 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Eye className="size-4" /></button> : null}
          </div>
          {options.filter(style => style.enabled).map(style => <div key={style.id} className="relative">
            <button type="button" aria-label={style.name} aria-pressed={selected?.id === style.id} title={style.description} onClick={() => { onChange(style.id); setOpen(false); }} className={`w-full overflow-hidden rounded-xl border text-left transition hover:border-primary ${selected?.id === style.id ? "border-primary ring-2 ring-primary/15" : "border-border"}`}>
              <img src={pictureBookStyleImageSource(style)} alt="" loading="lazy" className="aspect-square w-full object-cover" /><span className="flex items-center justify-between gap-2 px-3 py-3 pr-12 text-sm font-medium">{style.name}{selected?.id === style.id ? <Check className="size-4 shrink-0" /> : null}</span>
            </button>
            <button type="button" aria-label={`预览${style.name}风格图片`} aria-haspopup="dialog" title="预览大图" onClick={() => showPreview(style)} className="absolute bottom-1.5 right-1.5 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Eye className="size-4" /></button>
          </div>)}</div>}
      </div>
    </dialog>
    <dialog ref={previewDialog} aria-labelledby="picture-book-style-preview-title" onCancel={() => setPreview(null)} onClose={() => setPreview(null)} onClick={event => { if (event.target === event.currentTarget) setPreview(null); }} className="m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-4xl overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/60">
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="picture-book-style-preview-title" className="text-lg font-semibold">{preview?.name} · 风格预览</h2><button type="button" aria-label="关闭风格图片预览" onClick={() => setPreview(null)} className="shrink-0 rounded-lg p-2 hover:bg-secondary"><X className="size-5" /></button></div>
        {preview ? previewError ? <p role="alert" className="py-12 text-center text-sm text-destructive">图片加载失败，请稍后重试。</p> : <img src={pictureBookStyleImageSource(preview)} alt={`${preview.name}风格参考图`} onError={() => setPreviewError(true)} className="max-h-[calc(90dvh-100px)] w-full rounded-lg object-contain" /> : null}
      </div>
    </dialog>
  </>;
}
