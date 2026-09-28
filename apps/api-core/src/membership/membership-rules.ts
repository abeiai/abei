import { AppException } from "../common/app-exception.js";
export const MEMBERSHIP_PERIODS = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"] as const;
export type MembershipBillingPeriod = typeof MEMBERSHIP_PERIODS[number];
export function calculateMembershipPrice(input: {originalPriceCny: string; discountPercent?: number; salePriceCny?: string | null; credits: number}) {
  const cents = (value: string) => {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new AppException(40001,"价格格式错误",400);
    const [whole, fraction = ""] = value.split(".");
    const result = Number(whole) * 100 + Number(fraction.padEnd(2,"0"));
    if (result <= 0 || result > 9999999999) throw new AppException(40001,"价格必须大于零且小于一亿元",400);
    return result;
  };
  const original = cents(input.originalPriceCny);
  const discount = input.discountPercent ?? 100;
  if (!Number.isInteger(discount) || discount < 1 || discount > 100 || !Number.isInteger(input.credits) || input.credits < 0 || input.credits > 1000000000) throw new AppException(40001,"折扣或赠送点数不正确",400);
  const amount = input.salePriceCny ? cents(input.salePriceCny) : Math.floor((original * discount + 50) / 100);
  if (amount <= 0 || amount > original) throw new AppException(40001,"优惠价必须大于零且不超过原价",400);
  return {amountCny:(amount / 100).toFixed(2),pricePer100Credits:input.credits === 0 ? null : (amount / input.credits).toFixed(2)};
}
export function membershipPeriodEnd(start: Date, period: MembershipBillingPeriod): Date {
  if (!MEMBERSHIP_PERIODS.includes(period) || !Number.isFinite(start.getTime())) throw new AppException(40001,"会员周期不正确",400);
  if (period === "DAY" || period === "WEEK") return new Date(start.getTime() + (period === "DAY" ? 1 : 7) * 86400000);
  const local = new Date(start.getTime() + 8 * 3600000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + ({MONTH:1,QUARTER:3,YEAR:12}[period]));
  const last = new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,0)).getUTCDate();
  local.setUTCDate(Math.min(day,last));
  return new Date(local.getTime() - 8 * 3600000);
}
