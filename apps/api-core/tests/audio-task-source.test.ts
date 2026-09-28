import assert from "node:assert/strict";
import test from "node:test";

import { isVoiceExperienceAudioTask } from "../src/audio/audio.service.js";

test("语音合成体验任务分类同时排除新旧带学语音", () => {
  assert.equal(isVoiceExperienceAudioTask({
    type: "TTS",
    providerPayload: { source: "EXPERIENCE" },
    englishGuidedStudyMaterialCount: 0
  }), true);
  assert.equal(isVoiceExperienceAudioTask({
    type: "TTS",
    providerPayload: { source: "EXPERIENCE" },
    englishGuidedStudyMaterialCount: 1
  }), false);
  assert.equal(isVoiceExperienceAudioTask({
    type: "TTS",
    providerPayload: {
      source: "EXPERIENCE",
      videoGuidePersistence: { namespace: "english-guided-study" }
    },
    englishGuidedStudyMaterialCount: 0
  }), false);
  assert.equal(isVoiceExperienceAudioTask({
    type: "TTS",
    providerPayload: { source: "TOOL" },
    englishGuidedStudyMaterialCount: 0
  }), false);
});
