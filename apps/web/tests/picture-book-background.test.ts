import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgePictureBookDraft, patchPictureBookPage, pictureBookGenerationKey, pictureBookTranslationBaseline } from "../src/lib/picture-book-background.js";

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

test("异步保存只清理已保存的草稿，不丢失其他页或保存期间的新编辑", () => {
  const saved = { caption: "旧编辑", imagePrompt: "画面", narration: "语音" };
  const newer = { ...saved, caption: "继续编辑" };
  const other = { ...saved, caption: "其他页" };
  const drafts = { "book:1": newer, "book:2": other };
  assert.equal(acknowledgePictureBookDraft(drafts, "book:1", saved), drafts);
  const acknowledged = acknowledgePictureBookDraft(drafts, "book:1", newer);
  assert.equal(acknowledged["book:1"], undefined);
  assert.equal(acknowledged["book:2"], other);
});

test("切换绘本后忽略原绘本的后台结果，图片、语音、分页任务互不混用", () => {
  const book = { id: "other", pages: [{ position: 1, caption: "其他绘本" }] };
  assert.equal(patchPictureBookPage(book, "book", 1, { caption: "旧结果" }), book);
  assert.equal(patchPictureBookPage(null, "book", 1, {}), null);
  assert.equal(new Set([pictureBookGenerationKey("book", 1, "image"), pictureBookGenerationKey("book", 1, "audio"), pictureBookGenerationKey("book", 2, "image"), pictureBookGenerationKey("other", 1, "image")]).size, 4);
});

test("编辑译文时保留最初基线，异步保存其他字段后仍检测远端新译文", () => {
  const initial = [{ language: "en", caption: "Hello", audioUrl: "en.mp3" }];
  const baseline = pictureBookTranslationBaseline(undefined, initial);
  const remote = [...initial, { language: "ja", caption: "こんにちは", audioUrl: "ja.mp3" }];
  assert.deepEqual(pictureBookTranslationBaseline({ translationBaseline: baseline }, remote), initial);
});
