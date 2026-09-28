import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiTask, type AiTask } from "@/lib/ai-api";
import { getCurrentUser } from "@/lib/auth-actions";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusVariant(status: AiTask["status"]) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function inputText(task: AiTask) {
  return task.input && typeof task.input.text === "string" ? task.input.text : "";
}

export default async function TaskDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const continuation = `/dashboard/tasks/${encodeURIComponent(id)}`;
  await requireAccountProfile(continuation);
  await getCurrentUser();
  const task = await getAiTask(id);

  return (
    <DashboardShell active="tasks" continuation={continuation}>
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild className="w-fit" variant="outline">
            <Link href="/dashboard/tasks">
              <ArrowLeft data-icon="inline-start" />
              返回任务历史
            </Link>
          </Button>
          <Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>任务信息</CardTitle>
            <CardDescription>任务编号：{task.id}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Info label="预估点数" value={`${task.estimatedCredits.toLocaleString("zh-CN")} 点`} />
            <Info label="实际消耗" value={`${(task.actualCredits ?? 0).toLocaleString("zh-CN")} 点`} />
            <Info label="模型" value={task.modelName ?? "本地 mock"} />
            <Info label="完成时间" value={formatDate(task.finishedAt)} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <ContentCard title="输入内容" description="用户提交的原始输入。">
            {inputText(task) || "无输入内容"}
          </ContentCard>
          <ContentCard title="生成结果" description="成功时展示输出，失败时展示中文错误提示。">
            {task.output ?? task.errorMessage ?? "暂无输出"}
          </ContentCard>
        </div>

        <ContentCard title="渲染 Prompt" description="后台根据模板变量和知识库片段渲染后的 Prompt。">
          {task.renderedPrompt ?? "暂无渲染 Prompt"}
        </ContentCard>

        {task.input.knowledgeContext ? (
          <ContentCard title="RAG 检索片段" description="本次任务拼入 Prompt 的知识库片段。">
            {task.input.knowledgeContext}
          </ContentCard>
        ) : null}
      </section>
    </DashboardShell>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 break-all text-sm font-medium">{value}</div>
    </div>
  );
}

function ContentCard({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-5 text-sm leading-7">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
