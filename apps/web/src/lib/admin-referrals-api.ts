import { cookies } from "next/headers";

export interface AdminReferralUser { id: string; nickname: string; email: string }
export interface AdminReferralRecords {
  items: Array<{
    inviteeId: string; credits: number; createdAt: string;
    referrer: AdminReferralUser & { referralHandles: Array<{ handle: string; kind: string }> };
    invitee: AdminReferralUser & { createdAt: string };
  }>;
  total: number; page: number; pageSize: number;
}
export async function getAdminReferralRecords(filters: { q?: string; referrerId?: string; page?: string }) {
  const query = new URLSearchParams();
  for (const key of ["q", "referrerId", "page"] as const) if (filters[key]) query.set(key, filters[key]!);
  const jar = await cookies();
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/admin/referrals?${query}`, {
    cache: "no-store", headers: { Cookie: jar.getAll().map(item => `${item.name}=${encodeURIComponent(item.value)}`).join("; ") }
  });
  const payload = await response.json() as { code: number; message: string; data: AdminReferralRecords };
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || "推荐记录暂不可用");
  return payload.data;
}
