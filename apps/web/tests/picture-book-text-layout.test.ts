import assert from "node:assert/strict";
import test from "node:test";
import { fitPictureBookTextBox, layoutPageContent, pictureBookInitialLayoutLanguage, pictureBookLayoutCaption, pictureBookLayoutLanguages, placePictureBookCaption, snapPictureBookTextBox } from "../src/lib/picture-book-text-layout.js";

const box = { id: "a", text: "你好", x: 0, y: 0, width: 0.5, height: 0.2, fontSize: 32, fontFamily: "sans" as const, color: "#111111", bold: false, align: "left" as const, lineHeight: 1.5, speak: true };
const page = { caption: "旧文字", audioUrl: "old.mp3", textLayout: { enabled: true, versions: [{ language: "original", boxes: [box], audioUrl: "new.mp3" }, { language: "en", boxes: [{ ...box, text: "Hello" }], audioUrl: null }] } };

test("文本框按内容高度收缩或扩展，靠近底部时向上移动以保留全部文字", () => {
  assert.equal(fitPictureBookTextBox(box, 20, 400).height, .05);
  const fitted = fitPictureBookTextBox({ ...box, y: .9 }, 100, 400);
  assert.equal(fitted.height, .25);
  assert.equal(fitted.y, .75);
  assert.equal(fitted.width, box.width);
});

test("文本框以像素距离独立吸附两条中线，拖出阈值后解除吸附", () => {
  const bounds = { width: .25, height: .25 };
  assert.deepEqual(snapPictureBookTextBox(.38, .39, bounds, 1000, 400), { x: .375, y: .375, vertical: true, horizontal: true });
  assert.deepEqual(snapPictureBookTextBox(.385, .39, bounds, 1000, 400), { x: .385, y: .375, vertical: false, horizontal: true });
  assert.deepEqual(snapPictureBookTextBox(.38, .4, bounds, 1000, 400), { x: .375, y: .4, vertical: true, horizontal: false });
  assert.deepEqual(snapPictureBookTextBox(-.1, .95, bounds, 1000, 400), { x: 0, y: .75, vertical: false, horizontal: false });
});

test("书名译文只用于编排封面标题，内页导入必须有对应语种的展示文字", () => {
  const book = { title: "A Story", titleTranslations: [{ language: "zh-CN", title: "一个故事" }] };
  assert.equal(pictureBookLayoutCaption(book, { position: 0, caption: "A Story" }, "zh-CN"), "一个故事");
  assert.equal(pictureBookLayoutCaption(book, { position: 0, caption: "A dedication" }, "zh-CN"), "");
  const interior = { position: 1, caption: "Chapter one" };
  assert.equal(pictureBookLayoutCaption(book, interior, "zh-CN"), "");
  assert.equal(pictureBookLayoutCaption(book, { ...interior, translations: [{ language: "zh-CN", caption: "第一章" }] }, "zh-CN"), "第一章");
  assert.equal(pictureBookLayoutCaption(book, interior, "original"), "Chapter one");
});

test("复用文本布局时按顺序导入译文并保留各框样式，剩余文字留在最后一框", () => {
  const placeholder = { ...box, id: "placeholder", text: "" };
  const body = { ...box, id: "body", text: "原文正文", x: .25, fontSize: 24, align: "justify" as const };
  const boxes = [placeholder, box, body];
  assert.deepEqual(placePictureBookCaption(boxes, "Title\r\nBody\r\nMore"), [placeholder, { ...box, text: "Title" }, { ...body, text: "Body\nMore" }]);
  assert.deepEqual(placePictureBookCaption(boxes, "").map(item => item.text), ["", "", ""]);
  assert.deepEqual(placePictureBookCaption([placeholder], "整段\n文字"), [{ ...placeholder, text: "整段\n文字" }]);
});

test("编排只使用绘本已有语种，翻页时保留所选语言", () => {
  const translatedLayout = { ...page.textLayout, versions: [{ language: "ja", boxes: [box], audioUrl: null }] };
  const { originalLanguage, languages } = pictureBookLayoutLanguages({
    id: "book", edition: { language: "en" }, titleTranslations: [{ language: "fr" }],
    pages: [{ translations: [{ language: "en" }, { language: "zh-CN" }] }, { textLayout: translatedLayout }]
  });
  assert.deepEqual(languages, ["original", "ja", "fr", "zh-CN"]);
  assert.equal(pictureBookInitialLayoutLanguage("zh-CN", languages), "zh-CN");
  assert.equal(pictureBookInitialLayoutLanguage("en", languages, translatedLayout, originalLanguage), "original");
  assert.equal(pictureBookInitialLayoutLanguage("de", languages, translatedLayout, originalLanguage), "ja");
  assert.equal(pictureBookInitialLayoutLanguage(undefined, languages, page.textLayout), "original");
  assert.equal(pictureBookLayoutLanguages({ id: "storyweaver-24768", pages: [] }).originalLanguage, "en");
});
test("图文编排按所选语言返回文字和音频，缺失语种不回退", () => {
  assert.deepEqual(layoutPageContent(page, "en"), { caption: "Hello", audioUrl: null, language: "en" });
  assert.deepEqual(layoutPageContent(page, "ja"), { caption: "", audioUrl: null, language: "ja" });
  assert.deepEqual(layoutPageContent(page, "original"), { caption: "你好", audioUrl: "new.mp3", language: undefined });
});

test("混合旧页面缺少所选译文时不回退原文或原文语音", async () => {
  const { readerPageContent } = await import("../src/lib/picture-book-text-layout.js");
  assert.deepEqual(readerPageContent({ caption: "原文", audioUrl: "original.mp3" }, "en", true), { caption: "", originalCaption: "原文", audioUrl: null, language: "en" });
});

test("音色切换回默认时不保存空的音色标识", async () => {
  const { withLayoutVoice } = await import("../src/lib/picture-book-text-layout.js");
  const selected = { language: "en", boxes: [box], audioUrl: null, voiceKey: "voice:123" };
  assert.deepEqual(withLayoutVoice(selected, ""), { language: "en", boxes: [box], audioUrl: null });
  assert.equal(withLayoutVoice(selected, "system:voice").voiceKey, "system:voice");
});
