import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizePictureBookLibraryCover } from "../src/picture-books/picture-book-library-cover.js";

test("1:1模型输出只等比调整尺寸，不裁切也不添加纯色补边", async () => {
  for (const [width, height] of [[1024, 1024], [1536, 1536]]) {
    const source = await sharp({ create: { width, height, channels: 3, background: "#cb483d" } }).png().toBuffer();
    const normalized = await normalizePictureBookLibraryCover(source);
    const metadata = await sharp(normalized).metadata();
    assert.equal(metadata.width, 1536); assert.equal(metadata.height, 1536);
    for (const [left, top] of [[0, 0], [768, 768], [1535, 1535]]) {
      const pixel = [...await sharp(normalized).extract({ left: left!, top: top!, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
      assert.deepEqual(pixel, [203, 72, 61]);
    }
  }
});

test("非1:1模型输出拒绝用纯色条补齐比例", async () => {
  for (const [width, height] of [[1200, 900], [300, 600], [1536, 864]]) {
    const source = await sharp({ create: { width, height, channels: 3, background: "#cb483d" } }).png().toBuffer();
    await assert.rejects(normalizePictureBookLibraryCover(source), /1:1/);
  }
});
