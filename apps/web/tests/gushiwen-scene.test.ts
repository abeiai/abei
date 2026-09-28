import assert from "node:assert/strict";
import test from "node:test";

import { gushiwenGradeGroups, gushiwenStudyPath } from "../src/lib/english-guided-study-data.js";
import { gushiwenCreatorPath } from "../src/lib/tool-creator-routes.js";

test("学古诗文学段年级选项完整且顺序固定", () => {
  assert.deepEqual(
    gushiwenGradeGroups[0]?.options.map((option) => option.label),
    [
      "学龄前", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
      "七年级", "八年级", "九年级", "高一", "高二", "高三", "大学和工作"
    ]
  );
});

test("学古诗文创作与学习路由使用独立前缀", () => {
  assert.equal(gushiwenCreatorPath("demo"), "/gushiwen/creator/demo");
  assert.equal(gushiwenStudyPath("demo"), "/gushiwen/demo");
});
