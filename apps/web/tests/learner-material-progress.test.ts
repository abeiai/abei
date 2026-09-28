import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MaterialProgressList } from "../src/components/learning/material-progress-list.js";

(globalThis as typeof globalThis & { React: typeof import("react") }).React = {
  createElement
} as typeof import("react");

test("学习材料列表展示进度、课程和继续学习入口", () => {
  const html = renderToStaticMarkup(
    createElement(MaterialProgressList, {
      materials: [
        {
          materialType: "VIDEO_GUIDE",
          materialId: "lesson-1",
          title: "课程内视频课件",
          status: "IN_PROGRESS",
          progressPercent: 60,
          activeStudySeconds: 3660,
          lastStudiedAt: "2026-08-19T02:00:00.000Z",
          course: { id: "course-1", name: "英语入门" },
          continueHref: "/media-tutor/share-1",
          detailHref: "/learn/center/materials/VIDEO_GUIDE/lesson-1"
        }
      ]
    })
  );
  assert.match(html, /课程内视频课件/u);
  assert.match(html, /学习中 · 60% · 学习1 小时 1 分钟 · 英语入门/u);
  assert.match(html, /继续学习/u);
  assert.match(html, /查看详情/u);
});

test("学习材料列表提供中文空状态", () => {
  assert.match(
    renderToStaticMarkup(createElement(MaterialProgressList, { materials: [] })),
    /暂无学习记录/u
  );
});
