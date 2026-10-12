import type { RechargeProduct } from "./billing-api";

export const membershipPeriods = { DAY: "日", WEEK: "周", MONTH: "月", QUARTER: "季", YEAR: "年" } as const;
export type MembershipTerm = keyof typeof membershipPeriods;
export interface MembershipPrice {
  period: MembershipTerm;
  originalPriceCny: string;
  discountPercent: number;
  salePriceCny: string | null;
  credits: number;
  isEnabled: boolean;
  amountCny: string;
  pricePer100Credits: string | null;
}
export interface MembershipPlan {
  id: string;
  name: string;
  rank: number;
  isEnabled: boolean;
  storageGb: number;
  learnerLimit: number;
  benefits: { code: string; name: string; value: string | number | boolean }[];
  prices: MembershipPrice[];
}
export interface MembershipPeriod {
  id: string;
  name: string;
  rank: number;
  storageGb: number;
  learnerLimit: number;
  credits: number;
  remainingCredits: number;
  startsAt: string;
  endsAt: string;
  benefits: MembershipPlan["benefits"];
}
export interface MyMembership {
  current: MembershipPeriod | null;
  upcoming: MembershipPeriod[];
  membershipCredits: number;
}
export function membershipPricePreview(price: Pick<MembershipPrice, "originalPriceCny" | "discountPercent" | "salePriceCny" | "credits">) {
  const originalCents = Math.round(Number(price.originalPriceCny) * 100);
  const cents = price.salePriceCny !== null && price.salePriceCny !== ""
    ? Math.round(Number(price.salePriceCny) * 100)
    : Math.round(originalCents * price.discountPercent / 100);
  return {
    amountCny: (cents / 100).toFixed(2),
    pricePer100Credits: price.credits > 0 ? (cents / price.credits).toFixed(2) : null
  };
}
export function membershipProduct(plan: MembershipPlan, price: MembershipPrice): RechargeProduct {
  return {
    id: `${plan.id}:${price.period}`, code: `membership:${plan.id}:${price.period}`,
    name: `${plan.name} · ${membershipPeriods[price.period]}付`, billingMode: "SUBSCRIPTION", billingModeName: "会员订阅",
    amountCny: price.amountCny, credits: price.credits, sortOrder: plan.rank, isEnabled: plan.isEnabled && price.isEnabled,
    createdAt: "", updatedAt: "",
    description: "赠点在会员周期开始时一次性发放，优先消耗，周期结束清零。续费或换等级在已有周期结束后生效。",
    benefitsMarkdown: ["- 免费获取绘本馆全部资源", `- ${plan.storageGb} GB 存储额度`, `- 最多 ${plan.learnerLimit} 位学习者`,
      ...plan.benefits.map((benefit) => `- ${benefit.name}：${benefit.value}`)].join("\n")
  };
}


export function membershipNextStart(membership: MyMembership, now = new Date()): string | null {
  const ends = [...(membership.current ? [membership.current] : []), ...membership.upcoming]
    .map((period) => period.endsAt)
    .filter((end) => new Date(end).getTime() > now.getTime())
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());
  return ends[0] ?? null;
}

export function membershipEndDate(start: Date, period: MembershipTerm): Date {
  if (period === "DAY" || period === "WEEK") return new Date(start.getTime() + (period === "DAY" ? 1 : 7) * 86400000);
  const local = new Date(start.getTime() + 8 * 3600000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + { MONTH: 1, QUARTER: 3, YEAR: 12 }[period]);
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return new Date(local.getTime() - 8 * 3600000);
}
