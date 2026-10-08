import assert from "node:assert/strict";
import test from "node:test";
import { defaultGuideVoice, guideAudioExtension, guideAudioSelection } from "../src/lib/picture-book-guide.js";

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
