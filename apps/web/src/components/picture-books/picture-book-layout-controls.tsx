"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeft, Bold, Check, ChevronDown, Cloud, Ellipsis, Eye, EyeOff, Globe, MessageCircle, MessageSquare, Plus, Settings2, Square, X } from "lucide-react";
import { pictureBookLanguageName } from "@/lib/picture-book-languages";
import type { PictureBookTextBox } from "@/lib/picture-book-text-layout";

export const layoutButton = "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";
export const layoutIcon = "inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad371e] disabled:opacity-40";
const field = "min-h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm disabled:bg-muted";
const active = "bg-[#ffe8e0] text-[#a43520]";

export function LayoutIconButton({ label, children, pressed, disabled, onClick }: { label: string; children: ReactNode; pressed?: boolean; disabled?: boolean; onClick: () => void }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  function show(node: HTMLButtonElement) {
    if (node.disabled) return;
    const rect = node.getBoundingClientRect();
    setTip({ x: Math.max(86, Math.min(window.innerWidth - 86, rect.left + rect.width / 2)), y: Math.min(window.innerHeight - 40, rect.bottom + 5) });
  }
  return <><button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={() => { setTip(null); onClick(); }}
    onPointerEnter={event => { if (event.pointerType !== "touch") show(event.currentTarget); }} onPointerLeave={() => setTip(null)} onFocus={event => show(event.currentTarget)} onBlur={() => setTip(null)}
    className={`${layoutIcon} ${pressed ? active : ""}`}>{children}</button>
    {tip && !disabled && createPortal(<span aria-hidden="true" className="pointer-events-none fixed z-[60] -translate-x-1/2 whitespace-nowrap rounded bg-[#222] px-2 py-1 text-xs text-white shadow" style={{ left: tip.x, top: tip.y }}>{label}</span>, document.body)}
  </>;
}

type HeaderProps = {
  title: string; position: number; pages: number[]; language: string; originalLabel: string; editableLanguages: string[]; remainingLanguages: string[];
  pending: boolean; hasImage: boolean; dirty: boolean; enabled: boolean; preview: boolean; canImportLanguage: boolean;
  addLanguageCode?: string; copyLayout: boolean; onLanguage: (next: string) => void; onLanguageChoice: (next: string) => void; onCopyLayout: (value: boolean) => void; onAddLanguage: () => void;
  onClose: () => void; onNavigate: (position: number) => void; onToggle: (enabled: boolean) => void; onPreview: () => void; onSave: () => void;
};

