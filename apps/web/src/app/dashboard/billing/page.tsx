import { isMembershipExpiryEntry, isPointConsumeEntry, membershipExpiryDescription } from "@/lib/membership-ledger";
import { getMyMembership } from "@/lib/membership-api";
import { CheckCircle2, Coins, CreditCard, QrCode, WalletCards } from "lucide-react";
import Link from "next/link";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth-actions";
import {
  getLedger,
  getWallet,
  type LedgerEntry
} from "@/lib/billing-api";
import { cn } from "@/lib/utils";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

type BillingDetailView = "all" | "source" | "consume";

const taskTypeSceneNames: Record<string, string> = {
  AUDIO: "语音工具",
  COPYBOOK: "字帖生成",
  ENGLISH_GUIDED_STUDY: "英文带学",
  VIDEO_GUIDE: "视频导学课件"
};

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function formatPoints(value: number) {
  return `${value.toLocaleString("zh-CN")} 点`;
}

function normalizeView(value: string | undefined): BillingDetailView {
  if (value === "source" || value === "consume") {
    return value;
  }

  return "all";
}

function normalizeStartDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function billingDetailHref(
  view: BillingDetailView,
  options: {
    scenario?: string;
    startDate?: string;
  } = {}
) {
  const params = new URLSearchParams();

  if (view !== "all") {
    params.set("view", view);
  }

  if (view === "consume" && options.scenario && options.scenario !== "all") {
    params.set("scenario", options.scenario);
  }

  if (options.startDate) {
    params.set("startDate", options.startDate);
  }

  const query = params.toString();

  return `/dashboard/billing${query ? `?${query}` : ""}`;
}

function pointSourceName(entry: LedgerEntry) {
  if (entry.type === "ADMIN_ADJUST" && entry.amount > 0 && entry.idempotencyKey.startsWith("membership:")) return "会员赠送";
  if (entry.relatedOrder) {
    return "直接购买";
  }

  const note = entry.note ?? "";

  if (note.includes("会员")) {
    return "会员赠送";
  }

  if (note.includes("活动")) {
    return "活动赠送";
  }

  return "后台充值";
}

function pointSourceDescription(entry: LedgerEntry) {
  if (entry.relatedOrder) {
    return `订单 ${entry.relatedOrder.orderNo} · ¥${entry.relatedOrder.amountCny} · ${orderStatusName(entry.relatedOrder.status)}`;
  }

  if (entry.note) {
    return entry.note.replace(/^管理员充值：/, "");
  }

  return pointSourceName(entry);
}

function ledgerSceneName(entry: LedgerEntry) {
  if (entry.relatedTask?.scenarioName) {
    return entry.relatedTask.scenarioName;
  }

  if (entry.operationTypeName) {
    return entry.operationTypeName;
  }

  if (entry.relatedTaskType && taskTypeSceneNames[entry.relatedTaskType]) {
    return taskTypeSceneNames[entry.relatedTaskType];
  }

  return "其他点数消耗";
}

function ledgerDescription(entry: LedgerEntry) {
  if (entry.note) {
    return entry.note;
  }

  if (entry.relatedTaskId) {
    return `任务 ${entry.relatedTaskId.slice(0, 8)}`;
  }

  if (entry.relatedAudioTaskId) {
    return `语音任务 ${entry.relatedAudioTaskId.slice(0, 8)}`;
  }

  return ledgerSceneName(entry);
}

function isPointSourceEntry(entry: LedgerEntry) {
  return entry.amount > 0 && (entry.type === "TOP_UP" || entry.type === "ADMIN_ADJUST");
}

function ledgerTypeName(entry: LedgerEntry) {
  if (isMembershipExpiryEntry(entry)) return "会员点数到期";
  return isPointSourceEntry(entry) ? "点数来源" : "点数消耗";
}

function ledgerTypeDetail(entry: LedgerEntry) {
  if (isMembershipExpiryEntry(entry)) return "会员周期结束";
  return isPointSourceEntry(entry) ? pointSourceName(entry) : ledgerSceneName(entry);
}

function ledgerDetailDescription(entry: LedgerEntry) {
  if (isMembershipExpiryEntry(entry)) return membershipExpiryDescription(entry);
  return isPointSourceEntry(entry) ? pointSourceDescription(entry) : ledgerDescription(entry);
}

function ledgerChangeText(entry: LedgerEntry) {
  const prefix = isPointSourceEntry(entry) ? "+" : "-";

  return `${prefix}${formatPoints(Math.abs(entry.amount))}`;
}

function ledgerEmptyText(view: BillingDetailView) {
  if (view === "source") {
    return "暂无点数来源。";
  }

  if (view === "consume") {
    return "暂无点数消耗记录。";
  }

  return "暂无账单详情。";
}

function orderStatusName(status: string) {
  const names: Record<string, string> = {
    CREATED: "已创建",
    PAYING: "支付中",
    PAID: "已支付",
    CLOSED: "已关闭",
    FAILED: "支付失败"
  };

  return names[status] ?? status;
}

async function getDetailLedger(view: BillingDetailView, startDate?: string) {
  return getLedger(view, startDate);
}

