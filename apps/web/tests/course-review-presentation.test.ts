import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CourseReviewConfirmation,
  CourseReviewDiffDetails,
  CourseReviewLoadError,
  CourseReviewMetrics,
  CourseReviewWorkspace
} from "../src/components/admin/course-review-manager.js";
import {
  courseMaterialTypeLabel,
  courseMaterialFieldLabel,
  courseActionFailure,
  courseReviewAffectedCourseCount,
  courseReviewPreviewCourses,
  courseReviewActionOutcome,
  courseReviewTitle,
  claimCourseReviewSubmission,
  flashcardChangedFields,
  flashcardDiffTitle,
  flashcardPresentationFields,
  groupCourseReviewDiff,
  isCourseReviewConflict,
  localizeCourseReviewValue,
  normalizeCourseReviewFilters,
  courseRevisionItemPresentationFields,
  releaseCourseReviewSubmission,
  validateCourseReviewRejectionReason
} from "../src/lib/course-review-presentation.js";
import { adminNavGroups } from "../src/lib/mock-data.js";
import type { CourseMaterialType, CourseReviewRequest } from "../src/lib/course-types.js";

function reviewFixture(overrides: Partial<CourseReviewRequest> = {}): CourseReviewRequest {
  return {
    id: "review-1",
    scope: "COURSE_REVISION",
    status: "PENDING",
    courseId: "507f1f77bcf86cd799439011",
    courseRevisionId: "revision-1",
    materialPublicationId: null,
    submittedByUserId: "user-1",
    reviewedByAdminId: null,
    beforeSnapshot: null,
    afterSnapshot: {},
    diff: [],
    reviewNote: null,
    aiPrecheckStatus: "NOT_STARTED",
    aiPrecheckProgress: 0,
    aiPrecheckMessage: null,
    aiPrecheckResult: null,
    aiPrecheckTaskId: null,
    aiPrecheckTrigger: null,
    aiPrecheckStartedAt: null,
    aiPrecheckCompletedAt: null,
    submittedAt: "2026-07-18T08:00:00.000Z",
    reviewedAt: null,
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
    course: null,
    courseRevision: null,
    materialPublication: null,
    submittedByUser: {
      id: "user-1",
      email: "creator@example.com",
      nickname: "专辑作者"
    },
    reviewedByAdmin: null,
    affectedCourses: [],
    ...overrides
  };
}

function render(element: React.ReactNode) {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;

  try {
    return renderToStaticMarkup(element);
  } finally {
    runtime.React = previousReact;
  }
}

test("专辑和课件差异按资料、目录和内容分组", () => {
  const groups = groupCourseReviewDiff([
    { kind: "NAME", label: "专辑名称", before: "旧", after: "新" },
    { kind: "ITEM_REORDERED", label: "课件顺序", before: 2, after: 1 },
    { kind: "CARD_CHANGED", label: "闪卡 c1 正面", before: "cat", after: "a cat" }
  ]);

  assert.deepEqual(groups.map((group) => group.title), ["专辑资料", "专辑目录", "课件内容"]);
});

test("历史审核标签使用专辑称呼，原始审核快照和用户内容保持不变", () => {
  const diff = [
    { kind: "NAME", label: "课程名称", before: "旧课程名", after: "新课程名" },
    { kind: "COVER", label: "课程封面", before: "/old.png", after: "/new.png" },
    { kind: "SUMMARY", label: "课程简介", before: "旧", after: "新" }
  ] as const;
  const before = JSON.stringify(diff);
  const groups = groupCourseReviewDiff([...diff]);
  assert.deepEqual(groups[0]?.entries.map(entry => entry.label), ["专辑名称", "专辑封面", "专辑简介"]);
  assert.equal(groups[0]?.entries[0]?.after, "新课程名");
  assert.equal(JSON.stringify(diff), before);
});

