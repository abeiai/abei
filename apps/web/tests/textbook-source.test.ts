import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TextbookSourceLink } from "../src/components/textbook/textbook-source-link.js";
import {
  getSmartEduTextbookSourceUrl,
  textbookSourceSameAs
} from "../src/lib/textbook-source.js";

const sourceUrl =
  "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial";

function renderSourceLink(value: string | null) {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;

  try {
    return renderToStaticMarkup(
      React.createElement(TextbookSourceLink, { sourceUrl: value })
    );
  } finally {
    runtime.React = previousReact;
  }
}

test("只接受规范的 SmartEdu 教材详情地址", () => {
  assert.equal(getSmartEduTextbookSourceUrl(sourceUrl), sourceUrl);
  assert.equal(getSmartEduTextbookSourceUrl(sourceUrl.replace("https:", "http:")), null);
  assert.equal(
    getSmartEduTextbookSourceUrl(sourceUrl.replace("basic.smartedu.cn", "example.com")),
    null
  );
  assert.equal(
    getSmartEduTextbookSourceUrl("https://basic.smartedu.cn/tchMaterial/detail"),
    null
  );
  assert.equal(getSmartEduTextbookSourceUrl(null), null);
});

test("获取电子教材按钮使用 SmartEdu 来源地址并在新窗口打开", () => {
  const html = renderSourceLink(sourceUrl);

  assert.match(html, /获取电子教材/u);
  assert.doesNotMatch(html, /来源：国家中小学智慧教育平台/u);
  assert.match(html, /target="_blank"/u);
  assert.match(html, /rel="noreferrer"/u);
  assert.match(html, /basic\.smartedu\.cn/u);
});

test("非法来源不渲染且不写入 Book sameAs", () => {
  assert.equal(renderSourceLink("https://example.com"), "");
  assert.deepEqual(textbookSourceSameAs("https://example.com"), {});
  assert.deepEqual(textbookSourceSameAs(sourceUrl), { sameAs: sourceUrl });
});
