import Link from "next/link";
import { Activity, RefreshCcw } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminAudioTasks, type AdminAudioTask } from "@/lib/audio-admin-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

export default async function AdminAudioTasksPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    user: searchValue(params, "user"),
    status: searchValue(params, "status"),
    type: searchValue(params, "type")
  };
  const tasks = await getAdminAudioTasks(filters);
  const failureCount = tasks.filter((task) => task.status === "FAILED").length;
  const consumedCredits = tasks.reduce((sum, task) => sum + (task.actualCredits ?? 0), 0);

  return (
    <AdminShell
      active="/admin/audio/tasks"
      title="语音任务"
      description="按用户、状态和任务类型筛选语音任务，查看失败原因和关联流水。"
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="当前列表任务" value={tasks.length.toLocaleString("zh-CN")} />
          <Metric label="失败任务" value={failureCount.toLocaleString("zh-CN")} />
          <Metric label="已消耗点数" value={consumedCredits.toLocaleString("zh-CN")} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>筛选任务</CardTitle>
            <CardDescription>用户筛选支持邮箱、昵称和用户 ID 模糊匹配。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-4">
              <FieldGroup className="contents">
                <Field>
                  <FieldLabel htmlFor="user">用户</FieldLabel>
                  <Input id="user" name="user" defaultValue={filters.user} placeholder="邮箱、昵称或用户 ID" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="type">任务类型</FieldLabel>
                  <Select id="type" name="type" defaultValue={filters.type}>
                    <option value="">全部类型</option>
                    <option value="TTS">语音合成</option>
                    <option value="VOICE_DESIGN">声音设计</option>
                    <option value="VOICE_CLONE">声音复刻</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="status">状态</FieldLabel>
                  <Select id="status" name="status" defaultValue={filters.status}>
                    <option value="">全部状态</option>
                    <option value="CREATED">已创建</option>
                    <option value="RESERVED">已冻结点数</option>
                    <option value="PROCESSING">处理中</option>
                    <option value="SUCCEEDED">处理成功</option>
                    <option value="FAILED">处理失败</option>
                    <option value="CANCELLED">已取消</option>
                    <option value="COMPENSATED">已补偿</option>
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Button type="submit">
                    <RefreshCcw data-icon="inline-start" />
                    应用筛选
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>任务列表</CardTitle>
            <CardDescription>后台只查看任务状态、输出和关联流水，不提供成功任务输出改写入口。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>任务</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>模型与音色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>字符/点数</TableHead>
                    <TableHead>错误信息</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length > 0 ? (
                    tasks.map((task) => <TaskRow key={task.id} task={task} />)
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={8}>
                        暂无语音任务。
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <Activity />
        </div>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function TaskRow({ task }: { task: AdminAudioTask }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/audio/tasks/${task.id}`}>
            {task.typeName}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
        </div>
      </TableCell>
      <TableCell>{audioTaskSourceName(task)}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{task.user?.nickname ?? "未知用户"}</span>
          <span className="text-xs text-muted-foreground">{task.user?.email ?? task.userId}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs">{task.model}</span>
          <span className="text-xs text-muted-foreground">{task.voiceAsset?.name ?? "系统音色"}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 text-sm">
          <span>{task.inputTextLength.toLocaleString("zh-CN")} 字</span>
          <span className="text-muted-foreground">
            {task.actualCredits ?? task.estimatedCredits} 点
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-72">
        <p className="line-clamp-3 text-sm text-muted-foreground">{task.errorMessage ?? "无"}</p>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>{new Date(task.createdAt).toLocaleString("zh-CN")}</span>
          <span>{task.finishedAt ? new Date(task.finishedAt).toLocaleString("zh-CN") : "未完成"}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function audioTaskSourceName(task: AdminAudioTask) {
  const payload = task.providerPayload;
  const source = payload && typeof payload === "object" && "source" in payload ? payload.source : "";

  if (source === "VIDEO_GUIDE") {
    return "视频导学";
  }

  if (source === "EXPERIENCE") {
    return "体验区";
  }

  return "工具";
}
