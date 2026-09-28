"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, History, Play, RotateCcw } from "lucide-react";

import { typingPracticeModeKey, typingPracticeModes, typingVoiceKey, typingVoices, type TypingVoice, type TypingPracticeMode } from "@/lib/typing-practice-mode";
import { Button } from "@/components/ui/button";
import {
  createTypingSession,
  getActiveTypingSession,
  type TypingLibrary,
  type TypingSession
} from "@/lib/typing-api";
import { typingLibraryPracticeDefaults } from "@/lib/typing-stage";

export function TypingLibraryStart({
  library,
  isLoggedIn
}: {
  library: TypingLibrary;
  isLoggedIn: boolean;
}) {
  const practiceDefaults = typingLibraryPracticeDefaults(library.stage);
  const router = useRouter();
  const [scope, setScope] = useState<"ALL" | "UNIT">(practiceDefaults.initialSelection);
  const [mode, setMode] = useState<TypingPracticeMode>("BEGINNER");
  const [voice, setVoice] = useState<TypingVoice>("uk-female");
  const [unitId, setUnitId] = useState(library.units[0]?.id ?? "");
  const [activeSession, setActiveSession] = useState<TypingSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function start(abandonExisting = false) {
    if (!isLoggedIn) {
      window.location.href = `/login?next=${encodeURIComponent(`/typing/libraries/${library.id}`)}`;
      return;
    }
    setPending(true);
    setError("");
    try {
      if (!abandonExisting) {
        const existing = await getActiveTypingSession();
        if (existing) {
          setActiveSession(existing);
          return;
        }
      }
      const session = await createTypingSession({
        libraryId: library.id,
        unitId: scope === "UNIT" ? unitId : undefined,
        scope: practiceDefaults.requestScope,
        targetItemCount: practiceDefaults.targetItemCount,
        clientSessionKey: crypto.randomUUID(),
        abandonExisting
      });
      localStorage.setItem(typingPracticeModeKey(session.id), mode);
      localStorage.setItem(typingVoiceKey(session.id), voice);
      router.push(`/typing/practice/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "练习创建失败，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#dce3ec] bg-white p-6 shadow-[0_18px_60px_rgba(37,52,77,0.08)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#3b78d8]">
            <BookOpen className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[#25344d]">练习设置</h2>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {([
            ["ALL", library.stage === "UNIVERSITY" ? "整库分批" : "全册练习"],
            ["UNIT", library.stage === "UNIVERSITY" ? "指定字母" : "指定单元"]
          ] as const).map(([value, label]) => (
            <button
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                scope === value
                  ? "border-[#4d86e8] bg-[#eef5ff] text-[#3169c4]"
                  : "border-[#e1e7ef] bg-white text-[#5e6d83] hover:border-[#b8c9e4]"
              }`}
              aria-pressed={scope === value}
              key={value}
              onClick={() => setScope(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {scope === "UNIT" ? (
          <div className="mt-6">
            <label className="text-sm font-semibold text-[#34445d]" htmlFor="typing-unit">
              练习单元
            </label>
            <select
              className="mt-2 h-12 w-full rounded-xl border border-[#dce3ec] bg-white px-4 text-sm text-[#34445d] outline-none focus:border-[#4d86e8] focus:ring-4 focus:ring-[#4d86e8]/10"
              id="typing-unit"
              onChange={(event) => setUnitId(event.target.value)}
              value={unitId}
            >
              {library.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.title} · {unit.itemCount}个单词
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-[#34445d]">练习方式</legend>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {typingPracticeModes.map(({ value, label }) => (
              <label className={`cursor-pointer rounded-xl border px-2 py-3 text-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4d86e8] ${mode === value ? "border-[#4d86e8] bg-[#eef5ff] text-[#3169c4]" : "border-[#e1e7ef] text-[#5e6d83] hover:border-[#b8c9e4]"}`} key={value}>
                <input className="sr-only" type="radio" name="typing-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-[#34445d]">语音选择</legend>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {typingVoices.map(({ value, label }) => (
              <label className={`cursor-pointer rounded-xl border px-1 py-3 text-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4d86e8] ${voice === value ? "border-[#4d86e8] bg-[#eef5ff] text-[#3169c4]" : "border-[#e1e7ef] text-[#5e6d83] hover:border-[#b8c9e4]"}`} key={value}>
                <input className="sr-only" type="radio" name="typing-voice" value={value} checked={voice === value} onChange={() => setVoice(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

        <Button
          className="mt-7 h-12 w-full rounded-xl bg-[#3978dd] text-base font-semibold text-white hover:bg-[#2f69c7]"
          disabled={pending || (scope === "UNIT" && !unitId)}
          onClick={() => void start()}
          type="button"
        >
          <Play className="size-4 fill-current" />
          {pending ? "正在准备练习…" : "开始练习"}
        </Button>
        {library.stage === "UNIVERSITY" ? (
          <p className="mt-3 text-center text-xs text-[#8190a5]">每次学习 20 个新词</p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <a className="flex items-center gap-3 rounded-2xl border border-[#e0e6ee] bg-white p-4 text-[#34445d] transition hover:border-[#b9c9e0]" href="/typing/review">
          <RotateCcw className="size-5 text-[#e08346]" />
          <span className="text-sm font-semibold">复习巩固</span>
        </a>
        <a className="flex items-center gap-3 rounded-2xl border border-[#e0e6ee] bg-white p-4 text-[#34445d] transition hover:border-[#b9c9e0]" href="/typing/history">
          <History className="size-5 text-[#5485d5]" />
          <span className="text-sm font-semibold">练习记录</span>
        </a>
      </section>

      {activeSession ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#1f2c40]/45 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <h3 className="text-xl font-semibold text-[#25344d]">发现未完成的练习</h3>
            <p className="mt-2 text-sm leading-6 text-[#75849a]">
              {activeSession.library.title} 已完成 {activeSession.currentIndex + 1}/{activeSession.totalItems} 题。
            </p>
            <div className="mt-6 grid gap-3">
              <Button
                className="h-11 rounded-xl bg-[#3978dd] text-white hover:bg-[#2f69c7]"
                onClick={() => router.push(`/typing/practice/${activeSession.id}`)}
              >
                继续上次练习
              </Button>
              <Button
                className="h-11 rounded-xl"
                disabled={pending}
                onClick={() => {
                  setActiveSession(null);
                  void start(true);
                }}
                variant="outline"
              >
                放弃旧会话并重新开始
              </Button>
              <button className="py-1 text-sm text-[#7b8798]" onClick={() => setActiveSession(null)} type="button">
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
