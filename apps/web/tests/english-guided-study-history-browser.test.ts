import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getUserEnglishGuidedStudyMaterialHistory } from "../src/lib/english-guided-study-api.js";

test("全部历史接口固定请求每页二十条并传递场景和搜索词", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      code: 0,
      message: "成功",
      data: { items: [], page: 2, pageSize: 20, total: 45, totalPages: 3 }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const result = await getUserEnglishGuidedStudyMaterialHistory({
      page: 2,
      scene: "GUSHIWEN",
      search: "离骚"
    });

    assert.match(requestedUrl, /scene=GUSHIWEN/u);
    assert.match(requestedUrl, /page=2/u);
    assert.match(requestedUrl, /search=%E7%A6%BB%E9%AA%9A/u);
    assert.equal(result.pageSize, 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("左栏历史标题和第五十条后的按钮都可打开支持搜索、翻页与页码直达的浮层", () => {
  const source = readFileSync(
    new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /history\.length >= 50/u);
  assert.match(source, />查看更多记录</u);
  assert.match(source, /aria-label="查看全部带学材料历史"/u);
  assert.match(source, /aria-label="搜索历史记录"/u);
  assert.match(source, /aria-label="跳转页码"/u);
  assert.match(source, /\/\{historyBrowser\.totalPages\}页/u);
  assert.match(source, /跳转/u);
  assert.match(source, /上一页/u);
  assert.match(source, /下一页/u);
});