test("全部差异类型稳定分组并在组内保留原顺序", () => {
  const kinds = [
    "CARD_CHANGED",
    "TAG_REMOVED",
    "ITEM_REMOVED",
    "NAME",
    "MATERIAL_FIELD",
    "ITEM_ADDED",
    "COVER",
    "CARD_ADDED",
    "SUMMARY",
    "ITEM_RENAMED",
    "TAG_ADDED",
    "CARD_REMOVED",
    "ITEM_REORDERED"
  ] as const;
  const groups = groupCourseReviewDiff(kinds.map((kind) => ({
    kind,
    label: kind,
    before: null,
    after: null
  })));

  assert.deepEqual(groups.map((group) => group.title), ["专辑资料", "专辑目录", "课件内容"]);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.kind), [
    "TAG_REMOVED",
    "NAME",
    "COVER",
    "SUMMARY",
    "TAG_ADDED"
  ]);
  assert.deepEqual(groups[1]?.entries.map((entry) => entry.kind), [
    "ITEM_REMOVED",
    "ITEM_ADDED",
    "ITEM_RENAMED",
    "ITEM_REORDERED"
  ]);
  assert.deepEqual(groups[2]?.entries.map((entry) => entry.kind), [
    "CARD_CHANGED",
    "MATERIAL_FIELD",
    "CARD_ADDED",
    "CARD_REMOVED"
  ]);
});

test("未知差异类型进入其他变更且不丢失内容", () => {
  const unknownEntry = {
    kind: "FUTURE_CHANGE",
    label: "未来变更",
    before: "旧值",
    after: "新值"
  };
  const groups = groupCourseReviewDiff([
    unknownEntry,
    { kind: "NAME", label: "专辑名称", before: "旧", after: "新" }
  ] as Parameters<typeof groupCourseReviewDiff>[0]);

  assert.deepEqual(groups.map((group) => group.title), ["专辑资料", "其他变更"]);
  assert.equal(groups[1]?.entries[0], unknownEntry);
});

test("审核查询参数只接受白名单且默认待审核", () => {
  assert.deepEqual(normalizeCourseReviewFilters({}), {
    status: "PENDING",
    scope: ""
  });
  assert.deepEqual(normalizeCourseReviewFilters({
    status: ["APPROVED", "REJECTED"],
    scope: "MATERIAL_CHANGE"
  }), {
    status: "APPROVED",
    scope: "MATERIAL_CHANGE"
  });
  assert.deepEqual(normalizeCourseReviewFilters({
    status: "UNKNOWN",
    scope: "ALL"
  }), {
    status: "PENDING",
    scope: ""
  });
});

test("拒绝原因按去除首尾空格后的 2 到 500 字校验", () => {
  assert.equal(validateCourseReviewRejectionReason(" 拒绝 "), null);
  assert.equal(validateCourseReviewRejectionReason(" a "), "拒绝原因至少需要 2 个字符。");
  assert.equal(
    validateCourseReviewRejectionReason("理".repeat(501)),
    "拒绝原因不能超过 500 个字符。"
  );
});

test("HTTP 409 和业务码 40901 由 action 失败结果结构化透传", () => {
  const result = courseActionFailure<void>({
    code: 40901,
    message: "审核状态已发生变化，请刷新后重试",
    httpStatus: 409
  }, "审核操作失败，请稍后重试。");

  assert.deepEqual(result, {
    ok: false,
    message: "审核状态已发生变化，请刷新后重试",
    code: 40901,
    httpStatus: 409
  });
  assert.equal(isCourseReviewConflict(result), true);
});

test("网络和解析异常不会伪造为审核冲突", () => {
  const result = courseActionFailure<void>(null, "审核操作失败，请稍后重试。");
  const malformed = courseActionFailure<void>({
    code: null,
    httpStatus: null,
    message: null
  }, "审核操作失败，请稍后重试。");

  assert.deepEqual(result, { ok: false, message: "审核操作失败，请稍后重试。" });
  assert.deepEqual(malformed, { ok: false, message: "审核操作失败，请稍后重试。" });
  assert.equal(isCourseReviewConflict(result), false);
  assert.equal(isCourseReviewConflict(malformed), false);
});

test("学习材料分组首位是统一资源审核入口", () => {
  const group = adminNavGroups.find((item) => item.key === "learning-materials");

  assert.deepEqual(group?.items[0] && {
    href: group.items[0].href,
    label: group.items[0].label
  }, {
    href: "/admin/course-reviews",
    label: "资源审核"
  });
});

test("顶部只展示待审核、专辑变更和课件变更三项指标", () => {
  const html = render(React.createElement(CourseReviewMetrics, {
    reviews: [
      reviewFixture(),
      reviewFixture({ id: "review-2", scope: "MATERIAL_CHANGE" }),
      reviewFixture({ id: "review-3", scope: "MATERIAL_CHANGE" })
    ]
  }));

  assert.match(html, /待审核数量[\s\S]*3/u);
  assert.match(html, /专辑变更数量[\s\S]*1/u);
  assert.match(html, /课件变更数量[\s\S]*2/u);
  assert.equal((html.match(/data-review-metric=/gu) ?? []).length, 3);
});

