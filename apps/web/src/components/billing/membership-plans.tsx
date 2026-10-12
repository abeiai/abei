"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { membershipPeriods, type MembershipPlan, type MembershipTerm } from "@/lib/membership";

export function MembershipPlans({ plans, isLoggedIn }: { plans: MembershipPlan[]; isLoggedIn: boolean }) {
  const periods = (Object.keys(membershipPeriods) as MembershipTerm[]).filter((period) => plans.some((plan) => plan.prices.some((price) => price.period === period && price.isEnabled)));
  const [period, setPeriod] = useState<MembershipTerm>(periods.includes("MONTH") ? "MONTH" : periods[0] ?? "MONTH");
  return <section className="space-y-6" aria-label="会员套餐">
    <div className="flex flex-wrap justify-center gap-2">{periods.map((term) => <Button key={term} aria-pressed={period === term} variant={period === term ? "default" : "outline"} onClick={() => setPeriod(term)}>按{membershipPeriods[term]}付</Button>)}</div>
    <div className="grid justify-center gap-3 sm:grid-cols-[repeat(auto-fit,minmax(280px,390px))]">{plans.map((plan) => {
      const price = plan.prices.find((item) => item.period === period && item.isEnabled);
      if (!price) return null;
      const href = `/pricing?package=${encodeURIComponent(`membership:${plan.id}:${period}`)}`;
      return <article className="mx-auto flex w-full max-w-[390px] flex-col gap-5 rounded-2xl border bg-background p-6 shadow-sm" key={plan.id}>
        <h3 className="text-xl font-semibold">{plan.name}</h3>
        <div className="flex flex-wrap items-baseline gap-1"><span className="text-lg font-semibold">¥</span><span className="text-4xl font-semibold">{price.amountCny.replace(/\.00$/, "")}</span><span className="ml-1 text-sm text-muted-foreground">每{membershipPeriods[period]}</span>{Number(price.originalPriceCny) > Number(price.amountCny) && <del className="ml-3 text-sm text-muted-foreground">¥{price.originalPriceCny}</del>}</div>
        <p className="font-semibold">赠送 {price.credits.toLocaleString("zh-CN")} 点{price.pricePer100Credits !== null && <span className="ml-2 text-sm font-normal text-muted-foreground">¥{price.pricePer100Credits} / 百点</span>}</p>
        <ul className="flex-1 space-y-2 text-sm"><li>免费获取绘本馆全部资源</li><li>{plan.storageGb} GB 存储额度</li><li>最多 {plan.learnerLimit} 位学习者</li>{plan.benefits.map((benefit) => <li key={benefit.code}>{benefit.name}：{String(benefit.value)}</li>)}</ul>
        <Button asChild><Link href={isLoggedIn ? href : `/login?next=${encodeURIComponent(href)}`}>开通 {plan.name}</Link></Button>
      </article>;
    })}</div>
  </section>;
}
