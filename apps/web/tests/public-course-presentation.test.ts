import { defaultOpenGraph } from "../src/lib/share-metadata";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PublicCourseDetail } from "../src/components/courses/public-course-detail.js";
import { CourseReviewingState } from "../src/components/courses/course-reviewing-state.js";
import {
  learningLaunchHref,
  publicCourseItemPresentation
} from "../src/lib/course-editor-state.js";
import type { PublicCourse } from "../src/lib/course-types.js";
import { getLearningFlashcardDeck } from "../src/lib/learning-flashcards-api.js";
import {
  buildPublicCourseMetadata,
  buildReviewingCourseMetadata
} from "../src/lib/public-course-metadata.js";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function cookies(){return {getAll(){return []}}};export async function headers(){return new Headers()}"
      };
    }

    return nextResolve(specifier, context);
  }
});

const { getCoursePageOrNull } = await import("../src/lib/course-api.js");
const { default: PublicCoursePage } = await import("../src/app/c/[id]/page.js");

function publicCourseFixture({
  reviewing,
  itemStates = ["READY", "READY", "READY"]
}: {
  reviewing: boolean;
  itemStates?: PublicCourse["items"][number]["reviewState"][];
}): PublicCourse {
  const launchHrefs = ["/media-tutor/share-1", "/text2lesson/material-1", "/flashcard/deck-1"];

  return {
    id: "507f1f77bcf86cd799439011",
    name: "公开课程",
    coverUrl: "https://example.com/cover.jpg",
    summary: "课程简介",
    tags: ["英语"],
    author: { nickname: "课程作者", avatarUrl: null },
    reviewing,
    publishedAt: "2026-07-18T00:00:00.000Z",
    items: itemStates.map((reviewState, index) => ({
      id: `item-${index + 1}`,
      materialType:
        index === 0
          ? "VIDEO_GUIDE"
          : index === 1
            ? "ENGLISH_GUIDED_STUDY"
            : "LEARNING_FLASHCARD",
      displayName: `课件 ${index + 1}`,
      sortOrder: index,
      reviewState,
      launchHref: launchHrefs[index]!
    }))
  };
}

const loggedInUserFixture = {
  id: "user-1",
  accountId: "XL202608300001",
  email: "learner@example.com",
  phone: null,
  phoneVerifiedAt: null,
  nickname: "学习者",
  avatarUrl: null,
  status: "ACTIVE"
};

async function loadCoursePageForViewer({
  previewMode = "PUBLIC",
  user = null
}: {
  previewMode?: "PUBLIC" | "CREATOR" | "ADMIN";
  user?: typeof loggedInUserFixture | null;
}) {
  const originalFetch = globalThis.fetch;
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  const course = publicCourseFixture({ reviewing: false });
  const calls: string[] = [];
  runtime.React = React;

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith(`/public/courses/${course.id}`)) {
      return Response.json({
        code: 0,
        message: "成功",
        data: {
          state: "AVAILABLE",
          course,
          hasPublishedRevision: true,
          previewMode,
          revisionStatus: "APPROVED"
        }
      });
    }

    if (url.endsWith("/auth/me")) {
      return user
        ? Response.json({ code: 0, message: "成功", data: user })
        : Response.json(
            { code: 40101, message: "请先登录", data: null },
            { status: 401 }
          );
    }

    throw new Error(`未预期的请求：${url}`);
  };

  try {
    const page = await PublicCoursePage({ params: Promise.resolve({ id: course.id }) });

    return {
      calls,
      course,
      shellProps: page.props as {
        children: React.ReactElement<{ canOpenMaterials?: boolean }>;
        currentUser?: { id: string } | null;
      }
    };
  } finally {
    globalThis.fetch = originalFetch;
    runtime.React = previousReact;
  }
}

test("课程复审时只禁用真实待审课件", () => {
  const course = publicCourseFixture({
    reviewing: true,
    itemStates: ["READY", "PENDING", "READY"]
  });

  assert.deepEqual(
    course.items.map((item) => publicCourseItemPresentation(course, item).href),
    [
      "/media-tutor/share-1?courseId=507f1f77bcf86cd799439011&courseRevisionItemId=item-1",
      null,
      "/flashcard/deck-1?courseId=507f1f77bcf86cd799439011&courseRevisionItemId=item-3"
    ]
  );
});

