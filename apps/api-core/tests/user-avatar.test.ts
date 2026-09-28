import assert from "node:assert/strict";
import test from "node:test";
import { inspectUserAvatar } from "../src/auth/user-avatar.js";

test("头像接受真实 PNG 且不要求固定比例", () => {
  assert.deepEqual(inspectUserAvatar(pngFixture(800, 800), "image/png"), {
    height: 800,
    mimeType: "image/png",
    width: 800
  });
  assert.deepEqual(inspectUserAvatar(pngFixture(800, 600), "image/png"), {
    height: 600,
    mimeType: "image/png",
    width: 800
  });
});

test("头像拒绝伪造 MIME、无效图片和 5MB 以上图片", () => {
  assert.throws(() => inspectUserAvatar(Buffer.from("not-image"), "image/png"), /有效的头像图片/);
  assert.throws(() => inspectUserAvatar(pngFixture(800, 800), "image/jpeg"), /MIME 类型与文件内容不一致/);
  assert.throws(() => inspectUserAvatar(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"), /不能超过 5MB/);
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
