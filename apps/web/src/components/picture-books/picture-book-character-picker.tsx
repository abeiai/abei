"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { usePictureBookGenerationConfirmation } from "./picture-book-generation-confirmation";

export type StoryCharacter = { id?: string; name: string; description: string; imageUrl?: string | null; referenceName?: string };

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/picture-books${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) throw new Error(payload?.message || "角色读取失败，请重试");
  return payload.data as T;
}

export function PictureBookCharacterPicker({ value, style, styleName, disabled, onChange }: {
  value: StoryCharacter[]; style: string; styleName: string; disabled?: boolean;
  onChange(characters: StoryCharacter[]): Promise<void>;
}) {
  const generationConfirmation = usePictureBookGenerationConfirmation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [library, setLibrary] = useState<StoryCharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [roleName, setRoleName] = useState("");

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError("");
    request<StoryCharacter[]>(`/characters?style=${encodeURIComponent(style)}`).then(items => { if (active) setLibrary(items); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, style]);

  function show(character: StoryCharacter) {
    setTarget(character.name); setName(character.referenceName ?? `${character.name}参考形象`); setDescription(character.description); setFile(null); setUploading(false); setError(""); setOpen(true);
  }
  async function run(operation: () => Promise<void>) {
    if (working) return;
    setWorking(true); setError("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "角色保存失败"); }
    finally { setWorking(false); }
  }
  async function choose(character: StoryCharacter) {
    if (!target || !value.some(item => item.name === target)) throw new Error("请先确定故事中的角色名称");
    const selected = { id: character.id, name: target, referenceName: character.name, description: character.description, imageUrl: character.imageUrl ?? null };
    const next = value.map(item => item.name === target ? selected : item);
    await onChange(next); setOpen(false);
  }
  async function addRole() {
    const nextName = roleName.trim();
    if (!nextName) throw new Error("请填写角色名称");
    if (value.some(item => item.name === nextName)) throw new Error("角色名称已存在");
    if (value.length >= 9) throw new Error("最多添加 9 个出场角色");
    await onChange([...value, { name: nextName, description: "外貌待确定", imageUrl: null }]);
    setRoleName(""); setAdding(false);
  }
  async function generate(character: StoryCharacter) {
    if (!character.id) return;
    if (!await generationConfirmation.confirm({ label: "角色形象生成", path: "/image-cost", body: { referenceImageCount: character.id.startsWith("preset:") || character.imageUrl ? 2 : 1 } })) return;
    const updated = await request<StoryCharacter>(`/characters/${encodeURIComponent(character.id)}/image`, { style });
    setLibrary(items => [...items.filter(item => item.id !== updated.id), updated]);
    if (character.id.startsWith("preset:") || (target && value.find(item => item.name === target)?.id === character.id)) await choose(updated);
  }
  async function create(mode: "upload" | "generate" = "upload") {
    if (!name.trim() || description.trim().length < 2) throw new Error("请填写形象名称和外貌描述");
    const role = value.find(item => item.name === target);
    const existing = library.find(item => item.id === role?.id && !item.id?.startsWith("preset:") && item.name === name.trim() && item.description === description.trim());
    if (mode === "generate" && !await generationConfirmation.confirm({ label: "角色形象生成", path: "/image-cost", body: { referenceImageCount: existing?.imageUrl ? 2 : 1 } })) return;
    let created = existing ?? await request<StoryCharacter>("/characters", { name: name.trim(), description: description.trim() });
    if (mode === "generate") created = await request<StoryCharacter>(`/characters/${created.id}/image`, { style });
    else if (file) {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`/api/picture-books/characters/${created.id}/upload?style=${encodeURIComponent(style)}`, { method: "POST", credentials: "include", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.code !== 0) throw new Error(payload?.message || "角色图片上传失败");
      created = payload.data;
    }
    setLibrary(items => [...items, created]);
    await choose(created);
  }

  return <div className="space-y-3">
    {generationConfirmation.dialog}
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">出场角色</h3><button type="button" disabled={disabled || working} onClick={() => setAdding(current => !current)} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm hover:bg-secondary disabled:opacity-50"><Plus className="size-4" />添加角色</button></div>
    {adding ? <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void run(addRole); }}><input aria-label="新增角色名称" value={roleName} onChange={event => setRoleName(event.target.value)} maxLength={80} placeholder="角色名称" disabled={disabled || working} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button type="submit" disabled={disabled || working} className="rounded-lg border px-3 py-2 text-sm">添加</button></form> : null}
    <div className="space-y-2">{value.map(character => <div key={character.name} className="flex items-center gap-2 rounded-xl border border-border p-3">
      <button type="button" aria-label={`选择${character.name}的形象`} aria-haspopup="dialog" disabled={disabled} onClick={() => show(character)} className="w-full text-left disabled:opacity-50">
        <span className="flex items-center gap-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{character.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{character.referenceName ? `参考形象：${character.referenceName}` : "选择参考形象"}</span></span>{character.imageUrl ? <img src={character.imageUrl} alt={`${character.name}的参考形象 · ${styleName}`} className="size-12 shrink-0 rounded-lg object-cover" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary"><ImagePlus className="size-5 text-muted-foreground" /></span>}</span>
      </button><button type="button" aria-label={`移除角色${character.name}`} disabled={disabled || working} onClick={() => void run(() => onChange(value.filter(item => item.name !== character.name)))} className="shrink-0 rounded-lg p-1 hover:bg-secondary"><X className="size-3" /></button>
    </div>)}</div>
    {!value.length ? <p className="text-sm text-muted-foreground">在对话中确定出场角色，或添加角色名称。</p> : null}
    {error && !open ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <dialog ref={dialog} aria-labelledby="character-picker-title" onCancel={event => { if (working) event.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)} onClick={event => { if (!working && event.target === event.currentTarget) setOpen(false); }} className="m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="character-picker-title" className="text-lg font-semibold">为{target}选择参考形象</h2><p className="mt-1 text-sm text-muted-foreground">{styleName}</p></div><button type="button" aria-label="关闭角色选择" disabled={working} onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-secondary"><X className="size-5" /></button></div>
      {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
      {loading || working ? <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{loading ? "正在加载角色…" : "正在保存角色…"}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <button type="button" aria-label="上传角色图片" onClick={() => { setUploading(true); setError(""); }} disabled={working} className="overflow-hidden rounded-xl border border-dashed border-border text-left hover:border-primary"><span className="flex aspect-square items-center justify-center bg-secondary"><ImagePlus className="size-9 text-muted-foreground" /></span><span className="block px-3 py-3 text-sm font-medium">上传角色图片</span></button>
        {library.map(character => <div key={character.id} className="overflow-hidden rounded-xl border border-border">
          <button type="button" aria-label={character.name} aria-pressed={value.find(item => item.name === target)?.id === character.id} title={character.description} disabled={working} onClick={() => void run(() => choose(character))} className="w-full text-left hover:bg-secondary disabled:opacity-50">
            {character.imageUrl ? <img src={character.imageUrl} alt={`${character.name} · ${styleName}`} loading="lazy" className="aspect-square w-full object-cover" /> : <span className="flex aspect-square items-center justify-center bg-secondary"><ImagePlus className="size-8 text-muted-foreground" /></span>}
            <span className="flex items-center justify-between px-3 py-3 text-sm font-medium">{character.name}{value.find(item => item.name === target)?.id === character.id ? <Check className="size-4" /> : null}</span>
          </button>
          {!character.imageUrl || !character.id?.startsWith("preset:") ? <button type="button" disabled={working} onClick={() => void run(() => generate(character))} className="flex w-full items-center justify-center gap-1 border-t px-2 py-2 text-xs hover:bg-secondary disabled:opacity-50"><Sparkles className="size-3" />{character.imageUrl ? "重新生成" : "生成当前风格形象"} · 2点</button> : null}
        </div>)}
      </div>
      {uploading ? <div className="mt-5 space-y-3 border-t border-border pt-5">
        <label className="block space-y-2 text-sm font-semibold">形象名称<input value={name} maxLength={80} onChange={event => setName(event.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" /></label>
        <label className="block space-y-2 text-sm font-semibold">外貌描述<textarea value={description} maxLength={1000} rows={2} onChange={event => setDescription(event.target.value)} placeholder="发型、服装及标志颜色" className="w-full rounded-xl border px-3 py-2 text-sm font-normal" /></label>
        <label className="block space-y-2 text-sm font-semibold">上传{styleName}角色图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={working} className="block w-full text-sm font-normal" onChange={event => { const chosen = event.target.files?.[0]; if (!chosen) return; if (!["image/jpeg", "image/png", "image/webp"].includes(chosen.type) || chosen.size > 10 * 1024 * 1024) { setError("请选择 10MB 以内的 JPG、PNG 或 WebP 图片"); event.target.value = ""; return; } setFile(chosen); }} /></label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={working || !file} onClick={() => void run(() => create())} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">上传并使用</button><button type="button" disabled={working || !name.trim() || description.trim().length < 2} onClick={() => void run(() => create("generate"))} className="rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">生成角色形象 · 2点</button></div>
      </div> : null}
    </dialog>
  </div>;
}
