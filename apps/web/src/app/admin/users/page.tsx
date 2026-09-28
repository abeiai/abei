import { UserRechargeTable } from "@/components/admin/user-recharge-table";
import { AdminShell } from "@/components/shell/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminUsers } from "@/lib/admin-users-api";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return (
    <AdminShell
      active="/admin/users"
      title="用户运营"
      description="查看用户账号、点数余额、注册时间和最近登录时间。"
    >
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>禁用用户后，登录和后续前台请求都会被拒绝。</CardDescription>
        </CardHeader>
        <CardContent>
          <UserRechargeTable users={users} />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
