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

test("尚未合成语音的译文不出现在语音语种选择中", () => {
  assert.deepEqual(pictureBookAvailableLanguages([{ caption: "你好", audioUrl: "original.mp3", translations: [{ language: "fr", caption: "Bonjour", audioUrl: null }] }]), []);
});
