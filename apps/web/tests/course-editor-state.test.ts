import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  centerCropRect,
  courseGuidedStudyScene,
  courseMaterialDirectoryLabel,
  courseStatusLabel,
  materialReviewFeedback,
  moveCourseItem,
  normalizeEditorTags,
  reorderCourseItem
} from "../src/lib/course-editor-state.js";

test("课程目录按带学场景显示学古诗文或英文带读", () => {
  assert.equal(courseMaterialDirectoryLabel("ENGLISH_GUIDED_STUDY", "GUSHIWEN"), "学古诗文");
  assert.equal(courseMaterialDirectoryLabel("ENGLISH_GUIDED_STUDY", "ENGLISH"), "英文带读");
});

test("重新打开课程时从带学课件内容恢复古诗文场景", () => {
  assert.equal(courseGuidedStudyScene({ scene: "GUSHIWEN" }), "GUSHIWEN");
  assert.equal(courseGuidedStudyScene({ scene: "ENGLISH" }), "ENGLISH");
  assert.equal(courseGuidedStudyScene({}), "ENGLISH");
});

test("课件可向上和向下排序且重新编号", () => {
  const items = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 }
  ];

  assert.deepEqual(
    moveCourseItem(items, "b", -1).map((item) => [item.id, item.sortOrder]),
    [
      ["b", 0],
      ["a", 1],
      ["c", 2]
    ]
  );
  assert.deepEqual(
    moveCourseItem(items, "b", 1).map((item) => [item.id, item.sortOrder]),
    [
      ["a", 0],
      ["c", 1],
      ["b", 2]
    ]
  );
});

test("课件无法移动或未找到时仍按当前顺序连续编号", () => {
  const items = [
    { id: "a", sortOrder: 10 },
    { id: "b", sortOrder: 30 }
  ];

  assert.deepEqual(
    moveCourseItem(items, "a", -1).map((item) => [item.id, item.sortOrder]),
    [
      ["a", 0],
      ["b", 1]
    ]
  );
  assert.deepEqual(
    moveCourseItem(items, "missing", 1).map((item) => [item.id, item.sortOrder]),
    [
      ["a", 0],
      ["b", 1]
    ]
  );
});

test("课件可拖放到目标位置并重新连续编号", () => {
  const items = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 }
  ];

  assert.deepEqual(
    reorderCourseItem(items, "a", "c").map((item) => [item.id, item.sortOrder]),
    [["b", 0], ["c", 1], ["a", 2]]
  );
  assert.deepEqual(
    reorderCourseItem(items, "c", "a").map((item) => [item.id, item.sortOrder]),
    [["c", 0], ["a", 1], ["b", 2]]
  );
});

test("宽图中心裁切为 16:9", () => {
  assert.deepEqual(centerCropRect(1600, 900), {
    height: 900,
    width: 1600,
    x: 0,
    y: 0
  });
});

test("中心裁切拒绝无效图片尺寸", () => {
  for (const [width, height] of [
    [0, 900],
    [-1, 900],
    [1600, Number.POSITIVE_INFINITY],
    [Number.NaN, 900]
  ]) {
    assert.throws(
      () => centerCropRect(width!, height!),
      (error: unknown) =>
        error instanceof RangeError && error.message === "图片宽高必须是大于 0 的有限数值"
    );
  }
});

test("标签按中文逗号、英文逗号和空格拆分去重", () => {
  assert.deepEqual(normalizeEditorTags("英语，小学 口语,英语"), ["英语", "小学", "口语"]);
});

test("课程状态使用简体中文", () => {
  assert.equal(courseStatusLabel("PENDING_REVIEW", true), "审核中");
  assert.equal(courseStatusLabel("REJECTED", false), "审核未通过");
  assert.equal(courseStatusLabel("PUBLISHED", true, "DRAFT"), "有未提交修改");
  assert.equal(
    courseStatusLabel("PUBLISHED", true, "REJECTED"),
    "复审未通过（旧版仍发布）"
  );
});

test("已发布课程复审拒绝后编辑器按工作版本状态显示原因", () => {
  const source = readFileSync(
    new URL("../src/components/courses/course-editor.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /workingRevision\?\.status === "REJECTED"/u);
  assert.doesNotMatch(source, /reviewState === "REJECTED" \? course\.workingRevision/u);
});

test("课件审核被拒后只显示当前拒绝原因", () => {
  assert.deepEqual(materialReviewFeedback({
    status: "REJECTED",
    reviewRequests: [{ reviewNote: "例句翻译不准确" }]
  }), {
    label: "课件审核未通过",
    reason: "例句翻译不准确"
  });
  assert.equal(materialReviewFeedback({
    status: "PENDING",
    reviewRequests: [{ reviewNote: "已经过期的拒绝原因" }]
  }), null);
});

test("创作者预览统一进入真实课程页面，旧预览路由只做兼容跳转", () => {
  const editorSource = readFileSync(
    new URL("../src/components/courses/course-editor.tsx", import.meta.url),
    "utf8"
  );
  const listSource = readFileSync(
    new URL("../src/app/dashboard/courses/page.tsx", import.meta.url),
    "utf8"
  );
  const legacyPreviewSource = readFileSync(
    new URL("../src/app/dashboard/courses/[id]/preview/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(editorSource, /href=\{`\/c\/\$\{persistedCourseId\}`\}/u);
  assert.match(listSource, /href=\{`\/c\/\$\{course\.id\}`\}/u);
  assert.match(legacyPreviewSource, /redirect\(`\/c\/\$\{id\}`\)/u);
  assert.doesNotMatch(editorSource, /\/dashboard\/courses\/\$\{persistedCourseId\}\/preview/u);
  assert.doesNotMatch(listSource, /\/dashboard\/courses\/\$\{course\.id\}\/preview/u);
});

test("课程编辑器使用申请发布动作避免把保存草稿误认为已提审", () => {
  const editorSource = readFileSync(
    new URL("../src/components/courses/course-editor.tsx", import.meta.url),
    "utf8"
  );
  const actionSource = readFileSync(
    new URL("../src/lib/course-api.ts", import.meta.url),
    "utf8"
  );

  assert.match(editorSource, /正在申请/u);
  assert.match(editorSource, /申请发布/u);
  assert.doesNotMatch(editorSource, />提交审核</u);
  assert.match(actionSource, /发布申请已提交，正在等待审核/u);
});
