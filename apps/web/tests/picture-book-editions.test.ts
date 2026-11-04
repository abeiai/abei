import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookEditionOptions } from "../src/lib/picture-book-editions.js";

test("只在有其他已发布语种时显示语种选项", () => {
  const en = { id: "en", language: "en", href: "/library/en", current: true };
  const zh = { id: "zh", language: "zh-CN", href: "/library/zh", current: false };
  assert.deepEqual(pictureBookEditionOptions([en]), []);
  assert.deepEqual(pictureBookEditionOptions([en, zh]), [
    { ...en, label: "英语" }, { ...zh, label: "简体中文" }
  ]);
});
