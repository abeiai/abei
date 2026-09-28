import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminAiTask, type AdminAiTask } from "@/lib/ai-admin-api";

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

function statusVariant(status: AdminAiTask["status"]) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function inputText(task: AdminAiTask) {
  return task.inputPreview || (task.input && typeof task.input.text === "string" ? task.input.text : "");
}

export default async function AdminAiTaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const task = await getAdminAiTask(id);

  return (
    <AdminShell
      active="/admin/ai-tasks"
      title="AI 任务详情"
      description="查看任务状态、输入输出摘要、usage、点数结算和调用日志。"
    >
      <div className="flex flex-col gap-6">
        <Button asChild className="w-fit" variant="outline">
          <Link href="/admin/ai-tasks">
            <ArrowLeft data-icon="inline-start" />
            返回任务列表
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>任务信息</CardTitle>
            <CardDescription>任务编号：{task.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Info label="状态" value={<Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>} />
              <Info label="用户" value={`${task.user?.nickname ?? "用户"} / ${task.user?.email ?? "未知邮箱"}`} />
              <Info label="场景" value={task.scenario.name} />
              <Info label="模型" value={task.modelName ?? "本地 mock"} />
              <Info label="预估点数" value={`${task.estimatedCredits.toLocaleString("zh-CN")} 点`} />
              <Info label="实际消耗" value={`${(task.actualCredits ?? 0).toLocaleString("zh-CN")} 点`} />
              <Info label="冻结状态" value={task.reservation?.statusName ?? "无冻结记录"} />
              <Info label="完成时间" value={formatDate(task.finishedAt)} />
              <Info label="内容保存" value={task.saveFullContent ? "完整内容" : "仅预览与哈希"} />
              <Info label="输入哈希" value={task.inputHash ?? "无"} />
              <Info label="输出哈希" value={task.outputHash ?? "无"} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>输入摘要</CardTitle>
              <CardDescription>默认展示脱敏预览；完整内容保存需在系统设置中明确启用。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-5 text-sm leading-7">
                {inputText(task) || "无输入内容"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>输出摘要</CardTitle>
              <CardDescription>默认展示生成结果预览，生成失败时展示中文错误提示。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-5 text-sm leading-7">
                {task.outputPreview ?? task.output ?? task.errorMessage ?? "暂无输出"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>按输入和输出 token 计算实际点数，缺失 usage 时使用场景预估点数。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Info label="输入 Tokens" value={(task.inputTokens ?? 0).toLocaleString("zh-CN")} />
              <Info label="输出 Tokens" value={(task.outputTokens ?? 0).toLocaleString("zh-CN")} />
              <Info label="总 Tokens" value={(task.totalTokens ?? 0).toLocaleString("zh-CN")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>点数冻结与结算</CardTitle>
            <CardDescription>展示当前任务关联的钱包流水，包括冻结、消耗和释放。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>变动</TableHead>
                    <TableHead>余额</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {task.ledgerEntries.length > 0 ? (
                    task.ledgerEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.createdAt)}</TableCell>
                        <TableCell>{entry.typeName}</TableCell>
                        <TableCell>
                          {entry.amount > 0 ? "+" : ""}
                          {entry.amount.toLocaleString("zh-CN")} 点
                        </TableCell>
                        <TableCell>{entry.balanceAfter.toLocaleString("zh-CN")} 点</TableCell>
                        <TableCell className="max-w-sm text-sm text-muted-foreground">
                          {entry.note ?? "无"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        暂无点数流水。
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
            <CardTitle>调用日志</CardTitle>
            <CardDescription>日志不包含 API Key 和完整请求内容。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>错误</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {task.callLogs.length > 0 ? (
                    task.callLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.createdAt)}</TableCell>
                        <TableCell>{log.provider}</TableCell>
                        <TableCell>{log.model}</TableCell>
                        <TableCell>
                          {(log.totalTokens ?? 0).toLocaleString("zh-CN")} token
                        </TableCell>
                        <TableCell>{log.latencyMs ?? 0} ms</TableCell>
                        <TableCell>
                          <Badge variant={log.success ? "secondary" : "muted"}>
                            {log.success ? "成功" : "失败"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-sm text-sm text-muted-foreground">
                          {log.errorMessage ?? log.errorCode ?? "无"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={7}>
                        暂无真实 Provider 调用日志。
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

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 break-all text-sm font-medium">{value}</div>
    </div>
  );
}
