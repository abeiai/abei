import assert from "node:assert/strict";
import test from "node:test";

import { cosyVoiceV35Presets, findPublishedCosyVoiceV35Preset, getCosyVoiceV35Preset, resolveCosyVoiceV35Selection } from "../src/lib/cosyvoice-v35-presets.js";

test("CosyVoice v3.5 presets have distinct person names and preview copy", () => {
  assert.equal(cosyVoiceV35Presets.length, 6);
  assert.equal(new Set(cosyVoiceV35Presets.map((preset) => preset.name)).size, 6);
  for (const preset of cosyVoiceV35Presets) {
    assert.doesNotMatch(preset.name, /v3\.5|女声|男声|旁白|讲解|助理/);
    assert.ok(preset.description.length >= 40);
    assert.ok(preset.previewText.length > 0);
    assert.match(preset.avatarUrl, /\/cosyvoice-v35\/.+\.jpg$/);
    assert.match(preset.previewAudioUrl, /\/cosyvoice-v35\/.+\.wav$/);
    assert.equal(getCosyVoiceV35Preset(preset.value), preset);
  }
});

test("only a ready designed voice for the same model replaces a preset", () => {
  const preset = cosyVoiceV35Presets[0]!;
  const voice = {
    name: preset.name,
    type: "DESIGNED",
    status: "READY",
    targetModel: "cosyvoice-v3.5-plus",
    providerVoiceId: "provider-voice-id"
  };
  assert.equal(findPublishedCosyVoiceV35Preset(preset, [voice]), voice);
  assert.equal(findPublishedCosyVoiceV35Preset(preset, [{ ...voice, status: "DISABLED" }]), null);
  assert.equal(findPublishedCosyVoiceV35Preset(preset, [{ ...voice, providerVoiceId: null }]), null);
  assert.equal(findPublishedCosyVoiceV35Preset(preset, [{ ...voice, targetModel: "cosyvoice-v3.5-flash" }]), null);
});

test("saved preset selections map to the published voice without changing speakers", () => {
  const preset = cosyVoiceV35Presets[1]!;
  const options = [{ value: "voice:other", name: "其他角色" }, { value: "voice:published", name: preset.name }];
  assert.equal(resolveCosyVoiceV35Selection(preset.value, options), "voice:published");
  assert.equal(resolveCosyVoiceV35Selection("voice:published", options), "voice:published");
  assert.equal(resolveCosyVoiceV35Selection("cosyvoice-v35:missing", options), null);
});
