"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { captureReferralVisit } from "@/lib/referral-api";

export function ReferralRegistration({ handle }: { handle: string }) {
  const [status, setStatus] = useState<"pending" | "ready" | "error">("pending");
  const [attempt, setAttempt] = useState(0);
  // Mount, rather than prefetch, is evidence that the visitor entered the page.
  useEffect(() => {
    let cancelled = false;
    setStatus("pending");
    captureReferralVisit(handle).then(result => { if (!cancelled) setStatus(result.ok ? "ready" : "error"); }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [handle, attempt]);
  return <div className="space-y-3">
    <p className="text-sm leading-6">通过推荐进入后，72小时内完成有效注册，你和推荐人各得500点。</p>
    <div className="flex flex-wrap gap-3">
      {status === "ready" ? <Button asChild><Link href="/register">注册并领取500点</Link></Button> : <Button disabled={status === "pending"} onClick={() => setAttempt(value => value + 1)}>{status === "pending" ? "正在确认推荐资格…" : "重新确认推荐资格"}</Button>}
      <Button asChild variant="outline"><Link href="/login">已有账号，登录</Link></Button>
    </div>
    {status === "error" && <p role="alert" className="text-sm text-destructive">推荐资格暂时无法确认，请重试。</p>}
  </div>;
}
