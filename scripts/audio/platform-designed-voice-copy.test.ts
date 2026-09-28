import assert from "node:assert/strict";
import test from "node:test";

import { platformDesignedVoiceCopy } from "./platform-designed-voice-copy.js";

const nonTeacherVoices = new Set([
  "ttv-voice-2026081213584326-XMFMqsSA",
  "ttv-voice-2026081214111326-h2ISV1wl",
  "ttv-voice-2026081814513926-lB77u7hF"
]);

test("平台设计音色使用独立角色名和约 50 字的中文介绍", () => {
  const entries = Object.entries(platformDesignedVoiceCopy);
  assert.equal(entries.length, 31);
  assert.equal(new Set(entries.map(([, copy]) => copy.name)).size, entries.length);

  for (const [providerVoiceId, copy] of entries) {
    assert.match(copy.name, /^\p{Script=Han}+(?:[A-Za-z]+)?(?:老师)?$/u, providerVoiceId);
    assert.equal(copy.name.endsWith("老师"), !nonTeacherVoices.has(providerVoiceId), providerVoiceId);
    assert.match(copy.description, /\p{Script=Han}/u, providerVoiceId);
    assert.doesNotMatch(copy.description, /[A-Za-z\r\n]/, providerVoiceId);
    assert.ok(copy.description.length >= 40 && copy.description.length <= 70, providerVoiceId);
  }

  assert.equal(platformDesignedVoiceCopy["ttv-voice-2026082923581126-aHjw09tN"].name, "韩明希老师");
  assert.equal(platformDesignedVoiceCopy["ttv-voice-2026083000165426-zRHPAOQ3"].name, "杜嘉言老师");
});
