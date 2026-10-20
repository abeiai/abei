import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterCourseCatalog,
  toggleCourseSelection
} from "../src/lib/course-library.js";
import type { PublicCourse, PublicCourseListingItem } from "../src/lib/course-types.js";

function courseFixture(overrides: Partial<PublicCourse> = {}): PublicCourse {
  return {
    id: "course-1",
    name: "自然拼读入门",
    coverUrl: "/cover.png",
    summary: "通过视频学习基础发音规则",
    tags: ["英语", "发音"],
    author: { nickname: "王老师", avatarUrl: null },
    reviewing: false,
    publishedAt: "2026-07-20T00:00:00.000Z",
    items: [],
    ...overrides
  };
}

test("专辑选择器同时支持关键词、标签筛选并排除已加入专辑", () => {
  const courses = [
    courseFixture(),
    courseFixture({
      id: "course-2",
      name: "生活数学",
      summary: "在购物情境里理解分数",
      tags: ["数学"],
      author: { nickname: "李老师", avatarUrl: null }
    }),
    courseFixture({ id: "course-3", name: "英语阅读", tags: ["英语", "阅读"] })
  ];

  assert.deepEqual(
    filterCourseCatalog(courses, { keyword: "王老师", tag: "英语", excludedIds: new Set() })
      .map((course) => course.id),
    ["course-1", "course-3"]
  );
  assert.deepEqual(
    filterCourseCatalog(courses, { keyword: "购物", tag: "数学", excludedIds: new Set() })
      .map((course) => course.id),
    ["course-2"]
  );
  assert.deepEqual(
    filterCourseCatalog(courses, { keyword: "", tag: "英语", excludedIds: new Set(["course-1"]) })
      .map((course) => course.id),
    ["course-3"]
  );

  assert.deepEqual(
    filterCourseCatalog([{
      ...courseFixture(),
      itemCount: 1,
      itemNames: ["莎士比亚诗歌带读"]
    }], { keyword: "莎士比亚", tag: "", excludedIds: new Set() }).map((course) => course.id),
    ["course-1"]
  );
});

test("资源中心按条件排序并固定最多展示二十个专辑", async () => {
  const library = await import("../src/lib/course-library.js") as unknown as {
    collectPopularCourseTopics?: (courses: PublicCourse[], limit?: number) => string[];
    preparePublicCourseListing?: (
      courses: PublicCourse[],
      options: { keyword: string; sort: "latest" | "popular"; topic: string }
    ) => PublicCourse[];
  };

  assert.equal(typeof library.preparePublicCourseListing, "function");
  assert.equal(typeof library.collectPopularCourseTopics, "function");

  if (!library.preparePublicCourseListing || !library.collectPopularCourseTopics) {
    return;
  }

  const courses = Array.from({ length: 25 }, (_, index) =>
    courseFixture({
      id: `course-${index}`,
      learningCount: index === 3 ? 999 : index,
      name: `阅读专辑 ${index}`,
      publishedAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      summary: index === 7 ? "诗歌中的爱与自然" : `专辑简介 ${index}`,
      tags: index % 2 === 0 ? ["英语", "阅读"] : ["科普"]
    })
  );

  const latest = library.preparePublicCourseListing(courses, {
    keyword: "",
    sort: "latest",
    topic: ""
  });
  const popular = library.preparePublicCourseListing(courses, {
    keyword: "",
    sort: "popular",
    topic: ""
  });
  const filtered = library.preparePublicCourseListing(courses, {
    keyword: "诗歌中的爱",
    sort: "latest",
    topic: "科普"
  });

  assert.equal(latest.length, 20);
  assert.deepEqual(latest.slice(0, 2).map((course) => course.id), ["course-24", "course-23"]);
  assert.equal(popular[0]?.id, "course-3");
  assert.deepEqual(filtered.map((course) => course.id), ["course-7"]);
  assert.deepEqual(library.collectPopularCourseTopics(courses, 3), ["英语", "阅读", "科普"]);
});

test("资源中心轻量列表仍可按课件名称搜索", () => {
  const courses: PublicCourseListingItem[] = [{
    id: "course-1",
    name: "自然拼读入门",
    coverUrl: "/cover.png",
    summary: "基础发音规则",
    tags: ["英语"],
    author: { nickname: "王老师", avatarUrl: null },
    reviewing: false,
    publishedAt: "2026-07-20T00:00:00.000Z",
    itemCount: 1,
    learningCount: 128,
    itemNames: ["字母发音练习"]
  }];

  assert.deepEqual(
    filterCourseCatalog(courses, {
      keyword: "字母发音",
      tag: "",
      excludedIds: new Set()
    }).map((course) => course.id),
    ["course-1"]
  );
});

test("专辑多选可以切换且最多保留五十门", () => {
  assert.deepEqual(toggleCourseSelection(["course-1"], "course-2"), ["course-1", "course-2"]);
  assert.deepEqual(toggleCourseSelection(["course-1", "course-2"], "course-1"), ["course-2"]);
  assert.equal(
    toggleCourseSelection(Array.from({ length: 50 }, (_, index) => `course-${index}`), "overflow").length,
    50
  );
});

test("添加专辑使用居中浮层、复选框和批量加入操作", () => {
  const source = readFileSync(
    new URL("../src/components/courses/course-library.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /createPortal/u);
  assert.match(source, /aria-modal="true"/u);
  assert.match(source, /type="checkbox"/u);
  assert.match(source, /addCoursesAction/u);
  assert.match(source, /searchCourseCatalogAction/u);
  assert.match(source, /搜索专辑名称、简介、标签或作者/u);
  assert.match(source, /handleDialogKeyDown/u);
  assert.match(source, /focus-within:ring/u);
  assert.match(source, /上一页/u);
  assert.match(source, /下一页/u);
  assert.match(source, /加载更多/u);
});
