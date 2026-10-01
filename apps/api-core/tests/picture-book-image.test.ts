import assert from "node:assert/strict";
import test from "node:test";
import { inspectPictureBookImage } from "../src/picture-books/picture-book-image.js";

test("picture book uploads reject missing or spoofed images", () => {
  assert.throws(() => inspectPictureBookImage(undefined), /请选择图片/);
  assert.throws(() => inspectPictureBookImage({ originalname: "not-image.png", mimetype: "image/png", size: 5, buffer: Buffer.from("hello") }), /有效的/);
});
