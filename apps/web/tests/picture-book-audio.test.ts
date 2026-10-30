import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookPageAudioSource, waitForPictureBookAudio } from "../src/lib/picture-book-audio.js";

test("绘本语音使用站内播放地址并在重新生成后更换版本", () => {
  assert.equal(pictureBookPageAudioSource("book", 2, "https://r.abeiai.com/picture-books/audio/first.mp3"), "/api/picture-books/book/pages/2/audio?v=first.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, "https://r.abeiai.com/picture-books/audio/second.mp3"), "/api/picture-books/book/pages/2/audio?v=second.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, "/api/audio/files/local.mp3"), "/api/audio/files/local.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, "http://localhost:3600/api/audio/files/local.mp3"), "/api/audio/files/local.mp3");
});

test("多语种语音地址带语种参数并使用站内鉴权接口", () => {
  assert.equal(pictureBookPageAudioSource("book", 2, "https://r.example/en.mp3", "private", "en"), "/api/picture-books/book/pages/2/audio?language=en&v=en.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, "/api/audio/files/en.mp3", "public", "en"), "/api/public/picture-books/book/pages/2/audio?language=en&v=en.mp3");
});

test("已发布绘本的原文及译文语音使用 CDN，私有语音不直连", () => {
  const cdn = "https://r.abeiai.com";
  const source = `${cdn}/picture-books/narration.mp3`;
  assert.equal(pictureBookPageAudioSource("book", 2, source, "public", undefined, cdn), "https://cc.abeiai.com/picture-books/narration.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, source, "public", "en", cdn), "https://cc.abeiai.com/picture-books/narration.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, `${cdn}/uploads/audio/narration.mp3`, "public", undefined, cdn), "https://cc.abeiai.com/uploads/audio/narration.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, source, "private", undefined, cdn), "/api/picture-books/book/pages/2/audio?v=narration.mp3");
  assert.equal(pictureBookPageAudioSource("book", 2, "https://other.example/narration.mp3", "public", undefined, cdn), "/api/public/picture-books/book/pages/2/audio?v=narration.mp3");
});

test("语音能够播放后才完成生成反馈，加载失败则报告错误", async () => {
  const previousAudio = globalThis.Audio;
  class FakeAudio {
    oncanplay: (() => void) | null = null;
    onerror: (() => void) | null = null;
    preload = "";
    set src(value: string) { queueMicrotask(() => value === "/good.mp3" ? this.oncanplay?.() : this.onerror?.()); }
  }
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  try { await assert.rejects(waitForPictureBookAudio("/bad.mp3"), /语音.*加载失败/); await waitForPictureBookAudio("/good.mp3"); }
  finally { globalThis.Audio = previousAudio; }
});


test("专辑译文语音保留冻结成员路径，不回退作者当前草稿", () => {
  const source = "/api/creator-media/items/member-v1/pages/1/audio?language=en";
  assert.equal(pictureBookPageAudioSource("book", 1, source, "private", "en"), source);
});
