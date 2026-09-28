import assert from "node:assert/strict";
import test from "node:test";
import { validateDialogueInput, buildDialoguePlans, successfulDialogueCredits, dialogueFingerprint, assertDialogueQuoteCurrent, stripDialogueAudioCache } from "../src/audio/audio-dialogue.types.js";

const input = {
  speakers: [{ id: "a", name: "Student A", voiceValue: "system:alice" }, { id: "b", name: "Student B", voiceValue: "voice:bob" }],
  segments: [{ id: "s1", speakerId: "a", text: "Hello.", speed: 1, pauseSeconds: 0.5 }, { id: "s2", speakerId: "b", text: "Hi.", speed: 1, pauseSeconds: 0.2 }],
  format: "mp3", sampleRate: 24000, billingContext: "PERSONAL"
};
const prepared = (credits: number, modelName: string) => ({ modelInstanceId: modelName, providerInstanceId: "provider", providerKey: "test", modelName, providerVoiceId: "voice", voiceAssetId: null, voiceName: "voice", billingCharacters: 6, credits, speed: 1, pricingFingerprint: "price" });

test("混合模型报价按句汇总，不按全文使用同一单价", async () => {
  const plans = await buildDialoguePlans(validateDialogueInput(input), {}, async (_context, segment) => prepared(segment.id === "s1" ? 2 : 5, segment.id));
  assert.equal(plans.reduce((sum, plan) => sum + plan.credits, 0), 7);
  assert.deepEqual(plans.map(plan => plan.modelName), ["s1", "s2"]);
});

test("停顿变化复用已付费音频，正文变化不复用", async () => {
  const valid = validateDialogueInput(input);
  const first = await buildDialoguePlans(valid, {}, async () => prepared(2, "m"));
  const clips = { s1: { fingerprint: first[0].fingerprint, audioAssetId: "asset", audioTaskId: "task", url: "https://cdn.test/a.mp3", credits: 2 } };
  valid.segments[0].pauseSeconds = 2;
  const plans = await buildDialoguePlans(valid, clips, async () => prepared(2, "m"));
  assert.equal(plans[0].reused, true);
  assert.equal(plans[0].credits, 0);
  valid.segments[0].text = "Different.";
  const changed = await buildDialoguePlans(valid, clips, async () => prepared(2, "m"));
  assert.equal(changed[0].reused, false);
  assert.equal(changed[0].credits, 2);
});

test("单句重新合成仅对指定句报价，其余未生成句不收费", async () => {
  const valid = validateDialogueInput({ ...input, segmentId: "s2" });
  const plans = await buildDialoguePlans(valid, {}, async () => prepared(5, "m"));
  assert.deepEqual(plans.map(plan => [plan.credits, plan.status]), [[0, "SKIPPED"], [5, "PENDING"]]);
});

test("失败或未落盘的分句不计入实际费用", () => {
  const plans = [{ credits: 2, status: "SUCCEEDED" }, { credits: 5, status: "FAILED" }, { credits: 9, status: "STORING" }];
  assert.equal(successfulDialogueCredits(plans), 2);
});

test("旧版本及过期报价拒绝确认", () => {
  const snapshot = { revision: 2, expiresAt: new Date("2026-09-14T06:00:00Z"), fingerprint: "quote" };
  assert.throws(() => assertDialogueQuoteCurrent(snapshot, 3, "quote", new Date("2026-09-14T05:59:00Z")), /重新/);
  assert.throws(() => assertDialogueQuoteCurrent(snapshot, 2, "quote", new Date("2026-09-14T06:01:00Z")), /过期|重新/);
  assert.throws(() => assertDialogueQuoteCurrent(snapshot, 2, "other", new Date("2026-09-14T05:59:00Z")), /重新/);
});

test("无效角色、重复段落、越界停顿以及模板音色不能进入供应商请求", () => {
  assert.throws(() => validateDialogueInput({ ...input, segments: [{ ...input.segments[0], speakerId: "missing" }] }), /角色/);
  assert.throws(() => validateDialogueInput({ ...input, segments: [input.segments[0], input.segments[0]] }), /重复/);
  assert.throws(() => validateDialogueInput({ ...input, segments: [{ ...input.segments[0], pauseSeconds: 6 }] }), /停顿/);
  assert.throws(() => validateDialogueInput({ ...input, speakers: [{ ...input.speakers[0], voiceValue: "cosyvoice-v35:announcer" }, input.speakers[1]] }), /音色/);
});

test("输入指纹区分实际模型和角色音色", () => {
  assert.notEqual(dialogueFingerprint({ model: "one", voice: "a" }), dialogueFingerprint({ model: "two", voice: "a" }));
  assert.notEqual(dialogueFingerprint({ model: "one", voice: "a" }), dialogueFingerprint({ model: "one", voice: "b" }));
});

test("报价指纹不受 JSON 对象字段顺序影响", () => {
  assert.equal(dialogueFingerprint({ a: 1, b: { x: 2, y: 3 } }), dialogueFingerprint({ b: { y: 3, x: 2 }, a: 1 }));
});

test("任务历史不返回多人临时音频缓存，单人 Base64 兼容输出不受影响", () => {
  assert.deepEqual(stripDialogueAudioCache({ dialogueProjectId: "project", dialogueResult: { audioBase64: "private-bytes" }, dialogueCachedAt: "date", source: "EXPERIENCE" }), { dialogueProjectId: "project", source: "EXPERIENCE" });
  assert.deepEqual(stripDialogueAudioCache({ audioBase64: "single", source: "EXPERIENCE" }), { audioBase64: "single", source: "EXPERIENCE" });
});

test("new clip fingerprints use WAV masters while old paid MP3 clips remain reusable", async () => {
  const valid = validateDialogueInput(input);
  const fingerprintFor = (format: string) => dialogueFingerprint({ text: valid.segments[0].text, model: "m", provider: "provider", voice: "voice", voiceAssetId: null, speed: 1, format, sampleRate: 24000 });
  const plans = await buildDialoguePlans(valid, {}, async () => prepared(2, "m"));
  assert.equal(plans[0].fingerprint, fingerprintFor("wav"));
  const legacy = fingerprintFor("mp3");
  const clips = { s1: { fingerprint: legacy, audioAssetId: "asset", audioTaskId: "task", url: "https://cdn.test/old.mp3", credits: 2 } };
  valid.segments[0].pauseSeconds = 1;
  const reused = await buildDialoguePlans(valid, clips, async () => prepared(2, "m"));
  assert.equal(reused[0].reused, true);
  assert.equal(reused[0].credits, 0);
  assert.equal(reused[0].fingerprint, legacy);
  const regenerated = await buildDialoguePlans({ ...valid, segmentId: "s1" }, clips, async () => prepared(2, "m"));
  assert.equal(regenerated[0].reused, false);
  assert.equal(regenerated[0].fingerprint, fingerprintFor("wav"));
});
