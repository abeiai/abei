import Link from "next/link";
import { Film, Plus, Share2 } from "lucide-react";

import { VideoGuideLessonActions } from "@/components/dashboard/video-guide-lesson-actions";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { historyProfileFilterGroups, parseHistoryProfileFilter } from "@/lib/ai-api";
import { getUserVideoGuideLessons, type VideoGuideLesson } from "@/lib/video-guide-api";
import { getLearners, requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

function statusVariant(status: VideoGuideLesson["status"]) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "DRAFT") {
    return "outline" as const;
  }

  if (status === "FAILED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)}M`;
  }

  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("zh-CN")}K`;
}

function siteUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3321").replace(/\/+$/, "");
}

export default async function DashboardVideoGuidesPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ profile?: string | string[] }>;
} = {}) {
  await requireAccountProfile("/dashboard/video-guides");
  const learners = await getLearners();
  const profile = parseHistoryProfileFilter((await searchParams).profile, learners);
  const profileGroups = historyProfileFilterGroups(learners);
  const lessons = await getUserVideoGuideLessons(profile).catch(() => []);
  const completedCount = lessons.filter((lesson) => lesson.status === "SUCCEEDED").length;
  const latestLesson = lessons[0] ?? null;
  const baseUrl = siteUrl();

  return (
    <DashboardShell active="video-guides" continuation="/dashboard/video-guides">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        <form action="/dashboard/video-guides" className="flex flex-wrap items-end gap-3" method="get">
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
          <Button type="submit" variant="outline">筛选</Button>
        </form>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
                <Film />
              </div>
              <CardDescription>全部课件</CardDescription>
              <CardTitle className="text-3xl">{lessons.length.toLocaleString("zh-CN")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
                <Share2 />
              </div>
              <CardDescription>可分享课件</CardDescription>
              <CardTitle className="text-3xl">{completedCount.toLocaleString("zh-CN")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>最近生成</CardDescription>
              <CardTitle className="text-xl">{latestLesson ? formatDate(latestLesson.createdAt) : "暂无课件"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/media-tutor">
                  <Plus data-icon="inline-start" />
                  新建导学课件
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>导学课件列表</CardTitle>
                <CardDescription>展示当前账号最近生成的视频导学课件和分享入口。</CardDescription>
              </div>
              <Button asChild variant="outline">
                <Link href="/media-tutor">生成新课件</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>课件</TableHead>
                    <TableHead>素材</TableHead>
                    <TableHead>字幕</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>生成时间</TableHead>
                    <TableHead>分享</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lessons.length > 0 ? (
                    lessons.map((lesson) => {
                      const shareUrl = `${baseUrl}${lesson.sharePath}`;

                      return (
                        <TableRow key={lesson.id}>
                          <TableCell className="max-w-[240px]">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{lesson.title}</span>
                              <span className="break-all text-xs text-muted-foreground">{lesson.shareToken}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span>{lesson.mediaName}</span>
                              <span className="text-xs text-muted-foreground">
                                {lesson.mediaType === "VIDEO" ? "视频" : "音频"} · {formatBytes(lesson.mediaSizeBytes)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span>{lesson.subtitleName ?? "待上传或生成字幕"}</span>
                              <span className="text-xs text-muted-foreground">{lesson.subtitleFormat ?? "未生成"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(lesson.status)}>{lesson.statusName}</Badge>
                          </TableCell>
                          <TableCell>{formatDate(lesson.createdAt)}</TableCell>
                          <TableCell>
                            <VideoGuideLessonActions
                              canEdit={lesson.status === "DRAFT"}
                              disabled={lesson.status !== "SUCCEEDED"}
                              lessonId={lesson.id}
                              sharePath={lesson.sharePath}
                              shareUrl={shareUrl}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={6}>
                        暂无导学课件。可以先上传视频或音频和字幕，生成第一份可分享学习页。
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
