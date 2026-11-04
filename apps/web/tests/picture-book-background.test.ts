import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgePictureBookDraft, patchPictureBookPage, pictureBookGenerationKey, pictureBookPageChanges, pictureBookPageSavePlan, pictureBookTranslationBaseline } from "../src/lib/picture-book-background.js";

test("旧绘本缺少可选字段时，打开编排不会产生待保存修改", () => {
  assert.deepEqual(pictureBookPageChanges(
    { caption: "故事", imagePrompt: null, narration: undefined },
    { caption: "故事", imagePrompt: "", narration: "" }
  ), {});
});

test("保存绘本文字时只发送实际修改的字段，避免提交未填写的空字段", () => {
  assert.deepEqual(pictureBookPageChanges(
    { caption: "", imagePrompt: "", narration: "" },
    { caption: "新文字", imagePrompt: "", narration: "新文字" }
  ), { caption: "新文字", narration: "新文字" });
});

test("排队保存按前一次保存结果比较，保留等待期间改回原值的编辑", async () => {
  let finishFirst!: (page: { caption: string; imagePrompt: string; narration: string }) => void;
  const pending = new Promise<{ caption: string; imagePrompt: string; narration: string }>(resolve => { finishFirst = resolve; });
  const next = pending.then(page => pictureBookPageSavePlan(page, { caption: "原文", imagePrompt: "新提示", narration: "讲解" }));
  finishFirst({ caption: "第一次保存", imagePrompt: "旧提示", narration: "讲解" });
  assert.deepEqual(await next, { pageChanges: { caption: "原文", imagePrompt: "新提示" }, translationsDirty: false });
});

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
