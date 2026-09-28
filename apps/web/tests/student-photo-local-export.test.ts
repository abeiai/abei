import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { photoPixels, withJpegDpi, withPngDpi } from "../src/lib/student-photo-local-export";

test("本地 JPG 裁剪图保留 300 DPI 元数据", async () => {
  const source = await sharp({ create: { width: photoPixels(26), height: photoPixels(32), channels: 3, background: "white" } }).jpeg().toBuffer();
  const output = await withJpegDpi(new Blob([new Uint8Array(source)], { type: "image/jpeg" }), 300);
  const metadata = await sharp(Buffer.from(await output.arrayBuffer())).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.density, 300);
});

test("本地裁剪图片按 300 DPI 标记规格", async () => {
  const source = await sharp({ create: { width: photoPixels(26), height: photoPixels(32), channels: 3, background: "white" } }).png().toBuffer();
  const output = await withPngDpi(new Blob([new Uint8Array(source)], { type: "image/png" }), 300);
  const metadata = await sharp(Buffer.from(await output.arrayBuffer())).metadata();
  assert.equal(metadata.width, photoPixels(26));
  assert.equal(metadata.height, photoPixels(32));
  assert.equal(metadata.density, 300);
});
