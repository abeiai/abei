import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizePictureBookLibraryCover } from "../src/picture-books/picture-book-library-cover.js";

test("4:3模型输出只等比调整尺寸，不裁切也不添加纯色补边", async () => {
  for (const [width, height] of [[1200, 900], [1536, 1152]]) {
    const source = await sharp({ create: { width, height, channels: 3, background: "#cb483d" } }).png().toBuffer();
    const normalized = await normalizePictureBookLibraryCover(source);
    const metadata = await sharp(normalized).metadata();
    assert.equal(metadata.width, 1536); assert.equal(metadata.height, 1152);
    for (const [left, top] of [[0, 0], [768, 576], [1535, 1151]]) {
      const pixel = [...await sharp(normalized).extract({ left: left!, top: top!, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
      assert.deepEqual(pixel, [203, 72, 61]);
    }
  }
});

test("非4:3模型输出拒绝用纯色条补齐比例", async () => {
  for (const [width, height] of [[600, 600], [300, 600], [1536, 864]]) {
    const source = await sharp({ create: { width, height, channels: 3, background: "#cb483d" } }).png().toBuffer();
    await assert.rejects(normalizePictureBookLibraryCover(source), /4:3/);
  }
});
