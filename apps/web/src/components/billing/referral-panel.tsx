"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { bindReferralAlias, type ReferralSummary } from "@/lib/referral-api";

export function ReferralPanel({ summary, siteUrl }: { summary: ReferralSummary; siteUrl: string }) {
  const [state, action, pending] = useActionState(bindReferralAlias, {});
  const [copyStatus, setCopyStatus] = useState("");
  const code = summary.handles.find(item => item.kind === "RANDOM")?.handle;
  const alias = summary.handles.find(item => item.kind === "ALIAS" && item.status === "ACTIVE")?.handle;
  const handle = alias ?? code;
  const url = `${siteUrl}/u/${handle ?? ""}`;
  return <div className="space-y-6">
    <section className="space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
      <h2 className="text-base font-semibold">我的推荐主页</h2>
      <p className="text-sm leading-6">好友通过主页进入，并在72小时内完成有效注册，你和好友各得500点。</p>
      {handle ? <div className="flex flex-wrap items-center gap-3">
        <Link className="break-all text-sm underline" href={`/u/${handle}`}>{url}</Link>
        <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopyStatus("链接已复制"); } catch { setCopyStatus("复制失败，请手动复制链接"); } }}>复制链接</Button>
        <span role="status" className="text-sm">{copyStatus}</span>
      </div> : <p className="text-sm">推荐码暂不可用，请稍后刷新。</p>}
      {alias && <p className="text-sm text-muted-foreground">原推荐码 {code} 仍然有效</p>}
    </section>
    <section className="space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
      <h2 className="text-base font-semibold">专属名称</h2>
      {alias ? <p className="text-sm">已永久绑定：<strong>{alias}</strong></p> : <form action={action} className="space-y-3">
        <label className="flex max-w-md flex-col gap-2 text-sm font-semibold">名称
          <input className="h-10 rounded-md border border-input bg-background px-3 font-normal" name="name" required minLength={4} maxLength={32} pattern="[A-Za-z]{4,32}" placeholder="例如 eric" autoComplete="off" />
        </label>
        <p className="text-sm text-muted-foreground">4至32位英文字母，不可包含 xuele 或官方保留名称。仅可绑定一次，绑定后不能修改。</p>
        <Button disabled={pending || Boolean(state.success)} type="submit">{pending ? "正在绑定…" : "永久绑定此名称"}</Button>
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state.success && <p role="status" className="text-sm">{state.success}</p>}
      </form>}
    </section>
    <section className="space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
      <h2 className="text-base font-semibold">推荐奖励</h2>
      <div className="flex flex-wrap gap-8"><p>成功推荐 <strong>{summary.invitedCount}</strong> 人</p><p>累计获得 <strong>{summary.rewardCredits.toLocaleString("zh-CN")}</strong> 点</p></div>
      {summary.rewards.length ? <ul className="divide-y divide-border">{summary.rewards.map((reward, index) => <li className="flex justify-between py-3 text-sm" key={`${reward.createdAt}:${index}`}><span>{new Date(reward.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span><span>+{reward.credits} 点</span></li>)}</ul> : <p className="text-sm text-muted-foreground">暂无推荐奖励</p>}
    </section>
  </div>;
}
