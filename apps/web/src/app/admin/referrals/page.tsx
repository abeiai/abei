import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentAdmin } from "@/lib/auth-actions";
import { getAdminReferralRecords, type AdminReferralUser } from "@/lib/admin-referrals-api";

export const dynamic = "force-dynamic";
type Filters = { q?: string; referrerId?: string; page?: string };
function userLink(user: AdminReferralUser) {
  return <div className="space-y-1"><Link className="font-medium hover:underline" href={`/admin/users/${user.id}`}>{user.nickname}</Link><p className="text-xs text-muted-foreground">{user.email}</p></div>;
}
function dateLabel(value: string) { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }

export default async function AdminReferralsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  await getCurrentAdmin();
  const filters = await searchParams;
  const records = await getAdminReferralRecords(filters);
  const totalPages = Math.max(1, Math.ceil(records.total / records.pageSize));
  const pageHref = (page: number) => {
    const query = new URLSearchParams({ page: String(page) });
    if (filters.q) query.set("q", filters.q);
    if (filters.referrerId) query.set("referrerId", filters.referrerId);
    return `/admin/referrals?${query}`;
  };
  const selectedUser = records.items.find(item => item.referrer.id === filters.referrerId)?.referrer;
  return <AdminShell active="/admin/referrals" title="推荐记录"><div className="space-y-6">
    <form action="/admin/referrals" method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5">
      <label className="flex w-full max-w-md flex-col gap-2 text-sm font-semibold" htmlFor="referral-query">推荐用户
        <Input id="referral-query" name="q" defaultValue={filters.q ?? ""} maxLength={100} placeholder="昵称、邮箱、推荐码或专属名称" />
      </label>
      {filters.referrerId && <input type="hidden" name="referrerId" value={filters.referrerId} />}
      <Button type="submit">筛选</Button><Button asChild variant="outline"><Link href="/admin/referrals">重置</Link></Button>
      {filters.referrerId && <p className="w-full text-sm text-muted-foreground">当前仅查看：{selectedUser?.nickname ?? "指定用户"}<Link className="ml-3 underline" href="/admin/referrals">取消用户筛选</Link></p>}
    </form>
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">推荐记录</h2><span className="text-sm text-muted-foreground">共 {records.total} 条成功推荐</span></div>
      <div className="overflow-x-auto rounded-xl border border-border"><Table>
        <TableHeader><TableRow><TableHead>推荐人</TableHead><TableHead>推荐码 / 专属名称</TableHead><TableHead>新注册用户</TableHead><TableHead>注册时间</TableHead><TableHead>推荐人奖励</TableHead><TableHead>新用户奖励</TableHead><TableHead>发奖时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
        <TableBody>{records.items.length ? records.items.map(item => <TableRow key={item.inviteeId}>
          <TableCell>{userLink(item.referrer)}</TableCell>
          <TableCell><div className="space-y-1">{[...item.referrer.referralHandles].sort((a, b) => a.kind.localeCompare(b.kind)).map(handle => <p key={handle.handle} className="text-sm">{handle.handle}</p>)}</div></TableCell>
          <TableCell>{userLink(item.invitee)}</TableCell><TableCell className="whitespace-nowrap">{dateLabel(item.invitee.createdAt)}</TableCell>
          <TableCell>{item.credits} 点</TableCell><TableCell>{item.credits} 点</TableCell><TableCell className="whitespace-nowrap">{dateLabel(item.createdAt)}</TableCell>
          <TableCell><Link className="whitespace-nowrap text-sm underline" href={`/admin/referrals?referrerId=${encodeURIComponent(item.referrer.id)}`}>查看该用户推荐</Link></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">{filters.q || filters.referrerId ? "没有符合条件的推荐记录" : "暂无推荐记录"}</TableCell></TableRow>}</TableBody>
      </Table></div>
      <nav aria-label="推荐记录分页" className="flex items-center justify-end gap-3">
        {records.page > 1 ? <Button asChild variant="outline"><Link href={pageHref(records.page - 1)}>上一页</Link></Button> : <Button disabled variant="outline">上一页</Button>}
        <span className="text-sm">第 {records.page} / {totalPages} 页</span>
        {records.page < totalPages ? <Button asChild variant="outline"><Link href={pageHref(records.page + 1)}>下一页</Link></Button> : <Button disabled variant="outline">下一页</Button>}
      </nav>
    </section>
  </div></AdminShell>;
}
