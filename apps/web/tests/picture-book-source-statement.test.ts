import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PictureBookSourceStatement } from "../src/components/picture-books/picture-book-source-statement.js";

test("来源声明中的 CC BY 4.0 链接到对应许可页面", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previous = runtime.React; runtime.React = React;
  try {
    const html = renderToStaticMarkup(React.createElement(PictureBookSourceStatement, { text: "许可 (CC BY 4.0) 及署名" }));
    assert.match(html, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/);
    assert.match(html, />CC BY 4\.0<\/a>/);
    assert.match(html, /许可 \(/);
    assert.match(html, /\) 及署名/);
  } finally { runtime.React = previous; }
});

test("没有许可标记的声明作为普通文字呈现", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previous = runtime.React; runtime.React = React;
  try { assert.equal(renderToStaticMarkup(React.createElement(PictureBookSourceStatement, { text: "作者与插画家" })), "作者与插画家"); }
  finally { runtime.React = previous; }
});