test("审核详情明确展示封面、标签、排序和内容的修改前后", () => {
  const html = render(React.createElement(CourseReviewDiffDetails, {
    review: reviewFixture({
      diff: [
        {
          kind: "COVER",
          label: "专辑封面",
          before: "/old-cover.jpg",
          after: "/new-cover.jpg"
        },
        {
          kind: "TAG_ADDED",
          label: "新增标签：语法",
          before: null,
          after: "语法"
        },
        {
          kind: "TAG_REMOVED",
          label: "移除标签：入门",
          before: "入门",
          after: null
        },
        {
          kind: "ITEM_REORDERED",
          label: "课件排序：第一课",
          before: 2,
          after: 1
        },
        {
          kind: "MATERIAL_FIELD",
          label: "视频标题",
          before: "旧标题",
          after: "新标题"
        },
        {
          kind: "CARD_CHANGED",
          label: "修改闪卡：cat",
          before: { front: "cat", back: "猫" },
          after: { front: "a cat", back: "一只猫" }
        }
      ]
    })
  }));

  assert.match(html, /专辑资料/u);
  assert.match(html, /专辑目录/u);
  assert.match(html, /课件内容/u);
  assert.equal((html.match(/aspect-video/gu) ?? []).length, 2);
  assert.match(html, /新增/u);
  assert.match(html, /删除/u);
  assert.match(html, /旧位置：第 3 位/u);
  assert.match(html, /新位置：第 2 位/u);
  assert.match(html, /修改前[\s\S]*旧标题/u);
  assert.match(html, /修改后[\s\S]*新标题/u);
  assert.match(html, /cat/u);
  assert.match(html, /a cat/u);
});

test("三类课件在审核详情中使用明确中文名称", () => {
  assert.deepEqual([
    courseMaterialTypeLabel("VIDEO_GUIDE"),
    courseMaterialTypeLabel("ENGLISH_GUIDED_STUDY"),
    courseMaterialTypeLabel("LEARNING_FLASHCARD")
  ], ["视频导学", "英文带读", "学习闪卡"]);
});

test("通过和拒绝都使用页面内二次确认且拒绝输入限制 2 到 500 字", () => {
  const approveHtml = render(React.createElement(CourseReviewConfirmation, {
    mode: "approve",
    reason: "",
    error: null,
    isPending: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
    onReasonChange: () => undefined
  }));
  const rejectHtml = render(React.createElement(CourseReviewConfirmation, {
    mode: "reject",
    reason: "资料不完整",
    error: null,
    isPending: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
    onReasonChange: () => undefined
  }));

  assert.match(approveHtml, /确认通过本次审核/u);
  assert.match(approveHtml, /请再次确认/u);
  assert.match(rejectHtml, /拒绝原因/u);
  assert.match(rejectHtml, /minLength="2"/u);
  assert.match(rejectHtml, /maxLength="500"/u);
});

test("成功和 409 冲突都会刷新列表并清空选择，普通错误保留详情", () => {
  assert.deepEqual(courseReviewActionOutcome({
    ok: true,
    data: undefined,
    message: "专辑审核已通过。"
  }), {
    clearSelection: true,
    message: "专辑审核已通过。",
    refresh: true,
    success: true
  });
  assert.deepEqual(courseReviewActionOutcome({
    ok: false,
    message: "审核状态已发生变化，请刷新后重试",
    code: 40901,
    httpStatus: 409
  }), {
    clearSelection: true,
    message: "审核状态已发生变化，请刷新后重试",
    refresh: true,
    success: false
  });
  assert.deepEqual(courseReviewActionOutcome({
    ok: false,
    message: "专辑审核操作失败，请稍后重试。"
  }), {
    clearSelection: false,
    message: "专辑审核操作失败，请稍后重试。",
    refresh: false,
    success: false
  });
});

