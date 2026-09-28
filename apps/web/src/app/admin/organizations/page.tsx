import { Building2, Coins, Users } from "lucide-react";

import { AdminOrganizationManager } from "@/components/admin/admin-organization-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminOrganizations } from "@/lib/organizations-api";

export const dynamic = "force-dynamic";

function formatPoints(value: number) {
  return `${value.toLocaleString("zh-CN")} 点`;
}

export default async function AdminOrganizationsPage() {
  const result = await getAdminOrganizations();
  const totalBalance = result.organizations.reduce(
    (sum, organization) => sum + (organization.wallet?.balanceAvailable ?? 0),
    0
  );
  const totalMembers = result.organizations.reduce((sum, organization) => sum + organization.memberCount, 0);

  return (
    <AdminShell
      active="/admin/organizations"
      title="企业账号"
      description="管理企业组织、企业钱包、成员额度和企业消耗归集。"
    >
      <div className="flex flex-col gap-6">
        {!result.enabled ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              企业账号体系当前已停用。可在系统设置中启用，停用不会影响个人用户和个人钱包。
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Building2 className="size-5" />
              <div>
                <p className="text-sm text-muted-foreground">企业数量</p>
                <p className="text-2xl font-semibold">{result.organizations.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Users className="size-5" />
              <div>
                <p className="text-sm text-muted-foreground">企业成员</p>
                <p className="text-2xl font-semibold">{totalMembers}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Coins className="size-5" />
              <div>
                <p className="text-sm text-muted-foreground">企业可用点数</p>
                <p className="text-2xl font-semibold">{formatPoints(totalBalance)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <AdminOrganizationManager organizations={result.organizations} />
      </div>
    </AdminShell>
  );
}
