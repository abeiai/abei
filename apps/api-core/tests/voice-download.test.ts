import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AudioService } from "../src/audio/audio.service.js";
import { VoiceDownloadController } from "../src/audio/voice-download.controller.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";

const db = getPrismaClient();
after(() => db.$disconnect());
const implementation = () => import("../src/audio/voice-download.service.js").catch(() => null);

test("download queries accept exactly one bounded task/project target and MP3/WAV", async () => {
  const module = await implementation();
  assert.ok(module, "voice download service is implemented");
  const parse = module.validateVoiceDownloadQuery;
  assert.deepEqual(parse({ task: "task-1", format: "mp3" }), { task: "task-1", format: "mp3" });
  assert.deepEqual(parse({ project: "project-1", revision: "2", format: "wav" }), { project: "project-1", revision: 2, format: "wav" });
  for (const raw of [{}, { task: "x", project: "y", revision: "1" }, { task: ["x"] }, { task: "../x" }, { task: "x", revision: "1" }, { project: "x", revision: "1.5" }, { project: "x", revision: "0" }, { task: "x", format: "opus" }, { task: "x", url: "https://evil.example/x" }]) {
    assert.throws(() => parse(raw), /参数|格式|版本/);
  }
});

test("owned voice outputs export without wallet/task writes; other users/profiles/scenes cannot download", async t => {
  const module = await implementation();
  assert.ok(module, "voice download service is implemented");
  const user = await db.user.create({ data: { email: `voice-export-${randomUUID()}@example.test`, nickname: "音频下载测试", passwordHash: await hashPassword(randomUUID()), wallet: { create: { availableCredits: 100 } } } });
  t.after(async () => {
    await db.audioDialogueProject.deleteMany({ where: { userId: user.id } });
    await db.audioTask.deleteMany({ where: { userId: user.id } });
    await db.audioAsset.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
  const asset = await db.audioAsset.create({ data: { userId: user.id, type: "TTS_OUTPUT", storageProvider: "S3", url: "https://cdn.example.test/master.wav", objectKey: "master.wav", mimeType: "audio/wav", sizeBytes: 100 } });
  const task = await db.audioTask.create({ data: { userId: user.id, type: "TTS", status: "SUCCEEDED", provider: "fixture", model: "fixture", estimatedCredits: 0, actualCredits: 0, providerPayload: { source: "EXPERIENCE" }, outputAudioAssetId: asset.id } });
  const service = new module.VoiceDownloadService();
  const seen: string[] = [];
  Object.defineProperty(service, "render", { value: async (input: { source: { url: string }; format: string }) => {
    seen.push(input.source.url); return { bytes: Buffer.from(input.format), mimeType: input.format === "wav" ? "audio/wav" : "audio/mpeg" };
  } });
  const subject: ProfileSubject = { userId: user.id, learnerId: null, mode: "ACCOUNT" };
  for (const format of ["wav", "mp3"] as const) {
    const output = await service.download(subject, { task: task.id, format });
    assert.equal(output.bytes.toString(), format);
    assert.match(output.filename, new RegExp(`\\.${format}$`));
  }
  assert.deepEqual(await db.audioTask.findUnique({ where: { id: task.id } }), task);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).availableCredits, 100);
  assert.equal(await db.audioTask.count({ where: { userId: user.id } }), 1);
  for (const who of [{ ...subject, userId: "other-user" }, { userId: user.id, learnerId: "other-learner", mode: "LEARNER" as const }]) {
    await assert.rejects(service.download(who, { task: task.id, format: "wav" }), /不存在|权限/);
  }
  for (const providerPayload of [{ source: "TOOL" }, { source: "EXPERIENCE", videoGuidePersistence: {} }, { source: "EXPERIENCE", dialogueProjectId: "other" }]) {
    await db.audioTask.update({ where: { id: task.id }, data: { providerPayload } });
    await assert.rejects(service.download(subject, { task: task.id, format: "wav" }), /不存在|权限/);
  }
  assert.equal(seen.length, 2, "unauthorized assets never reach media processing");
  const project = await db.audioDialogueProject.create({ data: { userId: user.id, title: "下载版本测试", input: {}, outputAudioAssetId: asset.id, outputRevision: 2, revision: 3, status: "PROCESSING" } });
  await service.download(subject, { project: project.id, revision: 2, format: "wav" });
  await assert.rejects(service.download(subject, { project: project.id, revision: 1, format: "wav" }), /版本已更新/);
  await assert.rejects(service.download({ ...subject, userId: "other-user" }, { project: project.id, revision: 2, format: "wav" }), /不存在/);
  await assert.rejects(service.download({ ...subject, learnerId: "other-learner", mode: "LEARNER" }, { project: project.id, revision: 2, format: "wav" }), /不存在/);
  await db.audioAsset.update({ where: { id: asset.id }, data: { type: "SOURCE_SAMPLE" } });
  await assert.rejects(service.download(subject, { project: project.id, revision: 2, format: "wav" }), /暂无可下载/);
  assert.equal(seen.length, 3);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).availableCredits, 100);
});

