import assert from "node:assert/strict";
import test from "node:test";
import { playbackFromSnapshot } from "../src/picture-books/picture-book-playback.js";

const box = { id: "one", text: "\n\n first \n\n\t\nsecond", x: 0.29, y: 0.294, width: 0.5, height: 0.5, fontSize: 20, fontFamily: "sans", color: "#000000", bold: false, align: "left", lineHeight: 1, speak: true, zIndex: 0 };
const snapshot = {
  title: "Book\n\nTitle",
  titleTranslations: [{ language: "en", title: "Other\n\nTitle" }],
  pages: [{
    position: 1,
    caption: "\n First line  \r\n \t\r\nSecond line\n\u00a0\nThird\n",
    narration: "Spoken\n\nwords",
    imageUrl: "https://r.example/image.png", audioUrl: "https://r.example/audio.mp3",
    translations: [{ language: "en", caption: "One\n\nTwo", audioUrl: "https://r.example/en.mp3" }, { language: "zh-CN", caption: "第一行\n\n第二行", audioUrl: null }],
    textLayout: { enabled: true, versions: [{ language: "original", boxes: [box], audioUrl: "https://r.example/layout.mp3" }, { language: "zh-CN", boxes: [{ ...box, text: "\n第一行\n\n第二行\n" }], audioUrl: null }] }
  }]
};

test("StoryWeaver 播放保留各语种编排文字的原始空行和坐标，普通字幕仍整理空行", () => {
  const input = structuredClone(snapshot);
  const book = playbackFromSnapshot("storyweaver-698069-i-love-to-read", input);
  assert.equal(book.title, "Book\nTitle");
  assert.equal(book.titleTranslations?.[0]?.title, "Other\nTitle");
  assert.equal(book.pages[0]?.caption, " First line  \nSecond line\nThird");
  assert.equal(book.pages[0]?.translations?.[0]?.caption, "One\nTwo");
  assert.equal(book.pages[0]?.translations?.[1]?.caption, "第一行\n第二行");
  assert.deepEqual(book.pages[0]?.textLayout, snapshot.pages[0]?.textLayout);
  assert.equal(book.pages[0]?.narration, "Spoken\nwords");
  assert.equal(book.pages[0]?.audioUrl, "https://r.example/audio.mp3");
  assert.equal(book.pages[0]?.translations?.[0]?.audioUrl, "https://r.example/en.mp3");
  assert.deepEqual(input, snapshot);
});

test("相同的文字和旁白规范化后仍相同，避免审核页重复展示", () => {
  const book = playbackFromSnapshot("storyweaver-7", { pages: [{ position: 1, caption: "A\n\nB", narration: "A\n\nB" }] });
  assert.equal(book.pages[0]?.caption, "A\nB");
  assert.equal(book.pages[0]?.caption, book.pages[0]?.narration);
});

test("其他绘本保留原有空行", () => {
  const page = playbackFromSnapshot("another-book", snapshot).pages[0];
  assert.equal(page?.caption, snapshot.pages[0]?.caption);
  assert.equal(page?.translations?.[0]?.caption, "One\n\nTwo");
  assert.equal(page?.textLayout?.versions[0]?.boxes[0]?.text, box.text);
});

test("仅保留单行换行，空白内容变为空字符串", () => {
  const book = playbackFromSnapshot("storyweaver-123", { pages: [
    { position: 1, caption: "  \r\n\t\n", imageUrl: null },
    { position: 2, caption: "A\n\u200b\n\u2060\nB\u200bC", translations: [{ language: "zh-CN", caption: "一\n\u200b\n二", audioUrl: null }] }
  ] });
  assert.equal(book.pages[0]?.caption, "");
  assert.equal(book.pages[1]?.caption, "A\nB\u200bC");
  assert.equal(book.pages[1]?.translations?.[0]?.caption, "一\n二");
});
