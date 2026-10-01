import assert from "node:assert/strict";
import test from "node:test";
import { assertPictureBookGeneratedImageUrl, inspectPictureBookImage } from "../src/picture-books/picture-book-image.js";

test("picture book uploads reject missing or spoofed images", () => {
  assert.throws(() => inspectPictureBookImage(undefined), /请选择图片/);
  assert.throws(() => inspectPictureBookImage({ originalname: "not-image.png", mimetype: "image/png", size: 5, buffer: Buffer.from("hello") }), /有效的/);
});

test("picture book generated images accept provider URLs and reject untrusted origins", () => {
  assert.equal(
    assertPictureBookGeneratedImageUrl("https://dashscope-a717.oss-accelerate.aliyuncs.com/image.png?token=abc"),
    "https://dashscope-a717.oss-accelerate.aliyuncs.com/image.png?token=abc"
  );
  assert.equal(
    assertPictureBookGeneratedImageUrl("https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/image.jpeg"),
    "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/image.jpeg"
  );
  assert.throws(() => assertPictureBookGeneratedImageUrl("http://127.0.0.1/private.png"), /图片地址无效/);
  assert.throws(() => assertPictureBookGeneratedImageUrl("https://aliyuncs.com.evil.example/image.png"), /图片地址无效/);
  assert.throws(() => assertPictureBookGeneratedImageUrl("https://user:pass@dashscope-a717.oss-accelerate.aliyuncs.com/image.png"), /图片地址无效/);
});
