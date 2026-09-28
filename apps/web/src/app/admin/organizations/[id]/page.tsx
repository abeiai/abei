import Link from "next/link";
import { ArrowLeft, Coins, Users } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { adjustOrganizationCreditsAction, getAdminOrganization } from "@/lib/organizations-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

function formatPoints(value: number) {
  return `${value.toLocaleString("zh-CN")} 点`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusName(status: string) {
  const names: Record<string, string> = {
    ACTIVE: "正常",
    PENDING: "待认证",
    SUSPENDED: "已暂停",
    CLOSED: "已关闭"
  };

  return names[status] ?? status;
}

export default async function AdminOrganizationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const organization = await getAdminOrganization(id);

  return (
    <AdminShell
      active="/admin/organizations"
      title="企业账号"
      description="查看企业钱包、成员额度和企业用量。"
    >
      <div className="flex flex-col gap-6">
        <div>
          <Button asChild variant="outline">
            <Link href="/admin/organizations">
              <ArrowLeft data-icon="inline-start" />
              返回企业列表
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-5">
            <Card>
              <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">企业名称</p>
                  <p className="mt-1 text-2xl font-semibold">{organization.name}</p>
                  <p className="text-sm text-muted-foreground">{organization.legalName || organization.type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">状态</p>
                  <Badge className="mt-2" variant={organization.status === "ACTIVE" ? "secondary" : "muted"}>
                    {statusName(organization.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">所有者</p>
                  <p className="mt-1 font-medium">{organization.owner.nickname}</p>
                  <p className="text-sm text-muted-foreground">{organization.owner.email}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-3 pt-6">
                  <Coins className="size-5" />
                  <div>
                    <p className="text-sm text-muted-foreground">可用余额</p>
                    <p className="text-2xl font-semibold">{formatPoints(organization.wallet?.balanceAvailable ?? 0)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">冻结点数</p>
                  <p className="text-2xl font-semibold">{formatPoints(organization.wallet?.balanceReserved ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 pt-6">
                  <Users className="size-5" />
                  <div>
                    <p className="text-sm text-muted-foreground">成员数量</p>
                    <p className="text-2xl font-semibold">{organization.members.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>成员与额度</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>成员</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>总额度</TableHead>
                      <TableHead>已用</TableHead>
                      <TableHead>剩余</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organization.members.map((member) => {
                      const quota = member.quotas.reduce(
                        (summary, item) => {
                          summary.total += item.totalQuota;
                          summary.used += item.usedQuota;
                          summary.remaining += item.remainingQuota;
                          return summary;
                        },
                        { total: 0, used: 0, remaining: 0 }
                      );

                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <p className="font-medium">{member.nickname}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </TableCell>
                          <TableCell>{member.roleName}</TableCell>
                          <TableCell>{member.statusName}</TableCell>
                          <TableCell>{formatPoints(quota.total)}</TableCell>
                          <TableCell>{formatPoints(quota.used)}</TableCell>
                          <TableCell>{formatPoints(quota.remaining)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>钱包账本</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>变化</TableHead>
                      <TableHead>余额</TableHead>
                      <TableHead>备注</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organization.ledgers.length > 0 ? (
                      organization.ledgers.map((ledger) => (
                        <TableRow key={ledger.id}>
                          <TableCell>{formatDate(ledger.createdAt)}</TableCell>
                          <TableCell>{ledger.transactionType}</TableCell>
                          <TableCell>{formatPoints(ledger.pointsDelta)}</TableCell>
                          <TableCell>{formatPoints(ledger.balanceAfter)}</TableCell>
                          <TableCell>{ledger.remark ?? "无"}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell className="text-center text-muted-foreground" colSpan={5}>
                          暂无账本记录。
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>人工调整企业点数</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={adjustOrganizationCreditsAction} className="flex flex-col gap-4">
                <input name="orgId" type="hidden" value={organization.id} />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="amount">调整点数</FieldLabel>
                    <Input id="amount" name="amount" type="number" placeholder="正数增加，负数扣减" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="transaction-type">调整类型</FieldLabel>
                    <Select id="transaction-type" name="transactionType" defaultValue="GIFT">
                      <option value="GIFT">赠送点数</option>
                      <option value="ADJUST">人工调整</option>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reason">调整原因</FieldLabel>
                    <Textarea id="reason" name="reason" minLength={2} required />
                  </Field>
                </FieldGroup>
                <Button type="submit">确认调整</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