test("单课件待审只禁用对应入口", () => {
  const course = publicCourseFixture({
    reviewing: false,
    itemStates: ["READY", "PENDING", "READY"]
  });

  assert.deepEqual(
    course.items.map((item) => publicCourseItemPresentation(course, item).href),
    [
      "/media-tutor/share-1?courseId=507f1f77bcf86cd799439011&courseRevisionItemId=item-1",
      null,
      "/flashcard/deck-1?courseId=507f1f77bcf86cd799439011&courseRevisionItemId=item-3"
    ]
  );
});

test("课程课件启动链接携带编码后的课程和课程项上下文", () => {
  assert.equal(
    learningLaunchHref("/media-tutor/share-1", "course-1", "item-1"),
    "/media-tutor/share-1?courseId=course-1&courseRevisionItemId=item-1"
  );
  assert.equal(
    learningLaunchHref("/text2lesson/material-1?preview=1#study", "课程 1", "item/1"),
    "/text2lesson/material-1?preview=1&courseId=%E8%AF%BE%E7%A8%8B+1&courseRevisionItemId=item%2F1#study"
  );
});

test("公开课程 API 的业务 40401 与 HTTP 404 返回空结果", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    Response.json({ code: 40401, message: "课程不存在或尚未发布", data: null }, { status: 400 }),
    Response.json({ code: 50001, message: "请求失败", data: null }, { status: 404 })
  ];

  globalThis.fetch = async () => responses.shift()!;

  try {
    assert.equal(await getCoursePageOrNull("507f1f77bcf86cd799439011"), null);
    assert.equal(await getCoursePageOrNull("507f1f77bcf86cd799439012"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("公开课程服务异常、解析异常和网络异常继续抛出", async () => {
  const originalFetch = globalThis.fetch;
  const fetchResults: Array<() => Promise<Response>> = [
    async () => Response.json(
      { code: 50301, message: "Internal server error: prisma", data: null },
      { status: 503 }
    ),
    async () => new Response("not-json", { status: 200 }),
    async () => {
      throw new Error("network down");
    }
  ];

  globalThis.fetch = async () => fetchResults.shift()!();

  try {
    for (const id of [
      "507f1f77bcf86cd799439013",
      "507f1f77bcf86cd799439014",
      "507f1f77bcf86cd799439015"
    ]) {
      await assert.rejects(
        getCoursePageOrNull(id),
        (error: unknown) => error instanceof Error && error.message === "请求失败，请稍后重试。"
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("资源中心提供中文错误边界和重试入口", () => {
  const errorPath = new URL("../src/app/center/error.tsx", import.meta.url);

  assert.equal(existsSync(errorPath), true);
  const source = readFileSync(errorPath, "utf8");
  assert.match(source, /绘本馆加载失败/u);
  assert.match(source, /重新加载/u);
  assert.match(source, /reset\(\)/u);
});

test("资源中心沿用电子教材内容宽度并使用面包屑代替大标题", () => {
  const pagePath = new URL("../src/app/center/page.tsx", import.meta.url);
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /TextbookBreadcrumbs/u);
  assert.match(source, /max-w-7xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10/u);
  assert.match(source, /preparePublicCourseListing/u);
  assert.match(source, /lg:grid-cols-4/u);
  assert.doesNotMatch(source, /上一页|下一页/u);
  assert.doesNotMatch(source, /<h1[^>]*>资源中心<\/h1>/u);
});

test("公开课程 metadata 使用公开站点地址生成 canonical 和绝对封面 URL", () => {
  const course = {
    ...publicCourseFixture({ reviewing: false }),
    coverUrl: "/api/media/files/course-cover.jpg"
  };
  const metadata = buildPublicCourseMetadata(course, "https://xueleai.com/");

  assert.deepEqual(metadata.alternates, {
    canonical: `https://xueleai.com/c/${course.id}`
  });
  assert.equal(metadata.openGraph?.url, `https://xueleai.com/c/${course.id}`);
  assert.deepEqual(metadata.openGraph?.images, [
    "https://xueleai.com/api/media/files/course-cover.jpg"
  ]);
});

test("无封面课程使用品牌分享图并保留课程标题和摘要", () => {
  const course = { ...publicCourseFixture({ reviewing: false }), coverUrl: "" };
  const metadata = buildPublicCourseMetadata(course, "https://xueleai.com");

  assert.deepEqual(metadata.openGraph?.images, defaultOpenGraph.images);
  assert.equal(metadata.openGraph?.title, course.name);
  assert.equal(metadata.openGraph?.description, course.summary);
});

test("相对课程封面不会生成 localhost 外部 metadata URL", () => {
  const course = {
    ...publicCourseFixture({ reviewing: false }),
    coverUrl: "/api/media/files/course-cover.jpg"
  };
  const metadata = buildPublicCourseMetadata(course, "http://localhost:3321");

  assert.equal(metadata.alternates, undefined);
  assert.equal(metadata.openGraph?.url, undefined);
  assert.deepEqual(metadata.openGraph?.images, defaultOpenGraph.images);
  assert.doesNotMatch(JSON.stringify(metadata), /localhost/);
});

test("无效系统站点地址后继续使用有效环境站点地址", () => {
  const course = {
    ...publicCourseFixture({ reviewing: false }),
    coverUrl: "/api/media/files/course-cover.jpg"
  };

  for (const badConfig of ["not-a-url", "http://localhost:3321"]) {
    const metadata = buildPublicCourseMetadata(
      course,
      badConfig,
      "https://public.xueleai.com"
    );

    assert.deepEqual(metadata.alternates, {
      canonical: `https://public.xueleai.com/c/${course.id}`
    });
    assert.deepEqual(metadata.openGraph?.images, [
      "https://public.xueleai.com/api/media/files/course-cover.jpg"
    ]);
  }
});

test("不安全课程封面不会绕过公开 URL 校验", () => {
  for (const coverUrl of [
    "http://localhost:3321/private.jpg",
    "//localhost/private.jpg",
    "javascript:alert(1)",
    "\\\\localhost\\private.jpg",
    "/api/media/\nprivate.jpg"
  ]) {
    const metadata = buildPublicCourseMetadata(
      {
        ...publicCourseFixture({ reviewing: false }),
        coverUrl
      },
      "https://xueleai.com"
    );

    assert.deepEqual(metadata.openGraph?.images, defaultOpenGraph.images, coverUrl);
  }
});

test("未授权待审课程只显示资源审核中且不包含待审资料", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(CourseReviewingState, {
        courseId: "507f1f77bcf86cd799439011"
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /资源审核中/u);
  assert.match(html, /该资源正在审核，审核完成后即可访问/u);
  assert.match(html, /aria-label="面包屑"/u);
  assert.doesNotMatch(html, /课程作者|课程简介|课程封面|课件/u);
});

test("审核中元数据使用稳定地址和通用文案", () => {
  const courseId = "507f1f77bcf86cd799439011";
  const metadata = buildReviewingCourseMetadata(courseId, "https://xueleai.com");

  assert.equal(metadata.title, "资源审核中");
  assert.equal(metadata.description, "该资源正在审核，审核完成后即可访问。");
  assert.deepEqual(metadata.alternates, {
    canonical: `https://xueleai.com/c/${courseId}`
  });
  assert.doesNotMatch(JSON.stringify(metadata), /待审新版|待审简介|课程作者|课程封面/u);
});

test("课程详情页面按 API 状态渲染真实课程或通用审核页", () => {
  const pagePath = new URL("../src/app/c/[id]/page.tsx", import.meta.url);
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /getCoursePageOrNull/u);
  assert.match(source, /coursePage\.state === "REVIEWING"/u);
  assert.match(source, /CourseReviewingState/u);
  assert.match(source, /buildReviewingCourseMetadata/u);
});

test("课程详情页读取登录状态并把登录用户交给课件入口", async () => {
  const { calls, course, shellProps } = await loadCoursePageForViewer({
    user: loggedInUserFixture
  });

  assert.deepEqual(calls, [
    `http://localhost:3322/api/public/courses/${course.id}`,
    "http://localhost:3602/api/auth/me"
  ]);
  assert.equal(shellProps.currentUser?.id, "user-1");
  assert.equal(shellProps.children.props.canOpenMaterials, true);
});

test("游客仍可打开课程详情页且课件入口保持未登录状态", async () => {
  const { shellProps } = await loadCoursePageForViewer({});

  assert.equal(shellProps.currentUser, null);
  assert.equal(shellProps.children.props.canOpenMaterials, false);
});

test("创作者和管理员预览资源时都能直接打开课件", async () => {
  for (const previewMode of ["CREATOR", "ADMIN"] as const) {
    const { shellProps } = await loadCoursePageForViewer({ previewMode });

    assert.equal(shellProps.children.props.canOpenMaterials, true, previewMode);
  }
});

test("公开课程详情使用正确的标题层级", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(PublicCourseDetail, {
        course: {
          ...publicCourseFixture({ reviewing: false }),
          author: { nickname: "课程作者", avatarUrl: "/avatar.png" }
        }
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /<h1[^>]*>公开课程<\/h1>/u);
  assert.match(html, /<h2[^>]*>课程目录<\/h2>/u);
  assert.doesNotMatch(html, /创作者：/u);
  assert.match(html, /<img alt="课程作者头像"[^>]*src="\/_next\/image\?url=%2Favatar.png&amp;w=128&amp;q=82"[^>]*sizes="20px"/u);
  assert.match(html, /size-5[^"]*rounded-full/u);
  assert.match(html, /2026年07月18日更新 共3个课件/u);
  assert.doesNotMatch(html, /课程介绍/u);
  assert.match(html, /line-clamp-4/u);
  assert.match(html, /text-sm leading-6/u);
  assert.doesNotMatch(html, /line-clamp-4[^"]*text-base/u);
  assert.match(html, /aria-label="展开完整课程简介"/u);
  assert.match(html, />… 展开<\/button>/u);
  assert.ok(html.indexOf("公开课程</h1>") < html.indexOf("课程作者头像"));
  assert.ok(html.indexOf("课程作者头像") < html.indexOf("2026年07月18日更新 共3个课件"));
  assert.match(html, /aria-label="面包屑"/u);
  assert.match(html, />首页<\/a>.*».*>绘本馆<\/a>.*».*>公开课程<\/a>/u);
  assert.match(html, /class="grid gap-8 lg:grid-cols-\[minmax\(0,440px\)_1fr\]"/u);
  assert.doesNotMatch(html, /bg-\[#f7f7f6\]|rounded-2xl bg-|p-5 sm:p-6 lg:grid-cols/u);
});

test("游客从资源详情点击可用课件时先登录并返回原资源详情页", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(PublicCourseDetail, {
        canOpenMaterials: false,
        course: publicCourseFixture({ reviewing: false }),
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /aria-haspopup="dialog"/u);
  assert.match(html, /登录后继续学习/u);
  assert.match(html, /完成后将返回当前资源详情页/u);
  assert.match(
    html,
    /href="\/login\?next=%2Fc%2F507f1f77bcf86cd799439011"/u
  );
  assert.match(
    html,
    /href="\/register\?next=%2Fc%2F507f1f77bcf86cd799439011"/u
  );
  assert.doesNotMatch(html, /href="\/media-tutor\/share-1/u);
});

test("登录用户从资源详情直接进入课件", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(PublicCourseDetail, {
        canOpenMaterials: true,
        course: publicCourseFixture({ reviewing: false }),
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(
    html,
    /href="\/media-tutor\/share-1\?courseId=507f1f77bcf86cd799439011&amp;courseRevisionItemId=item-1"/u
  );
  assert.doesNotMatch(html, /登录后继续学习/u);
});

test("绘本资源播放链接只包含一组资源和目录条目参数", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  const course = publicCourseFixture({ reviewing: false });
  course.items = [{ ...course.items[0]!, materialType: "PICTURE_BOOK", launchHref: "/picture-books/book-1/play" }];
  let html: string;
  try {
    html = renderToStaticMarkup(React.createElement(PublicCourseDetail, { canOpenMaterials: true, course }));
  } finally {
    runtime.React = previousReact;
  }
  const href = html.match(/href="(\/picture-books\/[^"]+)"/u)?.[1]?.replaceAll("&amp;", "&");
  assert.ok(href);
  const link = new URL(href, "http://127.0.0.1:3600");
  assert.equal(link.pathname, "/picture-books/book-1/play");
  assert.deepEqual(link.searchParams.getAll("courseId"), [course.id]);
  assert.deepEqual(link.searchParams.getAll("courseRevisionItemId"), ["item-1"]);
  assert.deepEqual(link.searchParams.getAll("album"), [course.id]);
});

test("待审课件在游客和授权预览中都保持锁定且不出现登录入口", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;

  try {
    for (const canOpenMaterials of [false, true]) {
      const html = renderToStaticMarkup(
        React.createElement(PublicCourseDetail, {
          canOpenMaterials,
          course: publicCourseFixture({ reviewing: false, itemStates: ["PENDING"] }),
        })
      );

      assert.match(html, /disabled=""/u);
      assert.match(html, /课件审核中/u);
      assert.doesNotMatch(html, /aria-haspopup="dialog"|登录后继续学习/u);
    }
  } finally {
    runtime.React = previousReact;
  }
});

test("课程详情使用十六比九封面并在复审时显示审核状态", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(PublicCourseDetail, {
        course: { ...publicCourseFixture({ reviewing: true }), coverUrl: "/picture-book-demos/test/cover.webp" }
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /aspect-video/u);
  assert.doesNotMatch(html, /aspect-\[4\/3\]/u);
  assert.match(html, /审核中/u);
  assert.match(html, /<img[^>]*alt="[^"]*课程封面"/u);
  assert.match(html, /srcSet="[^"]*1280w"/u);
  assert.match(html, /sizes="\(max-width: 1023px\) 90vw, 440px"/u);
});

test("创作者预览未提审草稿时明确说明资源中心仍展示已发布版", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(PublicCourseDetail, {
        course: publicCourseFixture({ reviewing: false }),
        previewMode: "CREATOR",
        revisionStatus: "DRAFT"
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /当前显示未提交的修改版本/u);
  assert.match(html, /绘本馆仍展示已发布版本/u);
  assert.match(html, /href="\/dashboard\/courses\/507f1f77bcf86cd799439011"/u);
  assert.match(html, />编辑并申请发布</u);
});

test("登录态闪卡读取失败后使用脱敏公开响应并补齐展示字段", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    calls.push(String(input));

    if (calls.length === 1) {
      return Response.json({ code: 40101, message: "请先登录", data: null }, { status: 401 });
    }

    return Response.json({
      code: 0,
      message: "成功",
      data: {
        id: "deck-1",
        title: "公开闪卡",
        sourceType: "IMPORT",
        sourceName: "课程课件",
        textbookId: null,
        textbookRange: null,
        textbook: null,
        strategy: "DAILY_MEMORY",
        cardTypes: ["问答卡"],
        targetCardCount: 1,
        summary: "公开摘要",
        knowledgeMap: [],
        status: "READY",
        cards: [
          {
            id: "card-1",
            deckId: "deck-1",
            type: "问答卡",
            front: "问题",
            back: "答案",
            source: null,
            tags: [],
            sortOrder: 0,
            createdAt: "2026-07-18T00:00:00.000Z",
            updatedAt: "2026-07-18T00:00:00.000Z"
          }
        ],
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z"
      }
    });
  };

  try {
    const deck = await getLearningFlashcardDeck("deck-1");

    assert.deepEqual(calls, [
      "/api/learning-flashcards/decks/deck-1",
      "/api/public/learning-flashcards/decks/deck-1"
    ]);
    assert.equal(deck.userId, "");
    assert.equal(deck.detailRequest, null);
    assert.equal(deck.aiTask, null);
    assert.equal(deck.providerName, null);
    assert.equal(deck.modelName, null);
    assert.equal(deck.errorMessage, null);
    assert.deepEqual(deck.reviewSummary, { blurry: 0, hard: 0, mastered: 0 });
    assert.deepEqual(deck.cards[0]?.reviewSummary, { blurry: 0, hard: 0, mastered: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("课程闪卡使用提交链内置的匿名学习页面", () => {
  const routePath = new URL("../src/app/learn/flashcards/[id]/page.tsx", import.meta.url);
  const playerPath = new URL("../src/components/courses/public-flashcard-player.tsx", import.meta.url);

  assert.equal(existsSync(routePath), true);
  assert.equal(existsSync(playerPath), true);
  assert.match(readFileSync(routePath, "utf8"), /PublicFlashcardPlayer/u);
  assert.match(readFileSync(playerPath, "utf8"), /getPublicLearningFlashcardDeck/u);
});
