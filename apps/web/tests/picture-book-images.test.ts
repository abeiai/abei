import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookPageImageSource, waitForPictureBookImage } from "../src/lib/picture-book-images.js";

test("R2 图片使用站内地址，重新生成后使用新的缓存版本", () => {
  assert.equal(pictureBookPageImageSource("book-1", 2, "https://r.abeiai.com/picture-books/first.png"), "/api/picture-books/book-1/pages/2/image?v=first.png");
  assert.equal(pictureBookPageImageSource("book-1", 2, "https://r.abeiai.com/picture-books/second.png"), "/api/picture-books/book-1/pages/2/image?v=second.png");
  assert.equal(pictureBookPageImageSource("book-1", 0, "/api/media/files/local.png"), "/api/media/files/local.png");
});

test("图片加载失败时拒绝成功反馈，加载成功才完成", async () => {
  const previousImage = globalThis.Image;
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) { queueMicrotask(() => value === "/good.png" ? this.onload?.() : this.onerror?.()); }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  try {
    await assert.rejects(waitForPictureBookImage("/failed.png"), /加载失败/);
    await waitForPictureBookImage("/good.png");
  } finally { globalThis.Image = previousImage; }
});