test("统一工作区同时展示审核队列、提交用户、影响专辑和结构化详情", () => {
  const review = reviewFixture({
    scope: "MATERIAL_CHANGE",
    materialPublication: {
      id: "publication-1",
      materialType: "VIDEO_GUIDE",
      videoGuideLessonId: "video-1",
      englishGuidedStudyMaterialId: null,
      learningFlashcardDeckId: null,
      status: "PENDING",
      approvedHash: "approved",
      currentHash: "current",
      approvedSnapshot: {},
      currentSnapshot: {},
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z"
    },
    affectedCourses: [
      {
        id: "507f1f77bcf86cd799439011",
        name: "英语入门课",
        reviewState: "PUBLISHED",
        publishedAt: "2026-07-17T08:00:00.000Z"
      }
    ],
    diff: [
      { kind: "MATERIAL_FIELD", label: "课件标题", before: "旧标题", after: "新标题" }
    ]
  });
  const html = render(React.createElement(CourseReviewWorkspace, {
    reviews: [review],
    selectedReview: review,
    confirmation: null,
    reason: "",
    error: null,
    isPending: false,
    onBeginAction: () => undefined,
    onCancelAction: () => undefined,
    onConfirmAction: () => undefined,
    onReasonChange: () => undefined,
    onSelect: () => undefined
  }));

  assert.match(html, /审核队列/u);
  assert.match(html, /专辑作者/u);
  assert.match(html, /creator@example\.com/u);
  assert.match(html, /视频导学/u);
  assert.match(html, /英语入门课/u);
  assert.match(html, /提交时间/u);
  assert.match(html, /课件标题/u);
  assert.match(html, /审核通过/u);
  assert.match(html, /审核拒绝/u);
});

test("服务端读取失败显示中文错误而不是空队列", () => {
  const html = render(React.createElement(CourseReviewLoadError));

  assert.match(html, /审核数据加载失败/u);
  assert.match(html, /稍后重试/u);
  assert.doesNotMatch(html, /暂无审核记录/u);
});

test("审核提交锁阻止同一操作重复发起并可在完成后释放", () => {
  const lock = { current: false };

  assert.equal(claimCourseReviewSubmission(lock), true);
  assert.equal(claimCourseReviewSubmission(lock), false);
  releaseCourseReviewSubmission(lock);
  assert.equal(claimCourseReviewSubmission(lock), true);
});

test("三类课件全部公开快照顶层字段都有稳定中文名称", () => {
  const fields: Record<CourseMaterialType, string[]> = {
    VIDEO_GUIDE: [
      "title",
      "mediaUrl",
      "subtitleName",
      "subtitleFormat",
      "subtitleUrl",
      "subtitleText",
      "subtitles",
      "subtitleCues",
      "cues",
      "summary",
      "stageNames",
      "words",
      "guideWords",
      "teacherSegments",
      "questions",
      "repeatLines",
      "narration",
      "narrationScript",
      "narrationTimeline",
      "narrationAudioUrl",
      "audioUrl",
      "audioDurationSeconds",
      "audioDurationMs",
      "narrationVoice"
    ],
    ENGLISH_GUIDED_STUDY: [
      "title",
      "sourceText",
      "original",
      "summary",
      "narration",
      "sentences",
      "explanationMode",
      "level",
      "questions",
      "audioUrl",
      "audioDurationSeconds",
      "audioDurationMs",
      "audioTimeline",
      "narrationTimelineV2"
    ],
    LEARNING_FLASHCARD: ["title", "summary", "knowledgeMap", "knowledgeGraph", "cards"],
    PICTURE_BOOK: ["title", "style", "aspectRatio", "pages"]
  };

  for (const [type, keys] of Object.entries(fields) as Array<[CourseMaterialType, string[]]>) {
    for (const key of keys) {
      const label = courseMaterialFieldLabel(type, key);

      assert.match(label, /[\u3400-\u9fff]/u, `${type}.${key} 缺少中文名称`);
      assert.notEqual(label, key, `${type}.${key} 不应直接展示英文键名`);
    }
  }

  assert.equal(courseMaterialFieldLabel("VIDEO_GUIDE", "futureField"), "其他字段（futureField）");
  assert.equal(courseMaterialFieldLabel("VIDEO_GUIDE", "<script>"), "其他字段");
  assert.equal(courseMaterialFieldLabel("ENGLISH_GUIDED_STUDY", "explanationMode"), "讲解模式");
  assert.equal(courseMaterialFieldLabel("ENGLISH_GUIDED_STUDY", "level"), "学习等级");
  assert.equal(courseMaterialFieldLabel("ENGLISH_GUIDED_STUDY", "questions"), "练习题");
});