test("single experience synthesis forces WAV but other callers keep their requested format", async () => {
  const service = new AudioService();
  const model = { modelName: "cosyvoice-v3-flash", adapterType: "DASHSCOPE_AUDIO" };
  const replacements = {
    ensureDashScopeAudioDefaults: async () => undefined,
    resolvePreferredTtsModel: async () => ({ modelNames: [model.modelName], label: "fixture" }),
    getModelByAlias: async () => model,
    resolveVoice: async () => ({ providerVoiceId: "fixture", voiceAssetId: null }),
    calculatePricingQuote: async () => ({ estimatedCredits: 0 }),
    reserveAudioTask: async () => ({ id: "task-1" }),
    executeTtsTask: async (_id: string, _model: unknown, _voice: string, _text: string, parameters: { format: string }, _timeout: number, output: unknown) => ({ parameters, output })
  };
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(service, key, { value });
  const run = (source: "EXPERIENCE" | "TOOL") => service.createTtsTask({ userId: "user-1", learnerId: null, rootScenarioId: null }, { text: "Hello.", voice: "fixture", source, format: "mp3", execute: true });
  const experience = await run("EXPERIENCE") as unknown as { parameters: { format: string }; output: { voiceMasterUserId?: string } };
  assert.equal(experience.parameters.format, "wav");
  assert.equal(experience.output.voiceMasterUserId, "user-1");
  const other = await run("TOOL") as unknown as { parameters: { format: string }; output?: unknown };
  assert.equal(other.parameters.format, "mp3");
  assert.equal(other.output, undefined);
});

test("其他场景的 EXPERIENCE 标记不能绕过下载应用授权", async () => {
  const module = await implementation(); assert.ok(module);
  const service = new module.VoiceDownloadService();
  let processed = false;
  Object.defineProperty(service, "render", { value: async () => { processed = true; } });
  Object.defineProperty(service, "prisma", { value: { audioTask: { findFirst: async () => ({
    type: "TTS", scenarioId: "other-scenario", scenario: { slug: "short-video-voiceover" }, providerPayload: { source: "EXPERIENCE" },
    _count: { englishGuidedStudyMaterials: 0 }, outputAudioAsset: { userId: "user-1", type: "TTS_OUTPUT" }
  }) } } });
  await assert.rejects(service.download({ userId: "user-1", learnerId: "learner-1", mode: "LEARNER" }, { task: "task-1", format: "wav" }), /不存在/);
  assert.equal(processed, false);
});

test("授权过程中断开的下载不读取 R2 或运行转换", async () => {
  let release!: () => void; let exported = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const controller = new VoiceDownloadController({ download: async () => { exported = true; } } as never,
    { me: async () => { await gate; return { id: "user-1" }; } } as never,
    { requireSelected: async () => ({ userId: "user-1", learnerId: null, mode: "ACCOUNT" }) } as never,
    { assertScenarioAuthorized: async () => ({ id: "voice", slug: "article-to-speech" }) } as never);
  const request = Object.assign(new EventEmitter(), { headers: {}, aborted: false });
  const response = Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false, set: () => undefined, send: () => undefined });
  const pending = controller.download(request, response, { task: "task-1", format: "wav" });
  request.aborted = true; request.emit("aborted"); response.destroyed = true; response.emit("close"); release();
  await assert.rejects(pending);
  assert.equal(exported, false);
  assert.equal(request.listenerCount("aborted"), 0); assert.equal(response.listenerCount("close"), 0);
});
