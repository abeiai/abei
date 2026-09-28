"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Info, Play, Search, Shuffle, Volume2 } from "lucide-react";
import { groups, phonemes, wordLengths, type Phoneme, type WordEntry } from "@/lib/yinbiao/catalog";
import rawWords from "@/lib/yinbiao/words.json";
import { SameSoundGame } from "./same-sound-game";
import { MouthDiagram } from "./mouth-diagram";

const words = rawWords as Record<string, Record<string, WordEntry[]>>;
const storageKey = "xueleai.yinbiao.learned.v1";
const buttonStyle = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40";

export function YinbiaoWorkbench() {
  const [selected, setSelected] = useState(phonemes[0].id);
  const [family, setFamily] = useState("全部");
  const [query, setQuery] = useState("");
  const [length, setLength] = useState(3);
  const [learned, setLearned] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [playback, setPlayback] = useState("");
  const [error, setError] = useState("");
  const [rate, setRate] = useState(1);
  const [videoOpen, setVideoOpen] = useState(false);
  const animationVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);
  const detailRef = useRef<HTMLElement>(null);
  const current = phonemes.find((item) => item.id === selected) ?? phonemes[0];
  const group = groups.find((item) => (item.symbols as readonly string[]).includes(current.symbol))!;
  const examples = words[current.symbol]?.[length] ?? [];
  const filteredGroups = groups.filter((item) => family === "全部" || item.family === family).map((item) => ({
    ...item,
    items: item.symbols.map((symbol) => phonemes.find((p) => p.symbol === symbol)!).filter((p) => {
      const term = query.trim().toLowerCase().replace(/\//g, "");
      return !term || p.symbol.includes(term) || p.name.includes(term) || Object.values(words[p.symbol] ?? {}).flat().some((word) => word.word.includes(term));
    })
  })).filter((item) => item.items.length);
  const visible = filteredGroups.flatMap((item) => item.items);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) setLearned([...new Set(stored.filter((id): id is string => typeof id === "string" && phonemes.some((p) => p.id === id)))]);
    } catch { /* 存储不可用时仍可学习。 */ }
    setReady(true);
    return () => { requestRef.current += 1; audioRef.current?.pause(); };
  }, []);

  function stop() {
    requestRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayback("");
  }
  function choose(item: Phoneme, scroll = false) {
    stop();
    animationVideoRef.current?.pause();
    setSelected(item.id);
    setVideoOpen(false);
    setError("");
    if (scroll) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (item.femaleAudio) void play(item.femaleAudio, `女声 /${item.symbol}/`);
    else setPlayback("该音标的女声录音待补充。");
  }
  async function play(url: string, label: string) {
    stop();
    animationVideoRef.current?.pause();
    setError("");
    const request = requestRef.current;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.playbackRate = rate;
    setPlayback(`正在加载：${label}`);
    audio.onplaying = () => { if (request === requestRef.current) setPlayback(`正在播放：${label}`); };
    audio.onended = () => { if (request === requestRef.current) setPlayback(""); };
    const fail = () => {
      if (request !== requestRef.current) return;
      setPlayback("");
      setError("暂时无法播放该音频，请检查网络后重试。");
    };
    audio.onerror = fail;
    try { await audio.play(); } catch { fail(); }
  }
  function toggleLearned() {
    const next = learned.includes(current.id) ? learned.filter((id) => id !== current.id) : [...learned, current.id];
    setLearned(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setError("当前浏览器无法保存进度，本次标记仅在当前页面有效。"); }
  }
  function step(direction: number) {
    const index = phonemes.findIndex((item) => item.id === current.id);
    choose(phonemes[(index + direction + phonemes.length) % phonemes.length]);
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-[#f6f6f5] px-4 py-6 text-foreground sm:px-5">
      <div className="mx-auto max-w-[1480px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-700 text-xl font-semibold text-white" aria-hidden="true">/ə/</div>
            <div><h1 className="text-2xl font-semibold tracking-normal">英语音标</h1><p className="mt-1 text-xs text-muted-foreground">英式发音 · 48 个音标</p></div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">已掌握 <strong className="text-emerald-700">{learned.length}</strong> / 48</span>
            <button className={buttonStyle} disabled={!visible.length} onClick={() => {
              const pool = visible.filter((p) => p.id !== current.id);
              if (pool.length) choose(pool[Math.floor(Math.random() * pool.length)], true);
            }}><Shuffle className="size-4" />随机学习</button>
          </div>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section aria-label="音标分类表" className="min-w-0 rounded-2xl border border-border bg-background shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div aria-label="音标类型" className="flex rounded-lg bg-muted p-1">
                {["全部", "元音", "辅音"].map((value) => <button key={value} aria-pressed={family === value} onClick={() => setFamily(value)} className={`rounded-md px-3 py-2 text-sm font-medium ${family === value ? "bg-background text-emerald-800 shadow-sm" : "text-muted-foreground"}`}>{value}<span className="ml-1.5 text-xs opacity-60">{value === "全部" ? 48 : value === "元音" ? 20 : 28}</span></button>)}
              </div>
              <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3">
                <Search className="size-4 text-muted-foreground" /><input aria-label="搜索音标或单词" placeholder="搜索音标或单词" value={query} onChange={(event) => setQuery(event.target.value)} className="w-36 bg-transparent text-sm outline-none" />
              </label>
            </div>
            <div className="space-y-5 p-4 sm:p-5">
              {filteredGroups.map((item) => <section key={item.id}>
                <div className="mb-2.5 flex items-baseline gap-2"><span className={`text-xs font-medium ${item.family === "元音" ? "text-emerald-700" : "text-blue-600"}`}>{item.family}</span><h2 className="text-sm font-semibold">{item.label}</h2><span className="text-xs text-muted-foreground">{item.detail}</span></div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {item.items.map((p) => <button key={p.id} aria-pressed={current.id === p.id} aria-label={`${p.symbol}，${p.name}${learned.includes(p.id) ? "，已掌握" : ""}`} onClick={() => choose(p, window.innerWidth < 1280)} className={`relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${current.id === p.id ? "border-emerald-700 bg-emerald-700 text-white shadow-sm" : "border-border bg-background hover:border-emerald-400 hover:bg-emerald-50"}`}>
                    <span style={{ fontFamily: "Arial, sans-serif" }} className="text-2xl font-medium">{p.symbol}</span>
                    <span className={`text-[10px] ${current.id === p.id ? "text-emerald-100" : "text-muted-foreground"}`}>{Object.values(words[p.symbol] ?? {}).flat()[0]?.word ?? "查看详情"}</span>
                    {learned.includes(p.id) && <Check className="absolute right-1 top-1 size-3" />}
                  </button>)}
                </div>
              </section>)}
              {!visible.length && <p role="status" className="py-12 text-center text-sm text-muted-foreground">没有匹配的音标或词汇。<button onClick={() => { setQuery(""); setFamily("全部"); }} className="ml-2 text-emerald-700 underline">清除筛选</button></p>}
            </div>
            <details className="border-t border-border px-5 py-3 text-xs leading-6 text-muted-foreground">
              <summary className="flex cursor-pointer items-center gap-2"><Info className="size-3.5" />分类与素材来源</summary>
              <p className="mt-2">按参考图片的传统教学顺序排列。/ts/、/dz/、/tr/、/dr/ 为辅音组合，r 表示英语近音 /ɹ/。星形空位不计为音标。例词采用传统英式标音，实际发音可能因口音而异。</p>
              <p>男声及示范单词来自 LearnIPA，女声及示范单词2来自 Pronunciation Studio；音标和单词片段均由原录音切分。女声和发音示范图来自 <a href="https://pronunciationstudio.com/English-IPA-chart/" target="_blank" rel="noreferrer" className="underline">Pronunciation Studio</a>。发音动画来自 <a href="https://www.speechstar.ac.uk/speech-sound-animations/" target="_blank" rel="noreferrer" className="underline">SpeechSTAR</a>。示范单词录音来自 <a href="https://learnipa.github.io/english-phonemes.html" target="_blank" rel="noreferrer" className="underline">LearnIPA</a>。例词选自项目 ECDICT 词库及常见规则词形，<a href="/yinbiao/ECDICT-LICENSE.txt" className="underline" target="_blank" rel="noreferrer">MIT 许可</a>。<a href="https://www.cambridge.org/features/IPAchart/" target="_blank" rel="noreferrer" className="underline">IPA 分类参考</a>。</p>
            </details>
          </section>

          <section ref={detailRef} aria-label="当前音标详情" className="min-w-0 scroll-mt-6 xl:col-start-2 xl:row-span-2 rounded-2xl border border-border bg-background shadow-sm">
            <div className="border-b border-border p-5">
              <div className="mb-4 flex items-center justify-between"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{group.family} · {group.label}</span><div className="flex gap-1"><button aria-label="上一个音标" onClick={() => step(-1)} className={buttonStyle}><ArrowLeft className="size-4" /></button><button aria-label="下一个音标" onClick={() => step(1)} className={buttonStyle}><ArrowRight className="size-4" /></button></div></div>
              <div className="flex items-center justify-between gap-3"><div><h2 style={{ fontFamily: "Arial, sans-serif" }} className="text-6xl font-medium tracking-normal">/{current.symbol}/</h2><p className="mt-3 text-sm text-muted-foreground">{current.name}</p></div><button onClick={toggleLearned} disabled={!ready} aria-pressed={learned.includes(current.id)} className={`${buttonStyle} ${learned.includes(current.id) ? "text-emerald-700" : ""}`}><Check className="size-4" />{learned.includes(current.id) ? "已掌握" : "标记掌握"}</button></div>
              <div className="mt-4"><SameSoundGame key={current.id} phoneme={current} stop={() => { stop(); animationVideoRef.current?.pause(); }} speak={(word) => { void play(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`, word); }} /></div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className={buttonStyle} disabled={!current.maleAudio} onClick={() => current.maleAudio && play(current.maleAudio, "男声")} title={current.maleAudio ? "播放 LearnIPA 音标片段" : "男声录音待补充"}><Volume2 className="size-4" />男声 · LearnIPA{!current.maleAudio && " · 待补充"}</button>
                <button className={buttonStyle} disabled={!current.femaleAudio} onClick={() => current.femaleAudio && play(current.femaleAudio, "女声")} title={current.femaleAudio ? (["tr", "dr", "dz"].includes(current.symbol) ? "播放用户提供的 yyybabc.com 音标录音" : current.symbol === "ts" ? "播放用户提供的 ElevenLabs 音标片段" : "播放 Pronunciation Studio 音标片段") : "女声录音待补充"}><Volume2 className="size-4" />女声 · {["tr", "dr", "dz"].includes(current.symbol) ? "yyybabc.com" : current.symbol === "ts" ? "ElevenLabs" : "Pronunciation Studio"}{!current.femaleAudio && " · 待补充"}</button>
              </div>
              <div className="mt-3"><button className={buttonStyle} disabled={!current.example} onClick={() => current.example && play(current.example.audio, `示范单词 ${current.example.word}`)} title={current.example ? "播放 LearnIPA 单词片段" : "该来源未提供此辅音组合的示范录音"}><Volume2 className="size-4" />示范单词{current.example ? ` · ${current.example.word}` : " · 待补充"}</button></div>
              <div className="mt-3"><button className={buttonStyle} disabled={!current.example2} onClick={() => current.example2 && play(current.example2.audio, `示范单词2 ${current.example2.word}`)}><Volume2 className="size-4" />示范单词2{current.example2 ? ` · ${current.example2.word}` : " · 待补充"}</button></div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{current.audioNote}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground"><label>播放速度 <select aria-label="播放速度" value={rate} onChange={(event) => { const value = Number(event.target.value); setRate(value); if (audioRef.current) audioRef.current.playbackRate = value; }} className="ml-1 rounded border border-border bg-background p-1"><option value={0.75}>0.75 倍</option><option value={1}>正常</option></select></label>{playback && <button onClick={stop} className="underline">停止播放</button>}</div>
              <p role="status" className="mt-2 text-xs text-muted-foreground">{playback}</p>
              {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="space-y-5 p-5">
              <div><h3 className="mb-2 text-base font-semibold">音标介绍</h3><p className="text-sm leading-6 text-muted-foreground">/{current.symbol}/ 是{current.name}。{group.family === "元音" ? "发音时气流通过口腔，不形成明显阻塞。" : "发音部位和气流方式共同决定声音，练习时留意舌头与嘴唇的位置。"}</p></div>
              <div><h3 className="mb-3 text-base font-semibold">发音动画</h3>{current.animationVideo ? <video key={current.animationVideo} ref={animationVideoRef} src={current.animationVideo} controls playsInline preload="none" onPlay={stop} onError={() => setError("发音动画加载失败，请重试。")} aria-label={`/${current.symbol}/ SpeechSTAR 发音动画`} className="aspect-square max-h-96 w-full rounded-xl bg-black object-contain">浏览器不支持视频播放。</video> : <p className="text-sm text-muted-foreground">SpeechSTAR 未提供此音标的对应动画。</p>}</div>
              <div><h3 className="mb-3 text-base font-semibold">发音示范图</h3>{current.animation || current.mouthImages?.length ? <details key={current.id} className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm">展开 /{current.symbol}/ {current.animation ? "发音动图" : "口型图片"}{current.generatedImage && " · AI 生成示意图"}</summary><div className="mt-3 flex flex-wrap items-center justify-center gap-3">{(current.animation ? [current.animation] : current.mouthImages ?? []).map((src, index) => (
                // 原始 GIF 保留动画，静态图与动图使用同一展示规格。
                <img key={src} src={src} alt={`/${current.symbol}/ ${current.animation ? "发音动图" : "口型图片"} ${index + 1}`} loading="lazy" className="h-80 w-auto max-w-full rounded-lg object-contain" />
              ))}</div></details> : <p className="text-sm text-muted-foreground">该来源未提供此音标的示范图。</p>}</div>
              <div><h3 className="mb-3 text-base font-semibold">口型图</h3><MouthDiagram phoneme={current} /></div>
              <div><h3 className="mb-2 text-base font-semibold">发音要领</h3><p className="text-sm leading-7">{current.tip}</p></div>
              <div className="rounded-xl bg-amber-50 p-4"><h3 className="mb-1.5 text-sm font-semibold text-amber-900">易错提示</h3><p className="text-sm leading-6 text-amber-900/80">{current.mistake}</p></div>
              <div><h3 className="mb-3 text-base font-semibold">示范视频</h3>{current.video ? <>{videoOpen ? <iframe key={current.id} title={`BBC /${current.symbol}/ 发音示范`} src={current.video} allow="fullscreen; encrypted-media" allowFullScreen className="aspect-video w-full rounded-xl border-0" /> : <button onClick={() => { stop(); setVideoOpen(true); }} className={`${buttonStyle} min-h-20 w-full`}><Play className="size-5" />播放 BBC 发音示范</button>}<a href={current.video.replace("/embed/", "/watch?v=")} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline">无法播放？前往原站观看<ExternalLink className="size-3" /></a></> : <div className="rounded-xl border border-dashed border-border p-4"><p className="text-sm text-muted-foreground">该音标的独立示范视频待补充</p><a href="https://www.bbc.co.uk/learningenglish/english/features/pronunciation/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 underline">浏览 BBC 发音课程<ExternalLink className="size-3" /></a></div>}</div>
            </div>
          </section>
        <section aria-label="常见词汇" className="min-w-0 xl:col-start-1 xl:row-start-2 rounded-2xl border border-border bg-background p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><h2 className="text-base font-semibold">常见词汇</h2><span className="text-sm text-emerald-700">/{current.symbol}/</span></div><div className="flex flex-wrap gap-1.5" aria-label="单词字母数">{wordLengths.map((n) => <button key={n} onClick={() => setLength(n)} aria-pressed={length === n} className={`rounded-lg px-3 py-2 text-sm ${length === n ? "bg-emerald-700 text-white" : "bg-muted text-muted-foreground hover:bg-emerald-50"}`}>{n} 字母</button>)}</div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{examples.map((word) => <article key={word.word} className="min-w-0 rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-2"><h3 lang="en" className="break-all text-xl font-semibold">{word.word}</h3><button aria-label={`播放单词 ${word.word}`} className="shrink-0 rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" onClick={() => play(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.word)}&type=1`, word.word)}><Volume2 className="size-4" /></button></div><p style={{ fontFamily: "Arial, sans-serif" }} className="mt-2 break-words text-sm text-muted-foreground">/{word.phonetic}/</p><p className="mt-3 text-sm leading-6">{word.meaning}</p></article>)}</div>
          {examples.length < 5 && <p role="status" className="mt-4 text-sm text-muted-foreground">当前词库中，含 /{current.symbol}/ 的 {length} 字母常见词{examples.length ? `已收录 ${examples.length} 个，尚不足 5 个。` : "暂无收录。"}可切换其他字母数继续学习。</p>}
          <p className="mt-4 text-xs text-muted-foreground">{examples.length} / 5 个 · 单词音频由有道在线提供</p>
        </section>
        </div>
      </div>
    </main>
  );
}
