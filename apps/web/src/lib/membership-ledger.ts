export function isMembershipExpiryEntry(entry: { type: string; amount: number; idempotencyKey: string }) {
  return entry.type === "ADMIN_ADJUST" && entry.amount < 0 &&
    (entry.idempotencyKey.startsWith("membership:") || entry.idempotencyKey.startsWith("membership-release-expired:"));
}

export function isPointConsumeEntry(entry: { type: string }) {
  return entry.type === "CONSUME";
}

export function membershipExpiryDescription(entry: { note: string | null }) {
  return entry.note || "会员周期结束，剩余赠点清零";
}
