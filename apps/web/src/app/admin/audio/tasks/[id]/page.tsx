import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAdminAudioTask,
  type AdminAudioTask,
  type AdminOperationLog
} from "@/lib/audio-admin-api";
import { getAdminAudioSourceFileUrl } from "@/lib/audio-admin-url";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

function statusVariant(status: string) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED" || status === "COMPENSATED") {
    return "muted" as const;
  }

  return "outline" as const;
}

export default async function AdminAudioTaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const task = await getAdminAudioTask(id);
  const sourceFileUrl = getAdminAudioSourceFileUrl(task.sourceSampleFilePath);

  return (
    <AdminShell
      active="/admin/audio/tasks"
      title="语音任务详情"
      description="查看语音任务状态、失败原因、输出音频、钱包流水和用量日志。"
    >
      <div className="flex flex-col gap-6">
        <Button asChild className="w-fit" variant="outline">
          <Link href="/admin/audio/tasks">
            <ArrowLeft data-icon="inline-start" />
            返回任务列表
          </Link>
        </Button>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>{task.typeName}</CardTitle>
              <CardDescription>{task.model} · {task.provider}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="任务状态" value={task.statusName} badge={task.status} />
              <Info label="用户" value={`${task.user?.nickname ?? "未知用户"} / ${task.user?.email ?? task.userId}`} />
              <Info label="Provider 请求 ID" value={task.requestId ?? "未记录"} />
              <Info label="预估点数" value={`${task.estimatedCredits.toLocaleString("zh-CN")} 点`} />
              <Info label="实际点数" value={`${(task.actualCredits ?? 0).toLocaleString("zh-CN")} 点`} />
              <Info label="完成时间" value={task.finishedAt ? new Date(task.finishedAt).toLocaleString("zh-CN") : "未完成"} />
              <div className="rounded-md border border-border p-4 md:col-span-2">
                <p className="text-sm text-muted-foreground">输入文本摘要</p>
                <p className="mt-2 line-clamp-6 text-sm leading-6">{task.inputText ?? "无输入文本"}</p>
              </div>
              <div className="rounded-md border border-border p-4 md:col-span-2">
                <p className="text-sm text-muted-foreground">失败原因</p>
                <p className="mt-2 text-sm leading-6">{task.errorMessage ?? "无失败信息"}</p>
                {task.errorCode ? <p className="mt-1 font-mono text-xs text-muted-foreground">{task.errorCode}</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>音频资产</CardTitle>
              <CardDescription>输出音频只读展示，后台不提供手动替换入口。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">任务音色</p>
                <p className="mt-2 text-sm font-medium">{task.voiceAsset?.name ?? "系统音色"}</p>
                {task.voiceAsset ? (
                  <Button asChild className="mt-3 w-fit" size="sm" variant="outline">
                    <Link href={`/admin/audio/voices/${task.voiceAsset.id}`}>查看音色</Link>
                  </Button>
                ) : null}
              </div>

              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">来源样本</p>
                {task.sourceAudioAsset ? (
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    <span>{task.sourceAudioAsset.typeName} · {task.sourceAudioAsset.mimeType}</span>
                    {sourceFileUrl ? (
                      <Button asChild className="w-fit" size="sm" variant="outline">
                        <a href={sourceFileUrl} rel="noreferrer" target="_blank">
                          <ExternalLink data-icon="inline-start" />
                          临时打开样本
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">当前样本暂无可用临时入口。</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">无来源样本。</p>
                )}
              </div>

              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">输出音频</p>
                {task.outputAudioAsset?.url ? (
                  <audio className="mt-3 w-full" controls src={task.outputAudioAsset.url} />
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">暂无输出音频。</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <LedgerEntries task={task} />
          <UsageLogs task={task} />
        </div>

        <OperationLogs logs={task.operationLogs ?? []} />
      </div>
    </AdminShell>
  );
}

function Info({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2">
        {badge ? <Badge variant={statusVariant(badge)}>{value}</Badge> : <p className="break-all text-sm font-medium">{value}</p>}
      </div>
    </div>
  );
}

function LedgerEntries({ task }: { task: AdminAudioTask }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>钱包流水</CardTitle>
        <CardDescription>展示该任务关联的冻结、消耗或释放流水。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>点数</TableHead>
                <TableHead>余额</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {task.ledgerEntries.length > 0 ? (
                task.ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.typeName}</TableCell>
                    <TableCell>{entry.amount.toLocaleString("zh-CN")}</TableCell>
                    <TableCell>{entry.balanceAfter.toLocaleString("zh-CN")}</TableCell>
                    <TableCell>{entry.note ?? "无"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    暂无钱包流水。
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

function UsageLogs({ task }: { task: AdminAudioTask }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>用量日志</CardTitle>
        <CardDescription>展示 Provider 请求、耗时、成本和结算点数。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>结果</TableHead>
                <TableHead>使用量</TableHead>
                <TableHead>点数</TableHead>
                <TableHead>请求 ID</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {task.usageLogs.length > 0 ? (
                task.usageLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={log.success ? "secondary" : "muted"}>{log.success ? "成功" : "失败"}</Badge>
                    </TableCell>
                    <TableCell>
                      {log.usageCount.toLocaleString("zh-CN")} · {log.characterCount.toLocaleString("zh-CN")} 字
                    </TableCell>
                    <TableCell>{log.consumedCredits.toLocaleString("zh-CN")}</TableCell>
                    <TableCell className="font-mono text-xs">{log.providerRequestId ?? "无"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    暂无用量日志。
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

function OperationLogs({ logs }: { logs: AdminOperationLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>审计记录</CardTitle>
        <CardDescription>展示该任务相关的后台操作记录。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>动作</TableHead>
                <TableHead>管理员</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell>{log.adminUser?.name ?? log.adminUser?.email ?? "系统"}</TableCell>
                    <TableCell>{log.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    暂无审计记录。
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
