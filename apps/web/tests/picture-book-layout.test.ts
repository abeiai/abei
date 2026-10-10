import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookPageRatio, pictureBookPlaybackLayout } from "../src/lib/picture-book-layout.js";

test("跨页播放器只对内页使用两倍宽度，包含没有封面的旧绘本", () => {
  assert.equal(pictureBookPageRatio("1:1", true, 0), 1);
  assert.equal(pictureBookPageRatio("1:1", true, 1), 2);
  assert.equal(pictureBookPageRatio("16:9", true, 2), 32 / 9);
  assert.equal(pictureBookPageRatio("9:16", true, 1), 9 / 8);
  assert.equal(pictureBookPageRatio("1:1", false, 1), 1);
  assert.equal(pictureBookPageRatio("bad", true, 1), 2);
});

test("跨页模式回退左文右图选择，普通绘本保留所有版式", () => {
  assert.equal(pictureBookPlaybackLayout("side", true), "subtitle");
  assert.equal(pictureBookPlaybackLayout("side", false), "side");
  assert.equal(pictureBookPlaybackLayout("subtitle", true), "subtitle");
  assert.equal(pictureBookPlaybackLayout("below", true), "below");
});