test("视频导学复杂字段使用中文嵌套键且隐藏内部标识", () => {
  assert.deepEqual(localizeCourseReviewValue({
    teacherSegments: [
      {
        id: "teacher-private-id",
        explanation: "解释分数",
        subtitle: "1/2",
        startSeconds: 1,
        endSeconds: 3
      }
    ],
    questions: [
      {
        id: "question-private-id",
        question: "一半是多少？",
        options: ["1/2", "2/1"],
        answer: "1/2",
        explanation: "分子为 1"
      }
    ],
    subtitles: [
      {
        sentenceId: "sentence-private-id",
        text: "认识分数",
        startSeconds: 0,
        endSeconds: 2
      }
    ]
  }), {
    "教师讲解片段": [
      {
        "讲解内容": "解释分数",
        "字幕": "1/2",
        "开始时间（秒）": 1,
        "结束时间（秒）": 3
      }
    ],
    "练习题": [
      {
        "题目": "一半是多少？",
        "选项": ["1/2", "2/1"],
        "答案": "1/2",
        "讲解内容": "分子为 1"
      }
    ],
    "字幕列表": [
      {
        "文本": "认识分数",
        "开始时间（秒）": 0,
        "结束时间（秒）": 2
      }
    ]
  });
});

test("英文带读和闪卡复杂字段使用中文嵌套键", () => {
  assert.deepEqual(localizeCourseReviewValue({
    sourceText: "A cat sleeps.",
    sentences: [
      {
        id: "sentence-private-id",
        text: "A cat sleeps.",
        grammarFocus: "一般现在时",
        points: [{ id: "point-private-id", term: "sleep", meaning: "睡觉" }]
      }
    ],
    audioTimeline: [
      {
        sentenceId: "sentence-private-id",
        startSeconds: 0,
        endSeconds: 2,
        terms: [{ pointId: "point-private-id", term: "sleep", startSeconds: 1, endSeconds: 2 }]
      }
    ],
    summary: "猫在睡觉",
    knowledgeMap: [{ title: "一般现在时", description: "表达习惯或事实", priority: 1 }]
  }), {
    "英文原文": "A cat sleeps.",
    "逐句学习内容": [
      {
        "文本": "A cat sleeps.",
        "语法重点": "一般现在时",
        "知识点": [{ "术语": "sleep", "释义": "睡觉" }]
      }
    ],
    "音频时间轴": [
      {
        "开始时间（秒）": 0,
        "结束时间（秒）": 2,
        "知识点时间": [{ "术语": "sleep", "开始时间（秒）": 1, "结束时间（秒）": 2 }]
      }
    ],
    "内容摘要": "猫在睡觉",
    "知识图谱": [{ "标题": "一般现在时", "描述": "表达习惯或事实", "优先级": 1 }]
  });
});

test("中文字段别名和未知字段发生冲突时保留每一项且安全区分", () => {
  assert.deepEqual(localizeCourseReviewValue({
    subtitles: ["第一份字幕"],
    subtitleCues: ["第二份字幕"],
    "<unsafe-one>": "未知值一",
    "unsafe-key-two": "未知值二"
  }), {
    "字幕列表": ["第一份字幕"],
    "字幕列表（subtitleCues）": ["第二份字幕"],
    "其他字段": "未知值一",
    "其他字段（第 2 项）": "未知值二"
  });
});

test("闪卡修改只列真实变化的中文子字段且不泄露 ID", () => {
  assert.deepEqual(flashcardChangedFields(
    {
      id: "card-private-id",
      front: "cat",
      back: "猫",
      type: "问答卡",
      source: "教材第一课",
      tags: ["名词"],
      sortOrder: 0
    },
    {
      id: "card-private-id",
      front: "a cat",
      back: "猫",
      type: "问答卡",
      source: "教材第一课",
      tags: ["名词", "短语"],
      sortOrder: 1
    }
  ), [
    { key: "front", label: "正面", before: "cat", after: "a cat" },
    { key: "tags", label: "标签", before: ["名词"], after: ["名词", "短语"] },
    { key: "sortOrder", label: "排序", before: 0, after: 1 }
  ]);
});

test("闪卡字段比较忽略对象键顺序但保留数组顺序语义", () => {
  assert.deepEqual(flashcardChangedFields(
    {
      front: "cat",
      back: "猫",
      source: { lesson: "第一课", page: 3 },
      tags: ["名词", "动物"]
    },
    {
      front: "cat",
      back: "猫",
      source: { page: 3, lesson: "第一课" },
      tags: ["名词", "动物"]
    }
  ), []);

  assert.deepEqual(flashcardChangedFields(
    { tags: ["名词", "动物"] },
    { tags: ["动物", "名词"] }
  ), [
    { key: "tags", label: "标签", before: ["名词", "动物"], after: ["动物", "名词"] }
  ]);
});

