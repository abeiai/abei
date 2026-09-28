import assert from "node:assert/strict";
import test from "node:test";

import { smartEduTextbookSourceUrl } from "./textbook-source-url.js";

test("根据 contentId 生成规范的 SmartEdu 教材详情地址", () => {
  const contentId = "5f380546-7207-4ac7-b3e0-1f66dc9fd575";
  const value = smartEduTextbookSourceUrl(contentId);
  const url = new URL(value);

  assert.equal(url.origin, "https://basic.smartedu.cn");
  assert.equal(url.pathname, "/tchMaterial/detail");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    contentType: "assets_document",
    contentId,
    catalogType: "tchMaterial",
    subCatalog: "tchMaterial"
  });
  assert.equal(
    value,
    "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial"
  );
});

test("通过 URLSearchParams 编码 contentId", () => {
  const url = new URL(smartEduTextbookSourceUrl("教材 / 1"));

  assert.equal(url.searchParams.get("contentId"), "教材 / 1");
});

test("拒绝空 contentId", () => {
  assert.throws(() => smartEduTextbookSourceUrl("  "), /contentId 不能为空/u);
});
