import assert from "node:assert/strict";
import test from "node:test";

import { learningBillingConsumptionLabel } from "../src/lib/learning-billing-copy.js";

test("已确定的语音合成和上传识别账单显示确定消耗而非预计消耗", () => {
  assert.equal(learningBillingConsumptionLabel("ENGLISH_GUIDED_STUDY_TTS"), "本次消耗");
  assert.equal(learningBillingConsumptionLabel("ENGLISH_GUIDED_STUDY_ASR"), "本次消耗");
  assert.equal(learningBillingConsumptionLabel("VIDEO_GUIDE_NARRATION_TTS"), "本次消耗");
});

test("AI 内容和字幕等未确定任务仍显示预计消耗", () => {
  assert.equal(learningBillingConsumptionLabel("ENGLISH_GUIDED_STUDY_CONTENT"), "本次预计消耗");
  assert.equal(learningBillingConsumptionLabel("VIDEO_GUIDE_LESSON"), "本次预计消耗");
});