test("闪卡差异标题只使用对应快照中非空的正面文本", () => {
  assert.equal(flashcardDiffTitle("CARD_CHANGED", { front: "旧标题" }, { front: "  新标题  " }), "修改闪卡：新标题");
  assert.equal(flashcardDiffTitle("CARD_ADDED", null, { front: "  dog " }), "新增闪卡：dog");
  assert.equal(flashcardDiffTitle("CARD_REMOVED", { front: " cat  " }, null), "移除闪卡：cat");
  assert.equal(flashcardDiffTitle("CARD_CHANGED", { front: "旧标题" }, { front: "   ", id: "private-id" }), "修改闪卡：未命名闪卡");
});

test("新增删除闪卡和目录课件只展示中文业务字段", () => {
  assert.deepEqual(flashcardPresentationFields({
    id: "card-private-id",
    front: "cat",
    back: "猫",
    type: "问答卡",
    source: "教材第一课",
    tags: ["名词"],
    sortOrder: 0
  }), [
    { key: "front", label: "正面", value: "cat" },
    { key: "back", label: "背面", value: "猫" },
    { key: "type", label: "类型", value: "问答卡" },
    { key: "source", label: "来源", value: "教材第一课" },
    { key: "tags", label: "标签", value: ["名词"] },
    { key: "sortOrder", label: "排序", value: 0 }
  ]);
  assert.deepEqual(courseRevisionItemPresentationFields({
    id: "item-private-id",
    publicationId: "publication-private-id",
    videoGuideLessonId: "video-private-id",
    materialType: "VIDEO_GUIDE",
    displayName: "分数视频导学",
    sortOrder: 1
  }), [
    { key: "displayName", label: "课件名称", value: "分数视频导学" },
    { key: "materialType", label: "课件类型", value: "视频导学" },
    { key: "sortOrder", label: "排序", value: 1 }
  ]);
});

test("同类型课件审核用快照标题区分并显示去重后的影响专辑数", () => {
  const first = reviewFixture({
    id: "review-video-1",
    scope: "MATERIAL_CHANGE",
    afterSnapshot: { type: "VIDEO_GUIDE", title: "分数基础" },
    beforeSnapshot: { type: "VIDEO_GUIDE", title: "旧分数课" },
    materialPublication: {
      id: "publication-1",
      materialType: "VIDEO_GUIDE",
      videoGuideLessonId: "video-1",
      englishGuidedStudyMaterialId: null,
      learningFlashcardDeckId: null,
      status: "PENDING",
      approvedHash: "approved",
      currentHash: "current",
      approvedSnapshot: {},
      currentSnapshot: {},
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z"
    },
    affectedCourses: [
      { id: "course-1", name: "数学课", reviewState: "PUBLISHED", publishedAt: null },
      { id: "course-1", name: "数学课", reviewState: "PUBLISHED", publishedAt: null }
    ]
  });
  const second = reviewFixture({
    ...first,
    id: "review-video-2",
    afterSnapshot: { type: "VIDEO_GUIDE", title: "几何入门" },
    affectedCourses: [
      { id: "course-2", name: "几何课", reviewState: "PUBLISHED", publishedAt: null },
      { id: "course-3", name: "综合课", reviewState: "PUBLISHED", publishedAt: null }
    ]
  });
  const html = render(React.createElement(CourseReviewWorkspace, {
    reviews: [first, second],
    selectedReview: null,
    confirmation: null,
    reason: "",
    error: null,
    isPending: false,
    onBeginAction: () => undefined,
    onCancelAction: () => undefined,
    onConfirmAction: () => undefined,
    onReasonChange: () => undefined,
    onSelect: () => undefined
  }));

  assert.equal(courseReviewTitle(first), "分数基础");
  assert.equal(courseReviewTitle(second), "几何入门");
  assert.equal(courseReviewAffectedCourseCount(first), 1);
  assert.equal(courseReviewAffectedCourseCount(second), 2);
  assert.match(html, /分数基础/u);
  assert.match(html, /几何入门/u);
  assert.match(html, /影响 1 个专辑/u);
  assert.match(html, /影响 2 个专辑/u);
});

