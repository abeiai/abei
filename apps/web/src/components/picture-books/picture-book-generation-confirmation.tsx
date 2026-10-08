"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

type Cost = { credits: number; fallbackCredits?: number };
type Request = { label: string; path: string; body: unknown; warning?: string };

export function usePictureBookGenerationConfirmation() {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [prompt, setPrompt] = useState<(Request & { cost: Cost | null; error: string }) | null>(null);
  useEffect(() => {
    if (prompt && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!prompt && dialogRef.current?.open) dialogRef.current.close();
  }, [prompt]);
  useEffect(() => () => { resolveRef.current?.(false); resolveRef.current = null; }, []);

  function finish(confirmed: boolean) {
    const resolve = resolveRef.current;
    resolveRef.current = null; setPrompt(null); resolve?.(confirmed);
  }
  async function confirm(request: Request): Promise<boolean> {
    if (resolveRef.current) return false;
    let resolve!: (confirmed: boolean) => void;
    const result = new Promise<boolean>(done => { resolve = done; });
    resolveRef.current = resolve; setPrompt({ ...request, cost: null, error: "" });
    void (async () => { try {
      const response = await fetch(`/api/picture-books${request.path}`, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.code !== 0) throw new Error(payload?.message || "无法读取生成费用，请稍后重试");
      const cost = payload.data as Cost;
      if (!cost || !Number.isSafeInteger(cost.credits) || cost.credits < 0 || (cost.fallbackCredits !== undefined && (!Number.isSafeInteger(cost.fallbackCredits) || cost.fallbackCredits < 0))) throw new Error("生成费用读取失败，请稍后重试");
      if (resolveRef.current === resolve) setPrompt({ ...request, cost, error: "" });
    } catch (cause) {
      if (resolveRef.current === resolve) setPrompt({ ...request, cost: null, error: cause instanceof Error ? cause.message : "无法读取生成费用" });
    } })();
    return result;
  }

  const dialog = <dialog ref={dialogRef} aria-labelledby={`${id}-title`} aria-describedby={`${id}-cost`} onCancel={event => { event.preventDefault(); finish(false); }} onClick={event => { if (event.target === event.currentTarget) finish(false); }} className="m-auto w-[calc(100%-32px)] max-w-sm rounded-2xl border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40">
    <h2 id={`${id}-title`} className="text-lg font-semibold">{prompt?.label}确认</h2>
    <div id={`${id}-cost`} className="my-5 space-y-3 text-sm leading-6">
      {prompt?.error ? <p role="alert" className="text-destructive">{prompt.error}</p> : prompt?.cost ? <>
        <p>预计消耗 <strong className="text-xl text-primary">{prompt.cost.credits}</strong> 点</p>
        {prompt.cost.fallbackCredits !== undefined ? <p className="text-muted-foreground">默认模型连接超时时将使用备用模型，预计消耗 {prompt.cost.fallbackCredits} 点。</p> : null}
        {prompt.warning ? <p className="text-muted-foreground">{prompt.warning}</p> : null}
      </> : <p role="status" className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在读取生成费用…</p>}
    </div>
    <div className="flex justify-end gap-3"><button type="button" autoFocus onClick={() => finish(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">取消</button><button type="button" disabled={!prompt?.cost || Boolean(prompt.error)} onClick={() => finish(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">确认生成</button></div>
  </dialog>;
  return { confirm, dialog };
}
