import assert from "node:assert/strict";
import { test } from "node:test";
import { minimaxSystemVoices } from "../src/audio/minimax-system-voices.js";

test("MiniMax 系统音色列表完整且绑定限定 TTS 模型", () => {
  assert.equal(minimaxSystemVoices.length, 329);
  assert.equal(new Set(minimaxSystemVoices.map((voice) => voice.providerVoiceId)).size, minimaxSystemVoices.length);

  for (const voice of minimaxSystemVoices) {
    assert.deepEqual(voice.supportedModels, ["speech-2.8-turbo", "speech-2.8-hd"]);
    assert.equal(voice.targetModel, "speech-2.8-turbo");
    assert.equal(voice.type, "SYSTEM");
    assert.equal(voice.status, "READY");
  }

  assert.ok(minimaxSystemVoices.some((voice) => voice.providerVoiceId === "male-qn-qingse"));
  assert.ok(minimaxSystemVoices.some((voice) => voice.providerVoiceId === "hindi_female_1_v2"));
  assert.ok(minimaxSystemVoices.some((voice) => voice.providerVoiceId === "Chinese_casual_instructor_nv1"));
  assert.ok(minimaxSystemVoices.some((voice) => voice.providerVoiceId === "Chinese_patitent_teacher"));
});

test("MiniMax 系统音色补充分类、头像和 R2 试听音频", () => {
  const voicesWithPreview = minimaxSystemVoices.filter((voice) => voice.previewAudioUrl);
  const reliableExecutive = minimaxSystemVoices.find(
    (voice) => voice.providerVoiceId === "Chinese (Mandarin)_Reliable_Executive"
  );
  const energeticInstructor = minimaxSystemVoices.find(
    (voice) => voice.providerVoiceId === "Chinese_casual_instructor_nv1"
  );
  const gentleTeacher = minimaxSystemVoices.find((voice) => voice.providerVoiceId === "Chinese_patitent_teacher");

  assert.equal(voicesWithPreview.length, minimaxSystemVoices.length);
  for (const voice of minimaxSystemVoices) {
    assert.ok(voice.language);
    assert.ok(voice.accent);
    assert.ok(voice.gender);
    assert.ok(voice.ageCategory);
    assert.match(
      voice.avatarUrl ?? "",
      /^https:\/\/cdn\.xueleai\.com\/uploads\/audio\/voices\/avatars\/minimax-.+-[a-f0-9]{10}-v6-[a-f0-9]{20}\.jpg$/
    );
  }
  assert.equal(reliableExecutive?.name, "梁越山");
  assert.equal(reliableExecutive?.trait, "低沉厚实,磁性,从容不迫");
  assert.match(
    reliableExecutive?.previewAudioUrl ?? "",
    /^https:\/\/cdn\.xueleai\.com\/uploads\/audio\/voices\/minimax-system\/Chinese-Mandarin-_Reliable_Executive-[a-f0-9]{10}\.mp3$/
  );
  assert.equal(energeticInstructor?.name, "秦砚之");
  assert.equal(energeticInstructor?.scene, "在线教育、播客与社媒");
  assert.match(
    energeticInstructor?.previewAudioUrl ?? "",
    /^https:\/\/cdn\.xueleai\.com\/uploads\/audio\/voices\/minimax-system\/Chinese_casual_instructor_nv1-[a-f0-9]{10}\.mp3$/
  );
  assert.equal(gentleTeacher?.name, "袁清砚");
  assert.equal(gentleTeacher?.scene, "在线教育、播客与社媒、企业宣传与旁白");
  assert.match(
    gentleTeacher?.previewAudioUrl ?? "",
    /^https:\/\/cdn\.xueleai\.com\/uploads\/audio\/voices\/minimax-system\/Chinese_patitent_teacher-[a-f0-9]{10}\.mp3$/
  );
});
