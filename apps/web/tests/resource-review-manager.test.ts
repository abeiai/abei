import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/app/admin/course-reviews/page.tsx", import.meta.url),
  "utf8"
);
const managerSource = readFileSync(
  new URL("../src/components/admin/resource-review-manager.tsx", import.meta.url),
  "utf8"
);
const menuSource = readFileSync(
  new URL("../src/lib/mock-data.ts", import.meta.url),
  "utf8"
);

test("后台专辑审核统一命名为资源审核并使用列表列项", () => {
  assert.match(pageSource, /title="资源审核"/);
  assert.match(menuSource, /href: "\/admin\/course-reviews",\s*label: "资源审核"/);
  for (const heading of ["资源名称", "创作人", "提审时间", "预览", "AI 预审", "人工审核"]) {
    assert.match(managerSource, new RegExp(`>${heading}<`));
  }
});

test("资源审核通过真实专辑页预览并保留 AI 与人工审核弹窗", () => {
  assert.match(managerSource, /courseReviewPreviewCourses/u);
  assert.match(managerSource, /target="_blank"/u);
  assert.match(managerSource, /选择需要预览的专辑/u);
  assert.doesNotMatch(managerSource, /JSON\.stringify\(localizeCourseReviewValue\(review\.afterSnapshot\)/u);
  assert.match(managerSource, /AI 预审进度/);
  assert.match(managerSource, /aiPrecheckProgress/);
  assert.match(managerSource, /人工审核/);
  assert.match(managerSource, /审核通过/);
  assert.match(managerSource, /审核拒绝/);
});

test("没有可预览专辑时显示明确提示", () => {
  assert.match(managerSource, /title=\{previewCourses\.length === 0 \? "暂无可预览专辑" : undefined\}/u);
});

test("人工拒绝只能选择约定理由，其他理由需要填写说明", () => {
  for (const reason of ["内容不符规范", "内容质量不高", "存在版权争议", "其他"]) {
    assert.match(managerSource, new RegExp(reason));
  }
  assert.match(managerSource, /请输入其他拒绝理由/);
});
