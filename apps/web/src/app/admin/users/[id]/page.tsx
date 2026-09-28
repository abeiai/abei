import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Coins, UserRoundCheck, UserRoundX } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adjustUserCreditsAction,
  getAdminUser,
  updateUserStatusAction,
  type AdminUserDetail
} from "@/lib/admin-users-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusVariant(status: AdminUserDetail["user"]["status"]) {
  return status === "ACTIVE" ? "secondary" as const : "muted" as const;
}

function amountText(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("zh-CN")} 点`;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getAdminUser(id);
  const nextStatus = detail.user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";

  return (
    <AdminShell
      active="/admin/users"
      title="用户详情"
      description="查看用户基础信息、钱包、订单、消费流水和 AI 任务。"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/users">
              <ArrowLeft data-icon="inline-start" />
              返回用户列表
            </Link>
          </Button>
          <form action={updateUserStatusAction}>
            <input name="id" type="hidden" value={detail.user.id} />
            <input name="status" type="hidden" value={nextStatus} />
            <Button variant="outline" type="submit">
              {detail.user.status === "ACTIVE" ? (
                <UserRoundX data-icon="inline-start" />
              ) : (
                <UserRoundCheck data-icon="inline-start" />
              )}
              {detail.user.status === "ACTIVE" ? "禁用用户" : "启用用户"}
            </Button>
          </form>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>账号状态会影响登录和后续前台接口访问。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Info label="用户 ID" value={detail.user.id} mono />
              <Info label="邮箱" value={detail.user.email} />
              <Info label="昵称" value={detail.user.nickname} />
              <Info label="状态" value={<Badge variant={statusVariant(detail.user.status)}>{detail.user.statusName}</Badge>} />
              <Info label="注册时间" value={formatDate(detail.user.createdAt)} />
              <Info label="最近登录" value={formatDate(detail.user.lastLoginAt)} />
              <Info label="更新时间" value={formatDate(detail.user.updatedAt)} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle>钱包信息</CardTitle>
              <CardDescription>可用、冻结、累计充值和累计消耗点数。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="可用点数" value={`${detail.wallet.availableCredits.toLocaleString("zh-CN")} 点`} />
                <Info label="冻结点数" value={`${detail.wallet.frozenCredits.toLocaleString("zh-CN")} 点`} />
                <Info label="累计充值" value={`${detail.wallet.totalTopUpCredits.toLocaleString("zh-CN")} 点`} />
                <Info label="累计消耗" value={`${detail.wallet.totalConsumedCredits.toLocaleString("zh-CN")} 点`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>管理员调点</CardTitle>
              <CardDescription>必须填写原因，扣减不能使可用余额为负数。</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={adjustUserCreditsAction} className="flex flex-col gap-4">
                <input name="id" type="hidden" value={detail.user.id} />
                <FieldGroup className="md:grid md:grid-cols-[160px_1fr]">
                  <Field>
                    <FieldLabel htmlFor="amount">调整点数</FieldLabel>
                    <Input id="amount" name="amount" type="number" placeholder="例如 100 或 -50" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reason">调整原因</FieldLabel>
                    <Input id="reason" name="reason" placeholder="例如 客服补偿或违规扣除" required />
                  </Field>
                </FieldGroup>
                <Button className="w-fit" type="submit">
                  <Coins data-icon="inline-start" />
                  提交调整
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <SimpleTable
          title="钱包流水"
          description="包含充值、冻结、消耗、释放和管理员调整。"
          headers={["时间", "类型", "变动", "余额", "关联", "备注"]}
          empty="暂无钱包流水。"
          colSpan={6}
        >
          {detail.ledgerEntries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{formatDate(entry.createdAt)}</TableCell>
              <TableCell>{entry.typeName}</TableCell>
              <TableCell>{amountText(entry.amount)}</TableCell>
              <TableCell>{entry.balanceAfter.toLocaleString("zh-CN")} 点</TableCell>
              <TableCell className="font-mono text-xs">
                {entry.relatedOrder?.orderNo ?? entry.relatedTask?.scenarioName ?? "无"}
              </TableCell>
              <TableCell className="max-w-sm text-muted-foreground">{entry.note ?? "无"}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>

        <SimpleTable
          title="充值记录"
          description="展示支付充值和管理员充值入账流水。"
          headers={["时间", "来源", "点数", "余额", "备注"]}
          empty="暂无充值记录。"
          colSpan={5}
        >
          {detail.rechargeRecords.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{formatDate(entry.createdAt)}</TableCell>
              <TableCell className="font-mono text-xs">
                {entry.relatedOrder ? (
                  <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/payments/${entry.relatedOrder.id}`}>
                    {entry.relatedOrder.orderNo}
                  </Link>
                ) : (
                  "管理员充值"
                )}
              </TableCell>
              <TableCell>{amountText(entry.amount)}</TableCell>
              <TableCell>{entry.balanceAfter.toLocaleString("zh-CN")} 点</TableCell>
              <TableCell className="max-w-sm text-muted-foreground">{entry.note ?? "无"}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>

        <SimpleTable
          title="消费记录"
          description="展示 AI 消耗和管理员扣减。"
          headers={["时间", "类型", "变动", "余额", "说明"]}
          empty="暂无消费记录。"
          colSpan={5}
        >
          {detail.consumeRecords.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{formatDate(entry.createdAt)}</TableCell>
              <TableCell>{entry.typeName}</TableCell>
              <TableCell>{amountText(entry.amount)}</TableCell>
              <TableCell>{entry.balanceAfter.toLocaleString("zh-CN")} 点</TableCell>
              <TableCell className="max-w-sm text-muted-foreground">
                {entry.relatedTask?.scenarioName ?? entry.note ?? "无"}
              </TableCell>
            </TableRow>
          ))}
        </SimpleTable>

        <SimpleTable
          title="AI 任务记录"
          description="展示最近 30 条 AI 任务。"
          headers={["任务", "场景", "模型", "状态", "点数", "完成时间"]}
          empty="暂无 AI 任务。"
          colSpan={6}
        >
          {detail.aiTasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-mono text-xs">
                <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/ai-tasks/${task.id}`}>
                  {task.id}
                </Link>
              </TableCell>
              <TableCell>{task.scenarioName}</TableCell>
              <TableCell>{task.modelName ?? "本地 mock"}</TableCell>
              <TableCell>{task.statusName}</TableCell>
              <TableCell>
                {(task.actualCredits ?? 0).toLocaleString("zh-CN")} /{" "}
                {task.estimatedCredits.toLocaleString("zh-CN")} 点
              </TableCell>
              <TableCell>{formatDate(task.finishedAt)}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </div>
    </AdminShell>
  );
}

function Info({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={mono ? "mt-2 break-all font-mono text-sm" : "mt-2 break-all text-sm font-medium"}>
        {value}
      </div>
    </div>
  );
}

function SimpleTable({
  title,
  description,
  headers,
  empty,
  colSpan,
  children
}: {
  title: string;
  description: string;
  headers: string[];
  empty: string;
  colSpan: number;
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children : children ? [children] : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={colSpan}>
                    {empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
