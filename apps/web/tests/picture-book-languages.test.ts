import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookAvailableLanguages, pictureBookPageContent } from "../src/lib/picture-book-languages.js";

const pages = [
  { position: 0, caption: "封面", audioUrl: null, translations: [] },
  { position: 1, caption: "你好", audioUrl: "original.mp3", translations: [{ language: "en", caption: "Hello", audioUrl: "english.mp3" }] },
  { position: 2, caption: "再见", audioUrl: "original-2.mp3", translations: [] }
];

test("播放器列出书中译文语种，选中语种时使用对应字幕与语音", () => {
  assert.deepEqual(pictureBookAvailableLanguages(pages), ["en"]);
  assert.deepEqual(pictureBookPageContent(pages[1]!, "en"), { caption: "Hello", originalCaption: "你好", audioUrl: "english.mp3", language: "en" });
});

test("未翻译的页面回退原文，不将原语种语音误标为译文", () => {
  assert.deepEqual(pictureBookPageContent(pages[2]!, "en"), { caption: "再见", originalCaption: "再见", audioUrl: "original-2.mp3", language: undefined });
});

test("尚未合成语音的译文仍可作为阅读语言选择，且不会播放原文语音", () => {
  const page = { caption: "Hello", audioUrl: "original.mp3", translations: [{ language: "zh-CN", caption: "你好", audioUrl: null }] };
  assert.deepEqual(pictureBookAvailableLanguages([page]), ["zh-CN"]);
  assert.deepEqual(pictureBookPageContent(page, "zh-CN"), { caption: "你好", originalCaption: "Hello", audioUrl: null, language: "zh-CN" });
});

test("开放圣经故事的原文选项显示中文，其他绘本保留原有标签", async () => {
  const { pictureBookOriginalLabel } = await import("../src/lib/picture-book-languages.js");
  assert.equal(pictureBookOriginalLabel("abei-open-bible-stories-01"), "中文");
  assert.equal(pictureBookOriginalLabel("abei-open-bible-stories-50", "zh-CN"), "中文");
  assert.equal(pictureBookOriginalLabel("another-book"), "原文");
  assert.equal(pictureBookOriginalLabel("another-book", "en"), "英语（原文）");
});

test("标题随选择语言切换，缺少独立标题译文时读取与书名一致的封面译文", async () => {
  const { pictureBookTitleForLanguage } = await import("../src/lib/picture-book-languages.js");
  const book = { title: "创造", pages: [{ position: 0, caption: "创造", translations: [{ language: "en", caption: "The Creation", audioUrl: null }] }] };
  assert.equal(pictureBookTitleForLanguage(book, "original"), "创造");
  assert.equal(pictureBookTitleForLanguage(book, "en"), "The Creation");
  assert.equal(pictureBookTitleForLanguage({ ...book, titleTranslations: [{ language: "en", title: "Creation" }] }, "en"), "Creation");
  assert.equal(pictureBookTitleForLanguage({ ...book, pages: [{ ...book.pages[0]!, caption: "封面标语" }] }, "en"), "创造");
});
