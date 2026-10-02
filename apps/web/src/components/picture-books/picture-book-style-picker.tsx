"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Palette, X } from "lucide-react";
import { loadPictureBookStyles, pictureBookStyleImageSource, selectedPictureBookStyle, type PictureBookStyle } from "@/lib/picture-book-styles";

export function PictureBookStylePicker({ value, styles, disabled, onChange, onStylesChange }: {
  value: string; styles: PictureBookStyle[]; disabled?: boolean; onChange(value: string): void; onStylesChange(styles: PictureBookStyle[]): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(styles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = selectedPictureBookStyle(value, options);
  useEffect(() => { setOptions(styles); }, [styles]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  async function show() {
    setOpen(true); setError(""); setLoading(true);
    try { const loaded = await loadPictureBookStyles(); setOptions(loaded); onStylesChange(loaded); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "绘画风格加载失败"); }
    finally { setLoading(false); }
  }

  return <>
    <div className="space-y-2"><span className="text-sm font-semibold">绘画风格</span>
      <button type="button" aria-label={`绘画风格：${selected?.name ?? value}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => void show()} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2 text-left text-sm disabled:opacity-50">
        {selected ? <img src={pictureBookStyleImageSource(selected)} alt="" className="size-12 rounded-lg object-cover" /> : <Palette className="m-3 size-6 text-muted-foreground" />}
        <span className="flex-1 font-medium">{selected?.name ?? value}</span><ChevronDown className="mr-2 size-4 text-muted-foreground" />
      </button>
    </div>
    <dialog ref={dialog} aria-labelledby="picture-book-style-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} className="m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
      <div className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><h2 id="picture-book-style-title" className="text-lg font-semibold">选择绘画风格</h2><button type="button" aria-label="关闭绘画风格" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-secondary"><X className="size-5" /></button></div>
        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
        {loading ? <div role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在加载绘画风格…</div> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{options.filter(style => style.enabled).map(style => <button key={style.id} type="button" aria-label={style.name} aria-pressed={selected?.id === style.id} title={style.description} onClick={() => { onChange(style.id); setOpen(false); }} className={`overflow-hidden rounded-xl border text-left transition hover:border-primary ${selected?.id === style.id ? "border-primary ring-2 ring-primary/15" : "border-border"}`}>
          <img src={pictureBookStyleImageSource(style)} alt="" loading="lazy" className="aspect-square w-full object-cover" /><span className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-medium">{style.name}{selected?.id === style.id ? <Check className="size-4" /> : null}</span>
        </button>)}</div>
      </div>
    </dialog>
  </>;
}
