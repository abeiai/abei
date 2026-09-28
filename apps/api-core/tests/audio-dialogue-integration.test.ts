import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { getPrismaClient, hashPassword, type Prisma } from "@xueleai/database";
import { AudioService } from "../src/audio/audio.service.js";
import { AudioDialogueService } from "../src/audio/audio-dialogue.service.js";
import { OrganizationsService } from "../src/organizations/organizations.service.js";
import { AppException } from "../src/common/app-exception.js";
import { dialogueFingerprint, type DialogueInput, type PreparedDialogueTts } from "../src/audio/audio-dialogue.types.js";
import { isVoiceExperienceAudioTask } from "../src/audio/audio.service.js";

const db = getPrismaClient();
after(async () => db.$disconnect());
const draft: DialogueInput = {
  speakers: [{ id: "a", name: "Student A", voiceValue: "system:alice" }, { id: "b", name: "Student B", voiceValue: "system:bob" }],
  segments: [{ id: "s1", speakerId: "a", text: "Hello.", speed: 1, pauseSeconds: 0.5 }, { id: "s2", speakerId: "b", text: "Hi.", speed: 1, pauseSeconds: 0.5 }],
  format: "mp3", sampleRate: 24000, billingContext: "PERSONAL"
};
async function fixture(t: test.TestContext, credits = 100) {
  const user = await db.user.create({ data: { email: `dialogue-${randomUUID()}@example.test`, nickname: "多人配音测试", passwordHash: await hashPassword(randomUUID()), wallet: { create: { availableCredits: credits } } } });
  t.after(async () => {
    await db.audioDialogueProject.deleteMany({ where: { userId: user.id } });
    await db.audioTask.deleteMany({ where: { userId: user.id } });
    await db.audioAsset.deleteMany({ where: { userId: user.id } });
    await db.organization.deleteMany({ where: { ownerUserId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
  const audio = new AudioService();
  const state = { failedText: "", mergeFails: false, storeFails: false, priceVersion: "one", mergeFormat: "", requireWav: false };
  Object.defineProperty(audio, "prepareDialogueTts", { value: async (_context: unknown, input: { voiceValue: string; speed: number }) => ({
    modelInstanceId: input.voiceValue, providerInstanceId: "provider", providerKey: "test", modelName: input.voiceValue,
    providerVoiceId: input.voiceValue, voiceAssetId: null, voiceName: input.voiceValue,
    billingCharacters: 6, credits: input.voiceValue === "system:alice" ? 2 : 5, speed: input.speed, pricingFingerprint: state.priceVersion
  } satisfies PreparedDialogueTts) });
  Object.defineProperty(audio, "executeDialogueTts", { value: async (_context: unknown, plan: { id: string; fingerprint: string; credits: number }, input: { generationId: string; projectId: string; text: string }, onCreated: (id: string) => Promise<void>) => {
    const child = await db.audioTask.create({ data: { userId: user.id, type: "TTS", status: "PROCESSING", provider: "fixture", model: "fixture", inputText: input.text,
      estimatedCredits: 0, audioDialogueGenerationId: input.generationId,
      providerPayload: { source: "EXPERIENCE", dialogueProjectId: input.projectId, dialogueSegmentId: plan.id, dialogueFingerprint: plan.fingerprint } } });
    await onCreated(child.id);
    if (input.text === state.failedText) throw new AppException(40004, "测试供应商失败", 400);
    const payload = { audioBase64: "fixture" };
    await db.audioTask.update({ where: { id: child.id }, data: { providerPayload: { ...(child.providerPayload as Prisma.InputJsonObject), dialogueResult: payload } } });
    return { taskId: child.id, payload, credits: plan.credits };
  } });
  const organizations = new OrganizationsService();
  const service = new AudioDialogueService(audio, organizations);
  const result = (projectId: string, generationId: string) => ({ url: `https://cdn.example.test/audio/dialogue/${user.id}/${projectId}/${generationId}/fixture.mp3`, objectKey: "fixture.mp3", mimeType: "audio/mpeg", sizeBytes: 100, durationMs: 2000, sampleRate: 24000, channels: 1 });
  Object.defineProperty(service, "storage", { value: {
    persist: async (input: { projectId: string; generationId: string; requireWav?: boolean }) => { state.requireWav = Boolean(input.requireWav); if (state.storeFails) throw new Error("storage fixture failure"); return result(input.projectId, input.generationId); },
    merge: async (input: { projectId: string; generationId: string; format: string }) => { state.mergeFormat = input.format; if (state.mergeFails) throw new Error("merge fixture failure"); return result(input.projectId, input.generationId); }
  } });
  return { user, subject: { userId: user.id, mode: "ACCOUNT" as const, learnerId: null }, service, state, organizations };
}

test("整篇费用只预留一次；重复确认不创建子任务或重复冻结", async t => {
  const f = await fixture(t);
  const quote = await f.service.quote(f.subject, draft);
  assert.equal(quote.totalCredits, 7);
  await f.service.confirm(f.subject, quote.id);
  await f.service.confirm(f.subject, quote.id);
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } });
  assert.equal(wallet.availableCredits, 93); assert.equal(wallet.frozenCredits, 7);
  assert.equal(await db.audioTask.count({ where: { userId: f.user.id } }), 1);
  await f.service.processNext();
  const project = await f.service.get(f.subject, quote.projectId);
  assert.equal(project.status, "SUCCEEDED"); assert.equal(project.actualCredits, 7);
  assert.ok(project.audioUrl);
  assert.equal(f.state.mergeFormat, "wav", "merged outputs are always WAV masters");
  assert.equal(f.state.requireWav, true, "new sentence clips must be WAV masters");
  const settled = await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } });
  assert.equal(settled.frozenCredits, 0); assert.equal(settled.totalConsumedCredits, 7);
  const children = await db.audioTask.findMany({ where: { audioDialogueGenerationId: quote.id } });
  assert.equal(children.length, 2);
  assert.ok(children.every(task => task.estimatedCredits === 0 && task.actualCredits === 0));
  assert.ok(children.every(task => !isVoiceExperienceAudioTask({ type: task.type, providerPayload: task.providerPayload, englishGuidedStudyMaterialCount: 0, dialogueGenerationId: task.audioDialogueGenerationId })));
});

