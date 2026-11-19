"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, ArrowDown, ArrowUp, Copy, Ellipsis, GripVertical, Hand, Image as ImageIcon, Import, Lock, MessageSquare, Mic, MicOff, Minus, MousePointer2, Move, Plus, Settings, Trash2, Type, ZoomIn } from "lucide-react";
import { fitPictureBookTextBox, layoutNarration, placePictureBookCaption, removePictureBookBlankLines, snapPictureBookTextBox, withLayoutVoice, type PictureBookTextBox, type PictureBookTextLayout, type PictureBookTextVersion } from "@/lib/picture-book-text-layout";
import { pictureBookPageAudioSource } from "@/lib/picture-book-audio";
import { VoicePicker } from "@/components/audio/voice-picker";
import type { VoicePickerOption } from "@/lib/voice-picker";
import { pictureBookBoxPosition, pictureBookBoxTypography, PictureBookRegionDecoration, PictureBookTextOverlay, usePictureBookCanvasSize } from "./picture-book-text-overlay";
import { LayoutIconButton, PictureBookLayoutHeader, PictureBookLayoutTypography, PictureBookRegionSettings, layoutButton, layoutIcon } from "./picture-book-layout-controls";
import { pictureBookRegionVerticalInset, regionPosition, type Point } from "@/lib/picture-book-text-region";

type Props = {
  bookId: string; title: string; position: number; pages: number[]; imageUrl?: string; initial?: PictureBookTextLayout;
  bookLayoutEnabled: boolean; needsBookLayoutSync: boolean;
  initialLanguage: string; languages: string[]; originalLabel: string; getCaption: (language: string) => string; onLanguageChange: (language: string) => void;
  voiceKey: string; voiceOptions: VoicePickerOption[]; onVoiceChange: (value: string) => void; onClose: (language: string) => void; onSaved: (layout: PictureBookTextLayout) => void;
  onNavigate: (position: number, language: string) => void;
  save: (layout: PictureBookTextLayout, baseline: string) => Promise<PictureBookTextLayout>;
  generate: (language: string, selectedVoice: string, narration: string) => Promise<PictureBookTextLayout | null>;
};
type Tool = "select" | "text" | "annotation" | "pan";
type Panel = { kind: "menu" | "settings"; regionId: string; x: number; y: number };
const selectedStyle = "bg-[#ffe8e0] text-[#9d341e]";
const menuItem = "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted disabled:opacity-40";
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

function newTextBox(text: string, index = 0): PictureBookTextBox {
  return { id: crypto.randomUUID(), text, x: .1, y: .1 + (index % 6) * .1, width: .5, height: .2, fontSize: 24, fontFamily: "sans", color: "#222222", bold: false, align: "justify", lineHeight: 1.5, speak: true, zIndex: 0 };
}

