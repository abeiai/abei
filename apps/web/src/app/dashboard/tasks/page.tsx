import Link from "next/link";
import { Coins, ExternalLink } from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAiTasks,
  historyProfileFilterGroups,
  parseHistoryProfileFilter,
  type AiTask
} from "@/lib/ai-api";
import { getAudioTasks, type AudioTask } from "@/lib/audio-api";
import { getCurrentUser } from "@/lib/auth-actions";
import { getLearners, requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

type TaskStatus = AiTask["status"] | AudioTask["status"];

interface UnifiedTaskRow {
  id: string;
  type: string;
  summary: string;
  source: string;
  status: TaskStatus;
  statusName: string;
  credits: number | null;
  createdAt: string;
  href: string;
}

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusVariant(status: TaskStatus) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function previewText(task: AiTask) {
  const value =
    task.inputPreview ||
    (typeof task.input?.text === "string" ? task.input.text : "") ||
    task.input?.variables?.prompt ||
    "";

  return value.length > 42 ? `${value.slice(0, 42)}...` : value || "无输入内容";
}

function audioPreviewText(task: AudioTask) {
  const value = task.inputText ?? task.voiceAsset?.name ?? task.sourceAudioAsset?.objectKey ?? "";

  return value.length > 42 ? `${value.slice(0, 42)}...` : value || "无输入内容";
}

function aiTaskType(task: AiTask) {
  const capabilities = task.scenario.requiredCapabilities.map((item) => item.toUpperCase());

  if (capabilities.includes("VIDEO_GENERATION")) {
    return "视频任务";
  }

  if (capabilities.includes("IMAGE_GENERATION")) {
    return "图片任务";
  }

  return "文本任务";
}

function aiTaskSource(task: AiTask) {
  return task.scenario.slug.startsWith("experience-") ? "体验区" : "工具";
}

function audioTaskSource(task: AudioTask) {
  const source = typeof task.providerPayload?.source === "string" ? task.providerPayload.source : "";

  if (source === "EXPERIENCE") {
    return "体验区";
  }

  if (source === "VIDEO_GUIDE") {
    return "视频导学";
  }

  return "工具";
}

function consumedCredits(value: number | null) {
  return value === null ? "未结算" : `${value.toLocaleString("zh-CN")} 点`;
}

function toAiTaskRow(task: AiTask): UnifiedTaskRow {
  return {
    id: `ai:${task.id}`,
    type: aiTaskType(task),
    summary: previewText(task),
    source: aiTaskSource(task),
    status: task.status,
    statusName: task.statusName,
    credits: task.actualCredits,
    createdAt: task.createdAt,
    href: `/dashboard/tasks/${task.id}`
  };
}

function toAudioTaskRow(task: AudioTask): UnifiedTaskRow {
  return {
    id: `audio:${task.id}`,
    type: task.typeName,
    summary: audioPreviewText(task),
    source: audioTaskSource(task),
    status: task.status,
    statusName: task.statusName,
    credits: task.actualCredits,
    createdAt: task.createdAt,
    href: `/dashboard/audio-tasks/${task.id}`
  };
}

export default async function TasksPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ profile?: string | string[] }>;
} = {}) {
  await requireAccountProfile("/dashboard/tasks");
  await getCurrentUser();
  const learners = await getLearners();
  const profile = parseHistoryProfileFilter((await searchParams).profile, learners);
  const profileGroups = historyProfileFilterGroups(learners);
  const [aiTasks, audioTasks] = await Promise.all([
    getAiTasks(profile).catch(() => []),
    getAudioTasks(profile).catch(() => [])
  ]);
  const tasks = [...aiTasks.map(toAiTaskRow), ...audioTasks.map(toAudioTaskRow)]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 50);
  const succeededCount = tasks.filter((task) => task.status === "SUCCEEDED").length;
  const failedCount = tasks.filter((task) => task.status === "FAILED").length;
  const totalCredits = tasks.reduce((sum, task) => sum + (task.credits ?? 0), 0);

  return (
    <DashboardShell active="tasks" continuation="/dashboard/tasks">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        <form action="/dashboard/tasks" className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex min-w-56 flex-col gap-2 text-sm font-semibold">
            历史身份
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal"
              defaultValue={profile}
              name="profile"
            >
              {profileGroups.map((group) =>
                group.label ? (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ) : group.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))
              )}
            </select>
          </label>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium"
            type="submit"
          >
            筛选
          </button>
        </form>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>成功任务</CardDescription>
              <CardTitle className="text-3xl">{succeededCount.toLocaleString("zh-CN")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>失败任务</CardDescription>
              <CardTitle className="text-3xl">{failedCount.toLocaleString("zh-CN")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>累计消耗</CardDescription>
              <CardTitle className="text-3xl">{totalCredits.toLocaleString("zh-CN")} 点</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>任务列表</CardTitle>
            <CardDescription>统一展示文本、图片、视频和语音任务记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>摘要</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>消耗点数</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead>查看</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.type}</TableCell>
                        <TableCell className="max-w-[280px]">{task.summary}</TableCell>
                        <TableCell>{task.source}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <Coins data-icon="inline-start" />
                            {consumedCredits(task.credits)}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(task.createdAt)}</TableCell>
                        <TableCell>
                          <Link
                            className="inline-flex items-center gap-2 text-sm font-medium"
                            href={task.href}
                          >
                            查看
                            <ExternalLink />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={7}>
                        暂无任务。可以先进入工具或体验区创建第一条生成任务。
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
