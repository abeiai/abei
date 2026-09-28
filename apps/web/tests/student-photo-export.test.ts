import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { photoPixels, renderStudentPhoto, renderStudentPhotoPng } from "../src/lib/student-photo-export";

test("同一规格可导出 300 DPI 的 JPG 与 PNG", async () => {
  const source = await sharp({ create: { width: 768, height: 1024, channels: 3, background: "#95c9eb" } }).png().toBuffer();
  for (const format of ["jpg", "png"] as const) {
    const output = await renderStudentPhoto(source, 26, 32, 1.15, 0, 0, format);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, format === "jpg" ? "jpeg" : "png");
    assert.equal(metadata.width, photoPixels(26));
    assert.equal(metadata.height, photoPixels(32));
    assert.equal(metadata.density, 300);
  }
});

test("小一寸下载图为 22×32 毫米的 300 DPI PNG", async () => {
  const source = await sharp({ create: { width: 600, height: 800, channels: 3, background: "white" } }).png().toBuffer();
  const output = await renderStudentPhotoPng(source, 22, 32);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, photoPixels(22));
  assert.equal(metadata.height, photoPixels(32));
  assert.equal(metadata.density, 300);
  assert.equal(metadata.format, "png");
});

test("上下调整会改变导出图内容，输出规格保持不变", async () => {
  const source = await sharp({ create: { width: 768, height: 1024, channels: 3, background: "red" } })
    .composite([{ input: await sharp({ create: { width: 768, height: 512, channels: 3, background: "blue" } }).png().toBuffer(), top: 0, left: 0 }])
    .png().toBuffer();
  const upper = await renderStudentPhotoPng(source, 22, 32, 1.5, -1);
  const lower = await renderStudentPhotoPng(source, 22, 32, 1.5, 1);
  assert.notDeepEqual(upper, lower);
  assert.equal((await sharp(lower).metadata()).width, photoPixels(22));
});

test("左右调整会改变导出图内容，输出规格保持不变", async () => {
  const source = await sharp({ create: { width: 768, height: 1024, channels: 3, background: "red" } })
    .composite([{ input: await sharp({ create: { width: 384, height: 1024, channels: 3, background: "blue" } }).png().toBuffer(), top: 0, left: 0 }])
    .png().toBuffer();
  const left = await renderStudentPhotoPng(source, 26, 32, 1.5, 0, -1);
  const right = await renderStudentPhotoPng(source, 26, 32, 1.5, 0, 1);
  assert.notDeepEqual(left, right);
  assert.equal((await sharp(right).metadata()).width, photoPixels(26));
});
