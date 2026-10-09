import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { normalizePictureBookLibraryCover } from "../src/picture-books/picture-book-library-cover.js";
const sharp = createRequire(new URL("../../web/package.json", import.meta.url))("sharp");
test("原封面与模型输出保持完整，方形和竖版均规范为4:3且不裁掉标题", async () => {
  for (const [width,height] of [[600,600],[300,600],[1200,900]]) {
    const source = await sharp({ create: { width, height, channels: 3, background: "#cb483d" } }).png().toBuffer();
    const normalized = await normalizePictureBookLibraryCover(source);
    const metadata = await sharp(normalized).metadata();
    assert.equal(metadata.width,1536); assert.equal(metadata.height,1152);
    const pixel = async (left: number, top: number) => [...await sharp(normalized).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer()];
    assert.deepEqual(await pixel(768,576),[203,72,61]);
    if(width===height) assert.deepEqual(await pixel(0,0),[246,240,229]);
  }
});
