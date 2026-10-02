"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, Pencil, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { pictureBookStyleImageSource, type PictureBookStyle } from "@/lib/picture-book-styles";
import { savePictureBookStylesAction } from "@/lib/settings-api";

export function PictureBookStylesManager({ initialStyles }: { initialStyles: PictureBookStyle[] }) {
  const [styles, setStyles] = useState(initialStyles);
  const [draft, setDraft] = useState<PictureBookStyle | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (draft && !dialog.current?.open) dialog.current?.showModal();
    if (!draft && dialog.current?.open) dialog.current.close();
  }, [draft]);
  useEffect(() => () => { if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function persist(next: PictureBookStyle[]) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await savePictureBookStylesAction(next);
      if (result.status !== "success") throw new Error(result.message);
      setStyles(result.styles ?? next); setDraft(null); setMessage("绘画风格已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  function edit(style?: PictureBookStyle) {
    setError(""); setPreviewUrl("");
    setDraft(style ? { ...style } : { id: `style-${crypto.randomUUID()}`, name: "", description: "", imageUrl: "", enabled: true });
  }
  async function upload(file: File) {
    if (!draft) return;
    setUploading(true); setError("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("请选择 10MB 以内的 JPG、PNG 或 WebP 图片");
      const form = new FormData(); form.set("file", file); form.set("sourceType", "SYSTEM"); form.set("purpose", "PICTURE_BOOK_STYLE");
      const response = await fetch("/internal/admin/media/upload-json", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || payload.code !== 0 || !payload.data?.url) throw new Error(payload.message || "图片上传失败");
      setDraft({ ...draft, imageUrl: payload.data.url }); setPreviewUrl(URL.createObjectURL(file));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图片上传失败"); }
    finally { setUploading(false); }
  }
  function move(index: number, offset: number) {
    const next = [...styles]; const target = index + offset;
    [next[index], next[target]] = [next[target]!, next[index]!]; void persist(next);
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">共 {styles.length} 种风格</span><Button disabled={busy} onClick={() => edit()}><Plus />新增风格</Button></div>
    {message ? <p role="status" className="rounded-xl border p-3 text-sm">{message}</p> : null}
    {error && !draft ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{styles.map((style, index) => <article key={style.id} className="overflow-hidden rounded-2xl border border-border bg-card">
      <img src={pictureBookStyleImageSource(style)} alt={`${style.name}示意图`} loading="lazy" className="aspect-square w-full object-cover" /><div className="space-y-3 p-4"><h2 className="text-base font-semibold">{style.name}</h2><p className="min-h-12 text-sm leading-6 text-muted-foreground">{style.description}</p>
        <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={style.enabled} disabled={busy} onChange={event => void persist(styles.map(item => item.id === style.id ? { ...item, enabled: event.target.checked } : item))} />启用</label><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`${style.name}上移`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button size="sm" variant="ghost" aria-label={`${style.name}下移`} disabled={busy || index === styles.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></div></div>
        <Button className="w-full" variant="outline" disabled={busy} onClick={() => edit(style)} aria-label={`编辑${style.name}`}><Pencil />编辑风格</Button>
      </div></article>)}</div>
    <dialog ref={dialog} aria-labelledby="style-edit-title" onCancel={event => { if (busy || uploading) event.preventDefault(); else setDraft(null); }} onClose={() => setDraft(null)} className="m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
      {draft ? <form className="space-y-4 p-6" onSubmit={event => { event.preventDefault(); void persist(styles.some(style => style.id === draft.id) ? styles.map(style => style.id === draft.id ? draft : style) : [...styles, draft]); }}>
        <div className="flex items-center justify-between"><h2 id="style-edit-title" className="text-lg font-semibold">{styles.some(style => style.id === draft.id) ? "编辑风格" : "新增风格"}</h2><button type="button" aria-label="关闭风格编辑" disabled={busy || uploading} onClick={() => setDraft(null)}><X className="size-5" /></button></div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <label className="block space-y-2 text-sm font-semibold">名称<Input required maxLength={80} value={draft.name} disabled={busy || uploading} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="block space-y-2 text-sm font-semibold">描述<Textarea required maxLength={1000} rows={4} value={draft.description} disabled={busy || uploading} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="block space-y-2 text-sm font-semibold">参考图<span className="mx-auto flex size-48 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary">{previewUrl || draft.imageUrl ? <img src={previewUrl || pictureBookStyleImageSource(draft)} alt="参考图预览" className="size-full object-cover" /> : <span className="flex items-center gap-2 font-normal"><ImagePlus className="size-5" />上传参考图</span>}</span><input className="block w-full text-sm font-normal" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
        <Button type="submit" className="w-full" disabled={busy || uploading || !draft.imageUrl}>{busy || uploading ? <LoaderCircle className="animate-spin" /> : <Save />}{uploading ? "图片上传中…" : "保存风格"}</Button>
      </form> : null}
    </dialog>
  </div>;
}
