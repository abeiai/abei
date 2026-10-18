import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { displayImage, parseImageWidth, pruneImageVariants } from "../src/media/image-variants.js";

test("只接受固定图片宽度，不允许任意尺寸和重复查询参数", () => {
  assert.equal(parseImageWidth(undefined), undefined);
  assert.equal(parseImageWidth("640"), 640);
  for (const value of ["0", "641", "999999", "", "640x", ["320", "640"]]) {
    assert.throws(() => parseImageWidth(value), /图片尺寸/);
  }
});

test("历史图片按需压缩、保留透明度和比例，缓存命中不再读取原图", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-images-"));
  try {
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 0.5 } } }).png().toBuffer();
    const copy = Buffer.from(original);
    let reads = 0;
    const load = async () => { reads++; return { buffer: original, mimetype: "image/png" }; };
    const first = await displayImage("image-v1", 320, load, directory);
    const metadata = await sharp(first.buffer).metadata();
    assert.equal(metadata.width, 320);
    assert.equal(metadata.height, 160);
    assert.equal(metadata.hasAlpha, true);
    assert.equal(first.mimetype, "image/webp");
    assert.ok(first.buffer.length < original.length);
    assert.deepEqual(original, copy);
    assert.deepEqual(await displayImage("image-v1", 320, load, directory), first);
    assert.equal(reads, 1);
    await displayImage("image-v2", 320, load, directory);
    assert.equal(reads, 2);
    await pruneImageVariants(directory, 0);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("原图请求不处理，小图片不放大，EXIF 方向先校正再去除", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-images-"));
  try {
    const buffer = await sharp({ create: { width: 120, height: 80, channels: 3, background: "orange" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const original = { buffer, mimetype: "image/jpeg" };
    assert.deepEqual(await displayImage("original", undefined, async () => original, directory), original);
    const result = await displayImage("rotated", 320, async () => original, directory);
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 120);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.exif, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("动图保留所有帧，不支持的文件不送入静态图编码", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-images-"));
  try {
    const buffer = await sharp({ create: { width: 32, height: 64, channels: 3, background: "red" } }).raw().toBuffer();
    buffer.fill(0, 32 * 32 * 3);
    const gif = await sharp(buffer, { raw: { width: 32, height: 64, channels: 3, pageHeight: 32 } }).gif({ loop: 0, delay: [100, 100] }).toBuffer();
    assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 2);
    const original = { buffer: gif, mimetype: "image/gif" };
    assert.deepEqual(await displayImage("animation", 160, async () => original, directory), original);
    const icon = { buffer: Buffer.from("icon"), mimetype: "image/x-icon" };
    assert.deepEqual(await displayImage("icon", 64, async () => icon, directory), icon);
    await assert.rejects(displayImage("invalid-width", 641, async () => icon, directory), /图片尺寸/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