test("第二句失败释放其费用；重试只生成这一句", async t => {
  const f = await fixture(t); f.state.failedText = "Hi.";
  const quote = await f.service.quote(f.subject, draft);
  await f.service.confirm(f.subject, quote.id); await f.service.processNext();
  const project = await f.service.get(f.subject, quote.projectId);
  assert.equal(project.status, "PARTIAL_FAILED"); assert.equal(project.actualCredits, 2);
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } });
  assert.equal(wallet.availableCredits, 98); assert.equal(wallet.frozenCredits, 0);
  f.state.failedText = "";
  const retry = await f.service.quote(f.subject, { ...draft, projectId: project.id, revision: project.revision, segmentId: "s2" });
  assert.equal(retry.totalCredits, 5);
  await f.service.confirm(f.subject, retry.id); await f.service.processNext();
  assert.equal((await f.service.get(f.subject, project.id)).actualCredits, 7);
  assert.equal(await db.audioTask.count({ where: { audioDialogueGenerationId: retry.id } }), 1);
});

test("余额不足、过期报价、价格变化和越权确认均不执行供应商请求", async t => {
  const f = await fixture(t, 1);
  const quote = await f.service.quote(f.subject, draft);
  await assert.rejects(f.service.confirm(f.subject, quote.id), /余额不足/);
  assert.equal(await db.audioTask.count({ where: { userId: f.user.id } }), 0);
  const other = { userId: randomUUID(), mode: "ACCOUNT" as const, learnerId: null };
  await assert.rejects(f.service.get(other, quote.projectId), /不存在/);
  await assert.rejects(f.service.confirm(other, quote.id), /不存在/);
  f.state.priceVersion = "two";
  await assert.rejects(f.service.confirm(f.subject, quote.id), /重新/);
  f.state.priceVersion = "one";
  await db.audioDialogueGeneration.update({ where: { id: quote.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(f.service.confirm(f.subject, quote.id), /过期/);
});

test("合并失败及调整停顿仅免费重合并，不重复请求模型", async t => {
  const f = await fixture(t); f.state.mergeFails = true;
  const quote = await f.service.quote(f.subject, draft);
  await f.service.confirm(f.subject, quote.id); await f.service.processNext();
  assert.equal((await f.service.get(f.subject, quote.projectId)).actualCredits, 7);
  f.state.mergeFails = false;
  await f.service.remerge(f.subject, quote.projectId); await f.service.processNext();
  const project = await f.service.get(f.subject, quote.projectId);
  const pause = await f.service.quote(f.subject, { ...draft, projectId: project.id, revision: project.revision, segments: draft.segments.map(s => ({ ...s, pauseSeconds: 1.5 })) });
  assert.equal(pause.totalCredits, 0);
  await f.service.confirm(f.subject, pause.id); await f.service.processNext();
  assert.equal(await db.audioTask.count({ where: { userId: f.user.id, audioDialogueGenerationId: { not: null } } }), 2);
  assert.equal((await f.service.get(f.subject, project.id)).actualCredits, 7);
});

test("有缓存的 R2 保存重试不重新收费或调用模型", async t => {
  const f = await fixture(t); f.state.storeFails = true;
  const quote = await f.service.quote(f.subject, draft);
  await f.service.confirm(f.subject, quote.id); await f.service.processNext();
  const project = await f.service.get(f.subject, quote.projectId);
  assert.equal(project.actualCredits, 0);
  f.state.storeFails = false;
  const retry = await f.service.quote(f.subject, { ...draft, projectId: project.id, revision: project.revision, segmentId: "s1" });
  assert.equal(retry.totalCredits, 0);
  await f.service.confirm(f.subject, retry.id); await f.service.processNext();
  assert.equal(await db.audioTask.count({ where: { userId: f.user.id, audioDialogueGenerationId: { not: null } } }), 2);
});

test("升级前尚未保存的 MP3 缓存可以免费恢复，不冒充 WAV 母版", async t => {
  const f = await fixture(t);
  const quote = await f.service.quote(f.subject, draft);
  const project = await f.service.get(f.subject, quote.projectId);
  const fingerprint = dialogueFingerprint({ text: "Hello.", model: "system:alice", provider: "provider", voice: "system:alice", voiceAssetId: null, speed: 1, sampleRate: 24000, format: "mp3" });
  await db.audioTask.create({ data: { userId: f.user.id, type: "TTS", status: "FAILED", provider: "fixture", model: "fixture", estimatedCredits: 0,
    audioDialogueGenerationId: quote.id, providerPayload: { source: "EXPERIENCE", dialogueProjectId: project.id, dialogueSegmentId: "s1", dialogueFingerprint: fingerprint, dialogueResult: { audioBase64: "legacy" } } } });
  const retry = await f.service.quote(f.subject, { ...draft, projectId: project.id, revision: project.revision });
  assert.equal(retry.segments[0].credits, 0);
  await f.service.confirm(f.subject, retry.id); await f.service.processNext();
  assert.equal(await db.audioTask.count({ where: { userId: f.user.id, audioDialogueGenerationId: { not: null } } }), 2);
  const restored = await db.audioDialogueProject.findUniqueOrThrow({ where: { id: project.id } });
  assert.equal((restored.clips as Record<string, { fingerprint: string }>).s1.fingerprint, fingerprint);
});

test("重启后中断的供应商请求不会被盲目再次调用，未开始的句子继续执行", async t => {
  const f = await fixture(t);
  const quote = await f.service.quote(f.subject, draft);
  await f.service.confirm(f.subject, quote.id);
  const child = await db.audioTask.create({ data: { userId: f.user.id, type: "TTS", status: "PROCESSING", provider: "fixture", model: "fixture", estimatedCredits: 0, audioDialogueGenerationId: quote.id } });
  const generation = await db.audioDialogueGeneration.findUniqueOrThrow({ where: { id: quote.id } });
  const plans = generation.plans as unknown as Record<string, unknown>[];
  plans[0].status = "PROCESSING"; plans[0].audioTaskId = child.id;
  await db.audioDialogueGeneration.update({ where: { id: quote.id }, data: { status: "RUNNING", leaseOwner: "old-worker", leaseUntil: new Date(0), plans: plans as Prisma.InputJsonValue } });
  await f.service.processNext();
  const project = await f.service.get(f.subject, quote.projectId);
  assert.equal(project.actualCredits, 5);
  assert.equal(project.segments[0].status, "FAILED");
  assert.equal(await db.audioTask.count({ where: { audioDialogueGenerationId: quote.id } }), 2);
});

test("企业批次只预占一次，部分失败仅结算成功句，个人余额不变", async t => {
  const f = await fixture(t); f.state.failedText = "Hi.";
  Object.defineProperty(f.organizations, "isEnterpriseEnabled", { value: async () => true });
  const org = await db.organization.create({ data: { name: "多人配音测试企业", ownerUserId: f.user.id,
    wallet: { create: { balanceTotal: 100, balanceAvailable: 100 } }
  }, include: { wallet: true } });
  await db.organizationPointLot.create({ data: { orgId: org.id, walletId: org.wallet!.id, sourceType: "TEST", initialPoints: 100, remainingPoints: 100 } });
  const member = await db.organizationMember.upsert({ where: { orgId_userId: { orgId: org.id, userId: f.user.id } }, create: { orgId: org.id, userId: f.user.id, role: "OWNER" }, update: {} });
  await db.organizationMemberQuota.create({ data: { orgId: org.id, memberId: member.id, totalQuota: 100 } });
  const quote = await f.service.quote(f.subject, { ...draft, billingContext: "ORGANIZATION", organizationId: org.id });
  await f.service.confirm(f.subject, quote.id); await f.service.confirm(f.subject, quote.id);
  await f.service.processNext();
  const wallet = await db.organizationWallet.findUniqueOrThrow({ where: { orgId: org.id } });
  assert.equal(wallet.balanceAvailable, 98); assert.equal(wallet.balanceReserved, 0); assert.equal(wallet.totalConsumed, 2);
  assert.equal(await db.organizationWalletReservation.count({ where: { orgId: org.id } }), 1);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).availableCredits, 100);
});

test("不是企业成员不能借零费用报价指定他人企业空间", async t => {
  const f = await fixture(t);
  Object.defineProperty(f.organizations, "isEnterpriseEnabled", { value: async () => true });
  await assert.rejects(f.service.quote(f.subject, { ...draft, billingContext: "ORGANIZATION", organizationId: "foreign-org" }), /企业|权限/);
});
