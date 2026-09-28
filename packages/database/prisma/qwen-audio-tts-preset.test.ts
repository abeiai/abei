import assert from "node:assert/strict";
import { test } from "node:test";

import { providerPresets } from "./ai-preset-data.js";

test("阿里云语音预设包含千问 3.1 TTS Flash 独立模型", () => {
  const provider = providerPresets.find((item) => item.providerKey === "aliyun_dashscope_audio");
  const model = provider?.models.find((item) => item.providerModelName === "qwen-audio-3.1-tts-flash");

  assert.ok(model);
  assert.ok(model.capabilityTags.includes("TTS"));
  assert.ok(model.capabilityTags.includes("SYSTEM_VOICE"));
  assert.ok(model.capabilityTags.includes("CHINA_MAINLAND"));
  assert.equal(model.supportsAudio, true);
  assert.ok("pricingConfig" in model);
  assert.deepEqual(model.pricingConfig, {
    mode: "TOKENS",
    currency: "CNY",
    unit: "M_TOKENS",
    input: 1.5,
    output: 12,
    source: "https://help.aliyun.com/zh/model-studio/qwen-audio-3-1-tts-flash"
  });
});
