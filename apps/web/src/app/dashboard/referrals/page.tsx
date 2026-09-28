import { DashboardShell } from "@/components/shell/dashboard-shell";
import { ReferralPanel } from "@/components/billing/referral-panel";
import { requireAccountProfile } from "@/lib/profile-api";
import { getMyReferrals } from "@/lib/referral-api";

export const dynamic = "force-dynamic";
export default async function ReferralsPage() {
  await requireAccountProfile("/dashboard/referrals");
  const summary = await getMyReferrals();
  const siteUrl = (process.env.APP_BASE_URL ?? "https://xueleai.com").replace(/\/+$/, "");
  return <DashboardShell active="overview" continuation="/dashboard/referrals"><section className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8"><h1 className="text-2xl font-semibold">推荐好友</h1><ReferralPanel summary={summary} siteUrl={siteUrl} /></section></DashboardShell>;
}
