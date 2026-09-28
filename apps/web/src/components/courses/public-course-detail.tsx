import Link from "next/link";
import { BookOpen, LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextbookBreadcrumbs } from "@/components/textbook/textbook-page-sections";
import { publicCourseItemPresentation } from "@/lib/course-editor-state";
import type { PublicCourse } from "@/lib/course-types";

import { CourseMaterialLaunch } from "./course-material-launch";
import { ExpandableCourseSummary } from "./expandable-course-summary";

type PublicCourseDetailProps = {
  canOpenMaterials?: boolean;
  course: PublicCourse;
  hasPublishedRevision?: boolean;
  previewMode?: "PUBLIC" | "CREATOR" | "ADMIN";
  revisionStatus?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
};

function coverBackground(url: string) {
  return `url(${JSON.stringify(url)})`;
}

export function PublicCourseDetail({
  canOpenMaterials = false,
  course,
  hasPublishedRevision = true,
  previewMode = "PUBLIC",
  revisionStatus = "APPROVED"
}: PublicCourseDetailProps) {
  const items = [...course.items].sort((left, right) => left.sortOrder - right.sortOrder);
  const updatedDate = formatCourseDate(course.publishedAt);
  const previewNotice = coursePreviewNotice(previewMode, revisionStatus, hasPublishedRevision);

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 sm:px-8 lg:px-10">
      <TextbookBreadcrumbs
        items={[
          { href: "/", label: "首页" },
          { href: "/center", label: "资源中心" },
          { href: `/c/${course.id}`, label: course.name }
        ]}
      />

      {previewNotice ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p>{previewNotice.message}</p>
          {previewNotice.canEdit ? (
            <Button asChild className="self-start sm:self-auto" size="sm" variant="outline">
              <Link href={`/dashboard/courses/${course.id}`}>编辑并申请发布</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr]">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-secondary">
          <div
            aria-hidden={course.coverUrl ? true : undefined}
            className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <BookOpen className="size-6" />
            <span>暂无封面</span>
          </div>
          {course.coverUrl ? (
            <div
              aria-label={`${course.name}课程封面`}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              role="img"
              style={{ backgroundImage: coverBackground(course.coverUrl) }}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-4">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-normal md:text-4xl">
            {course.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[10px] font-medium text-foreground ring-1 ring-border">
                {course.author.avatarUrl ? (
                  <img alt={`${course.author.nickname}头像`} className="size-full object-cover" src={course.author.avatarUrl} />
                ) : (
                  <span aria-hidden="true">{authorInitial(course.author.nickname)}</span>
                )}
              </span>
              <span className="truncate">{course.author.nickname}</span>
            </div>
            <span>{updatedDate}更新 共{items.length}个课件</span>
            {course.reviewing ? <Badge variant="outline">审核中</Badge> : null}
          </div>
          <ExpandableCourseSummary text={course.summary || "暂无课程介绍"} />
          {course.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {course.tags.map((tag) => (
                <Badge key={tag} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-xl font-semibold leading-snug">课程目录</h2>
          <span className="text-sm text-muted-foreground">共 {items.length} 个课件</span>
        </header>
        <ol>
            {items.map((item, index) => {
              const presentation = publicCourseItemPresentation(course, item);

              return (
                <li
                  className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-3 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary/45 sm:px-6"
                  key={item.id}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium leading-8">{item.displayName}</p>
                  </div>
                  {presentation.href ? (
                    <CourseMaterialLaunch
                      canOpenDirectly={canOpenMaterials}
                      courseId={course.id}
                      href={presentation.href}
                      itemName={item.displayName}
                    />
                  ) : (
                    <Button
                      aria-label={`${item.displayName}：${presentation.statusLabel}`}
                      className="size-8 px-0"
                      disabled
                      size="sm"
                      title={presentation.statusLabel}
                      variant="outline"
                    >
                      <LockKeyhole className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
        </ol>
      </section>
    </section>
  );
}

function coursePreviewNotice(
  previewMode: "PUBLIC" | "CREATOR" | "ADMIN",
  revisionStatus: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED",
  hasPublishedRevision: boolean
) {
  if (previewMode === "PUBLIC" || revisionStatus === "APPROVED") {
    return null;
  }

  const roleLabel = previewMode === "ADMIN" ? "管理员预览：" : "";

  if (revisionStatus === "DRAFT") {
    return {
      canEdit: previewMode === "CREATOR",
      message: hasPublishedRevision
        ? `${roleLabel}当前显示未提交的修改版本，资源中心仍展示已发布版本。`
        : `${roleLabel}当前显示未提交的草稿，尚未出现在资源中心。`
    };
  }

  if (revisionStatus === "REJECTED") {
    return {
      canEdit: previewMode === "CREATOR",
      message: hasPublishedRevision
        ? `${roleLabel}当前显示审核未通过的修改版本，资源中心仍展示已发布版本。`
        : `${roleLabel}当前版本审核未通过，修改后可重新申请发布。`
    };
  }

  return {
    canEdit: false,
    message: hasPublishedRevision
      ? `${roleLabel}当前显示审核中的修改版本，资源中心仍展示已发布版本。`
      : `${roleLabel}当前版本正在审核，通过后将出现在资源中心。`
  };
}

function authorInitial(nickname: string) {
  return Array.from(nickname.trim())[0] ?? "学";
}

function formatCourseDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}年${part("month")}月${part("day")}日`;
}
