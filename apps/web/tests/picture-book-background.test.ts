import assert from "node:assert/strict";
import test from "node:test";
import { patchPictureBookPage, pictureBookGenerationKey } from "../src/lib/picture-book-background.js";

test("后台图片和语音结果只更新发起页，保留其他页及绘本的修改", () => {
  const editing = { position: 2, caption: "编辑中的新内容", imageUrl: null as string | null, audioUrl: null as string | null };
  const book = { id: "book", title: "新作品名", pages: [{ position: 1, caption: "第一页", imageUrl: null as string | null, audioUrl: null as string | null }, editing] };
  const image = patchPictureBookPage(book, "book", 1, { imageUrl: "image.png" });
  const audio = patchPictureBookPage(image, "book", 1, { audioUrl: "audio.mp3" });
  assert.equal(audio?.pages[0]?.imageUrl, "image.png");
  assert.equal(audio?.pages[0]?.audioUrl, "audio.mp3");
  assert.equal(audio?.pages[1], editing);
  assert.equal(audio?.title, "新作品名");
});

test("切换绘本后忽略原绘本的后台结果，图片、语音、分页任务互不混用", () => {
  const book = { id: "other", pages: [{ position: 1, caption: "其他绘本" }] };
  assert.equal(patchPictureBookPage(book, "book", 1, { caption: "旧结果" }), book);
  assert.equal(patchPictureBookPage(null, "book", 1, {}), null);
  assert.equal(new Set([pictureBookGenerationKey("book", 1, "image"), pictureBookGenerationKey("book", 1, "audio"), pictureBookGenerationKey("book", 2, "image"), pictureBookGenerationKey("other", 1, "image")]).size, 4);
});
