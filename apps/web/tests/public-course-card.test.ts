import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PublicCourseCard } from "../src/components/courses/public-course-card.js";
import type { PublicCourse } from "../src/lib/course-types.js";

const course: PublicCourse & { learningCount: number } = {
  id: "507f1f77bcf86cd799439011",
  name: "自然拼读入门",
  coverUrl: "/cover.png",
  summary: "通过视频学习基础发音规则",
  tags: ["英语", "发音"],
  author: { nickname: "王老师", avatarUrl: "/avatar.png" },
  reviewing: false,
  publishedAt: "2026-07-20T00:00:00.000Z",
  learningCount: 128,
  items: [
    {
      id: "item-1",
      materialType: "VIDEO_GUIDE",
      displayName: "字母发音",
      sortOrder: 0,
      reviewState: "READY",
      launchHref: "/media-tutor/share-1"
    },
    {
      id: "item-2",
      materialType: "LEARNING_FLASHCARD",
      displayName: "自然拼读闪卡",
      sortOrder: 1,
      reviewState: "READY",
      launchHref: "/learn/flashcards/deck-1"
    }
  ]
};

test("课程列表卡片使用视频流信息层级展示课件数和学习次数", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(React.createElement(PublicCourseCard, { course }));
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /自然拼读入门/u);
  assert.match(html, /通过视频学习基础发音规则/u);
  assert.match(html, /王老师/u);
  assert.match(html, /2个课件 · 128次学习/u);
  assert.match(html, /<img[^>]*alt="自然拼读入门课程封面"[^>]*src="\/_next\/image\?url=%2Fcover.png&amp;w=640&amp;q=82"[^>]*srcSet="[^"]*320w[^"]*640w"[^>]*loading="lazy"/u);
  assert.match(html, /aspect-video/u);
  assert.doesNotMatch(html, /aspect-\[4\/3\]/u);
  assert.match(html, /<article class="[^"]*overflow-hidden[^"]*rounded-xl[^"]*border[^"]*">/u);
  assert.match(html, /<img alt="王老师头像"[^>]*src="\/_next\/image\?url=%2Favatar.png&amp;w=128&amp;q=82"[^>]*sizes="20px"[^>]*loading="lazy"/u);
  assert.match(html, /size-5[^"]*rounded-full/u);
  assert.match(html, /<p class="[^"]*font-normal[^"]*text-muted-foreground[^"]*">通过视频学习基础发音规则<\/p>/u);
  assert.doesNotMatch(html, /已发布/u);
});

test("首屏课程封面可显式设为高优先级加载", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(React.createElement(PublicCourseCard, {
      course,
      eagerCover: true
    }));
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /fetchPriority="high"/u);
  assert.match(html, /loading="eager"/u);
});