export function PictureBookLayoutHeader(props: HeaderProps) {
  const { title, position, pages, language, originalLabel, pending, dirty, enabled, preview, hasImage, addLanguageCode, copyLayout } = props;
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const currentTab = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const label = (code: string) => code === "original" ? originalLabel : pictureBookLanguageName(code);
  useEffect(() => { currentTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [position]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) { setOpen(false); setAdding(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setAdding(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  function chooseLanguage(next: string) { props.onLanguage(next); setOpen(false); setAdding(false); trigger.current?.focus(); }
  return <header className="relative z-30 shrink-0 bg-background">
    <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-4 py-2 sm:px-5 lg:min-h-16">
      <button type="button" disabled={pending} onClick={props.onClose} className="inline-flex items-center gap-2 rounded-md px-1.5 py-2 text-sm hover:bg-muted disabled:opacity-50"><ArrowLeft size={18} />返回绘本</button>
      <h1 className="border-l border-border pl-3 text-base font-semibold sm:text-lg">图文编排</h1>
      <span className="max-w-[24ch] truncate text-sm text-muted-foreground" title={title}>{title}</span>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">{dirty ? "未保存" : <><Check size={15} />已保存</>}</span>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" role="switch" className="peer sr-only" disabled={pending || !hasImage || preview} checked={enabled} onChange={event => props.onToggle(event.target.checked)} /><span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-neutral-300 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#c44329] peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-50" />全书开启图文编排</label>
        <button type="button" disabled={!hasImage || pending} onClick={props.onPreview} className={layoutButton}>{preview ? <EyeOff size={16} /> : <Eye size={16} />}{preview ? "退出预览" : "预览"}</button>
        <button type="button" disabled={pending || !dirty || !hasImage} onClick={props.onSave} className="min-h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">{pending ? "处理中…" : "保存"}</button>
      </div>
    </div>
    <div className="flex min-w-0 items-center gap-3 border-b border-border bg-[#f7f7f6] px-4 sm:px-5">
      <div ref={menu} className="relative shrink-0 py-2 lg:py-2.5">
        <button ref={trigger} type="button" aria-label={`编辑语言：${label(language)}`} aria-expanded={open} disabled={pending} className={layoutButton} onClick={() => { setOpen(!open); setAdding(false); }}><Globe size={17} />{label(language)}<ChevronDown size={14} /></button>
        {open ? <div className="absolute top-full left-0 z-50 max-h-[min(45dvh,22rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-2 shadow-lg">
          {props.editableLanguages.map(code => <button key={code} type="button" onClick={() => chooseLanguage(code)} className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-muted ${code === language ? active : ""}`}>{label(code)}{code === language && <Check size={16} />}</button>)}
          {props.remainingLanguages.length && !preview && hasImage ? <div className="mt-1 border-t border-border pt-1">
            {!adding ? <button type="button" onClick={() => setAdding(true)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"><Plus size={16} />添加语言</button> : <div className="space-y-2 p-2">
              <select aria-label="新增语言" className={`${field} w-full`} value={addLanguageCode} onChange={event => props.onLanguageChoice(event.target.value)}>{props.remainingLanguages.map(code => <option key={code} value={code}>{label(code)}</option>)}</select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={copyLayout} onChange={event => props.onCopyLayout(event.target.checked)} />复用文本布局</label>
              {copyLayout && !props.canImportLanguage && <p role="status" className="text-sm text-muted-foreground">本页暂无{label(addLanguageCode!)}展示文字，请先返回绘本填写，或取消复用后手动添加。</p>}
              <button type="button" className={layoutButton} disabled={copyLayout && !props.canImportLanguage} onClick={() => { props.onAddLanguage(); setOpen(false); setAdding(false); trigger.current?.focus(); }}>添加语言</button>
            </div>}
          </div> : null}
        </div> : null}
      </div>
      <nav ref={tabs} aria-label="绘本页面" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto border-l border-border pl-2">
        {pages.map(page => <button key={page} ref={page === position ? currentTab : undefined} type="button" disabled={pending} aria-current={page === position ? "page" : undefined} onClick={() => props.onNavigate(page)} className={`min-h-10 shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-4 text-sm hover:bg-background ${page === position ? "border-[#ff5530] bg-background font-semibold" : "border-transparent text-muted-foreground"}`}>{page === 0 ? "封面" : `第 ${page} 页`}</button>)}
      </nav>
      {pages.length > 7 && <LayoutIconButton label="查看更多页面" onClick={() => { const node = tabs.current; if (node) node.scrollTo({ left: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 ? 0 : node.scrollLeft + node.clientWidth * .8 }); }}><Ellipsis size={18} /></LayoutIconButton>}
    </div>
  </header>;
}

const alignment = [["left", "左对齐", AlignLeft], ["center", "居中对齐", AlignCenter], ["right", "右对齐", AlignRight], ["justify", "两端对齐", AlignJustify]] as const;

export function LayoutNumber({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange?: (value: number) => void; min: number; max: number; step?: number; unit?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="flex min-w-0 items-center gap-2 text-sm"><span className="shrink-0">{label}</span><span className={`flex min-w-0 flex-1 items-center gap-1 ${field} ${onChange ? "" : "bg-muted text-muted-foreground"}`}>
    <input type="number" className="w-full min-w-0 bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#ad371e]" aria-label={label} min={min} max={max} step={step} value={draft ?? value} readOnly={!onChange}
      onChange={event => {
        const next = event.currentTarget.valueAsNumber;
        setDraft(event.currentTarget.value);
        if (next >= min && next <= max) onChange?.(next);
      }} onBlur={event => {
        const next = event.currentTarget.valueAsNumber;
        if (Number.isFinite(next) && (next < min || next > max)) onChange?.(Math.max(min, Math.min(max, next)));
        setDraft(null);
      }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    {unit && <span className="text-muted-foreground">{unit}</span>}
  </span></label>;
}

function ColorField({ label, value, onChange, swatchOnly = false }: { label: string; value: string; onChange: (value: string) => void; swatchOnly?: boolean }) {
  return <label className="flex min-w-0 items-center gap-2 text-sm" title={label}>
    {!swatchOnly && <span className="shrink-0">{label}</span>}
    <span className={`${field} flex flex-1 items-center gap-2`}><input type="color" aria-label={label} value={value} className="size-6 shrink-0 cursor-pointer border-0 bg-transparent p-0" onChange={event => onChange(event.target.value)} />{!swatchOnly && <span className="font-mono text-xs uppercase">{value}</span>}</span>
  </label>;
}

export function PictureBookLayoutTypography({ box, onChange, disabled }: { box?: PictureBookTextBox; onChange: (patch: Partial<PictureBookTextBox>) => void; disabled: boolean }) {
  return <fieldset disabled={!box || disabled} className="flex min-w-0 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-background px-4 py-2 sm:px-5 lg:py-3">
    <legend className="sr-only">文字格式</legend>
    <span className="shrink-0 border-r border-border pr-3 text-sm font-semibold">文字</span>
    <select aria-label="字体" title="字体" className={`${field} w-28 shrink-0`} value={box?.fontFamily ?? "sans"} onChange={event => onChange({ fontFamily: event.target.value as PictureBookTextBox["fontFamily"] })}><option value="sans">黑体</option><option value="serif">宋体</option></select>
    <div className="w-26 shrink-0"><LayoutNumber label="字号" value={box?.fontSize ?? 24} min={8} max={160} onChange={fontSize => onChange({ fontSize })} /></div>
    <ColorField label="文字颜色" value={box?.color ?? "#222222"} onChange={color => onChange({ color })} swatchOnly />
    <div className="flex shrink-0 items-center gap-1 border-x border-border px-2"><LayoutIconButton label="加粗" pressed={Boolean(box?.bold)} onClick={() => onChange({ bold: !box?.bold })}><Bold size={18} /></LayoutIconButton></div>
    <div className="flex shrink-0 gap-0.5 border-r border-border pr-2">{alignment.map(([value, label, Icon]) => <LayoutIconButton key={value} label={label} pressed={(box?.align ?? "justify") === value} onClick={() => onChange({ align: value })}><Icon size={18} /></LayoutIconButton>)}</div>
    <div className="w-28 shrink-0"><LayoutNumber label="行高" value={box?.lineHeight ?? 1.5} min={.8} max={3} step={.1} onChange={lineHeight => onChange({ lineHeight })} /></div>
  </fieldset>;
}

const shapes = [[undefined, "方框", Square], ["rounded", "圆角矩形", MessageSquare], ["ellipse", "椭圆", MessageCircle], ["cloud", "云朵", Cloud]] as const;

export function PictureBookRegionSettings({ box, onChange, onClose }: { box: PictureBookTextBox; onChange: (patch: Partial<PictureBookTextBox>) => void; onClose: () => void }) {
  const percent = (value: number) => Math.round(value * 1000) / 10;
  const transparency = Math.round((1 - (box.backgroundOpacity ?? (box.backgroundColor ? 1 : 0))) * 100);
  return <div aria-label="规格设置">
    <div className="mb-2 flex items-center justify-between border-b border-border pb-1"><h2 className="flex items-center gap-2 font-semibold"><Settings2 size={17} />规格设置</h2><LayoutIconButton label="关闭规格设置" onClick={onClose}><X size={16} /></LayoutIconButton></div>
    <fieldset className="mb-3"><legend className="mb-1.5 text-sm">形状</legend><div className="grid grid-cols-4 gap-1.5">{shapes.map(([shape, name, Icon]) => <button key={name} type="button" aria-pressed={box.shape === shape} onClick={() => onChange({ shape })} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md border border-border px-1 text-sm hover:bg-muted ${box.shape === shape ? active : ""}`}><Icon size={19} />{name}</button>)}</div></fieldset>
    <div className="grid grid-cols-2 gap-2">
      <LayoutNumber label="X" value={percent(box.x)} min={0} max={100} step={.1} unit="%" onChange={x => onChange({ x: Math.min(1 - box.width, x / 100) })} />
      <LayoutNumber label="Y" value={percent(box.y)} min={0} max={100} step={.1} unit="%" onChange={y => onChange({ y: Math.min(1 - box.height, y / 100) })} />
      <LayoutNumber label="宽度" value={percent(box.width)} min={1} max={100} step={.1} unit="%" onChange={width => onChange({ width: Math.min(1 - box.x, width / 100) })} />
      <LayoutNumber label="高度" value={percent(box.height)} min={1} max={100} unit="%" />
    </div>
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <ColorField label="背景颜色" value={box.backgroundColor ?? "#ffffff"} onChange={backgroundColor => onChange({ backgroundColor, backgroundOpacity: box.backgroundOpacity ?? 1 })} />
      <label className="flex min-w-0 items-center gap-2 text-sm"><span className="shrink-0">背景透明度</span><input type="range" min={0} max={100} value={transparency} onChange={event => onChange({ backgroundColor: box.backgroundColor ?? "#ffffff", backgroundOpacity: 1 - Number(event.target.value) / 100 })} className="w-full min-w-0 accent-[#c44329]" /><output className="w-10 shrink-0 text-right tabular-nums">{transparency}%</output></label>
      {(!box.shape || box.shape === "rounded") && <LayoutNumber label="圆角" value={box.cornerRadius ?? 0} min={0} max={100} unit="px" onChange={cornerRadius => onChange({ cornerRadius })} />}
      <ColorField label="边框颜色" value={box.borderColor ?? "#8fa4be"} onChange={borderColor => onChange({ borderColor, borderWidth: box.borderWidth ?? 1 })} />
      <LayoutNumber label="边框粗细" value={box.borderWidth ?? 0} min={0} max={24} unit="px" onChange={borderWidth => onChange({ borderWidth })} />
      <LayoutNumber label="显示层级" value={box.zIndex ?? 0} min={0} max={100} onChange={zIndex => onChange({ zIndex })} />
    </div>
  </div>;
}
