import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Download, Play } from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { audioUrl, getAudioTask, type AudioTask } from "@/lib/audio-api";
import { getCurrentUser } from "@/lib/auth-actions";
import { getPublicSystemConfigs } from "@/lib/settings-api";
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

function statusVariant(status: AudioTask["status"]) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "muted" as const;
  }

  return "outline" as const;
}

export default async function AudioTaskDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const continuation = `/dashboard/audio-tasks/${encodeURIComponent(id)}`;
  await requireAccountProfile(continuation);
  await getCurrentUser();
  const [task, publicConfigs] = await Promise.all([getAudioTask(id), getPublicSystemConfigs().catch(() => [])]);
  const configByKey = new Map(publicConfigs.map((config) => [config.key, config.value]));
  const downloadNotice =
    configByKey.get("audioDownloadNotice") ??
    "下载或对外使用生成音频前，请确认用途合法合规，并建议标注为 AI 生成语音。";
  const url = audioUrl(task);

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
            <Info label="模型" value={task.model} />
            <Info label="使用音色" value={task.voiceAsset?.name ?? "系统音色"} />
            <Info label="预估点数" value={`${task.estimatedCredits.toLocaleString("zh-CN")} 点`} />
            <Info label="实际消耗" value={`${(task.actualCredits ?? 0).toLocaleString("zh-CN")} 点`} />
            <Info label="创建时间" value={formatDate(task.createdAt)} />
            <Info label="完成时间" value={formatDate(task.finishedAt)} />
            <Info label="Request ID" value={task.requestId ?? "暂无"} />
            <Info label="错误码" value={task.errorCode ?? "无"} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <ContentCard title="输入文本" description="语音合成文本或声音设计描述。">
            {task.inputText ?? "无输入文本"}
          </ContentCard>
          <ContentCard title="错误信息" description="失败任务会在这里展示中文原因。">
            {task.errorMessage ?? "无错误信息"}
          </ContentCard>
        </div>

        {task.voiceConsent ? (
          <Card>
            <CardHeader>
              <CardTitle>授权记录</CardTitle>
              <CardDescription>
                {task.voiceConsent.consentTypeName} · {new Date(task.voiceConsent.agreedAt).toLocaleString("zh-CN", { hour12: false })}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-muted-foreground">
              {task.voiceConsent.consentText}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>输出音频</CardTitle>
            <CardDescription>成功任务可以在线播放和下载；文件不存在时显示已删除。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {url ? (
              <>
                <audio className="w-full" controls src={url}>
                  <track kind="captions" />
                </audio>
                <div className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                  {downloadNotice}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <a href={url}>
                      <Play data-icon="inline-start" />
                      在线试听
                    </a>
                  </Button>
                  <Button asChild>
                    <a download href={url}>
                      下载音频
                      <Download data-icon="inline-end" />
                    </a>
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                文件已删除或任务尚未生成音频。
              </div>
            )}
          </CardContent>
        </Card>
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
