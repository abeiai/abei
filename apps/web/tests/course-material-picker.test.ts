import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CourseMaterialPicker,
  courseMaterialLimit,
  filterCourseMaterialOptions,
  toggleCourseMaterialSelection
} from "../src/components/courses/course-material-picker.js";
import type { CourseMaterialOption } from "../src/lib/course-types.js";

const options: CourseMaterialOption[] = [
  {
    materialType: "VIDEO_GUIDE",
    materialId: "video-1",
    title: "英语入门视频",
    subtitle: "基础发音",
    updatedAt: "2026-07-20T08:00:00.000Z"
  },
  {
    materialType: "ENGLISH_GUIDED_STUDY",
    materialId: "english-1",
    title: "每日口语",
    subtitle: "生活对话",
    updatedAt: "2026-07-21T08:00:00.000Z"
  },
  {
    materialType: "LEARNING_FLASHCARD",
    materialId: "flashcard-1",
    title: "核心词汇",
    subtitle: "小学英语",
    updatedAt: "2026-07-22T08:00:00.000Z"
  }
];

test("单课程最多可以添加二百个课件", () => {
  assert.equal(courseMaterialLimit, 200);
});

test("课件选择器默认只显示添加按钮，不在编辑页铺开全部课件", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(
      React.createElement(CourseMaterialPicker, {
        onAdd: () => undefined,
        options,
        selectedMaterialKeys: new Set<string>()
      })
    );
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, />添加课件<\/button>/u);
  assert.doesNotMatch(html, /英语入门视频|每日口语|核心词汇/u);
});

test("弹窗课件可以按类型和关键词筛选", () => {
  assert.deepEqual(
    filterCourseMaterialOptions(options, { keyword: "入门", materialType: "VIDEO_GUIDE" })
      .map((item) => item.materialId),
    ["video-1"]
  );
  assert.deepEqual(
    filterCourseMaterialOptions(options, { keyword: "生活对话", materialType: "" })
      .map((item) => item.materialId),
    ["english-1"]
  );
});

test("弹窗多选排除已添加课件并遵守课程容量", () => {
  const existing = new Set(["VIDEO_GUIDE:video-1"]);
  assert.deepEqual(toggleCourseMaterialSelection([], "VIDEO_GUIDE:video-1", existing, 2), []);
  assert.deepEqual(toggleCourseMaterialSelection([], "ENGLISH_GUIDED_STUDY:english-1", existing, 2), [
    "ENGLISH_GUIDED_STUDY:english-1"
  ]);
  assert.deepEqual(
    toggleCourseMaterialSelection(
      ["ENGLISH_GUIDED_STUDY:english-1"],
      "LEARNING_FLASHCARD:flashcard-1",
      existing,
      1
    ),
    ["ENGLISH_GUIDED_STUDY:english-1"]
  );
});
