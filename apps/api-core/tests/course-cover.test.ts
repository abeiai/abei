import assert from "node:assert/strict";
import test from "node:test";
import { inspectCourseCover } from "../src/courses/course-cover.js";

test("封面拒绝伪造 MIME 和非 16:9 尺寸", () => {
  assert.throws(() => inspectCourseCover(Buffer.from("not-image"), "image/jpeg"), /有效的封面图片/);
  assert.throws(() => inspectCourseCover(pngFixture(800, 800), "image/png"), /比例必须为 16:9/);
});

test("封面识别真实 PNG 尺寸", () => {
  assert.deepEqual(inspectCourseCover(pngFixture(1600, 900), "image/png"), {
    height: 900,
    mimeType: "image/png",
    width: 1600
  });
});

test("封面识别 JPEG SOF 尺寸", () => {
  assert.deepEqual(inspectCourseCover(jpegFixture(1600, 900), "image/jpeg"), {
    height: 900,
    mimeType: "image/jpeg",
    width: 1600
  });
});

test("封面识别 WebP 的 VP8、VP8L 和 VP8X 尺寸", () => {
  for (const buffer of [webpVp8Fixture(1600, 900), webpVp8lFixture(1600, 900), webpVp8xFixture(1600, 900)]) {
    assert.deepEqual(inspectCourseCover(buffer, "image/webp"), {
      height: 900,
      mimeType: "image/webp",
      width: 1600
    });
  }
});

test("封面校验声明 MIME、零尺寸和 10MB 上限", () => {
  assert.throws(() => inspectCourseCover(pngFixture(1600, 900), "image/jpeg"), /MIME 类型与文件内容不一致/);
  assert.throws(() => inspectCourseCover(pngFixture(0, 0), "image/png"), /有效的封面图片/);
  assert.throws(() => inspectCourseCover(Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"), /不能超过 10MB/);
});

test("恰好 10MiB 的有效封面被接受", () => {
  const buffer = Buffer.alloc(10 * 1024 * 1024);
  pngFixture(1600, 900).copy(buffer);

  assert.deepEqual(inspectCourseCover(buffer, "image/png"), {
    height: 900,
    mimeType: "image/png",
    width: 1600
  });
});

test("封面拒绝截断 JPEG segment 和越界 WebP chunk", () => {
  const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00]);
  const overflowingWebp = webpVp8xFixture(800, 600);
  overflowingWebp.writeUInt32LE(100, 16);

  assert.throws(() => inspectCourseCover(truncatedJpeg, "image/jpeg"), /有效的封面图片/);
  assert.throws(() => inspectCourseCover(overflowingWebp, "image/webp"), /有效的封面图片/);
});

test("封面识别 VP8L 和 VP8X 最大 16:9 尺寸边界", () => {
  assert.deepEqual(inspectCourseCover(webpVp8lFixture(16_384, 9_216), "image/webp"), {
    height: 9_216,
    mimeType: "image/webp",
    width: 16_384
  });
  assert.deepEqual(inspectCourseCover(webpVp8xFixture(16_777_216, 9_437_184), "image/webp"), {
    height: 9_437_184,
    mimeType: "image/webp",
    width: 16_777_216
  });
});

function pngFixture(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegFixture(width: number, height: number) {
  const buffer = Buffer.alloc(23);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0]).copy(buffer, 0);
  buffer.writeUInt16BE(17, 4);
  buffer[6] = 8;
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  buffer[11] = 3;
  Buffer.from([1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9]).copy(buffer, 12);
  return buffer;
}

function webpVp8Fixture(width: number, height: number) {
  const buffer = webpFixture("VP8 ", 10);
  Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a]).copy(buffer, 20);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function webpVp8lFixture(width: number, height: number) {
  const buffer = webpFixture("VP8L", 5);
  buffer[20] = 0x2f;
  buffer.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return buffer;
}

function webpVp8xFixture(width: number, height: number) {
  const buffer = webpFixture("VP8X", 10);
  writeUInt24LE(buffer, width - 1, 24);
  writeUInt24LE(buffer, height - 1, 27);
  return buffer;
}

function webpFixture(chunkType: string, chunkSize: number) {
  const buffer = Buffer.alloc(20 + chunkSize + (chunkSize % 2));
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write(chunkType, 12, "ascii");
  buffer.writeUInt32LE(chunkSize, 16);
  return buffer;
}

function writeUInt24LE(buffer: Buffer, value: number, offset: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
}
