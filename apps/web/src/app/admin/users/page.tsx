import Link from "next/link";
import { UserRechargeTable } from "@/components/admin/user-recharge-table";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { adminUserPageHref, adminUserQuery, readAdminUserFilters } from "@/lib/admin-user-query";
import { getAdminUsersPage, type AdminUsersPage as AdminUsersPageResult } from "@/lib/admin-users-api";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readAdminUserFilters(await searchParams);
  let result: AdminUsersPageResult | undefined;
  let errorMessage = "";
  try {
    result = await getAdminUsersPage(filters);
  } catch (error) {
    errorMessage = error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
      ? error.message : "用户列表加载失败，请稍后重试。";
  }
  const pageSize = result?.pageSize ?? 20;
  const pageHref = (page: number) => adminUserPageHref({ ...filters, pageSize: String(pageSize) }, page);

  return (
    <AdminShell active="/admin/users" title="用户运营">
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form action="/admin/users" method="get" key={adminUserQuery(filters)} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-60 flex-1 flex-col gap-2 text-sm font-medium" htmlFor="user-query">
              搜索用户
              <Input id="user-query" type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="邮箱、昵称或用户 ID" />
            </label>
            <label className="flex w-32 flex-col gap-2 text-sm font-medium" htmlFor="user-status">
              账号状态
              <Select id="user-status" name="status" defaultValue={filters.status}>
                <option value="">全部状态</option><option value="ACTIVE">正常</option><option value="DISABLED">已禁用</option>
              </Select>
            </label>
            <label className="flex w-40 flex-col gap-2 text-sm font-medium" htmlFor="user-start-date">
              注册开始日期
              <Input id="user-start-date" type="date" name="startDate" defaultValue={filters.startDate} />
            </label>
            <label className="flex w-40 flex-col gap-2 text-sm font-medium" htmlFor="user-end-date">
              注册结束日期
              <Input id="user-end-date" type="date" name="endDate" defaultValue={filters.endDate} />
            </label>
            <label className="flex w-28 flex-col gap-2 text-sm font-medium" htmlFor="user-page-size">
              每页条数
              <Select id="user-page-size" name="pageSize" defaultValue={String(pageSize)}>
                {[20, 50, 100].map(size => <option key={size} value={size}>{size} 条</option>)}
              </Select>
            </label>
            <div className="flex gap-2"><Button type="submit">搜索 / 筛选</Button><Button asChild variant="outline"><Link href="/admin/users">重置</Link></Button></div>
          </form>
          {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
          {result ? <>
            <p className="text-sm text-muted-foreground">共 {result.total.toLocaleString("zh-CN")} 位用户{result.total > 0 ? `，当前显示 ${(result.page - 1) * pageSize + 1}–${Math.min(result.page * pageSize, result.total)} 位` : ""}</p>
            <UserRechargeTable users={result.items} />
            <nav aria-label="用户列表分页" className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">第 {result.page} / {result.totalPages} 页</span>
              <div className="flex flex-wrap items-center gap-2">
                {result.page > 1 ? <>
                  <Button asChild variant="outline" size="sm"><Link href={pageHref(1)}>首页</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href={pageHref(result.page - 1)}>上一页</Link></Button>
                </> : <><Button disabled variant="outline" size="sm">首页</Button><Button disabled variant="outline" size="sm">上一页</Button></>}
                {result.page < result.totalPages ? <>
                  <Button asChild variant="outline" size="sm"><Link href={pageHref(result.page + 1)}>下一页</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href={pageHref(result.totalPages)}>末页</Link></Button>
                </> : <><Button disabled variant="outline" size="sm">下一页</Button><Button disabled variant="outline" size="sm">末页</Button></>}
                <form action="/admin/users" method="get" key={result.page} className="flex items-center gap-2">
                  {Object.entries({ ...filters, pageSize: String(pageSize) }).filter(([key, value]) => key !== "page" && value).map(([key, value]) => <input type="hidden" name={key} value={value} key={key} />)}
                  <label htmlFor="user-page" className="text-sm">跳至</label>
                  <Input id="user-page" name="page" type="number" className="h-9 w-20" min={1} max={result.totalPages} step={1} defaultValue={result.page} required />
                  <span className="text-sm">页</span><Button type="submit" variant="outline" size="sm">跳转</Button>
                </form>
              </div>
            </nav>
          </> : null}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
