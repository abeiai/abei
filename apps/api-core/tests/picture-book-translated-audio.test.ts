import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";

test("多语种语音生成使用本页译文并仅保存该语种音频", async () => {
  const book = { pages: [{ position: 1, narration: "原文", audioUrl: "original.mp3", translations: [
    { language: "en", caption: "Hello", audioUrl: null, audioTaskId: null },
    { language: "ja", caption: "こんにちは", audioUrl: "ja.mp3", audioTaskId: "ja-task" }
  ] }] };
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(service, {
    get: async () => book,
    mediaService: { assertPictureBookR2Ready: () => undefined },
    audioService: {
      listVoiceAssets: async () => ({ defaultVoice: { voiceAssetId: null, systemVoiceId: "voice" }, systemVoices: [] }),
      createTtsTask: async (_user: unknown, request: { text: string }) => {
        assert.equal(request.text, "Hello");
        return { id: "new-task", status: "SUCCEEDED", outputAudioAsset: { url: "en.mp3" } };
      }
    },
    mutate: async (_user: string, _id: string, update: (current: typeof book) => { pages: typeof book.pages }) => { book.pages = update(book).pages; return book; }
  });
  await service.generateAudio({ userId: "owner", mode: "ACCOUNT" }, "book", 1, { language: "en" });
  assert.equal(book.pages[0].audioUrl, "original.mp3");
  assert.equal(book.pages[0].translations[0].audioUrl, "en.mp3");
  assert.equal(book.pages[0].translations[1].audioUrl, "ja.mp3");
  await assert.rejects(service.generateAudio({ userId: "owner", mode: "ACCOUNT" }, "book", 1, { language: "fr" }), /保存该语种/);
});
