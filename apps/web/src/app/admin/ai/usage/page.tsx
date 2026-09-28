import Link from "next/link";
import { Activity, CheckCircle2, Coins, FileText, Gauge, Mic2, RefreshCcw, Timer, TrendingUp, type LucideIcon } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  aggregateAiUsageAction,
  getAdminAiUsageDashboard,
  getSystemAlerts,
  resolveSystemAlertAction,
  type SystemAlert,
  type UsageGroup,
  type UsageSummary
} from "@/lib/ai-usage-api";
import {
  getAdminAudioUsageDashboard,
  type AudioUsageGroup,
  type AudioUsageSummary
} from "@/lib/audio-admin-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function cost(value: number) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function duration(value: number | null) {
  if (!value) {
    return "0 秒";
  }

  return `${Math.round(value / 1000).toLocaleString("zh-CN")} 秒`;
}

function levelVariant(level: SystemAlert["level"]) {
  if (level === "ERROR") {
    return "muted" as const;
  }

  if (level === "WARNING") {
    return "outline" as const;
  }

  return "secondary" as const;
}

function statusVariant(success: boolean) {
  return success ? ("secondary" as const) : ("muted" as const);
}

export default async function AdminAiUsagePage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    from: searchValue(params, "from"),
    to: searchValue(params, "to"),
    providerId: searchValue(params, "providerId"),
    modelId: searchValue(params, "modelId"),
    operationType: searchValue(params, "operationType"),
    audioModel: searchValue(params, "audioModel")
  };
  const [dashboard, audioDashboard, alerts] = await Promise.all([
    getAdminAiUsageDashboard({
      from: filters.from,
      to: filters.to,
      providerId: filters.providerId,
      modelId: filters.modelId
    }),
    getAdminAudioUsageDashboard({
      from: filters.from,
      to: filters.to,
      operationType: filters.operationType,
      model: filters.audioModel
    }),
    getSystemAlerts("OPEN")
  ]);
  const audioTrendByDate = new Map(audioDashboard.trend.map((item) => [item.date, item]));
  const combinedTrend = dashboard.trend.map((item) => {
    const audio = audioTrendByDate.get(item.date) ?? emptyAudioSummary();

    return {
      date: item.date,
      ai: item,
      audio,
      totalRequestCount: item.requestCount + audio.requestCount,
      totalConsumedCredits: item.consumedCredits + audio.consumedCredits,
      totalEstimatedCost: item.estimatedCost + audio.estimatedCost,
      failureRate: combinedFailureRate(item, audio)
    };
  });
  const hasUsage = dashboard.total.requestCount > 0 || audioDashboard.total.requestCount > 0;
  const maxTrendCalls = Math.max(1, ...combinedTrend.map((item) => item.totalRequestCount));
  const modelRows = [
    ...dashboard.byModel.map((model) => modelUsageRow("AI 模型", model, `${model.totalTokens.toLocaleString("zh-CN")} tokens`)),
    ...audioDashboard.byModel.map((model) =>
      modelUsageRow("语音模型", model, `${model.characterCount.toLocaleString("zh-CN")} 字 · ${duration(model.audioDurationMs)}`)
    )
  ].sort((first, second) => second.consumedCredits - first.consumedCredits || second.requestCount - first.requestCount);

  return (
    <AdminShell
      active="/admin/ai/usage"
      title="用量成本"
      description="统一查看文本、图片、视频和语音模型调用量、点数消耗、估算成本、失败率和系统告警。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <CardTitle>筛选条件</CardTitle>
              <CardDescription>语音用量已合并到本页；成本字段为运营估算，实际账单以 Provider 为准。</CardDescription>
            </div>
            <form action={aggregateAiUsageAction}>
              <input name="from" type="hidden" value={dashboard.filters.from} />
              <input name="to" type="hidden" value={dashboard.filters.to} />
              <Button type="submit" variant="outline">
                <RefreshCcw data-icon="inline-start" />
                刷新 AI 统计
              </Button>
            </form>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <FieldGroup className="contents">
                <Field>
                  <FieldLabel htmlFor="from">开始日期</FieldLabel>
                  <Input id="from" name="from" type="date" defaultValue={dashboard.filters.from} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="to">结束日期</FieldLabel>
                  <Input id="to" name="to" type="date" defaultValue={dashboard.filters.to} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="providerId">AI Provider</FieldLabel>
                  <Select id="providerId" name="providerId" defaultValue={dashboard.filters.providerId}>
                    <option value="">全部 Provider</option>
                    {dashboard.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="modelId">AI 模型</FieldLabel>
                  <Select id="modelId" name="modelId" defaultValue={dashboard.filters.modelId}>
                    <option value="">全部 AI 模型</option>
                    {dashboard.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="operationType">语音类型</FieldLabel>
                  <Select id="operationType" name="operationType" defaultValue={audioDashboard.filters.operationType}>
                    <option value="">全部语音类型</option>
                    {audioDashboard.operationTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audioModel">语音模型</FieldLabel>
                  <Select id="audioModel" name="audioModel" defaultValue={audioDashboard.filters.model}>
                    <option value="">全部语音模型</option>
                    {audioDashboard.models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldGroup>
              <div className="xl:col-span-6">
                <Button type="submit">
                  <Activity data-icon="inline-start" />
                  应用筛选
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {!hasUsage ? (
          <Card>
            <CardHeader>
              <CardTitle>暂无用量统计</CardTitle>
              <CardDescription>当前筛选区间内没有模型调用或语音任务。创建任务后可回到本页查看。</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={Activity}
                label="今日总调用"
                value={(dashboard.today.requestCount + audioDashboard.today.requestCount).toLocaleString("zh-CN")}
                description={`AI ${dashboard.today.requestCount.toLocaleString("zh-CN")} / 语音 ${audioDashboard.today.requestCount.toLocaleString("zh-CN")}`}
              />
              <MetricCard
                icon={Coins}
                label="今日消耗"
                value={`${(dashboard.today.consumedCredits + audioDashboard.today.consumedCredits).toLocaleString("zh-CN")} 点`}
              />
              <MetricCard
                icon={TrendingUp}
                label="区间估算成本"
                value={cost(dashboard.total.estimatedCost + audioDashboard.total.estimatedCost)}
                badge="估算"
              />
              <MetricCard
                icon={Gauge}
                label="区间失败率"
                value={percent(combinedFailureRate(dashboard.total, audioDashboard.total))}
              />
              <MetricCard
                icon={FileText}
                label="AI Tokens"
                value={dashboard.total.totalTokens.toLocaleString("zh-CN")}
                description={`输入 ${dashboard.total.inputTokens.toLocaleString("zh-CN")} / 输出 ${dashboard.total.outputTokens.toLocaleString("zh-CN")}`}
              />
              <MetricCard
                icon={Mic2}
                label="语音字符"
                value={audioDashboard.total.characterCount.toLocaleString("zh-CN")}
                description={`音频 ${duration(audioDashboard.total.audioDurationMs)}`}
              />
              <MetricCard
                icon={CheckCircle2}
                label="最常用 AI 模型"
                value={dashboard.top.mostUsedModel?.name ?? "暂无"}
                description={
                  dashboard.top.mostUsedModel
                    ? `${dashboard.top.mostUsedModel.value.toLocaleString("zh-CN")} 次`
                    : undefined
                }
              />
              <MetricCard
                icon={Timer}
                label="平均耗时"
                value={`${combinedAvgLatencyMs(dashboard.total, audioDashboard.total).toLocaleString("zh-CN")} ms`}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>AI 用量汇总</CardTitle>
                  <CardDescription>
                    {dashboard.filters.from} 至 {dashboard.filters.to}，来自 AI 任务统计。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AiSummaryGrid summary={dashboard.total} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>语音用量汇总</CardTitle>
                  <CardDescription>
                    {audioDashboard.filters.from} 至 {audioDashboard.filters.to}，来自语音用量日志。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AudioSummaryGrid summary={audioDashboard.total} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>每日趋势</CardTitle>
                <CardDescription>按日期对比 AI 调用、语音任务、点数消耗和估算成本。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>总调用</TableHead>
                        <TableHead>AI 调用</TableHead>
                        <TableHead>语音任务</TableHead>
                        <TableHead>AI Tokens</TableHead>
                        <TableHead>语音字符</TableHead>
                        <TableHead>消耗点数</TableHead>
                        <TableHead>估算成本</TableHead>
                        <TableHead>失败率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedTrend.map((item) => (
                        <TableRow key={item.date}>
                          <TableCell>{item.date}</TableCell>
                          <TableCell>
                            <div className="flex min-w-44 items-center gap-3">
                              <div className="h-2 flex-1 rounded-full bg-secondary">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{
                                    width: `${Math.max(4, (item.totalRequestCount / maxTrendCalls) * 100)}%`
                                  }}
                                />
                              </div>
                              <span>{item.totalRequestCount.toLocaleString("zh-CN")}</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.ai.requestCount.toLocaleString("zh-CN")}</TableCell>
                          <TableCell>{item.audio.requestCount.toLocaleString("zh-CN")}</TableCell>
                          <TableCell>{item.ai.totalTokens.toLocaleString("zh-CN")}</TableCell>
                          <TableCell>{item.audio.characterCount.toLocaleString("zh-CN")}</TableCell>
                          <TableCell>{item.totalConsumedCredits.toLocaleString("zh-CN")} 点</TableCell>
                          <TableCell>{cost(item.totalEstimatedCost)}</TableCell>
                          <TableCell>{percent(item.failureRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>模型用量看板</CardTitle>
                <CardDescription>按当前时间段汇总不同 AI 模型和语音模型的调用、用量、点数和成本。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>类型</TableHead>
                        <TableHead>模型</TableHead>
                        <TableHead>调用量</TableHead>
                        <TableHead>用量</TableHead>
                        <TableHead>点数</TableHead>
                        <TableHead>估算成本</TableHead>
                        <TableHead>失败率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modelRows.length > 0 ? (
                        modelRows.map((row) => (
                          <TableRow key={`${row.kind}-${row.id}`}>
                            <TableCell>
                              <Badge variant={row.kind === "语音模型" ? "secondary" : "outline"}>{row.kind}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>{row.requestCount.toLocaleString("zh-CN")}</TableCell>
                            <TableCell>{row.usage}</TableCell>
                            <TableCell>{row.consumedCredits.toLocaleString("zh-CN")} 点</TableCell>
                            <TableCell>{cost(row.estimatedCost)}</TableCell>
                            <TableCell>{percent(row.failureRate)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell className="text-muted-foreground" colSpan={7}>
                            暂无模型用量。
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <AudioUsageGroup title="语音类型" items={audioDashboard.byOperation} />
              <AudioUsageGroup title="音色" items={audioDashboard.byVoice} />
              <AudioUsageGroup title="语音任务状态" items={audioDashboard.byStatus} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>最近语音用量日志</CardTitle>
                <CardDescription>用于快速追踪语音模型扣点和 Provider 返回的实际用量。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>用户</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>模型</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>用量</TableHead>
                        <TableHead>点数</TableHead>
                        <TableHead>任务</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audioDashboard.recentLogs.length > 0 ? (
                        audioDashboard.recentLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>{new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span>{log.user?.nickname ?? "用户"}</span>
                                <span className="text-xs text-muted-foreground">{log.user?.email}</span>
                              </div>
                            </TableCell>
                            <TableCell>{log.operationTypeName}</TableCell>
                            <TableCell>{log.model}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(log.success)}>{log.success ? "成功" : "失败"}</Badge>
                            </TableCell>
                            <TableCell>
                              {log.characterCount.toLocaleString("zh-CN")} 字 · {duration(log.audioDurationMs)}
                            </TableCell>
                            <TableCell>{log.consumedCredits.toLocaleString("zh-CN")} 点</TableCell>
                            <TableCell>
                              <Link className="font-mono text-xs underline-offset-4 hover:underline" href={`/admin/audio/tasks/${log.taskId}`}>
                                {log.taskId}
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell className="text-muted-foreground" colSpan={8}>
                            暂无语音用量日志。
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>未处理告警</CardTitle>
            <CardDescription>只在后台展示，不发送外部通知；处理后会记录管理员操作日志。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>级别</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.length > 0 ? (
                    alerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Badge variant={levelVariant(alert.level)}>{alert.levelName}</Badge>
                        </TableCell>
                        <TableCell>{alert.typeName}</TableCell>
                        <TableCell>
                          <div className="flex max-w-2xl flex-col gap-1">
                            <span className="font-medium">{alert.title}</span>
                            <span className="text-sm text-muted-foreground">{alert.message}</span>
                          </div>
                        </TableCell>
                        <TableCell>{new Date(alert.createdAt).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                        <TableCell>
                          <form action={resolveSystemAlertAction}>
                            <input name="id" type="hidden" value={alert.id} />
                            <Button size="sm" variant="outline" type="submit">
                              <CheckCircle2 data-icon="inline-start" />
                              标记处理
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        暂无未处理告警。
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

function MetricCard({
  icon: Icon,
  label,
  value,
  description,
  badge
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  description?: string;
  badge?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
            <Icon />
          </div>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </div>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="break-words text-2xl">{value}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
    </Card>
  );
}

function AiSummaryGrid({ summary }: { summary: UsageSummary }) {
  const items = [
    ["调用量", summary.requestCount.toLocaleString("zh-CN")],
    ["成功", summary.successCount.toLocaleString("zh-CN")],
    ["失败", summary.failureCount.toLocaleString("zh-CN")],
    ["失败率", percent(summary.failureRate)],
    ["输入 Tokens", summary.inputTokens.toLocaleString("zh-CN")],
    ["输出 Tokens", summary.outputTokens.toLocaleString("zh-CN")],
    ["总 Tokens", summary.totalTokens.toLocaleString("zh-CN")],
    ["消耗点数", `${summary.consumedCredits.toLocaleString("zh-CN")} 点`],
    ["估算成本", cost(summary.estimatedCost)]
  ];

  return <SummaryGrid items={items} />;
}

function AudioSummaryGrid({ summary }: { summary: AudioUsageSummary }) {
  const items = [
    ["语音合成", summary.ttsCount.toLocaleString("zh-CN")],
    ["声音设计", summary.voiceDesignCount.toLocaleString("zh-CN")],
    ["声音复刻", summary.voiceCloneCount.toLocaleString("zh-CN")],
    ["合成字符", summary.characterCount.toLocaleString("zh-CN")],
    ["音频时长", duration(summary.audioDurationMs)],
    ["消耗点数", `${summary.consumedCredits.toLocaleString("zh-CN")} 点`],
    ["估算成本", cost(summary.estimatedCost)],
    ["失败率", percent(summary.failureRate)],
    ["平均耗时", `${summary.avgLatencyMs.toLocaleString("zh-CN")} ms`]
  ];

  return <SummaryGrid items={items} />;
}

function SummaryGrid({ items }: { items: string[][] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map(([label, value]) => (
        <div className="rounded-md border border-border p-4" key={label}>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 break-all text-lg font-medium">{value}</p>
        </div>
      ))}
    </div>
  );
}

function AudioUsageGroup({ title, items }: { title: string; items: AudioUsageGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>按当前筛选条件聚合语音用量。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>任务量</TableHead>
                <TableHead>字符</TableHead>
                <TableHead>消耗</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length > 0 ? (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.requestCount.toLocaleString("zh-CN")}</TableCell>
                    <TableCell>{item.characterCount.toLocaleString("zh-CN")}</TableCell>
                    <TableCell>{item.consumedCredits.toLocaleString("zh-CN")} 点</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    暂无数据。
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

function emptyAudioSummary(): AudioUsageSummary {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    failureRate: 0,
    ttsCount: 0,
    voiceCloneCount: 0,
    voiceDesignCount: 0,
    characterCount: 0,
    audioDurationMs: 0,
    consumedCredits: 0,
    estimatedCost: 0,
    avgLatencyMs: 0
  };
}

function combinedFailureRate(ai: UsageSummary, audio: AudioUsageSummary) {
  const requestCount = ai.requestCount + audio.requestCount;

  return requestCount > 0 ? ((ai.failureCount + audio.failureCount) / requestCount) * 100 : 0;
}

function combinedAvgLatencyMs(ai: UsageSummary, audio: AudioUsageSummary) {
  const weight = ai.requestCount + audio.requestCount;

  if (weight <= 0) {
    return 0;
  }

  return Math.round(((ai.avgLatencyMs * ai.requestCount) + (audio.avgLatencyMs * audio.requestCount)) / weight);
}

function modelUsageRow(kind: "AI 模型" | "语音模型", model: UsageGroup | AudioUsageGroup, usage: string) {
  return {
    id: model.id,
    kind,
    name: model.name,
    requestCount: model.requestCount,
    usage,
    consumedCredits: model.consumedCredits,
    estimatedCost: model.estimatedCost,
    failureRate: model.failureRate
  };
}
