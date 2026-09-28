"use server";

import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth-actions";

export interface ReferralSummary {
  handles: Array<{ handle: string; kind: string; status: string }>;
  invitedCount: number;
  rewardCredits: number;
  rewards: Array<{ credits: number; createdAt: string }>;
}
export interface ReferralProfile { id: string; nickname: string; avatarUrl: string | null; handle: string; canonicalHandle: string }

async function referralFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const jar = await cookies();
  const incoming = await headers();
  const clientIp = incoming.get("x-real-ip") ?? "";
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/referrals${path}`, {
    ...init, cache: "no-store", headers: { "Content-Type": "application/json", Cookie: jar.getAll().map(item => `${item.name}=${encodeURIComponent(item.value)}`).join("; "), ...(isIP(clientIp) ? { "X-Forwarded-For": clientIp } : {}) }
  });
  const payload = await response.json() as { code: number; message: string; data: T };
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || "推荐信息暂不可用");
  return payload.data;
}

export async function getMyReferrals() { return referralFetch<ReferralSummary>("/me"); }
export async function captureReferralVisit(handle: string): Promise<{ ok: boolean }> {
  const jar = await cookies();
  if (await getOptionalCurrentUser()) return { ok: false };
  try {
    const visit = await referralFetch<{ token: string; expiresAt: string }>(`/visit/${encodeURIComponent(handle)}`, { method: "POST" });
    const appUrl = process.env.APP_BASE_URL ?? "";
    jar.set("xueleai_referral", visit.token, { httpOnly: true, sameSite: "lax", path: "/", secure: appUrl ? appUrl.startsWith("https:") : process.env.NODE_ENV === "production", expires: new Date(visit.expiresAt) });
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function getReferralProfile(handle: string) { return referralFetch<ReferralProfile>(`/profile/${encodeURIComponent(handle)}`); }
export async function bindReferralAlias(_previous: { error?: string; success?: string }, formData: FormData): Promise<{ error?: string; success?: string }> {
  try {
    await referralFetch("/alias", { method: "POST", body: JSON.stringify({ name: String(formData.get("name") ?? "") }) });
    revalidatePath("/dashboard/referrals");
    return { success: "专属名称已永久绑定" };
  } catch (error) { return { error: error instanceof Error ? error.message : "绑定失败，请稍后重试" }; }
}
