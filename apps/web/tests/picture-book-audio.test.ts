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
