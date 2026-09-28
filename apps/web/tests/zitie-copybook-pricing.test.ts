import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  copybookGenerateDialog,
  copybookPreviewMode,
  copybookPricingForPages
} from "../src/components/zitie/copybook-pricing";
import { shouldGuardZitieScenario } from "../src/lib/zitie-access";

test("字帖前端直接使用生产 Nginx 可转发的复数 API 路径", async () => {
  const source = await readFile(
    new URL("../src/components/zitie/zitie-generator.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /\/api\/copybook\//u);
  assert.match(source, /\/api\/copybooks\/generate/u);
  assert.match(source, /fetch\("\/api\/copybooks"/u);
  assert.match(source, /`\/api\/copybooks\/\$\{encodeURIComponent\(recordId\)\}`/u);
  assert.match(source, /`\/api\/copybooks\/\$\{encodeURIComponent\(record\.id\)\}\/pdf`/u);
});

test("生成入口按登录状态选择登录提示或扣点确认", () => {
  assert.equal(copybookGenerateDialog(false), "login");
  assert.equal(copybookGenerateDialog(true), "pricing");
});

test("未登录访问字帖页面时不运行学习者场景守卫", () => {
  assert.equal(shouldGuardZitieScenario(false), false);
  assert.equal(shouldGuardZitieScenario(true), true);
});

test("访客预览直接使用本地 SVG，登录后才请求服务端预览", () => {
  assert.equal(copybookPreviewMode(false), "local");
  assert.equal(copybookPreviewMode(true), "remote");
});

test("无水印字帖确认提示显示实际页数和每页 2 点费用", () => {
  const pricing = copybookPricingForPages(Array.from({ length: 10 }, () => ({ watermark: null })));

  assert.deepEqual(pricing, {
    pageCount: 10,
    hasWatermark: false,
    creditsPerPage: 2,
    credits: 20,
    confirmationMessage: "本次生成字帖10页，需消耗20点，确认生成将自动扣除。"
  });
});

test("带水印字帖确认提示显示实际页数和每页 5 点费用", () => {
  const pages = Array.from({ length: 10 }, () => ({ watermark: null as unknown }));

  pages[3].watermark = {
    text: {
      visible: true,
      value: "学乐AI"
    }
  };

  const pricing = copybookPricingForPages(pages);

  assert.deepEqual(pricing, {
    pageCount: 10,
    hasWatermark: true,
    creditsPerPage: 5,
    credits: 50,
    confirmationMessage: "本次生成带水印字帖10页，需消耗50点，确认生成将自动扣除。"
  });
});

test("姓名贴活动期间显示页数但不扣点", () => {
  const pricing = copybookPricingForPages(
    Array.from({ length: 1 }, () => nameLabelPage()),
    "name-label"
  );

  assert.deepEqual(pricing, {
    pageCount: 1,
    hasWatermark: false,
    creditsPerPage: 0,
    credits: 0,
    confirmationMessage: "本次生成字帖1页，活动期间不扣点。"
  });
});

test("伪造姓名贴模板或额外叠加水印时仍按普通规则计费", () => {
  const missingSheet = copybookPricingForPages([{ watermark: null }], "name-label");
  const watermarked = copybookPricingForPages(
    [{ ...nameLabelPage(), watermark: { text: { visible: true, value: "免费" } } }],
    "name-label"
  );

  assert.equal(missingSheet.credits, 2);
  assert.equal(watermarked.credits, 5);
});

function nameLabelPage() {
  return {
    watermark: null,
    worksheet: null,
    grid: { visible: false },
    content: [],
    strokeGlyphs: {},
    strokePracticeRows: [],
    nameLabelSheet: { labels: [{ lines: ["姓名：张三"] }] }
  };
}
