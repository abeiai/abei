"use client";
import { useEffect, useRef, useState } from "react";
import { pictureBookLanguageChoices, pictureBookLanguageName } from "@/lib/picture-book-languages";
import { layoutNarration, withLayoutVoice, type PictureBookTextBox, type PictureBookTextLayout } from "@/lib/picture-book-text-layout";
import { pictureBookPageAudioSource } from "@/lib/picture-book-audio";
import { VoicePicker } from "@/components/audio/voice-picker";
import type { VoicePickerOption } from "@/lib/voice-picker";
import { PictureBookTextOverlay } from "./picture-book-text-overlay";

type Props = {
  bookId: string; position: number; imageUrl: string; initial?: PictureBookTextLayout;
  legacyCaption: string; voiceKey: string; voiceOptions: VoicePickerOption[]; onVoiceChange: (value: string) => void; onClose: () => void; onSaved: (layout: PictureBookTextLayout) => void;
  previous: number | null; next: number | null; onNavigate: (position: number) => void;
  save: (layout: PictureBookTextLayout, baseline: string) => Promise<PictureBookTextLayout>;
  generate: (language: string, selectedVoice: string, narration: string) => Promise<PictureBookTextLayout | null>;
};
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50";
export function PictureBookTextEditor({ bookId, position, imageUrl, initial, legacyCaption, voiceKey, voiceOptions, onVoiceChange, onClose, onSaved, previous, next, onNavigate, save, generate }: Props) {
  const [layout, setLayout] = useState<PictureBookTextLayout>(initial ?? { enabled: false, versions: [{ language: "original", boxes: [], audioUrl: null }] });
  const [baseline, setBaseline] = useState(JSON.stringify(initial ?? null));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial ?? { enabled: false, versions: [{ language: "original", boxes: [], audioUrl: null }] }));
  const [language, setLanguage] = useState("original");
  const [selected, setSelected] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const [copyLayout, setCopyLayout] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ratio, setRatio] = useState(1);
  const leaving = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const resize = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const editorText = useRef<HTMLTextAreaElement>(null);
  const [overflow, setOverflow] = useState(false);
  const version = layout.versions.find(item => item.language === language);
  const boxes = version?.boxes ?? [];
  const box = boxes.find(item => item.id === selected);
  const dirty = JSON.stringify(layout) !== savedSnapshot;
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
  function updateBoxes(next: PictureBookTextBox[]) { setLayout(current => ({ ...current, versions: current.versions.map(item => item.language === language ? { ...item, boxes: next } : item) })); }
  function updateBox(id: string, patch: Partial<PictureBookTextBox>) { updateBoxes(boxes.map(item => item.id === id ? { ...item, ...patch } : item)); }
  function addBox(text = "") {
    const id = crypto.randomUUID();
    updateBoxes([...boxes, { id, text, x: .1, y: .1 + (boxes.length % 6) * .1, width: .5, height: .2, fontSize: 32, fontFamily: "sans", color: "#222222", bold: false, align: "left", lineHeight: 1.5, speak: true, zIndex: 0 }]); setSelected(id);
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
  function close() { if (dirty && !window.confirm("图文编排尚未保存，确定返回吗？")) return; leaving.current = true; onClose(); }
  async function navigate(target: number) {
    setPending(true); setError("");
    try { if (dirty) await persist(); leaving.current = true; onNavigate(target); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试"); setPending(false); }
  }
  function addLanguage() {
    if (layout.versions.some(item => item.language === newLanguage)) { setLanguage(newLanguage); return; }
    setLayout(current => ({ ...current, versions: [...current.versions, { language: newLanguage, boxes: copyLayout ? boxes.map(item => ({ ...item, id: crypto.randomUUID(), text: "" })) : [], audioUrl: null }] })); setLanguage(newLanguage); setNewLanguage(pictureBookLanguageChoices.find(item => item.code !== newLanguage && !layout.versions.some(version => version.language === item.code))?.code ?? newLanguage); setSelected("");
  }
  return <main aria-label="图文编排" className="flex h-dvh min-h-0 w-full flex-col bg-[#f6f6f5] text-foreground">
    <header className="flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3"><button type="button" className={button} disabled={pending} onClick={close}>返回绘本</button><h1 className="text-lg font-semibold">图文编排 · {position === 0 ? "封面" : `第 ${position} 页`}</h1><button type="button" className={button} disabled={pending || previous === null} onClick={() => previous !== null && void navigate(previous)}>上一页</button><button type="button" className={button} disabled={pending || next === null} onClick={() => next !== null && void navigate(next)}>下一页</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={layout.enabled} onChange={event => setLayout({ ...layout, enabled: event.target.checked })} />开启图文编排</label><span className="ml-auto text-sm text-muted-foreground">{dirty ? "未保存" : "已保存"}</span><button type="button" className={button} disabled={pending || !dirty} onClick={() => void doSave()}>保存</button></header>
    {(error || (!dirty && notice)) && <div role={error ? "alert" : "status"} className={`px-5 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</div>}
    <fieldset disabled={pending} className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
      <section className="flex min-h-[55vh] flex-col overflow-auto p-4 lg:min-h-0 lg:p-6"><div className="mb-3 flex flex-wrap items-center gap-3"><button type="button" className={button} onClick={() => addBox()}>添加文本框</button>{legacyCaption && language === "original" ? <button type="button" className={button} onClick={() => addBox(legacyCaption)}>导入原有展示文字</button> : null}<span className="text-sm text-muted-foreground">拖动文本框顶部移动位置</span></div>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-[#e8e8e6] p-4">
          <div ref={canvas} className="relative max-w-full overflow-visible bg-white shadow-lg" style={{ width: `min(100%, ${Math.max(35, Math.min(160, 68 * ratio))}vh)`, aspectRatio: String(ratio), containerType: "inline-size" }}>
            <img src={imageUrl} alt="绘本页面" className="absolute inset-0 h-full w-full object-contain" onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight); }} />
            <PictureBookTextOverlay boxes={boxes.filter(item => item.id !== selected)} />
            {boxes.map((item, index) => <div key={item.id} className={`absolute ${selected === item.id ? "z-20 border-2 border-primary" : "z-10 border border-transparent hover:border-primary"}`} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%` }} onClick={() => setSelected(item.id)}>
              {selected === item.id ? <><button type="button" aria-label={`移动文本框 ${index + 1}`} className="absolute -top-7 left-0 cursor-move rounded-t bg-primary px-2 py-1 text-xs text-primary-foreground" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.id, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y }; }} onPointerMove={event => { if (!drag.current || !canvas.current) return; const rect = canvas.current.getBoundingClientRect(); updateBox(item.id, { x: Math.max(0, Math.min(1 - item.width, drag.current.x + (event.clientX - drag.current.startX) / rect.width)), y: Math.max(0, Math.min(1 - item.height, drag.current.y + (event.clientY - drag.current.startY) / rect.height)) }); }} onPointerUp={() => { drag.current = null; }}>移动 {index + 1}</button><textarea ref={editorText} maxLength={1000} aria-label={`文本框 ${index + 1} 内容`} value={item.text} onChange={event => updateBox(item.id, { text: event.target.value })} className="h-full w-full resize-none bg-transparent p-0 outline-none" style={{ fontSize: `${item.fontSize / 10}cqw`, fontFamily: item.fontFamily === "serif" ? "serif" : "sans-serif", color: item.color, fontWeight: item.bold ? 700 : 400, textAlign: item.align, lineHeight: item.lineHeight }} /><button type="button" aria-label={`调整文本框 ${index + 1} 大小`} className="absolute -bottom-2 -right-2 size-5 cursor-nwse-resize rounded border-2 border-white bg-primary" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); resize.current = { startX: event.clientX, startY: event.clientY, width: item.width, height: item.height }; }} onPointerMove={event => { if (!resize.current || !canvas.current) return; const rect = canvas.current.getBoundingClientRect(); updateBox(item.id, { width: Math.max(.01, Math.min(1 - item.x, resize.current.width + (event.clientX - resize.current.startX) / rect.width)), height: Math.max(.01, Math.min(1 - item.y, resize.current.height + (event.clientY - resize.current.startY) / rect.height)) }); }} onPointerUp={() => { resize.current = null; }} /></> : <button type="button" aria-label={`选择文本框 ${index + 1}`} className="h-full w-full" />}
            </div>)}
          </div>
        </div>
      </section>
      <aside className="space-y-5 overflow-y-auto border-l bg-background p-5"><div><label className="block text-sm font-semibold">编辑语言</label><select className={`${input} mt-2`} value={language} onChange={event => { setLanguage(event.target.value); setSelected(""); }}>{layout.versions.map(item => <option key={item.language} value={item.language}>{item.language === "original" ? "中文" : pictureBookLanguageName(item.language)}</option>)}</select><div className="mt-3 flex gap-2"><select aria-label="新增语言" className={`${input} min-w-0 flex-1`} value={newLanguage} onChange={event => setNewLanguage(event.target.value)}>{pictureBookLanguageChoices.filter(item => !layout.versions.some(version => version.language === item.code)).map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select><button type="button" className={`${button} shrink-0 whitespace-nowrap`} onClick={addLanguage}>添加</button></div><label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={copyLayout} onChange={event => setCopyLayout(event.target.checked)} />复制当前语言布局</label></div>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">文本框顺序</h3><button type="button" className={button} onClick={() => addBox()}>添加</button></div><div className="space-y-2">{boxes.map((item, index) => <div key={item.id} className={`flex items-center gap-1 rounded-lg border p-2 ${item.id === selected ? "border-primary" : "border-border"}`}><button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setSelected(item.id)}>{index + 1}. {item.text || "空文本框"}</button><button type="button" aria-label="上移" className={button} disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" aria-label="下移" className={button} disabled={index === boxes.length - 1} onClick={() => reorder(index, 1)}>↓</button></div>)}</div></div>
        {box && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">文本框设置</h3>{overflow ? <p role="status" className="text-sm text-amber-700">文字超出文本框，请调整大小或字号。</p> : null}<label className="block text-sm">内容<textarea maxLength={1000} className={`${input} mt-1`} rows={3} value={box.text} onChange={event => updateBox(box.id, { text: event.target.value })} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">字体<select className={`${input} mt-1`} value={box.fontFamily} onChange={event => updateBox(box.id, { fontFamily: event.target.value as "sans" | "serif" })}><option value="sans">黑体</option><option value="serif">宋体</option></select></label><label className="text-sm">字号<input className={`${input} mt-1`} type="number" min="8" max="160" value={box.fontSize} onChange={event => updateBox(box.id, { fontSize: Math.max(8, Math.min(160, Number(event.target.value))) })} /></label><label className="text-sm">颜色<input className={`${input} mt-1 h-10`} type="color" value={box.color} onChange={event => updateBox(box.id, { color: event.target.value })} /></label><label className="text-sm">对齐<select className={`${input} mt-1`} value={box.align} onChange={event => updateBox(box.id, { align: event.target.value as "left" | "center" | "right" })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>{(["x", "y", "width", "height"] as const).map(key => <label key={key} className="text-sm">{{ x: "横向位置", y: "纵向位置", width: "宽度", height: "高度" }[key]} %<input className={`${input} mt-1`} type="number" min={key === "width" || key === "height" ? 1 : 0} max="100" value={Math.round(box[key] * 100)} onChange={event => { const value = Number(event.target.value) / 100; const limit = key === "x" ? 1 - box.width : key === "y" ? 1 - box.height : key === "width" ? 1 - box.x : 1 - box.y; updateBox(box.id, { [key]: Math.max(key === "width" || key === "height" ? .01 : 0, Math.min(limit, value)) }); }} /></label>)}</div><label className="block text-sm">行高<input className={`${input} mt-1`} type="number" min="0.8" max="3" step="0.1" value={box.lineHeight} onChange={event => updateBox(box.id, { lineHeight: Math.max(.8, Math.min(3, Number(event.target.value))) })} /></label><label className="block text-sm">显示层级<input className={`${input} mt-1`} type="number" min="0" max="100" value={box.zIndex ?? 0} onChange={event => updateBox(box.id, { zIndex: Math.max(0, Math.min(100, Number(event.target.value))) })} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={box.bold} onChange={event => updateBox(box.id, { bold: event.target.checked })} />加粗</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={box.speak} onChange={event => updateBox(box.id, { speak: event.target.checked })} />参与配音</label><div className="flex gap-2"><button type="button" className={button} onClick={() => { const id = crypto.randomUUID(); updateBoxes([...boxes, { ...box, id, x: Math.min(box.x + .03, 1 - box.width), y: Math.min(box.y + .03, 1 - box.height) }]); setSelected(id); }}>复制</button><button type="button" className={button} onClick={() => { updateBoxes(boxes.filter(item => item.id !== box.id)); setSelected(""); }}>删除</button></div></div>}
        <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">当前语言配音</h3><VoicePicker label="讲解声音" value={version?.voiceKey ?? voiceKey} voices={voiceOptions} onChange={value => { setLayout(current => ({ ...current, versions: current.versions.map(item => item.language === language ? withLayoutVoice(item, value) : item) })); onVoiceChange(value); }} />{version?.audioUrl && !dirty ? <audio controls className="w-full" src={pictureBookPageAudioSource(bookId, position, version.audioUrl, "private", language === "original" ? undefined : language)} /> : null}<button type="button" className={button} disabled={pending} onClick={() => void doGenerate()}>{pending ? "处理中…" : version?.audioUrl ? "重新生成语音" : "生成语音"}</button></div>
      </aside>
    </fieldset>
  </main>;
}
