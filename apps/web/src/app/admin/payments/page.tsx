import { RefreshCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { PaymentProviderLabel } from "@/components/billing/payment-provider-label";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAdminPaymentOrders,
  getPaymentNotifyLogs,
  supplementPaymentOrderAction,
  syncPaymentOrderAction,
  type PaymentNotifyLog
} from "@/lib/payment-admin-api";
import type { PaymentOrder } from "@/lib/billing-api";

export const dynamic = "force-dynamic";

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

export default async function AdminPaymentsPage() {
  const [orders, notifyLogs] = await Promise.all([
    getAdminPaymentOrders(),
    getPaymentNotifyLogs()
  ]);

  return (
    <AdminShell
      active="/admin/payments"
      title="支付订单"
      description="查看充值订单、渠道回调日志，并按真实渠道状态执行同步和补单。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <CardTitle>订单列表</CardTitle>
              <CardDescription>金额和点数以后端订单为准，补单必须先查询支付渠道。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>金额</TableHead>
                    <TableHead>点数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>支付时间</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length > 0 ? (
                    orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">
                          <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/payments/${order.id}`}>
                            {order.orderNo}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{order.user?.nickname ?? "用户"}</span>
                            <span className="text-xs text-muted-foreground">{order.user?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <PaymentProviderLabel iconOnly provider={order.provider} providerName={order.providerName} />
                        </TableCell>
                        <TableCell>¥{order.amountCny}</TableCell>
                        <TableCell>{order.credits.toLocaleString("zh-CN")} 点</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(order.status)}>{order.statusName}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(order.paidAt)}</TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <form action={syncPaymentOrderAction}>
                              <input name="id" type="hidden" value={order.id} />
                              <Button size="sm" variant="outline" type="submit">
                                <RefreshCcw data-icon="inline-start" />
                                同步
                              </Button>
                            </form>
                            <form action={supplementPaymentOrderAction}>
                              <input name="id" type="hidden" value={order.id} />
                              <Button size="sm" variant="outline" type="submit">
                                <ShieldCheck data-icon="inline-start" />
                                补单
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={9}>
                        暂无支付订单。
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
            <CardTitle>支付回调日志</CardTitle>
            <CardDescription>仅展示最近 100 条回调日志，不记录支付私钥或 API 密钥。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>订单号</TableHead>
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
                          <PaymentProviderLabel provider={log.provider} providerName={log.providerName} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.orderNo ?? "未知"}</TableCell>
                        <TableCell>
                          <Badge variant={log.verifyResult === "SUCCESS" ? "secondary" : "muted"}>
                            {log.verifyResult === "SUCCESS" ? "通过" : "失败"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={logResultVariant(log.processResult)}>{log.processResult}</Badge>
                        </TableCell>
                        <TableCell className="max-w-sm text-sm text-muted-foreground">
                          {log.errorMessage ?? "无"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={6}>
                        暂无支付回调日志。
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
