"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { pictureBookLanguageName } from "@/lib/picture-book-languages";
import { fitPictureBookTextBox, layoutNarration, placePictureBookCaption, snapPictureBookTextBox, withLayoutVoice, type PictureBookTextBox, type PictureBookTextLayout, type PictureBookTextVersion } from "@/lib/picture-book-text-layout";
import { pictureBookPageAudioSource } from "@/lib/picture-book-audio";
import { VoicePicker } from "@/components/audio/voice-picker";
import type { VoicePickerOption } from "@/lib/voice-picker";
import { pictureBookBoxTypography, PictureBookTextOverlay } from "./picture-book-text-overlay";

type Props = {
  bookId: string; position: number; imageUrl: string; initial?: PictureBookTextLayout;
  bookLayoutEnabled: boolean; needsBookLayoutSync: boolean;
  initialLanguage: string; languages: string[]; originalLabel: string; getCaption: (language: string) => string; onLanguageChange: (language: string) => void;
  voiceKey: string; voiceOptions: VoicePickerOption[]; onVoiceChange: (value: string) => void; onClose: (language: string) => void; onSaved: (layout: PictureBookTextLayout) => void;
  previous: number | null; next: number | null; onNavigate: (position: number, language: string) => void;
  save: (layout: PictureBookTextLayout, baseline: string) => Promise<PictureBookTextLayout>;
  generate: (language: string, selectedVoice: string, narration: string) => Promise<PictureBookTextLayout | null>;
};
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50";

function newTextBox(text: string, index = 0): PictureBookTextBox {
  return { id: crypto.randomUUID(), text, x: .1, y: .1 + (index % 6) * .1, width: .5, height: .2, fontSize: 24, fontFamily: "sans", color: "#222222", bold: false, align: "justify", lineHeight: 1.5, speak: true, zIndex: 0 };
}