export function PictureBookTextEditor({ bookId, title, position, pages, imageUrl, initial, initialLanguage, languages, originalLabel, getCaption, onLanguageChange, bookLayoutEnabled, needsBookLayoutSync, voiceKey, voiceOptions, onVoiceChange, onClose, onSaved, onNavigate, save, generate }: Props) {
  const [layout, setLayout] = useState<PictureBookTextLayout>(() => ({ ...(initial ?? { versions: [{ language: "original", boxes: [], audioUrl: null }] }), enabled: bookLayoutEnabled }));
  const [baseline, setBaseline] = useState(JSON.stringify(initial ?? null));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ ...(initial ?? { versions: [{ language: "original", boxes: [], audioUrl: null }] }), enabled: bookLayoutEnabled }));
  const [language, setLanguage] = useState(initialLanguage);
  const [selected, setSelected] = useState("");
  const [newLanguage, setNewLanguage] = useState("");
  const [copyLayout, setCopyLayout] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ratio, setRatio] = useState(1);
  const leaving = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvasSize = usePictureBookCanvasSize(canvas);
  const stageSize = usePictureBookCanvasSize(stage);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelOrigin = useRef<HTMLElement | null>(null);
  const tailDrag = useRef<number | null>(null);
  const layerDrag = useRef<string | null>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const textMeasure = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; box: PictureBookTextBox } | null>(null);
  const resize = useRef<{ pointerId: number; startX: number; width: number } | null>(null);
  const [guides, setGuides] = useState<{ vertical: boolean; horizontal: boolean } | null>(null);
  const editorText = useRef<HTMLTextAreaElement>(null);
  const [overflow, setOverflow] = useState(false);
  const version = layout.versions.find(item => item.language === language);
  const editableLanguages = [...new Set(["original", ...layout.versions.map(item => item.language), language])];
  const remainingLanguages = languages.filter(code => code !== "original" && !layout.versions.some(item => item.language === code));
  const languageToAdd = remainingLanguages.includes(newLanguage) ? newLanguage : remainingLanguages[0];
  const existingCaption = getCaption(language);
  const captionToImport = languageToAdd ? getCaption(languageToAdd) : "";
  const boxes = version?.boxes ?? [];
  const boxText = boxes.map(item => item.text).filter(text => text.trim()).join("\n");
  const captionImported = Boolean(existingCaption && (boxText.replace(/\s+/g, " ").trim() === existingCaption.replace(/\s+/g, " ") || boxes.some(item => item.text.trim() === existingCaption)));
  const box = boxes.find(item => item.id === selected);
  const dirty = Boolean(imageUrl) && (JSON.stringify(layout) !== savedSnapshot || needsBookLayoutSync);
  const editingDisabled = pending || !imageUrl || preview;
  const fittedWidth = Math.min(Math.max(1, stageSize.width - 48), Math.max(1, stageSize.height - 48) * ratio);
  const visiblePanelBox = panel && boxes.find(item => item.id === panel.regionId);
  const getCanvasPoint = (x: number, y: number) => {
    const rect = canvas.current?.getBoundingClientRect();
    return rect?.width && rect.height ? { x: clampUnit((x - rect.left) / rect.width), y: clampUnit((y - rect.top) / rect.height) } : null;
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!leaving.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const check = () => { const node = editorText.current; setOverflow(Boolean(node && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1))); };
    const frame = requestAnimationFrame(check);
    const observer = new ResizeObserver(check); if (editorText.current) observer.observe(editorText.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [box, ratio, editingDisabled, tool]);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (panel && !panelRef.current?.contains(event.target as Node) && !panelOrigin.current?.contains(event.target as Node)) setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (panel) { setPanel(null); panelOrigin.current?.focus(); }
      else if (preview) setPreview(false);
      else setTool("select");
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [panel, preview]);
  useEffect(() => {
    if (panel) panelRef.current?.focus();
  }, [panel]);
  function selectLanguage(next: string) { setLanguage(next); setSelected(""); setPanel(null); onLanguageChange(next); }
  function updateVersion(change: (version: PictureBookTextVersion) => PictureBookTextVersion) {
    setLayout(current => {
      const currentVersion = current.versions.find(item => item.language === language);
      const next = change(currentVersion ?? { language, boxes: [], audioUrl: null });
      return { ...current, versions: currentVersion ? current.versions.map(item => item === currentVersion ? next : item) : [...current.versions, next] };
    });
  }
  function updateBoxes(next: PictureBookTextBox[]) { updateVersion(current => ({ ...current, boxes: next })); }
  function updateBox(id: string, patch: Partial<PictureBookTextBox>) { updateVersion(current => ({ ...current, boxes: current.boxes.map(item => item.id === id ? { ...item, ...patch } : item) })); }
  function fitText(box: PictureBookTextBox) {
    const measure = textMeasure.current;
    const canvasHeight = canvas.current?.getBoundingClientRect().height;
    if (!measure?.parentElement || !canvasHeight) return box;
    measure.parentElement.style.width = `${box.width * 100}%`;
    Object.assign(measure.style, pictureBookBoxTypography(box));
    // The zero-width space keeps the editable line after a trailing newline measurable.
    measure.textContent = `${box.text}\u200b`;
    const contentFraction = 1 - 2 * pictureBookRegionVerticalInset(box.shape);
    return fitPictureBookTextBox(box, Math.ceil((measure.getBoundingClientRect().height + 1) / contentFraction), canvasHeight);
  }
  function updateBoxText(box: PictureBookTextBox, patch: Partial<PictureBookTextBox>) {
    const fitted = fitText({ ...box, ...patch });
    if (patch.width !== undefined && patch.width < box.width && fitted.height === 1) return;
    updateBox(box.id, fitted);
  }
  function pasteText(event: ClipboardEvent<HTMLTextAreaElement>, box: PictureBookTextBox) {
    const pasted = event.clipboardData.getData("text/plain");
    const cleaned = removePictureBookBlankLines(pasted);
    if (cleaned === pasted) return;
    event.preventDefault();
    const input = event.currentTarget;
    const { selectionStart, selectionEnd, value, maxLength } = input;
    const available = Math.max(0, maxLength - value.length + selectionEnd - selectionStart);
    const inserted = cleaned.slice(0, available).replace(/[\uD800-\uDBFF]$/, "");
    if (!inserted) return;
    // The browser's insertion command keeps cleaned pastes in the textarea's undo history.
    if (!input.ownerDocument.execCommand("insertText", false, inserted)) {
      input.setRangeText(inserted, selectionStart, selectionEnd, "end");
    }
    updateBoxText(box, { text: input.value });
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, box: PictureBookTextBox) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, box };
    setPanel(null);
    setGuides({ vertical: Math.abs(box.x + box.width / 2 - .5) < .00001, horizontal: Math.abs(box.y + box.height / 2 - .5) < .00001 });
  }
  function moveBox(event: ReactPointerEvent<HTMLButtonElement>, box: PictureBookTextBox) {
    const start = drag.current;
    const rect = canvas.current?.getBoundingClientRect();
    if (start?.pointerId !== event.pointerId || !rect?.width || !rect.height) return;
    const { x, y, vertical, horizontal } = snapPictureBookTextBox(start.box.x + (event.clientX - start.startX) / rect.width, start.box.y + (event.clientY - start.startY) / rect.height, box, rect.width, rect.height);
    setGuides({ vertical, horizontal });
    updateBox(box.id, regionPosition(start.box, { x, y }));
  }
  function stopDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setGuides(null);
  }
  function startResize(event: ReactPointerEvent<HTMLButtonElement>, box: PictureBookTextBox) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { pointerId: event.pointerId, startX: event.clientX, width: box.width };
  }
  function resizeBox(event: ReactPointerEvent<HTMLButtonElement>, box: PictureBookTextBox) {
    const start = resize.current;
    const width = canvas.current?.getBoundingClientRect().width;
    if (start?.pointerId !== event.pointerId || !width) return;
    const nextWidth = Math.max(.01, Math.min(1 - box.x, start.width + (event.clientX - start.startX) / width));
    updateBoxText(box, { width: nextWidth });
  }
  function stopResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resize.current?.pointerId === event.pointerId) resize.current = null;
  }
  function addBox(text = "", point?: Point, annotation = false) {
    if (editingDisabled) return;
    if (boxes.length >= 50) { setError("本页该语言最多可添加 50 个文本区域"); return; }
    const draft = newTextBox(text, boxes.length);
    if (annotation) Object.assign(draft, { width: .28, shape: "rounded", backgroundColor: "#f0f5ff", backgroundOpacity: .7, cornerRadius: 8, borderColor: "#8fa4be", borderWidth: 1 });
    if (point) { draft.x = Math.min(1 - draft.width, point.x); draft.y = Math.min(1 - draft.height, point.y); }
    const next = fitText(draft);
    if (annotation) next.tail = { x: next.x + next.width / 2, y: clampUnit(next.y + next.height + .13) };
    updateBoxes([...boxes, next]);
    setTool("select");
    setSelected(next.id);
    requestAnimationFrame(() => editorText.current?.focus());
  }
  function importCaption() {
    if (!existingCaption || captionImported) return;
    if (boxes.length && !boxText) {
      const next = placePictureBookCaption(boxes, existingCaption).map(fitText);
      updateBoxes(next);
      setSelected(next[0]!.id);
    } else {
      addBox(existingCaption);
    }
  }
  function reorder(index: number, delta: number) { const next = [...boxes]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target]!, next[index]!]; updateBoxes(next); }
  async function persist(): Promise<PictureBookTextLayout> { const saved = await save(layout, baseline); setLayout(saved); setBaseline(JSON.stringify(saved)); setSavedSnapshot(JSON.stringify(saved)); onSaved(saved); return saved; }
  async function doSave() { setPending(true); setError(""); try { await persist(); setNotice("图文编排已保存"); } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); } finally { setPending(false); } }
  async function doGenerate() {
    if (!layout.enabled) { setError("请先开启图文编排"); return; }
    if (!layoutNarration(boxes)) { setError("请先选择并填写要配音的文本区域"); return; }
    setPending(true); setError("");
    try { await persist(); const updated = await generate(language, version?.voiceKey ?? voiceKey, layoutNarration(boxes)); if (updated) { setLayout(updated); setBaseline(JSON.stringify(updated)); setSavedSnapshot(JSON.stringify(updated)); onSaved(updated); setNotice("语音已生成"); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "语音生成失败"); } finally { setPending(false); }
  }
  function close() { if (dirty && !window.confirm("图文编排尚未保存，确定返回吗？")) return; leaving.current = true; onClose(language); }
  async function navigate(target: number) {
    if (target === position) return;
    setPending(true); setError("");
    try { if (dirty) await persist(); leaving.current = true; onNavigate(target, language); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试"); setPending(false); }
  }
  function addLanguage() {
    if (!languageToAdd || (copyLayout && !captionToImport)) return;
    let nextBoxes: PictureBookTextBox[] = [];
    if (copyLayout) {
      const originalBoxes = layout.versions.find(item => item.language === "original" && item.boxes.length)?.boxes;
      const sourceBoxes = boxes.length ? boxes : originalBoxes ?? layout.versions.find(item => item.boxes.length)?.boxes ?? [];
      if (sourceBoxes.length) {
        nextBoxes = placePictureBookCaption(sourceBoxes, captionToImport).map(item => ({ ...item, id: crypto.randomUUID() }));
      } else {
        nextBoxes = [newTextBox(captionToImport)];
      }
    }
    const fitted = nextBoxes.map(fitText);
    setLayout(current => ({ ...current, versions: [...current.versions, { language: languageToAdd, boxes: fitted, audioUrl: null }] }));
    selectLanguage(languageToAdd);
  }
  function openPanel(event: ReactMouseEvent<HTMLElement>, id: string, kind: Panel["kind"]) {
    if (editingDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(id);
    panelOrigin.current = event.currentTarget;
    const anchor = event.currentTarget.getBoundingClientRect();
    const item = boxes.find(box => box.id === id);
    if (kind === "settings" && item) openSettings(item);
    else setPanel({ kind, regionId: id, x: event.clientX || anchor.left, y: event.clientY || anchor.bottom });
  }
  function openSettings(item: PictureBookTextBox) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 320;
    const gap = 12;
    const left = rect.left + item.x * rect.width;
    const right = left + item.width * rect.width;
    const top = rect.top + item.y * rect.height;
    const bottom = top + item.height * rect.height;
    const availableBelow = window.innerHeight - bottom - 2 * gap;
    const preferredHeight = Math.min(530, window.innerHeight / 2);
    const x = right + gap - width;
    let anchor = { x, y: bottom + gap };
    if (availableBelow < preferredHeight) {
      if (left >= width + 2 * gap) anchor = { x: left - width - gap, y: Math.min(top, window.innerHeight - preferredHeight - gap) };
      else if (right + width + 2 * gap <= window.innerWidth) anchor = { x: right + gap, y: Math.min(top, window.innerHeight - preferredHeight - gap) };
      else if (top - gap > availableBelow) anchor = { x, y: Math.max(gap, top - preferredHeight - gap) };
    }
    setPanel({ kind: "settings", regionId: item.id, ...anchor });
  }
  function applySettings(item: PictureBookTextBox, patch: Partial<PictureBookTextBox>) {
    if (patch.x !== undefined || patch.y !== undefined) {
      updateBox(item.id, regionPosition(item, { x: patch.x ?? item.x, y: patch.y ?? item.y }));
    } else if (patch.shape !== undefined || patch.width !== undefined) updateBoxText(item, patch);
    else updateBox(item.id, patch);
  }
  function alignToCanvas(item: PictureBookTextBox, axis: "x" | "y") {
    const next = { x: item.x, y: item.y, [axis]: axis === "x" ? (1 - item.width) / 2 : (1 - item.height) / 2 };
    updateBox(item.id, regionPosition(item, next));
    setPanel(null);
  }
  function duplicate(item: PictureBookTextBox) {
    if (boxes.length >= 50) { setError("本页该语言最多可添加 50 个文本区域"); return; }
    const next = { ...item, ...regionPosition(item, { x: Math.min(1 - item.width, item.x + .03), y: Math.min(1 - item.height, item.y + .03) }), id: crypto.randomUUID() };
    updateBoxes([...boxes, next]);
    setSelected(next.id);
    setPanel(null);
  }
  function dropLayer(target: string) {
    const id = layerDrag.current;
    layerDrag.current = null;
    if (!id || id === target) return;
    const sourceIndex = boxes.findIndex(item => item.id === id);
    const targetIndex = boxes.findIndex(item => item.id === target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...boxes];
    next.splice(targetIndex, 0, next.splice(sourceIndex, 1)[0]!);
    updateBoxes(next);
  }
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || tool !== "pan" || editingDisabled) return;
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
  }
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pan.current;
    if (start?.id !== event.pointerId) return;
    event.currentTarget.scrollTo(start.left - event.clientX + start.x, start.top - event.clientY + start.y);
  }
  function stopPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (pan.current?.id === event.pointerId) pan.current = null;
  }
  function moveTail(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (tailDrag.current !== event.pointerId) return;
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (point) updateBox(id, { tail: point });
  }
  const changeZoom = (delta: number) => setZoom(value => Math.max(.5, Math.min(3, Math.round((value + delta) * 100) / 100)));
  const layerIndex = visiblePanelBox ? boxes.indexOf(visiblePanelBox) : -1;
  const panelTop = panel ? Math.max(12, Math.min(panel.y, window.innerHeight - (panel.kind === "settings" ? 160 : 318))) : 12;

  return <main aria-label="图文编排" className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#efeeec] text-foreground">
    <PictureBookLayoutHeader title={title} position={position} pages={pages} language={language} originalLabel={originalLabel} editableLanguages={editableLanguages} remainingLanguages={remainingLanguages}
      pending={pending} hasImage={Boolean(imageUrl)} dirty={dirty} enabled={layout.enabled} preview={preview} canImportLanguage={Boolean(captionToImport)} addLanguageCode={languageToAdd} copyLayout={copyLayout}
      onLanguage={selectLanguage} onLanguageChoice={setNewLanguage} onCopyLayout={setCopyLayout} onAddLanguage={addLanguage} onClose={close} onNavigate={page => void navigate(page)}
      onToggle={enabled => setLayout(current => ({ ...current, enabled }))} onPreview={() => { setPanel(null); setPreview(current => !current); }} onSave={() => void doSave()} />
    <PictureBookLayoutTypography box={box} disabled={editingDisabled} onChange={patch => box && updateBoxText(box, patch)} />
    {(error || (!dirty && notice)) && <div role={error ? "alert" : "status"} className={`shrink-0 px-5 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</div>}
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[64px_minmax(0,1fr)_300px] lg:overflow-hidden xl:grid-cols-[72px_minmax(0,1fr)_320px]">
      <nav aria-label="画布工具" className="flex shrink-0 items-center gap-1 border-b border-border bg-background p-2 lg:flex-col lg:border-r lg:border-b-0">
        {([["select", "选择", MousePointer2], ["text", "文本", Type], ["annotation", "标注", MessageSquare]] as const).map(([mode, name, Icon]) =>
          <button key={mode} type="button" title={mode === "select" ? "选择文本区域" : `在画布上添加${name}`} aria-pressed={tool === mode} disabled={editingDisabled} onClick={() => { setPanel(null); setTool(mode); }} className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs hover:bg-muted disabled:opacity-40 lg:min-h-14 ${tool === mode ? selectedStyle : ""}`}><Icon size={20} />{name}</button>)}
        <button type="button" aria-label="导入原有展示文字" title={existingCaption ? "导入原有展示文字" : "本页暂无该语种展示文字"} disabled={editingDisabled || !existingCaption || captionImported} onClick={importCaption} className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs hover:bg-muted disabled:opacity-40 lg:min-h-14"><Import size={20} />导入</button>
        <div className="flex gap-1 lg:mt-auto lg:flex-col">
          <button type="button" title="平移画布" aria-pressed={tool === "pan"} disabled={editingDisabled} onClick={() => { setPanel(null); setTool(tool === "pan" ? "select" : "pan"); }} className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs hover:bg-muted disabled:opacity-40 lg:min-h-14 ${tool === "pan" ? selectedStyle : ""}`}><Hand size={20} />抓手</button>
          <button type="button" title="放大画布" disabled={!imageUrl || zoom >= 3} onClick={() => changeZoom(.25)} className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs hover:bg-muted disabled:opacity-40 lg:min-h-14"><ZoomIn size={20} />缩放</button>
        </div>
      </nav>
      <div ref={stage} className={`relative min-h-[50dvh] min-w-0 overflow-auto lg:min-h-0 ${tool === "pan" && !preview ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan} onLostPointerCapture={stopPan}>
        <div className="flex min-h-full min-w-full w-max items-center justify-center p-6">
          <div ref={canvas} className={`relative shrink-0 ${imageUrl ? "bg-white shadow-md" : ""} ${!editingDisabled && (tool === "text" || tool === "annotation") ? "cursor-crosshair" : ""}`}
            style={{ width: Math.max(1, fittedWidth * zoom), aspectRatio: ratio, containerType: "inline-size" }}
            onClick={event => {
              if (editingDisabled || tool === "pan") return;
              if (tool === "select") { setSelected(""); setPanel(null); return; }
              const point = getCanvasPoint(event.clientX, event.clientY);
              if (point) addBox("", point, tool === "annotation");
            }}>
            {imageUrl ? <img src={imageUrl} alt="绘本页面" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" onLoad={event => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight);
            }} /> : <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">本页还没有图片，请返回绘本添加。</p>}
            <div aria-hidden="true" className="pointer-events-none invisible absolute inset-0 overflow-hidden"><div><div ref={textMeasure} /></div></div>
            {imageUrl && <PictureBookTextOverlay boxes={boxes.filter(item => editingDisabled || tool === "pan" || item.id !== selected)} />}
            {guides?.vertical && <span data-guide="canvas-vertical" aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 z-30 border-l-2 border-amber-400" />}
            {guides?.horizontal && <span data-guide="canvas-horizontal" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 z-30 border-t-2 border-amber-400" />}
            {!editingDisabled && tool !== "pan" && boxes.map((item, index) => <div key={item.id} style={pictureBookBoxPosition(item)}
              className={`group/region absolute ${item.id === selected ? "z-20 ring-1 ring-[#ff5530]" : "z-10 hover:ring-1 hover:ring-[#ff5530]"}`}
              onContextMenu={event => openPanel(event, item.id, "menu")} onClick={event => { event.stopPropagation(); setSelected(item.id); }}>
              {item.id === selected ? <>
                <PictureBookRegionDecoration box={item} canvas={canvasSize} />
                <textarea ref={editorText} value={item.text} maxLength={1000} aria-label={`文本区域 ${index + 1} 内容`} onChange={event => updateBoxText(item, { text: event.target.value })} onPaste={event => pasteText(event, item)}
                  style={{ ...pictureBookBoxTypography(item), top: `${pictureBookRegionVerticalInset(item.shape) * 100}%`, height: `${(1 - 2 * pictureBookRegionVerticalInset(item.shape)) * 100}%` }} className="absolute inset-x-0 w-full resize-none border-0 bg-transparent outline-none" />
                {guides && <>
                  <span data-guide="box-vertical" aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-amber-600" />
                  <span data-guide="box-horizontal" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-amber-600" />
                </>}
                <button type="button" aria-label={`移动文本区域 ${index + 1}`} title="移动文本区域" className="absolute -top-7 left-0 grid size-6 touch-none cursor-move place-items-center rounded border border-[#ef826f] bg-white text-[#a43520]"
                  onPointerDown={event => startDrag(event, item)} onPointerMove={event => moveBox(event, item)} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}><Move size={15} /></button>
                <button type="button" aria-label={`调整文本区域 ${index + 1} 宽度`} title="调整宽度" className="absolute -right-3 -bottom-3 grid size-6 touch-none cursor-ew-resize place-items-center"
                  onPointerDown={event => startResize(event, item)} onPointerMove={event => resizeBox(event, item)} onPointerUp={stopResize} onPointerCancel={stopResize} onLostPointerCapture={stopResize}><span aria-hidden="true" className="size-3 rounded-xs border border-[#e84123] bg-white" /></button>
              </> : <button type="button" aria-label={`选择文本区域 ${index + 1}`} className="h-full w-full" />}
              <button type="button" aria-label={`文本区域 ${index + 1} 规格设置`} title="规格设置" className={`absolute -top-7 right-0 grid size-6 place-items-center rounded border border-border bg-background shadow-sm focus:opacity-100 group-hover/region:opacity-100 ${item.id === selected ? "opacity-100" : "opacity-0"}`}
                onClick={event => openPanel(event, item.id, "settings")}><Settings size={15} /></button>
            </div>)}
            {!editingDisabled && tool !== "pan" && box?.shape && box.tail && <button type="button" title="拖动箭头尖端" aria-label="拖动箭头尖端"
              className="absolute z-30 grid size-7 -translate-1/2 touch-none cursor-move place-items-center" style={{ left: `${box.tail.x * 100}%`, top: `${box.tail.y * 100}%` }}
              onClick={event => event.stopPropagation()} onPointerDown={event => { if (event.button === 0) { event.currentTarget.setPointerCapture(event.pointerId); tailDrag.current = event.pointerId; } }}
              onPointerMove={event => moveTail(event, box.id)} onLostPointerCapture={() => { tailDrag.current = null; }}
              onKeyDown={event => {
                const delta = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }[event.key];
                if (!delta || !box.tail) return;
                event.preventDefault();
                updateBox(box.id, { tail: { x: clampUnit(box.tail.x + delta[0]!), y: clampUnit(box.tail.y + delta[1]!) } });
              }}><span aria-hidden="true" className="size-3 rotate-45 rounded-xs border border-[#8a5d00] bg-[#ffdf62] shadow-sm" /></button>}
          </div>
        </div>
      </div>
      <aside aria-label="文本区域与配音" className="min-w-0 space-y-4 border-t border-border bg-background p-4 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">文本区域</h2><LayoutIconButton label={tool === "annotation" ? "添加标注" : "添加文本区域"} disabled={editingDisabled} onClick={() => addBox("", undefined, tool === "annotation")}><Plus size={19} /></LayoutIconButton></div>
        <div className="space-y-1.5">
          {boxes.map((item, index) => <div key={item.id} onDragOver={event => { if (layerDrag.current) event.preventDefault(); }} onDrop={event => { event.preventDefault(); dropLayer(item.id); }} className={`flex min-w-0 items-center gap-0.5 rounded-md px-1 ${selected === item.id ? selectedStyle : "hover:bg-muted"}`}>
            <span tabIndex={-1} aria-hidden="true" draggable={!editingDisabled} title="拖动调整顺序" onDragStart={event => { layerDrag.current = item.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => { layerDrag.current = null; }} className="grid size-6 shrink-0 cursor-grab place-items-center text-muted-foreground"><GripVertical size={15} /></span>
            <button type="button" disabled={editingDisabled} onClick={() => { setPanel(null); setSelected(item.id); }} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left text-sm" title={item.text || `文本区域 ${index + 1}`}>
              {item.shape ? <MessageSquare className="shrink-0" size={16} /> : <Type className="shrink-0" size={16} />}<span className="truncate">{item.text || `空文本区域 ${index + 1}`}</span>
            </button>
            <LayoutIconButton label={`文本区域 ${index + 1} 参与配音`} pressed={item.speak} disabled={editingDisabled} onClick={() => updateBox(item.id, { speak: !item.speak })}>{item.speak ? <Mic size={16} /> : <MicOff size={16} />}</LayoutIconButton>
            <button type="button" className={layoutIcon} title="更多操作" aria-label={`文本区域 ${index + 1} 更多操作`} disabled={editingDisabled} onClick={event => openPanel(event, item.id, "menu")}><Ellipsis size={19} /></button>
          </div>)}
          {imageUrl && <div className="flex min-h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm text-muted-foreground"><ImageIcon size={16} />绘本图片<Lock className="ml-auto" size={15} /></div>}
        </div>
        {box && overflow && !preview && <p role="status" className="text-sm text-amber-800">部分文字显示不全，请加宽文本区域或减小字号。</p>}
        <fieldset disabled={editingDisabled} className="space-y-3 border-t border-border pt-4">
          <legend className="sr-only">当前语言配音</legend><h2 className="text-sm font-semibold">当前语言配音</h2>
          <VoicePicker label="讲解声音" value={version?.voiceKey ?? voiceKey} voices={voiceOptions} onChange={value => { updateVersion(current => withLayoutVoice(current, value)); onVoiceChange(value); }} />
          {version?.audioUrl && !dirty && <audio controls className="w-full" src={pictureBookPageAudioSource(bookId, position, version.audioUrl, "private", language === "original" ? undefined : language)} />}
          <button type="button" className={`${layoutButton} w-full`} onClick={() => void doGenerate()}><Mic size={16} />{pending ? "处理中…" : version?.audioUrl ? "重新生成语音" : "生成语音"}</button>
        </fieldset>
      </aside>
    </div>
    <footer className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-4 text-sm text-muted-foreground">
      <span>{position === 0 ? "封面" : `第 ${position} 页`} / {pages.filter(page => page !== 0).length} 页</span>
      <div className="flex items-center gap-1"><LayoutIconButton label="缩小画布" disabled={!imageUrl || zoom <= .5} onClick={() => changeZoom(-.25)}><Minus size={16} /></LayoutIconButton><button type="button" title="适应画布" onClick={() => setZoom(1)} disabled={!imageUrl} className={layoutButton}>{zoom === 1 ? "适应画布" : `${Math.round(zoom * 100)}%`}</button><LayoutIconButton label="进一步放大画布" disabled={!imageUrl || zoom >= 3} onClick={() => changeZoom(.25)}><Plus size={16} /></LayoutIconButton></div>
    </footer>
    {panel && visiblePanelBox && !editingDisabled && createPortal(<div ref={panelRef} tabIndex={-1} role="dialog" aria-label={panel.kind === "settings" ? "文本区域规格设置" : "文本区域操作"}
      className="fixed z-50 overflow-auto overscroll-contain rounded-lg border border-border bg-background p-3 text-foreground shadow-lg outline-none"
      style={{ width: Math.min(window.innerWidth - 24, panel.kind === "settings" ? 320 : 208), left: Math.max(12, Math.min(panel.x, window.innerWidth - (panel.kind === "settings" ? 332 : 220))), top: panelTop, maxHeight: `calc(100dvh - ${panelTop + 12}px)` }}>
      {panel.kind === "settings" ? <PictureBookRegionSettings box={visiblePanelBox} onChange={patch => applySettings(visiblePanelBox, patch)} onClose={() => { setPanel(null); panelOrigin.current?.focus(); }} /> : <>
        <button type="button" className={menuItem} onClick={() => openSettings(visiblePanelBox)}><Settings size={16} />规格设置</button>
        <p className="mt-1 border-t border-border px-2 pt-2 text-xs text-muted-foreground">对齐画布</p>
        <button type="button" className={menuItem} onClick={() => alignToCanvas(visiblePanelBox, "x")}><AlignHorizontalJustifyCenter size={16} />水平居中</button>
        <button type="button" className={menuItem} onClick={() => alignToCanvas(visiblePanelBox, "y")}><AlignVerticalJustifyCenter size={16} />垂直居中</button>
        <div className="my-1 border-t border-border" />
        <button type="button" className={menuItem} disabled={layerIndex === 0} onClick={() => { reorder(layerIndex, -1); setPanel(null); }}><ArrowUp size={16} />上移</button>
        <button type="button" className={menuItem} disabled={layerIndex === boxes.length - 1} onClick={() => { reorder(layerIndex, 1); setPanel(null); }}><ArrowDown size={16} />下移</button>
        <button type="button" className={menuItem} onClick={() => duplicate(visiblePanelBox)}><Copy size={16} />复制文本区域</button>
        <button type="button" className={`${menuItem} text-red-700`} onClick={() => { updateBoxes(boxes.filter(item => item.id !== visiblePanelBox.id)); setSelected(""); setPanel(null); }}><Trash2 size={16} />删除文本区域</button>
      </>}
    </div>, document.body)}
  </main>;
}
