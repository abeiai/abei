import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ResponsiveImage } from "../ui/responsive-image";
import type {
  CourseListItem,
  PublicCourse,
  PublicCourseListingItem
} from "@/lib/course-types";

export function PublicCourseCard({
  course,
  eagerCover = false
}: {
  course: CourseListItem | PublicCourse | PublicCourseListingItem;
  eagerCover?: boolean;
}) {
  const itemCount = "itemCount" in course ? course.itemCount : course.items.length;
  const learningCount = course.learningCount ?? 0;

  return (
    <Link className="group block h-full min-w-0" href={`/c/${course.id}`}>
      <article className="h-full overflow-hidden rounded-xl border border-border bg-background transition-shadow group-hover:shadow-sm">
        <div className="relative aspect-video overflow-hidden bg-secondary">
          <div
            aria-hidden={course.coverUrl ? true : undefined}
            className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <BookOpen className="size-6" />
            <span>暂无封面</span>
          </div>
          {course.coverUrl ? (
            <ResponsiveImage
              alt={`${course.name}课程封面`}
              className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
              decoding="async"
              fetchPriority={eagerCover ? "high" : "auto"}
              loading={eagerCover ? "eager" : "lazy"}
              src={course.coverUrl}
            />
          ) : null}
          {course.reviewing ? (
            <Badge className="absolute left-3 top-3 shadow-sm" variant="outline">审核中</Badge>
          ) : null}
        </div>
        <div className="flex min-h-36 flex-col px-4 pb-4 pt-3">
          <h3 className="truncate text-base font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
            {course.name}
          </h3>
          <p className="mt-0.5 truncate text-sm font-normal text-muted-foreground">
            {course.summary || "暂无课程简介"}
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[10px] font-medium text-foreground ring-1 ring-border">
              {course.author.avatarUrl ? (
                <ResponsiveImage
                  usage="avatar"
                  sizes="20px"
                  alt={`${course.author.nickname}头像`}
                  className="size-full object-cover"
                  decoding="async"
                  loading="lazy"
                  src={course.author.avatarUrl}
                />
              ) : (
                <span aria-hidden="true">{authorInitial(course.author.nickname)}</span>
              )}
            </span>
            <span className="truncate">{course.author.nickname}</span>
          </div>
          <p className="mt-auto pt-3 text-sm text-muted-foreground">
            {itemCount}个课件 · {learningCount.toLocaleString("zh-CN")}次学习
          </p>
        </div>
      </article>
    </Link>
  );
}

function authorInitial(nickname: string) {
  return Array.from(nickname.trim())[0] ?? "学";
}
