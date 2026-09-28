"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { membershipPeriods, membershipPricePreview, type MembershipPlan, type MembershipTerm } from "@/lib/membership";
import { saveMembership, saveMembershipSettings } from "@/lib/membership-api";

function newPlan(): MembershipPlan {
  return { id: "", name: "", rank: 1, isEnabled: true, storageGb: 10, learnerLimit: 3, benefits: [], prices: (Object.keys(membershipPeriods) as MembershipTerm[]).map((period) => ({ period, originalPriceCny: "10", discountPercent: 100, salePriceCny: null, credits: 100, isEnabled: true, amountCny: "10.00", pricePer100Credits: "10.00" })) };
}

export function MembershipManager({ plans, freeLearnerLimit }: { plans: MembershipPlan[]; freeLearnerLimit: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState<MembershipPlan | null>(null);
  const [freeLimit, setFreeLimit] = useState(freeLearnerLimit);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function save(action: () => Promise<void>) {
    setMessage("");
    startTransition(async () => {
      try { await action(); setDraft(null); setMessage("保存成功"); router.refresh(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试"); }
    });
  }
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>非会员权益</CardTitle></CardHeader><CardContent>
      <form className="flex flex-wrap items-end gap-4" onSubmit={(event) => { event.preventDefault(); save(() => saveMembershipSettings(freeLimit)); }}>
        <label className="space-y-2 text-sm font-semibold">学习者数量上限<Input type="number" min={1} max={999} step={1} required value={freeLimit} onChange={(event) => setFreeLimit(Number(event.target.value))} /></label>
        <Button disabled={pending}>保存</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>会员等级</CardTitle><Button onClick={() => { setDraft(newPlan()); setMessage(""); }}>添加会员等级</Button></CardHeader><CardContent className="space-y-3">
      {plans.map((plan) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" key={plan.id}>
        <div><p className="font-semibold">{plan.name} · 等级 {plan.rank} · {plan.isEnabled ? "已启用" : "已停用"}</p><p className="mt-1 text-sm text-muted-foreground">{plan.storageGb} GB · {plan.learnerLimit} 位学习者 · {plan.prices.filter((price) => price.isEnabled).length} 种付费周期</p></div>
        <Button variant="outline" onClick={() => { setDraft({ ...plan, prices: newPlan().prices.map((price) => plan.prices.find((existing) => existing.period === price.period) ?? { ...price, isEnabled: false }) }); setMessage(""); }}>编辑</Button>
      </div>)}
      {!plans.length && <p className="text-sm text-muted-foreground">暂无会员等级</p>}
    </CardContent></Card>
    {message && <p role="status" className="text-sm">{message}</p>}
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="membership-editor-title" className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
      <h2 id="membership-editor-title" className="mb-5 text-xl font-semibold">{draft.id ? "编辑会员等级" : "添加会员等级"}</h2>
      <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); save(() => saveMembership(draft)); }}>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="space-y-2 text-sm font-semibold">会员名称<Input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          {([['rank', '等级（数值越大等级越高）'], ['storageGb', '存储额度（GB）'], ['learnerLimit', '学习者数量上限']] as const).map(([key, label]) => <label key={key} className="space-y-2 text-sm font-semibold">{label}<Input type="number" min={key === 'storageGb' ? 0 : 1} max={key === "learnerLimit" ? 999 : undefined} step={1} required value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isEnabled} onChange={(event) => setDraft({ ...draft, isEnabled: event.target.checked })} />启用会员等级</label>
        <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr>{['周期', '启用', '原价（元）', '实付比例（%，80 为八折）', '手动优惠价（元）', '赠送点数', '实付价 / 每百点'].map((label) => <th key={label} className="p-2 font-semibold">{label}</th>)}</tr></thead><tbody>
          {draft.prices.map((price, index) => {
            const preview = membershipPricePreview(price);
            const update = (patch: Partial<typeof price>) => setDraft({ ...draft, prices: draft.prices.map((item, i) => i === index ? { ...item, ...patch } : item) });
            return <tr key={price.period} className="border-t"><td className="p-2">按{membershipPeriods[price.period]}付</td><td className="p-2"><input aria-label={`${membershipPeriods[price.period]}付启用`} type="checkbox" checked={price.isEnabled} onChange={(event) => update({ isEnabled: event.target.checked })} /></td>
              <td className="p-2"><Input aria-label={`${membershipPeriods[price.period]}原价`} type="number" min="0.01" step="0.01" required value={price.originalPriceCny} onChange={(event) => update({ originalPriceCny: event.target.value })} /></td>
              <td className="p-2"><Input aria-label={`${membershipPeriods[price.period]}实付比例`} type="number" min="1" max="100" step="1" required value={price.discountPercent} onChange={(event) => update({ discountPercent: Number(event.target.value) })} /></td>
              <td className="p-2"><Input aria-label={`${membershipPeriods[price.period]}手动优惠价`} placeholder="自动计算" type="number" min="0.01" step="0.01" value={price.salePriceCny ?? ""} onChange={(event) => update({ salePriceCny: event.target.value || null })} /></td>
              <td className="p-2"><Input aria-label={`${membershipPeriods[price.period]}赠送点数`} type="number" min="0" step="1" required value={price.credits} onChange={(event) => update({ credits: Number(event.target.value) })} /></td>
              <td className="whitespace-nowrap p-2">¥{preview.amountCny}<br /><span className="text-xs text-muted-foreground">{preview.pricePer100Credits === null ? "无赠点" : `¥${preview.pricePer100Credits} / 百点`}</span></td></tr>;
          })}
        </tbody></table></div>
        <p className="text-sm text-muted-foreground">赠点在周期开始时一次性发放，周期结束清零。手动优惠价优先于折扣计算价。</p>
        <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">扩展权益</h3><Button type="button" variant="outline" onClick={() => setDraft({ ...draft, benefits: [...draft.benefits, { code: "", name: "", value: "" }] })}>添加权益</Button></div>
          {draft.benefits.map((benefit, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">{(['code', 'name', 'value'] as const).map((key) => <Input key={key} aria-label={{ code: '权益编码', name: '权益名称', value: '权益内容' }[key]} placeholder={{ code: '权益编码', name: '权益名称', value: '权益内容' }[key]} pattern={key === "code" ? "[a-z][a-z0-9_]*" : undefined} title={key === "code" ? "小写字母开头，可包含数字和下划线" : undefined} required value={String(benefit[key])} onChange={(event) => setDraft({ ...draft, benefits: draft.benefits.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })} />)}<Button type="button" variant="outline" onClick={() => setDraft({ ...draft, benefits: draft.benefits.filter((_, i) => i !== index) })}>移除</Button></div>)}
        </div>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setDraft(null)}>取消</Button><Button disabled={pending}>{pending ? "保存中…" : "保存会员等级"}</Button></div>
      </form>
    </section></div>}
  </div>;
}
