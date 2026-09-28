import { getCurrentAdmin } from "@/lib/auth-actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { MembershipManager } from "@/components/admin/membership-manager";
import { getAdminMemberships, getMembershipSettings } from "@/lib/membership-api";
export const dynamic = "force-dynamic";
export default async function AdminMembershipsPage() {
  await getCurrentAdmin();
  const [plans, settings] = await Promise.all([getAdminMemberships(), getMembershipSettings()]);
  return <AdminShell active="/admin/memberships" title="会员管理" description="会员等级、定价与权益"><MembershipManager plans={plans} freeLearnerLimit={settings.freeLearnerLimit} /></AdminShell>;
}
