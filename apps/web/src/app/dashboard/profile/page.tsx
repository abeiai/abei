import { ProfileSettingsPanel } from "@/components/profile/profile-forms";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getCurrentUser } from "@/lib/auth-actions";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  await requireAccountProfile("/dashboard/profile");
  const user = await getCurrentUser();

  return (
    <DashboardShell active="profile" continuation="/dashboard/profile">
      <ProfileSettingsPanel user={user} />
    </DashboardShell>
  );
}