test("课件标题缺失时依次回退旧快照标题和课件类型", () => {
  const fromBefore = reviewFixture({
    scope: "MATERIAL_CHANGE",
    afterSnapshot: { type: "LEARNING_FLASHCARD" },
    beforeSnapshot: { type: "LEARNING_FLASHCARD", title: "旧闪卡标题" },
    materialPublication: {
      id: "publication-1",
      materialType: "LEARNING_FLASHCARD",
      videoGuideLessonId: null,
      englishGuidedStudyMaterialId: null,
      learningFlashcardDeckId: "deck-1",
      status: "PENDING",
      approvedHash: "approved",
      currentHash: "current",
      approvedSnapshot: {},
      currentSnapshot: {},
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z"
    }
  });

  assert.equal(courseReviewTitle(fromBefore), "旧闪卡标题");
  assert.equal(courseReviewTitle({ ...fromBefore, beforeSnapshot: {} }), "学习闪卡内容变更");
});

test("专辑变更的影响专辑数至少包含自身并与受影响列表去重", () => {
  const courseReview = reviewFixture({
    courseId: "course-1",
    affectedCourses: [
      { id: "course-1", name: "当前专辑", reviewState: "PENDING_REVIEW", publishedAt: null },
      { id: "course-2", name: "关联专辑", reviewState: "PUBLISHED", publishedAt: null }
    ]
  });

  assert.equal(courseReviewAffectedCourseCount(reviewFixture({ affectedCourses: [] })), 1);
  assert.equal(courseReviewAffectedCourseCount(courseReview), 2);
});

test("资源审核预览生成去重的真实专辑页面地址", () => {
  const courseReview = reviewFixture({
    courseId: "course-1",
    courseRevision: {
      id: "revision-1",
      courseId: "course-1",
      coverMediaId: "cover-1",
      name: "待审专辑",
      summary: "专辑简介",
      tags: [],
      status: "PENDING",
      submittedAt: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z",
      coverMedia: { id: "cover-1", url: "/cover.png" },
      items: []
    },
    affectedCourses: [
      { id: "course-1", name: "旧名称", reviewState: "PENDING_REVIEW", publishedAt: null }
    ]
  });
  const materialReview = reviewFixture({
    scope: "MATERIAL_CHANGE",
    courseId: null,
    affectedCourses: [
      { id: "course-2", name: "英语课", reviewState: "PUBLISHED", publishedAt: null },
      { id: "course-2", name: "英语课", reviewState: "PUBLISHED", publishedAt: null },
      { id: "course-3", name: "综合课", reviewState: "PUBLISHED", publishedAt: null }
    ]
  });

  assert.deepEqual(courseReviewPreviewCourses(courseReview), [
    { id: "course-1", name: "待审专辑", href: "/c/course-1" }
  ]);
  assert.deepEqual(courseReviewPreviewCourses(materialReview), [
    { id: "course-2", name: "英语课", href: "/c/course-2" },
    { id: "course-3", name: "综合课", href: "/c/course-3" }
  ]);
});

test("差异详情实际使用中文结构字段且不渲染专辑目录与闪卡内部 ID", () => {
  const review = reviewFixture({
    scope: "MATERIAL_CHANGE",
    materialPublication: {
      id: "publication-record-id",
      materialType: "LEARNING_FLASHCARD",
      videoGuideLessonId: null,
      englishGuidedStudyMaterialId: null,
      learningFlashcardDeckId: "deck-record-id",
      status: "PENDING",
      approvedHash: "approved",
      currentHash: "current",
      approvedSnapshot: {},
      currentSnapshot: {},
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z"
    },
    diff: [
      {
        kind: "MATERIAL_FIELD",
        label: "knowledgeMap",
        before: [{ title: "旧知识点", description: "旧描述", priority: 2 }],
        after: [{ title: "新知识点", description: "新描述", priority: 1 }]
      },
      {
        kind: "CARD_CHANGED",
        label: "修改闪卡：cat",
        before: {
          id: "card-private-id",
          front: "cat",
          back: "猫",
          type: "问答卡",
          source: "教材第一课",
          tags: ["名词"],
          sortOrder: 0
        },
        after: {
          id: "card-private-id",
          front: "a cat",
          back: "猫",
          type: "问答卡",
          source: "教材第一课",
          tags: ["名词", "短语"],
          sortOrder: 1
        }
      },
      {
        kind: "CARD_ADDED",
        label: "新增闪卡：dog",
        before: null,
        after: {
          id: "added-card-private-id",
          front: "dog",
          back: "狗",
          type: "问答卡",
          source: "教材第二课",
          tags: ["名词"],
          sortOrder: 2
        }
      },
      {
        kind: "ITEM_ADDED",
        label: "新增课件：分数导学",
        before: null,
        after: {
          id: "item-private-id",
          publicationId: "publication-private-id",
          videoGuideLessonId: "video-private-id",
          materialType: "VIDEO_GUIDE",
          displayName: "分数导学",
          sortOrder: 0
        }
      }
    ]
  });
  const html = render(React.createElement(CourseReviewDiffDetails, { review }));

  assert.match(html, /知识图谱/u);
  assert.match(html, /标题/u);
  assert.match(html, /描述/u);
  assert.match(html, /正面/u);
  assert.match(html, /标签/u);
  assert.match(html, /排序/u);
  assert.match(html, /课件名称/u);
  assert.match(html, /课件类型/u);
  assert.match(html, /视频导学/u);
  assert.doesNotMatch(html, /card-private-id|added-card-private-id|item-private-id|publication-private-id|video-private-id/u);
  assert.doesNotMatch(html, /&quot;(id|publicationId|videoGuideLessonId|front|sortOrder)&quot;/u);
});

