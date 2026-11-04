import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookLayoutHref, pictureBookPageNeighbors, pictureBookStudioHref } from "../src/lib/picture-book-layout-navigation.js";

test("图文编排和返回地址保留绘本与页码并安全编码", () => {
  assert.equal(pictureBookLayoutHref("book & 1", 0), "/storybook/layout?book=book+%26+1&page=0");
  assert.equal(pictureBookStudioHref("book & 1", 2), "/storybook?book=book+%26+1&page=2");
});

test("按实际页序切换，封面和缺少图片的页面均保留", () => {
  const pages = [{ position: 2, imageUrl: "b" }, { position: 0, imageUrl: "cover" }, { position: 1, imageUrl: null }];
  assert.deepEqual(pictureBookPageNeighbors(pages, 0), { previous: null, next: 1 });
  assert.deepEqual(pictureBookPageNeighbors(pages, 1), { previous: 0, next: 2 });
  assert.deepEqual(pictureBookPageNeighbors(pages, 2), { previous: 1, next: null });
  assert.deepEqual(pictureBookPageNeighbors(pages, 9), { previous: null, next: null });
});
