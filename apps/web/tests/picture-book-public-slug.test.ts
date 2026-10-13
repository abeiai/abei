import assert from "node:assert/strict";
import test from "node:test";
import { publicPictureBookHref } from "../src/lib/picture-book-public-slug.js";

test("《一苇渡江》从创作页进入新的公开地址", () => {
  assert.equal(publicPictureBookHref("abei-yiwei-lingjiang"), "/library/damo-yiwei-dujiang");
  assert.equal(publicPictureBookHref("ordinary-book"), "/library/ordinary-book");
});
