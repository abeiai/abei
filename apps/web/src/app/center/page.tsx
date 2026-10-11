import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { PublicCourseCard } from "@/components/courses/public-course-card";
import { PublicShell } from "@/components/shell/public-shell";
import { TextbookBreadcrumbs } from "@/components/textbook/textbook-page-sections";
import { getPublicCourseListing } from "@/lib/course-api";
import {
  collectPopularCourseTopics,
  preparePublicCourseListing
} from "@/lib/course-library";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "绘本馆",
  description: "浏览已发布课程和学习课件。"
};

type CenterSearchParams = Record<string, string | string[] | undefined>;

export default async function ResourceCenterPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<CenterSearchParams>;
} = {}) {
  const params = await searchParams;
  const courses = await getPublicCourseListing();
  const keyword = readParam(params.q);
  const topic = readParam(params.topic);
  const sort = readParam(params.sort) === "popular" ? "popular" : "latest";
  const popularTopics = collectPopularCourseTopics(courses);
  const visibleCourses = preparePublicCourseListing(courses, { keyword, sort, topic });

  return (
    <PublicShell>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10">
        <TextbookBreadcrumbs
          items={[
            { href: "/", label: "首页" },
            { href: "/center", label: "绘本馆" }
          ]}
        />

        <div className="space-y-5">
          <form action="/center" className="mx-auto w-full max-w-3xl" method="get">
            {sort === "popular" ? <input name="sort" type="hidden" value="popular" /> : null}
            {topic ? <input name="topic" type="hidden" value={topic} /> : null}
            <div className="flex h-14 items-center rounded-xl border border-border bg-background px-5 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
              <input
                aria-label="搜索课程"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
                defaultValue={keyword}
                name="q"
                placeholder="输入关键词查找学习资源、课件或主题"
                type="search"
              />
              <button aria-label="提交搜索" className="ml-3 text-muted-foreground transition-colors hover:text-foreground" type="submit">
                <Search className="size-5" />
              </button>
            </div>
          </form>

          {popularTopics.length > 0 ? (
            <nav aria-label="热门主题" className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm">
              <span className="text-muted-foreground">热门主题：</span>
              {popularTopics.map((item) => (
                <Link
                  className={item === topic ? "font-medium text-amber-600" : "text-muted-foreground hover:text-foreground"}
                  href={centerHref({ keyword, sort, topic: item === topic ? "" : item })}
                  key={item}
                >
                  {item}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-[#f7f7f6] px-5 py-3 text-sm">
          <div className="flex items-center gap-3">
            <Link className={sort === "latest" ? "font-medium text-amber-600" : "text-muted-foreground hover:text-foreground"} href={centerHref({ keyword, sort: "latest", topic })}>
              最新发布
            </Link>
            <span className="text-border">/</span>
            <Link className={sort === "popular" ? "font-medium text-amber-600" : "text-muted-foreground hover:text-foreground"} href={centerHref({ keyword, sort: "popular", topic })}>
              最多学习
            </Link>
          </div>
          <span className="text-muted-foreground">共 {visibleCourses.length} 门课程</span>
        </div>

        {visibleCourses.length > 0 ? (
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {visibleCourses.map((course, index) => (
              <PublicCourseCard course={course} eagerCover={index === 0} key={course.id} />
            ))}
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">没有找到符合条件的课程</p>
        )}
      </section>
    </PublicShell>
  );
}

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function centerHref({
  keyword,
  sort,
  topic
}: {
  keyword: string;
  sort: "latest" | "popular";
  topic: string;
}) {
  const params = new URLSearchParams();

  if (keyword) params.set("q", keyword);
  if (topic) params.set("topic", topic);
  if (sort === "popular") params.set("sort", sort);

  const query = params.toString();
  return query ? `/center?${query}` : "/center";
}
