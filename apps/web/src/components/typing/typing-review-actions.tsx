"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createTypingReviewSession,
  getActiveTypingSession,
  resetTypingReview
} from "@/lib/typing-api";

export function StartTypingReviewButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setPending(true);
    setError("");
    try {
      const active = await getActiveTypingSession();
      const session = active ?? await createTypingReviewSession({
        targetItemCount: 20,
        clientSessionKey: crypto.randomUUID()
      });
      router.push(`/typing/practice/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复习创建失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button className="h-11 rounded-xl bg-[#3978dd] px-6 text-white hover:bg-[#2f69c7]" disabled={disabled || pending} onClick={() => void start()}>
        <Play className="size-4 fill-current" /> {pending ? "正在准备…" : "开始今日复习"}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function ResetTypingReviewButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function reset() {
    if (!window.confirm("确定重置这个单词的记忆进度吗？历史作答记录会保留。")) return;
    setPending(true);
    try {
      await resetTypingReview(itemId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#8a96a8] hover:bg-red-50 hover:text-red-600 disabled:opacity-50" disabled={pending} onClick={() => void reset()} type="button">
      <Trash2 className="size-3.5" /> {pending ? "重置中" : "重置"}
    </button>
  );
}
