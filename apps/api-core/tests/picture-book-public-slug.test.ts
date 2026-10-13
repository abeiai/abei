import assert from "node:assert/strict";
import test from "node:test";
import { publicPictureBookHref, resolvePublicPictureBookId } from "../src/picture-books/picture-book-public-slug.js";

test("《一苇渡江》的公开地址使用指定 slug，读取时仍使用原绘本 ID", () => {
  assert.equal(publicPictureBookHref("abei-yiwei-lingjiang"), "/library/damo-yiwei-dujiang");
  assert.equal(resolvePublicPictureBookId("damo-yiwei-dujiang"), "abei-yiwei-lingjiang");
  assert.equal(resolvePublicPictureBookId("abei-yiwei-lingjiang"), "abei-yiwei-lingjiang");
});

test("其他绘本维持现有的 ID 地址", () => {
  assert.equal(publicPictureBookHref("ordinary-book"), "/library/ordinary-book");
  assert.equal(resolvePublicPictureBookId("ordinary-book"), "ordinary-book");
});