export function PictureBookTextEditor({ bookId, position, imageUrl, initial, initialLanguage, languages, originalLabel, getCaption, onLanguageChange, bookLayoutEnabled, needsBookLayoutSync, voiceKey, voiceOptions, onVoiceChange, onClose, onSaved, previous, next, onNavigate, save, generate }: Props) {
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
  const textMeasure = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);
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
  const dirty = JSON.stringify(layout) !== savedSnapshot || needsBookLayoutSync;
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
  }, [box, ratio]);
  function selectLanguage(next: string) { setLanguage(next); setSelected(""); onLanguageChange(next); }
  function updateVersion(change: (version: PictureBookTextVersion) => PictureBookTextVersion) {
    setLayout(current => {
      const currentVersion = current.versions.find(item => item.language === language);
      const next = change(currentVersion ?? { language, boxes: [], audioUrl: null });
      return { ...current, versions: currentVersion ? current.versions.map(item => item === currentVersion ? next : item) : [...current.versions, next] };
    });
  }
  function updateBoxes(next: PictureBookTextBox[]) { updateVersion(current => ({ ...current, boxes: next })); }
  function updateBox(id: string, patch: Partial<PictureBookTextBox>) { updateBoxes(boxes.map(item => item.id === id ? { ...item, ...patch } : item)); }
  function fitText(box: PictureBookTextBox) {
    const measure = textMeasure.current;
    const canvasHeight = canvas.current?.getBoundingClientRect().height;
    if (!measure || !canvasHeight) return box;
    Object.assign(measure.style, pictureBookBoxTypography(box), { width: `${box.width * 100}%` });
    // The zero-width space keeps the editable line after a trailing newline measurable.
    measure.textContent = `${box.text}\u200b`;
    return fitPictureBookTextBox(box, Math.ceil(measure.getBoundingClientRect().height + 1), canvasHeight);
  }
  function updateBoxText(box: PictureBookTextBox, patch: Partial<PictureBookTextBox>) {
    const fitted = fitText({ ...box, ...patch });
    if (patch.width !== undefined && patch.width < box.width && fitted.height === 1) return;
    updateBox(box.id, fitted);
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, box: PictureBookTextBox) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: box.x, y: box.y };
    setGuides({ vertical: Math.abs(box.x + box.width / 2 - .5) < .00001, horizontal: Math.abs(box.y + box.height / 2 - .5) < .00001 });
  }
  function moveBox(event: ReactPointerEvent<HTMLButtonElement>, box: PictureBookTextBox) {
    const start = drag.current;
    const rect = canvas.current?.getBoundingClientRect();
    if (start?.pointerId !== event.pointerId || !rect?.width || !rect.height) return;
    const { x, y, vertical, horizontal } = snapPictureBookTextBox(start.x + (event.clientX - start.startX) / rect.width, start.y + (event.clientY - start.startY) / rect.height, box, rect.width, rect.height);
    setGuides({ vertical, horizontal });
    updateBox(box.id, { x, y });
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
  function addBox(text = "") {
    const next = fitText(newTextBox(text, boxes.length));
    updateBoxes([...boxes, next]);
    setSelected(next.id);
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
    if (!layoutNarration(boxes)) { setError("请先选择并填写要配音的文本框"); return; }
    setPending(true); setError("");
    try { await persist(); const updated = await generate(language, version?.voiceKey ?? voiceKey, layoutNarration(boxes)); if (updated) { setLayout(updated); setBaseline(JSON.stringify(updated)); setSavedSnapshot(JSON.stringify(updated)); onSaved(updated); setNotice("语音已生成"); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "语音生成失败"); } finally { setPending(false); }
  }
  function close() { if (dirty && !window.confirm("图文编排尚未保存，确定返回吗？")) return; leaving.current = true; onClose(language); }
  async function navigate(target: number) {
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
  return <main aria-label="图文编排" className="flex h-dvh min-h-0 w-full flex-col bg-[#f6f6f5] text-foreground">
    <header className="flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3"><button type="button" className={button} disabled={pending} onClick={close}>返回绘本</button><h1 className="text-lg font-semibold">图文编排 · {position === 0 ? "封面" : `第 ${position} 页`}</h1><button type="button" className={button} disabled={pending || previous === null} onClick={() => previous !== null && void navigate(previous)}>上一页</button><button type="button" className={button} disabled={pending || next === null} onClick={() => next !== null && void navigate(next)}>下一页</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={layout.enabled} onChange={event => setLayout({ ...layout, enabled: event.target.checked })} />全书开启图文编排</label><span className="ml-auto text-sm text-muted-foreground">{dirty ? "未保存" : "已保存"}</span><button type="button" className={button} disabled={pending || !dirty} onClick={() => void doSave()}>保存</button></header>
    {(error || (!dirty && notice)) && <div role={error ? "alert" : "status"} className={`px-5 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</div>}
    <fieldset disabled={pending} className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
      <section className="flex min-h-[55vh] flex-col overflow-auto p-4 lg:min-h-0 lg:p-6"><div className="mb-3 flex flex-wrap items-center gap-3"><button type="button" className={button} onClick={() => addBox()}>添加文本框</button><button type="button" className={button} disabled={!existingCaption || captionImported} onClick={importCaption}>导入原有展示文字</button><span className="text-sm text-muted-foreground">拖动文本框顶部移动位置</span></div>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-[#e8e8e6] p-4">
          <div ref={canvas} className="relative max-w-full overflow-visible bg-white shadow-lg" style={{ width: `min(100%, ${Math.max(35, Math.min(160, 68 * ratio))}vh)`, aspectRatio: String(ratio), containerType: "inline-size" }}>
            <img src={imageUrl} alt="绘本页面" className="absolute inset-0 h-full w-full object-contain" onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight); }} />
            <div className="pointer-events-none invisible absolute inset-0 overflow-hidden" aria-hidden="true"><div ref={textMeasure} /></div>
            <PictureBookTextOverlay boxes={boxes.filter(item => item.id !== selected)} />
            {guides?.vertical ? <span data-guide="canvas-vertical" aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 z-30 border-l-2 border-amber-400" /> : null}
            {guides?.horizontal ? <span data-guide="canvas-horizontal" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 z-30 border-t-2 border-amber-400" /> : null}
            {boxes.map((item, index) => <div
              key={item.id}
              className={`absolute ${selected === item.id ? "z-20 ring-2 ring-primary" : "z-10 ring-1 ring-transparent hover:ring-primary"}`}
              style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%` }}
              onClick={() => setSelected(item.id)}
            >
              {selected === item.id ? <>
                {guides ? <>
                  <span data-guide="box-vertical" aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-amber-600" />
                  <span data-guide="box-horizontal" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-amber-600" />
                </> : null}
                <button
                  type="button" aria-label={`移动文本框 ${index + 1}`}
                  className="absolute -top-7 left-0 touch-none cursor-move select-none rounded-t bg-primary px-2 py-1 text-xs text-primary-foreground"
                  onPointerDown={event => startDrag(event, item)} onPointerMove={event => moveBox(event, item)}
                  onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
                >移动 {index + 1}</button>
                <textarea
                  ref={editorText} maxLength={1000} aria-label={`文本框 ${index + 1} 内容`} value={item.text}
                  onChange={event => updateBoxText(item, { text: event.target.value })}
                  className="block h-full w-full resize-none border-0 bg-transparent p-0 outline-none"
                  style={pictureBookBoxTypography(item)}
                />
                <button
                  type="button" aria-label={`调整文本框 ${index + 1} 宽度`}
                  className="absolute -bottom-2 -right-2 size-5 touch-none cursor-ew-resize rounded border-2 border-white bg-primary"
                  onPointerDown={event => startResize(event, item)} onPointerMove={event => resizeBox(event, item)}
                  onPointerUp={stopResize} onPointerCancel={stopResize} onLostPointerCapture={stopResize}
                />
              </> : <button type="button" aria-label={`选择文本框 ${index + 1}`} className="h-full w-full" />}
            </div>)}
          </div>
        </div>
      </section>
      <aside className="space-y-5 overflow-y-auto border-l bg-background p-5">
        <div>
          <label className="block text-sm font-semibold">编辑语言
            <select className={`${input} mt-2 font-normal`} value={language} onChange={event => selectLanguage(event.target.value)}>
              {editableLanguages.map(code => <option key={code} value={code}>{code === "original" ? originalLabel : pictureBookLanguageName(code)}</option>)}
            </select>
          </label>
          {languageToAdd ? <><div className="mt-3 flex gap-2">
            <select aria-label="新增语言" className={`${input} min-w-0 flex-1`} value={languageToAdd} onChange={event => setNewLanguage(event.target.value)}>
              {remainingLanguages.map(code => <option key={code} value={code}>{pictureBookLanguageName(code)}</option>)}
            </select>
            <button type="button" className={`${button} shrink-0 whitespace-nowrap`} disabled={copyLayout && !captionToImport} onClick={addLanguage}>添加语言</button>
          </div><label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={copyLayout} onChange={event => setCopyLayout(event.target.checked)} />复用文本布局</label></> : null}
          {languageToAdd && copyLayout && !captionToImport ? <p role="status" className="mt-2 text-sm text-muted-foreground">本页暂无{pictureBookLanguageName(languageToAdd)}展示文字，请先返回绘本填写，或取消复用后手动添加。</p> : null}
        </div>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">文本框顺序</h3><button type="button" className={button} onClick={() => addBox()}>添加</button></div><div className="space-y-2">{boxes.map((item, index) => <div key={item.id} className={`flex items-center gap-1 rounded-lg border p-2 ${item.id === selected ? "border-primary" : "border-border"}`}><button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setSelected(item.id)}>{index + 1}. {item.text || "空文本框"}</button><button type="button" aria-label="上移" className={button} disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" aria-label="下移" className={button} disabled={index === boxes.length - 1} onClick={() => reorder(index, 1)}>↓</button></div>)}</div></div>
        {box && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">文本框设置</h3>{overflow ? <p role="status" className="text-sm text-amber-700">部分文字显示不全，请加宽文本框或减小字号。</p> : null}<label className="block text-sm">内容<textarea maxLength={1000} className={`${input} mt-1`} rows={3} value={box.text} onChange={event => updateBoxText(box, { text: event.target.value })} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">字体<select className={`${input} mt-1`} value={box.fontFamily} onChange={event => updateBoxText(box, { fontFamily: event.target.value as "sans" | "serif" })}><option value="sans">黑体</option><option value="serif">宋体</option></select></label><label className="text-sm">字号<input className={`${input} mt-1`} type="number" min="8" max="160" value={box.fontSize} onChange={event => updateBoxText(box, { fontSize: Math.max(8, Math.min(160, Number(event.target.value))) })} /></label><label className="text-sm">颜色<input className={`${input} mt-1 h-10`} type="color" value={box.color} onChange={event => updateBox(box.id, { color: event.target.value })} /></label><label className="text-sm">对齐<select className={`${input} mt-1`} value={box.align} onChange={event => updateBox(box.id, { align: event.target.value as PictureBookTextBox["align"] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="justify">两端对齐</option></select></label>{(["x", "y", "width"] as const).map(key => <label key={key} className="text-sm">{{ x: "横向位置", y: "纵向位置", width: "宽度" }[key]} %<input className={`${input} mt-1`} type="number" min={key === "width" ? 1 : 0} max="100" value={Math.round(box[key] * 100)} onChange={event => {
          const value = Number(event.target.value) / 100;
          if (key === "width") updateBoxText(box, { width: Math.max(.01, Math.min(1 - box.x, value)) });
          else updateBox(box.id, { [key]: Math.max(0, Math.min(key === "x" ? 1 - box.width : 1 - box.height, value)) });
        }} /></label>)}<label className="text-sm">高度 %<input className={`${input} mt-1 bg-muted`} type="number" readOnly value={Math.round(box.height * 100)} /></label></div><label className="block text-sm">行高<input className={`${input} mt-1`} type="number" min="0.8" max="3" step="0.1" value={box.lineHeight} onChange={event => updateBoxText(box, { lineHeight: Math.max(.8, Math.min(3, Number(event.target.value))) })} /></label><label className="block text-sm">显示层级<input className={`${input} mt-1`} type="number" min="0" max="100" value={box.zIndex ?? 0} onChange={event => updateBox(box.id, { zIndex: Math.max(0, Math.min(100, Number(event.target.value))) })} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={box.bold} onChange={event => updateBoxText(box, { bold: event.target.checked })} />加粗</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={box.speak} onChange={event => updateBox(box.id, { speak: event.target.checked })} />参与配音</label><div className="flex gap-2"><button type="button" className={button} onClick={() => { const id = crypto.randomUUID(); updateBoxes([...boxes, { ...box, id, x: Math.min(box.x + .03, 1 - box.width), y: Math.min(box.y + .03, 1 - box.height) }]); setSelected(id); }}>复制</button><button type="button" className={button} onClick={() => { updateBoxes(boxes.filter(item => item.id !== box.id)); setSelected(""); }}>删除</button></div></div>}
        <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">当前语言配音</h3><VoicePicker label="讲解声音" value={version?.voiceKey ?? voiceKey} voices={voiceOptions} onChange={value => { updateVersion(current => withLayoutVoice(current, value)); onVoiceChange(value); }} />{version?.audioUrl && !dirty ? <audio controls className="w-full" src={pictureBookPageAudioSource(bookId, position, version.audioUrl, "private", language === "original" ? undefined : language)} /> : null}<button type="button" className={button} disabled={pending} onClick={() => void doGenerate()}>{pending ? "处理中…" : version?.audioUrl ? "重新生成语音" : "生成语音"}</button></div>
      </aside>
    </fieldset>
  </main>;
}
