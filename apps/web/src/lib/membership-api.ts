"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { MembershipPlan, MyMembership } from "./membership";

async function membershipFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}${path}`, {
    ...init, cache: "no-store", headers: { "Content-Type": "application/json", Cookie: cookieStore.getAll().map((item) => `${item.name}=${encodeURIComponent(item.value)}`).join("; ") }
  });
  const payload = await response.json() as { code: number; message: string; data: T };
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || "会员信息请求失败");
  return payload.data;
}
export async function getMembershipPlans() { return membershipFetch<MembershipPlan[]>("/membership/plans"); }
export async function getMyMembership() { return membershipFetch<MyMembership>("/membership/me"); }
export async function getAdminMemberships() { return membershipFetch<MembershipPlan[]>("/admin/memberships"); }
export async function getMembershipSettings() { return membershipFetch<{ freeLearnerLimit: number }>("/admin/memberships/settings"); }
export async function saveMembership(plan: MembershipPlan) {
  await membershipFetch(plan.id ? `/admin/memberships/${encodeURIComponent(plan.id)}` : "/admin/memberships", { method: plan.id ? "PUT" : "POST", body: JSON.stringify(plan) });
  revalidatePath("/admin/memberships");
  revalidatePath("/pricing");
}
export async function saveMembershipSettings(freeLearnerLimit: number) {
  await membershipFetch("/admin/memberships/settings", { method: "PUT", body: JSON.stringify({ freeLearnerLimit }) });
  revalidatePath("/admin/memberships");
}
