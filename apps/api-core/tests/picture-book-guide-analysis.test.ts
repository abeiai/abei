import assert from "node:assert/strict";
import test from "node:test";
import { buildPdfOverviewPrompt, parsePdfPageAnalysis, pdfOverviewBatches, selectPdfPages } from "../src/picture-book-guide/picture-book-guide-analysis.js";
import type { GuidePage } from "../src/picture-book-guide/picture-book-guide-content.js";

const page = (pageNumber: number, kind: "COVER" | "CONTENT" | "ADVERTISEMENT"): GuidePage => ({ pageNumber, sourceText: `原文${pageNumber}`, script: "", audioTaskId: null, audioMimeType: null, audioVoice: null, audioSpeed: null, pdfAnalysis: { kind, description: `画面${pageNumber}`, text: `识别文字${pageNumber}` } });

test("逐页识别校验页码和类型，不把不确定页面当作广告", () => {
  assert.deepEqual(parsePdfPageAnalysis('{"pageNumber":2,"kind":"ADVERTISEMENT","description":"推广其他产品","text":"更多商品"}', 2), { kind: "ADVERTISEMENT", description: "推广其他产品", text: "更多商品" });
  assert.throws(() => parsePdfPageAnalysis('{"pageNumber":3,"kind":"ADVERTISEMENT","description":"广告","text":""}', 2), /分析/);
  assert.throws(() => parsePdfPageAnalysis('{"pageNumber":2,"kind":"UNKNOWN","description":"","text":""}', 2), /分析/);
});

test("整本理解使用所有非广告页的有序画面和文字", () => {
  const prompt = buildPdfOverviewPrompt([page(1, "COVER"), page(2, "CONTENT"), page(3, "ADVERTISEMENT")]);
  assert.match(prompt, /画面1/); assert.match(prompt, /识别文字2/); assert.doesNotMatch(prompt, /画面3/);
  assert.match(prompt, /不可信/);
});
test("长绘本按页序分批概括，避免遗漏尾页", () => {
  const batches = pdfOverviewBatches(Array.from({ length: 19 }, (_, index) => page(index + 1, "CONTENT")));
  assert.deepEqual(batches.map(batch => batch.map(item => item.pageNumber)), [[1,2,3,4,5,6,7,8], [9,10,11,12,13,14,15,16], [17,18,19]]);
});
test("长页面的尾部文字不被丢弃，并拆分到适当批次", () => {
  const pages = [page(1, "COVER"), { ...page(2, "CONTENT"), sourceText: "前".repeat(11990) + "关键结尾" }, { ...page(3, "CONTENT"), sourceText: "后".repeat(10000) }];
  const batches = pdfOverviewBatches(pages);
  assert.equal(batches.length, 2);
  assert.match(buildPdfOverviewPrompt(batches[0]!), /关键结尾/);
});

test("确认页面时保留顺序、原始图片位置和整本上下文", () => {
  const result = selectPdfPages([page(1, "ADVERTISEMENT"), page(2, "COVER"), page(3, "CONTENT")], [2, 3], "完整故事梗概");
  assert.deepEqual(result.map(item => [item.pageNumber, item.sourcePageNumber]), [[1, 2], [2, 3]]);
  assert.equal(result[0]!.bookSummary, "完整故事梗概");
  assert.equal(result[1]!.sourceText, "原文3");
  assert.throws(() => selectPdfPages([page(1, "COVER"), page(2, "CONTENT")], [2, 2], "故事"), /页面/);
  assert.throws(() => selectPdfPages([page(1, "COVER")], [], "故事"), /页面/);
});