test("闪卡差异正面为空时不从动态标签或内部字段泄露 ID", () => {
  const privateId = "card-secret-9f8e7d";
  const review = reviewFixture({
    scope: "MATERIAL_CHANGE",
    diff: [
      {
        kind: "CARD_CHANGED",
        label: `修改闪卡：${privateId}`,
        before: { id: privateId, front: "旧正面" },
        after: { id: privateId, front: "   " }
      },
      {
        kind: "CARD_ADDED",
        label: `新增闪卡：${privateId}`,
        before: null,
        after: { id: privateId, front: "" }
      },
      {
        kind: "CARD_REMOVED",
        label: `移除闪卡：${privateId}`,
        before: { id: privateId, front: "  " },
        after: null
      }
    ]
  });
  const html = render(React.createElement(CourseReviewDiffDetails, { review }));

  assert.match(html, /修改闪卡：未命名闪卡/u);
  assert.match(html, /新增闪卡：未命名闪卡/u);
  assert.match(html, /移除闪卡：未命名闪卡/u);
  assert.doesNotMatch(html, new RegExp(privateId, "u"));
});

test("首次公开课件在专辑审核详情中展示真实中文结构化内容且隐藏内部字段", () => {
  const review = reviewFixture({
    diff: [{
      kind: "ITEM_ADDED",
      label: "新增课件：分数导学",
      before: null,
      after: {
        publicationId: "publication-private-id",
        materialType: "VIDEO_GUIDE",
        displayName: "分数导学",
        sortOrder: 0
      }
    }],
    afterSnapshot: {
      items: [{
        publicationId: "publication-private-id",
        videoGuideLessonId: "video-private-id",
        materialType: "VIDEO_GUIDE",
        displayName: "分数导学",
        sortOrder: 0,
        firstPublication: true,
        materialHash: "private-hash-123",
        materialSnapshot: {
          type: "VIDEO_GUIDE",
          title: "分数导学",
          summary: "理解分数的含义",
          questions: [{ id: "question-private-id", question: "一半是多少？", options: ["1/2"], answer: 0 }]
        }
      }]
    }
  });
  const html = render(React.createElement(CourseReviewDiffDetails, { review }));

  assert.match(html, /首次公开课件内容/u);
  assert.match(html, /分数导学/u);
  assert.match(html, /内容摘要/u);
  assert.match(html, /理解分数的含义/u);
  assert.match(html, /练习题/u);
  assert.match(html, /一半是多少/u);
  assert.doesNotMatch(
    html,
    /publication-private-id|video-private-id|question-private-id|private-hash-123|materialHash/u
  );
});

test("管理员审核动作把当前请求 updatedAt 作为版本 token 提交", () => {
  const apiSource = readFileSync(new URL("../src/lib/course-api.ts", import.meta.url), "utf8");
  const managerSource = readFileSync(
    new URL("../src/components/admin/course-review-manager.tsx", import.meta.url),
    "utf8"
  );

  assert.match(apiSource, /JSON\.stringify\(\{ expectedUpdatedAt \}\)/u);
  assert.match(apiSource, /JSON\.stringify\(\{ reason, expectedUpdatedAt \}\)/u);
  assert.match(managerSource, /approveCourseReviewAction\(reviewId, selectedReview\.updatedAt\)/u);
  assert.match(
    managerSource,
    /rejectCourseReviewAction\(reviewId, reason\.trim\(\), selectedReview\.updatedAt\)/u
  );
});