export default async function BillingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; paid?: string; scenario?: string; startDate?: string; view?: string }>;
}) {
  const params = await searchParams;
  await requireAccountProfile("/dashboard/billing");
  await getCurrentUser();
  const detailView = normalizeView(params.view);
  const startDate = normalizeStartDate(params.startDate);
  const [wallet, ledger, membership] = await Promise.all([
    getWallet(),
    getDetailLedger(detailView, startDate),
    getMyMembership()
  ]);
  const sourceEntries = ledger.filter(isPointSourceEntry);
  const consumeEntries = ledger.filter(isPointConsumeEntry);
  const scenarioOptions = Array.from(new Set(consumeEntries.map((entry) => ledgerSceneName(entry)))).sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
  const selectedScenario = params.scenario && scenarioOptions.includes(params.scenario)
    ? params.scenario
    : "all";
  const filteredConsumeEntries = selectedScenario === "all"
    ? consumeEntries
    : consumeEntries.filter((entry) => ledgerSceneName(entry) === selectedScenario);
  const visibleLedger = detailView === "source"
    ? sourceEntries
    : detailView === "consume"
      ? filteredConsumeEntries
      : ledger;

  return (
    <DashboardShell active="billing" continuation="/dashboard/billing">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        {params.error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              操作失败：{params.error}
            </CardContent>
          </Card>
        ) : null}

        {params.paid ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6 text-sm">
              <CheckCircle2 data-icon="inline-start" />
              支付成功回调已处理，钱包余额和流水已刷新。
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>{membership.current?.name ?? "尚未开通会员"}</CardTitle><Button asChild variant="outline"><Link href="/pricing">{membership.current ? "续费 / 更换会员" : "查看会员"}</Link></Button></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {membership.current && <><p>有效期：{formatDate(membership.current.startsAt)} 至 {formatDate(membership.current.endsAt)}</p><p>会员可用点数：{membership.membershipCredits.toLocaleString("zh-CN")} · {membership.current.storageGb} GB 存储额度 · {membership.current.learnerLimit} 位学习者</p><p className="text-muted-foreground">会员点数优先消耗，当前周期结束清零。</p></>}
            {membership.upcoming.map((period) => <p key={period.id}>待生效：{period.name} · {formatDate(period.startsAt)} 至 {formatDate(period.endsAt)} · 赠送 {period.credits.toLocaleString("zh-CN")} 点</p>)}
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <WalletCards />
              </div>
              <CardDescription>当前可用点数</CardDescription>
              <CardTitle className="text-3xl">
                {wallet.availableCredits.toLocaleString("zh-CN")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <Coins />
              </div>
              <CardDescription>冻结点数</CardDescription>
              <CardTitle className="text-3xl">
                {wallet.frozenCredits.toLocaleString("zh-CN")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <CreditCard />
              </div>
              <CardDescription>累计充值</CardDescription>
              <CardTitle className="text-3xl">
                {wallet.totalTopUpCredits.toLocaleString("zh-CN")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <QrCode />
              </div>
              <CardDescription>累计消耗</CardDescription>
              <CardTitle className="text-3xl">
                {wallet.totalConsumedCredits.toLocaleString("zh-CN")}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <p className="text-sm text-muted-foreground">购买点数：{(wallet.purchasedCredits ?? wallet.availableCredits).toLocaleString("zh-CN")} · 会员点数：{membership.membershipCredits.toLocaleString("zh-CN")}</p>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle>账单详情</CardTitle>
                <CardDescription>
                  {detailView === "all"
                    ? "点数来源和点数消耗按时间排序。"
                    : detailView === "source"
                      ? "查看直接购买、会员赠送、活动赠送和后台充值。"
                      : "查看点数消耗，并可按场景筛选。"}
                </CardDescription>
              </div>
              <form action="/dashboard/billing" className="grid gap-3 sm:grid-cols-[180px_180px_auto_auto]" method="get">
                <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                  筛选类型
                  <Select defaultValue={detailView} name="view">
                    <option value="all">全部明细</option>
                    <option value="source">点数来源</option>
                    <option value="consume">点数消耗</option>
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                  起始日期
                  <Input defaultValue={startDate} name="startDate" type="date" />
                </label>
                <div className="flex items-end">
                  <Button className="w-full" size="sm" type="submit">
                    筛选
                  </Button>
                </div>
                {(detailView !== "all" || startDate) ? (
                  <div className="flex items-end">
                    <Button asChild className="w-full" size="sm" variant="outline">
                      <Link href="/dashboard/billing">重置</Link>
                    </Button>
                  </div>
                ) : null}
              </form>
            </div>
          </CardHeader>
          <CardContent>
            {detailView === "consume" && scenarioOptions.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <Link
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
                    selectedScenario === "all"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                  href={billingDetailHref("consume", { startDate })}
                >
                  全部场景
                </Link>
                {scenarioOptions.map((scenario) => (
                  <Link
                    className={cn(
                      "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
                      selectedScenario === scenario
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                    href={billingDetailHref("consume", { scenario, startDate })}
                    key={scenario}
                  >
                    {scenario}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>场景 / 来源</TableHead>
                    <TableHead>点数变动</TableHead>
                    <TableHead>余额</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLedger.length > 0 ? (
                    visibleLedger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge variant={isPointSourceEntry(entry) ? "default" : "secondary"}>
                            {ledgerTypeName(entry)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{ledgerTypeDetail(entry)}</Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-medium",
                            isPointSourceEntry(entry) ? "text-emerald-700" : "text-foreground"
                          )}
                        >
                          {ledgerChangeText(entry)}
                        </TableCell>
                        <TableCell>{formatPoints(entry.balanceAfter)}</TableCell>
                        <TableCell className="max-w-sm break-words text-xs">
                          {ledgerDetailDescription(entry)}
                        </TableCell>
                        <TableCell>{formatDate(entry.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={6}>
                        {ledgerEmptyText(detailView)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </DashboardShell>
  );
}
