"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Trophy, X } from "lucide-react";
import { containsSound, tokenizePhonetic, type Phoneme } from "@/lib/yinbiao/catalog";

type Entry = { word: string; phonetic: string; meaning: string };
const cache = new Map<string, Record<string, Entry>>();
const storagePrefix = "xueleai.yinbiao.same-sound.v1.";
export function SameSoundGame({ phoneme, speak, stop }: { phoneme: Phoneme; speak: (word: string) => void; stop: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [accepted, setAccepted] = useState<Entry[]>([]);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rejected, setRejected] = useState<Entry | null>(null);
  const [fading, setFading] = useState(false);
  const [ready, setReady] = useState(false);
  const passed = accepted.length >= 10;
  useEffect(() => {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(storagePrefix + phoneme.id) ?? "[]");
      const saved = data && typeof data === "object" && !Array.isArray(data) ? data as { accepted?: unknown; completedRounds?: unknown } : null;
      const entries = Array.isArray(data) ? data : saved?.accepted;
      if (Array.isArray(entries)) {
        const unique = new Map<string, Entry>();
        for (const item of entries) {
          if (item && typeof item.word === "string" && /^[a-z]{1,30}$/.test(item.word) && typeof item.phonetic === "string" && typeof item.meaning === "string" && containsSound(tokenizePhonetic(item.phonetic), phoneme.symbol)) unique.set(item.word, item);
        }
        const restored = [...unique.values()].slice(0, 10);
        setAccepted(restored);
        const rounds = typeof saved?.completedRounds === "number" && Number.isSafeInteger(saved.completedRounds) && saved.completedRounds >= 0 ? saved.completedRounds : 0;
        setCompletedRounds(Math.max(rounds, restored.length === 10 ? 1 : 0));
      }
    } catch { /* 本地存储不可用时仍可练习。 */ }
    setReady(true);
    return () => { request.current++; timers.current.forEach(clearTimeout); };
  }, [phoneme.id, phoneme.symbol]);
  function saveProgress(entries: Entry[], rounds: number) {
    try { localStorage.setItem(storagePrefix + phoneme.id, JSON.stringify({ accepted: entries, completedRounds: rounds })); } catch { /* 进度保留在当前会话。 */ }
  }
  function startNextRound() {
    if (!passed) return;
    request.current++;
    timers.current.forEach(clearTimeout);
    stop();
    setAccepted([]);
    setInput("");
    setRejected(null);
    setFading(false);
    setBusy(false);
    setMessage(`第 ${completedRounds + 1} 轮开始！`);
    saveProgress([], completedRounds);
    timers.current = [setTimeout(() => inputRef.current?.focus(), 0)];
  }
  function close() {
    request.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setBusy(false);
    setRejected(null);
    setMessage("");
    setInput("");
    stop();
    dialog.current?.close();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || passed) return;
    const word = input.trim().toLowerCase();
    if (!/^[a-z]{1,30}$/.test(word)) { setMessage("请输入一个英文单词，仅限字母。"); return; }
    if (accepted.some((item) => item.word === word)) { speak(word); setMessage("这个词已经答对了，换一个吧。"); return; }
    timers.current.forEach(clearTimeout);
    setRejected(null);
    setFading(false);
    setMessage("");
    setBusy(true);
    const token = ++request.current;
    try {
      let shard = cache.get(word[0]);
      if (!shard) {
        const response = await fetch(`/yinbiao/dictionary/${word[0]}.json`);
        if (!response.ok) throw new Error("dictionary");
        shard = await response.json() as Record<string, Entry>;
        cache.set(word[0], shard);
      }
      if (token !== request.current) return;
      const entry = Object.hasOwn(shard, word) ? shard[word] : undefined;
      speak(word);
      setInput("");
      if (entry && containsSound(tokenizePhonetic(entry.phonetic), phoneme.symbol)) {
        const next = [...accepted, entry];
        setAccepted(next);
        const rounds = completedRounds + (next.length === 10 ? 1 : 0);
        setCompletedRounds(rounds);
        saveProgress(next, rounds);
        setMessage(next.length === 10 ? "已答对 10 个不同单词，挑战通过！" : `答对了！已完成 ${next.length}/10。`);
      } else {
        setRejected(entry ?? { word, phonetic: "", meaning: "词库未收录，无法提供释义或判定读音。" });
        setMessage(entry ? `这个词不含 /${phoneme.symbol}/。` : "未收录的单词不计入成绩。");
        timers.current = [setTimeout(() => setFading(true), 2500), setTimeout(() => setRejected(null), 3100)];
      }
    } catch {
      if (token === request.current) setMessage("词库加载失败，请重试。");
    } finally {
      if (token === request.current) { setBusy(false); inputRef.current?.focus(); }
    }
  }
  return <>
    <button disabled={!ready} onClick={() => { stop(); dialog.current?.showModal(); inputRef.current?.focus(); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-40 ${completedRounds > 0 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
      {completedRounds > 0 ? <Trophy className="size-4" /> : null}同音有词{completedRounds > 0 ? ` · 已完成 ${completedRounds} 轮` : ""}{!passed && ` · ${accepted.length}/10`}
    </button>
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }} aria-labelledby={`same-sound-${phoneme.id}`} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/45">
      <div className="p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-muted-foreground">同音有词</p><h2 id={`same-sound-${phoneme.id}`} className="mt-2 text-5xl" style={{ fontFamily: "Arial, sans-serif" }}>/{phoneme.symbol}/</h2></div>
          <button aria-label="关闭同音有词" onClick={close} className="rounded-lg p-2 hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="mt-5 flex items-center justify-between text-sm"><span>第 {passed ? completedRounds : completedRounds + 1} 轮 · {passed ? "挑战通过" : "输入含有此音标的单词"}</span><span className="font-semibold">{accepted.length}/10</span></div>
        <progress max={10} value={accepted.length} aria-label="答对单词数量" className="mt-2 h-2 w-full accent-emerald-600" />
        {passed ? <div className="mt-5 flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-amber-800"><Trophy className="size-6" /><div className="flex-1"><p>已完成 {completedRounds} 轮！</p><button onClick={startNextRound} className="mt-2 rounded-lg bg-amber-800 px-3 py-2 text-sm font-medium text-white hover:bg-amber-900">开始新一轮</button></div></div> : <form onSubmit={submit} className="mt-5 flex gap-2">
          <input ref={inputRef} aria-label="输入英文单词" value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={30} placeholder="输入单词，按回车确认" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-3 outline-none focus:ring-2 focus:ring-emerald-600" />
          <button disabled={busy} className="rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">{busy ? "查询中" : "确认"}</button>
        </form>}
        <p role="status" className="mt-3 min-h-5 text-sm text-muted-foreground">{message}</p>
        {rejected && <div className={`mt-3 rounded-xl border border-red-200 bg-red-50 p-3 transition-all duration-500 motion-reduce:transition-none ${fading ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}><p className="font-semibold text-red-800">{rejected.word}</p>{rejected.phonetic && <p className="mt-1 text-xs text-red-700">/{rejected.phonetic}/</p>}<p className="mt-1 text-xs leading-5 text-red-700">{rejected.meaning}</p></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{accepted.map((entry) => <button key={entry.word} onClick={() => speak(entry.word)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left"><span className="flex items-center justify-between gap-2 font-semibold text-emerald-900">{entry.word}<Check className="size-4" /></span><span className="mt-1 block text-xs leading-5 text-emerald-800">{entry.meaning}</span></button>)}</div>
      </div>
    </dialog>
  </>;
}
