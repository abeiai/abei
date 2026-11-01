import assert from "node:assert/strict";
import test from "node:test";
import { defaultGuideVoice, guideAudioExtension, guideAudioSelection, guidePlaybackPage, type GuidePage } from "../src/lib/picture-book-guide.js";

test("播放显示绘本原文或 PDF 识别文字，未标记封面的首页仍显示文字", () => {
  const page: GuidePage = { pageNumber: 1, sourceText: "绘本原文", script: "导读讲解", imageUrl: "/image", audioUrl: "/audio", audioTaskId: null, audioMimeType: null, audioVoice: null, audioSpeed: null };
  assert.deepEqual(guidePlaybackPage(page, 0), { cover: false, text: "绘本原文", label: "第 1 页" });
  const scanned = { ...page, sourceText: "", pdfAnalysis: { kind: "CONTENT" as const, text: "识别的绘本文字", description: "画面" } };
  assert.equal(guidePlaybackPage(scanned, 0).text, "识别的绘本文字");
  assert.equal(guidePlaybackPage(scanned, 0, true).cover, true);
  assert.deepEqual(guidePlaybackPage(scanned, 1, true), { cover: false, text: "识别的绘本文字", label: "第 1 页" });
});

test("导读默认音色必须发送已选系统或资产 ID，优先使用音色库默认项", () => {
  const library = { defaultVoice: { voiceAssetId: "platform", systemVoiceId: null },
    systemVoices: [{ id: "system", providerVoiceId: "Cherry", status: "READY" }],
    platformVoices: [{ id: "platform", status: "READY" }], customVoices: [] };
  assert.deepEqual(guideAudioSelection(defaultGuideVoice(library), 0.85), { voiceAssetId: "platform", speed: 0.85 });
  library.defaultVoice.voiceAssetId = "missing";
  assert.deepEqual(guideAudioSelection(defaultGuideVoice(library), 1), { voice: "Cherry", speed: 1 });
  library.systemVoices[0]!.status = "DISABLED";
  library.platformVoices[0]!.status = "DISABLED";
  assert.equal(defaultGuideVoice(library), "");
});

test("逐页语音下载保留供应商实际音频格式", () => {
  assert.equal(guideAudioExtension("audio/wav"), "wav");
  assert.equal(guideAudioExtension("audio/ogg"), "ogg");
  assert.equal(guideAudioExtension("audio/mp4"), "m4a");
  assert.equal(guideAudioExtension("audio/mpeg"), "mp3");
});
