import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, RefreshCcw, ShieldCheck } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PaymentOrder } from "@/lib/billing-api";
import { getAdminOperationLogs } from "@/lib/operation-logs-api";
import {
  getAdminPaymentOrder,
  getPaymentNotifyLogs,
  supplementPaymentOrderAction,
  syncPaymentOrderAction,
  type PaymentNotifyLog
} from "@/lib/payment-admin-api";

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

function statusVariant(status: PaymentOrder["status"]) {
  if (status === "PAID") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CLOSED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function logResultVariant(value: PaymentNotifyLog["processResult"]) {
  return value === "CREDITED" || value === "DUPLICATE" ? "secondary" as const : "outline" as const;
}

export default async function AdminPaymentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const order = await getAdminPaymentOrder(id);
  const [notifyLogs, operationLogs] = await Promise.all([
    getPaymentNotifyLogs(order.orderNo),
    getAdminOperationLogs({
      resourceType: "PAYMENT_ORDER",
      resourceId: id
    })
  ]);

  return (
    <AdminShell
      active="/admin/payments"
      title="支付订单详情"
      description="查看订单、渠道返回数据、回调日志和补单处理结果。"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/payments">
              <ArrowLeft data-icon="inline-start" />
              返回订单列表
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <form action={syncPaymentOrderAction}>
              <input name="id" type="hidden" value={order.id} />
              <Button variant="outline" type="submit">
                <RefreshCcw data-icon="inline-start" />
                同步渠道状态
              </Button>
            </form>
            <form action={supplementPaymentOrderAction}>
              <input name="id" type="hidden" value={order.id} />
              <Button variant="outline" type="submit">
                <ShieldCheck data-icon="inline-start" />
                手动补单
              </Button>
            </form>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>订单信息</CardTitle>
            <CardDescription>补单前必须以支付渠道查询结果为准。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Info label="订单号" value={order.orderNo} mono />
              <Info label="渠道" value={order.providerName} />
              <Info label="状态" value={<Badge variant={statusVariant(order.status)}>{order.statusName}</Badge>} />
              <Info label="金额" value={`¥${order.amountCny}`} />
              <Info label="点数" value={`${order.credits.toLocaleString("zh-CN")} 点`} />
              <Info label="渠道流水号" value={order.providerTradeNo ?? "未返回"} mono />
              <Info label="用户" value={`${order.user?.nickname ?? "用户"} / ${order.user?.email ?? "未知邮箱"}`} />
              <Info label="创建时间" value={formatDate(order.createdAt)} />
              <Info label="支付时间" value={formatDate(order.paidAt)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>渠道数据</CardTitle>
            <CardDescription>展示渠道下单、查询或回调的最近原始返回，敏感密钥不会写入这里。</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-secondary/40 p-4 text-xs leading-6">
              {JSON.stringify(order.notifyRaw ?? order.providerPayload ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>回调日志</CardTitle>
            <CardDescription>当前订单最近回调处理记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>验签</TableHead>
                    <TableHead>处理结果</TableHead>
                    <TableHead>错误</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifyLogs.length > 0 ? (
                    notifyLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={log.verifyResult === "SUCCESS" ? "secondary" : "muted"}>
                            {log.verifyResult === "SUCCESS" ? "通过" : "失败"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={logResultVariant(log.processResult)}>{log.processResult}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xl text-sm text-muted-foreground">
                          {log.errorMessage ?? "无"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={4}>
                        暂无当前订单的回调日志。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>管理员操作记录</CardTitle>
            <CardDescription>展示当前订单相关的同步和补单操作。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>管理员</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationLogs.length > 0 ? (
                    operationLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.createdAt)}</TableCell>
                        <TableCell>{log.adminUser?.email ?? "未知管理员"}</TableCell>
                        <TableCell>{log.actionName}</TableCell>
                        <TableCell className="max-w-xl text-sm text-muted-foreground">
                          {log.description}
                        </TableCell>
                        <TableCell>{log.ip ?? "未知"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        暂无当前订单的管理员操作记录。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function Info({
  label,
  value,
  mono = false
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={mono ? "mt-2 break-all font-mono text-sm" : "mt-2 break-all text-sm font-medium"}>
        {value}
      </div>
    </div>
  );
}
