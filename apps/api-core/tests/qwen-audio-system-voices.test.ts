import assert from "node:assert/strict";
import { test } from "node:test";

import { qwenAudioTtsSystemVoices } from "../src/audio/qwen-audio-system-voices.js";

test("千问 3.1 精品中文音色完整且仅绑定普通话模型", () => {
  assert.equal(qwenAudioTtsSystemVoices.length, 22);
  assert.equal(new Set(qwenAudioTtsSystemVoices.map((voice) => voice.providerVoiceId)).size, 22);
  assert.ok(qwenAudioTtsSystemVoices.some((voice) => voice.providerVoiceId === "yuxiaoyun_v3.1"));
  assert.ok(qwenAudioTtsSystemVoices.some((voice) => voice.providerVoiceId === "anyuqing_v3.1"));

  for (const voice of qwenAudioTtsSystemVoices) {
    assert.deepEqual(voice.supportedModels, ["qwen-audio-3.1-tts-flash"]);
    assert.deepEqual(voice.languages, ["普通话"]);
    assert.equal(voice.targetModel, "qwen-audio-3.1-tts-flash");
    assert.equal(voice.accent, "普通话");
    assert.equal(voice.type, "SYSTEM");
    assert.match(voice.previewAudioUrl, /^https:\/\/g-adoc\.alcasset\.com\/media\/maas_docs\/sfm-cn\/common\/audios\/.+\.wav$/);
  }
});
