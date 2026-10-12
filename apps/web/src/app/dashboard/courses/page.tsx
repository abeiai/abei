import Link from "next/link";
import { CreatorWorkMetadata } from "@/components/creator/work-metadata";
import { BookOpen, Clock3, Plus, Send } from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { CourseLibrary } from "@/components/courses/course-library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth-actions";
import { getEnrolledCourses, getUserCourses } from "@/lib/course-api";
import { courseStatusLabel } from "@/lib/course-editor-state";
import type { CourseReviewState, CourseSummary } from "@/lib/course-types";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

function statusVariant(status: CourseReviewState) {
  if (status === "PUBLISHED") {
    return "secondary" as const;
  }

  if (status === "REJECTED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function displayedRevision(course: CourseSummary) {
  return course.workingRevision ?? course.approvedRevision;
}

function coverBackground(url: string) {
  return `url(${JSON.stringify(url)})`;
}

export default async function DashboardCoursesPage() {
  await requireAccountProfile("/dashboard/courses");
  const [userResult, coursesResult, enrolledResult] = await Promise.allSettled([
    getCurrentUser(),
    getUserCourses(),
    getEnrolledCourses()
  ]);

  if (userResult.status === "rejected") {
    throw userResult.reason;
  }

  const courses = coursesResult.status === "fulfilled" ? coursesResult.value : null;
  const courseList = courses ?? [];
  const enrolledPage = enrolledResult.status === "fulfilled"
    ? enrolledResult.value
    : { items: [], page: 1, pageSize: 12, total: 0 };
  const enrolledCourses = enrolledPage.items;
  const pendingCount = courseList.filter((course) => course.reviewState === "PENDING_REVIEW").length;

  return (
    <DashboardShell active="courses" continuation="/dashboard/courses">
      <section className="flex w-full flex-col gap-6 px-5 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">我的课程</h2>
            <p className="mt-1 text-sm text-muted-foreground">查看已加入课程，管理自己创建的课程。</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/courses/new">
              <Plus />
              创建课程
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <BookOpen className="size-5 text-muted-foreground" />
              <CardTitle className="text-3xl">{(enrolledPage.total + courseList.length).toLocaleString("zh-CN")}</CardTitle>
              <p className="text-sm text-muted-foreground">全部课程</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Clock3 className="size-5 text-muted-foreground" />
              <CardTitle className="text-3xl">{enrolledPage.total.toLocaleString("zh-CN")}</CardTitle>
              <p className="text-sm text-muted-foreground">已加入</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Send className="size-5 text-muted-foreground" />
              <CardTitle className="text-3xl">{pendingCount.toLocaleString("zh-CN")}</CardTitle>
              <p className="text-sm text-muted-foreground">审核中</p>
            </CardHeader>
          </Card>
        </div>

        <CourseLibrary
          initialCourses={enrolledCourses}
          initialTotal={enrolledPage.total}
          loadFailed={enrolledResult.status === "rejected"}
        />

        <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
          <div>
            <h3 className="text-xl font-semibold">我创建的课程</h3>
            <p className="mt-1 text-sm text-muted-foreground">{courseList.length} 门课程</p>
          </div>
        </div>

        {courses === null ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            课程列表加载失败，请稍后刷新重试。
          </div>
        ) : courseList.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {courseList.map((course) => {
              const revision = displayedRevision(course);
              const rereviewRejected = Boolean(
                course.approvedRevisionId && course.workingRevision?.status === "REJECTED"
              );

              return (
                <Card className="overflow-hidden" key={course.id}>
                  <div className="relative aspect-video bg-secondary">
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
                    >
                      <BookOpen className="size-6" />
                      <span>课程封面暂不可用</span>
                    </div>
                    {revision?.coverMedia.url ? (
                      <div
                        aria-label={`${revision.name}课程封面`}
                        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                        role="img"
                        style={{ backgroundImage: coverBackground(revision.coverMedia.url) }}
                      />
                    ) : null}
                  </div>
                  <CardHeader>
                    <CreatorWorkMetadata sync={course.creatorSync} />
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="line-clamp-2">{revision?.name ?? "未命名课程"}</CardTitle>
                      <Badge variant={rereviewRejected ? "muted" : statusVariant(course.reviewState)}>
                        {courseStatusLabel(
                          course.reviewState,
                          Boolean(course.approvedRevisionId),
                          course.workingRevision?.status
                        )}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {revision?.summary ?? "暂无课程简介"}
                    </p>
                    {rereviewRejected && course.workingRevision?.rejectionReason ? (
                      <p className="line-clamp-2 text-sm text-destructive">
                        未通过原因：{course.workingRevision.rejectionReason}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground">
                      {revision?.items.length ?? 0} 个课件 · 更新于 {formatDate(course.updatedAt)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href={`/dashboard/courses/${course.id}`}>
                          {course.reviewState === "PENDING_REVIEW" ? "查看课程" : "编辑课程"}
                        </Link>
                      </Button>
                      {revision ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/c/${course.id}`}>作者预览</Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-start gap-4 py-8">
              <p className="text-sm text-muted-foreground">还没有创建课程。</p>
              <Button asChild variant="outline">
                <Link href="/dashboard/courses/new">创建第一门课程</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </DashboardShell>
  );
}
