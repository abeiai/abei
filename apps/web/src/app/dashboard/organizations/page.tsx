import { OrganizationDashboard } from "@/components/dashboard/organization-dashboard";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getOrganization, getUserOrganizations } from "@/lib/organizations-api";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function DashboardOrganizationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  await requireAccountProfile("/dashboard/organizations");
  const organizationsResult = await getUserOrganizations();
  const selectedOrgId = firstParam(params, "org");
  const selectedOrganization = selectedOrgId ? await getOrganization(selectedOrgId).catch(() => null) : null;

  return (
    <DashboardShell active="organizations" continuation="/dashboard/organizations">
      <OrganizationDashboard organizations={organizationsResult} selectedOrganization={selectedOrganization} />
    </DashboardShell>
  );
}
