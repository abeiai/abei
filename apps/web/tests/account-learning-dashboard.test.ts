import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("学习者管理为每个有效学习者提供学习情况入口", async () => {
  const source = await readFile(new URL("../src/components/profiles/learner-manager.tsx", import.meta.url), "utf8");
  assert.match(source, /dashboard\/learners\/learning/u);
  assert.match(source, /学习情况/u);
});

test("主账号看板要求账号身份并保留筛选参数", async () => {
  const source = await readFile(new URL("../src/app/dashboard/learners/learning/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireAccountProfile/u);
  for (const field of ["learnerId", "from", "to", "courseId", "scenarioId", "resourceType", "materialType"]) assert.match(source, new RegExp(field, "u"));
});

test("主账号看板包含核心指标、分解和分段入口", async () => {
  const source = await readFile(new URL("../src/components/learning/account-learning-dashboard.tsx", import.meta.url), "utf8");
  for (const text of ["有效在线", "学习时长", "每日学习趋势", "已学习应用", "课程投入", "学习资源投入", "课件进度", "分段明细"]) assert.match(source, new RegExp(text, "u"));
});
