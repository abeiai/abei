import { assertCreatorTestDatabase } from "./helpers/abei-test-environment.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { getPrismaClient, hashPassword, type Prisma } from "@xueleai/database";
import { AudioService } from "../src/audio/audio.service.js";
import { AudioDialogueService } from "../src/audio/audio-dialogue.service.js";
import { OrganizationsService } from "../src/organizations/organizations.service.js";
import { AppException } from "../src/common/app-exception.js";
import type { DialogueInput, DialoguePlan, PreparedDialogueTts } from "../src/audio/audio-dialogue.types.js";

assertCreatorTestDatabase();
const db = getPrismaClient();
after(async () => db.$disconnect());
const draft: DialogueInput = {
  speakers: [{ id: "a", name: "Student A", voiceValue: "system:alice" }, { id: "b", name: "Student B", voiceValue: "system:bob" }],
  segments: [{ id: "s1", speakerId: "a", text: "Hello.", speed: 1, pauseSeconds: 0.5 }, { id: "s2", speakerId: "b", text: "Hi.", speed: 1, pauseSeconds: 0.5 }],
  format: "mp3", sampleRate: 24000, billingContext: "PERSONAL"
};
type Generation = Prisma.AudioDialogueGenerationGetPayload<Prisma.AudioDialogueGenerationDefaultArgs>;
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("并发测试屏障超时")), 10_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function fixture(t: test.TestContext) {
  const user = await db.user.create({ data: { email: `dialogue-concurrency-${randomUUID()}@example.test`, nickname: "配音并发回归", passwordHash: await hashPassword(randomUUID()), wallet: { create: { availableCredits: 100 } } } });
  t.after(async () => {
    await db.audioDialogueProject.deleteMany({ where: { userId: user.id } });
    await db.audioTask.deleteMany({ where: { userId: user.id } });
    await db.audioAsset.deleteMany({ where: { userId: user.id } });
    await db.organization.deleteMany({ where: { ownerUserId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
  const audio = new AudioService();
  const state = {
    storeFails: false,
    supplierSegments: [] as string[],
    afterCandidate: null as ((generation: Generation) => Promise<void>) | null
  };
  Object.defineProperty(audio, "prepareDialogueTts", { value: async (_context: unknown, input: { voiceValue: string; speed: number }) => ({
    modelInstanceId: input.voiceValue, providerInstanceId: "fixture-provider", providerKey: "fixture", modelName: input.voiceValue,
    providerVoiceId: input.voiceValue, voiceAssetId: null, voiceName: input.voiceValue, billingCharacters: 6,
    credits: input.voiceValue === "system:alice" ? 2 : 5, speed: input.speed, pricingFingerprint: "fixture-price"
  } satisfies PreparedDialogueTts) });
  Object.defineProperty(audio, "executeDialogueTts", { value: async (_context: unknown, plan: DialoguePlan, input: { generationId: string; projectId: string; text: string }, onCreated: (id: string) => Promise<void>) => {
    const child = await db.audioTask.create({ data: {
      userId: user.id, type: "TTS", status: "PROCESSING", provider: "fixture", model: "fixture", inputText: input.text,
      inputTextLength: input.text.length, estimatedCredits: 0, audioDialogueGenerationId: input.generationId,
      providerPayload: { source: "EXPERIENCE", dialogueProjectId: input.projectId, dialogueSegmentId: plan.id, dialogueFingerprint: plan.fingerprint }
    } });
    await onCreated(child.id);
    state.supplierSegments.push(plan.id);
    const payload = { audioBase64: "fixture" };
    await db.audioTask.update({ where: { id: child.id }, data: { providerPayload: { ...(child.providerPayload as Prisma.InputJsonObject), dialogueResult: payload } } });
    return { taskId: child.id, payload, credits: plan.credits };
  } });
  const organizations = new OrganizationsService();
  Object.defineProperty(organizations, "isEnterpriseEnabled", { value: async () => true, configurable: true });
  const service = new AudioDialogueService(audio, organizations);
  Object.defineProperty(service, "lastCacheCleanup", { value: Date.now(), writable: true });
  // Only isolate worker selection and schedule a committed checkpoint; all writes/locks stay real.
  const delegate = new Proxy(db.audioDialogueGeneration, { get(original, key) {
    if (key === "findFirst") return async (args: Prisma.AudioDialogueGenerationFindFirstArgs = {}) => {
      const candidate = await original.findFirst({ ...args, where: { AND: [args.where ?? {}, { project: { userId: user.id } }] } });
      if (candidate && state.afterCandidate) {
        const checkpoint = state.afterCandidate;
        state.afterCandidate = null;
        await checkpoint(candidate);
      }
      return candidate;
    };
    const value = Reflect.get(original, key);
    return typeof value === "function" ? value.bind(original) : value;
  } });
  Object.defineProperty(service, "prisma", { value: new Proxy(db, { get(original, key) {
    if (key === "audioDialogueGeneration") return delegate;
    const value = Reflect.get(original, key);
    return typeof value === "function" ? value.bind(original) : value;
  } }) });
  const persisted = (input: { projectId: string; generationId: string; segmentId?: string }) => {
    const objectKey = `audio/dialogue/${user.id}/${input.projectId}/${input.generationId}/${input.segmentId ?? "complete"}.mp3`;
    return { url: `https://cdn.example.test/${objectKey}`, objectKey, mimeType: "audio/mpeg", sizeBytes: 100, durationMs: 2000, sampleRate: 24000, channels: 1 };
  };
  Object.defineProperty(service, "storage", { value: {
    persist: async (input: { projectId: string; generationId: string; segmentId: string }) => { if (state.storeFails) throw new Error("测试保存失败"); return persisted(input); },
    merge: async (input: { projectId: string; generationId: string }) => persisted(input)
  } });
  return { user, audio, service, organizations, state, subject: { userId: user.id, mode: "ACCOUNT" as const, learnerId: null } };
}

async function enterpriseBatch(f: Awaited<ReturnType<typeof fixture>>) {
  const org = await db.organization.create({ data: { name: "配音并发测试企业", ownerUserId: f.user.id, wallet: { create: { balanceTotal: 100, balanceAvailable: 100 } } }, include: { wallet: true } });
  await db.organizationPointLot.create({ data: { orgId: org.id, walletId: org.wallet!.id, sourceType: "TEST", initialPoints: 100, remainingPoints: 100 } });
  const member = await db.organizationMember.upsert({ where: { orgId_userId: { orgId: org.id, userId: f.user.id } }, create: { orgId: org.id, userId: f.user.id, role: "OWNER" }, update: {} });
  await db.organizationMemberQuota.create({ data: { orgId: org.id, memberId: member.id, totalQuota: 100 } });
  const input = { ...draft, billingContext: "ORGANIZATION" as const, organizationId: org.id };
  const quote = await f.service.quote(f.subject, input);
  let reservations = 0;
  const reserve = f.organizations.reserveEnterpriseUsage.bind(f.organizations);
  Object.defineProperty(f.organizations, "reserveEnterpriseUsage", { configurable: true, value: async (input: Parameters<OrganizationsService["reserveEnterpriseUsage"]>[0]) => { reservations++; return reserve(input); } });
  await f.service.confirm(f.subject, quote.id);
  const generation = await db.audioDialogueGeneration.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(generation.status, "RESERVING", "企业确认只持久化排队状态");
  assert.equal(reservations, 0, "HTTP 确认不得直接调用企业预留边界");
  assert.equal(generation.leaseOwner, null);
  assert.deepEqual(f.state.supplierSegments, []);
  return { org, generation };
}

test("R1 领取后读取最新检查点，不重放已经开始的分句供应商请求", async t => {
  const f = await fixture(t);
  const quote = await f.service.quote(f.subject, draft);
  await f.service.confirm(f.subject, quote.id);
  f.state.afterCandidate = async candidate => {
    const child = await db.audioTask.create({ data: { userId: f.user.id, type: "TTS", status: "PROCESSING", provider: "fixture", model: "fixture", estimatedCredits: 0, audioDialogueGenerationId: candidate.id } });
    const plans = candidate.plans as unknown as DialoguePlan[];
    const updated = plans.map((plan, index) => index === 0 ? { ...plan, status: "PROCESSING", audioTaskId: child.id } : plan);
    await db.audioDialogueGeneration.update({ where: { id: candidate.id }, data: { plans: asJson(updated) } });
  };
  await f.service.processNext();
  const project = await f.service.get(f.subject, quote.projectId);
  assert.deepEqual(f.state.supplierSegments, ["s2"], "已记录请求的 s1 不得再次进入供应商");
  assert.equal(project.status, "PARTIAL_FAILED");
  assert.equal(project.actualCredits, 5);
  assert.equal(await db.audioTask.count({ where: { audioDialogueGenerationId: quote.id } }), 2);
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } });
  assert.equal(wallet.frozenCredits, 0);
  assert.equal(wallet.totalConsumedCredits, 5);
});

test("R2 租约转移后的迟到企业预留回调不能覆盖成功项目和已结算账单", async t => {
  for (const outcome of ["SUCCESS", "REJECTION"] as const) {
    await t.test(outcome, async t => {
      const f = await fixture(t);
      const { org, generation } = await enterpriseBatch(f);
      const entered = deferred();
      const response = deferred();
      const reserve = f.organizations.reserveEnterpriseUsage.bind(f.organizations);
      let attempts = 0;
      Object.defineProperty(f.organizations, "reserveEnterpriseUsage", { configurable: true, value: async (input: Parameters<OrganizationsService["reserveEnterpriseUsage"]>[0]) => {
        if (++attempts === 1) {
          entered.resolve();
          await bounded(response.promise);
          if (outcome === "REJECTION") throw new AppException(40301, "企业账号体系未启用", 403);
        }
        return reserve(input);
      } });
      const oldWorker = f.service.processNext().then(() => null, error => error);
      try {
        await bounded(entered.promise);
        // Commit the reservation while its old caller is still waiting for the response.
        await reserve({ userId: f.user.id, orgId: org.id, points: 7, featureCode: "audio.tts", usageRequestId: `audio-dialogue:${generation.id}`, resourceType: "audio_dialogue", resourceId: generation.projectId });
        await db.audioDialogueGeneration.update({ where: { id: generation.id }, data: { leaseUntil: new Date(0) } });
        const replacement = new AudioDialogueService(f.audio, f.organizations);
        for (const key of ["prisma", "storage", "lastCacheCleanup"]) Object.defineProperty(replacement, key, Object.getOwnPropertyDescriptor(f.service, key)!);
        await replacement.processNext();
        const completed = await db.audioDialogueGeneration.findUniqueOrThrow({ where: { id: generation.id } });
        assert.equal(completed.status, "SUCCEEDED", "替代 worker 应在同一次领取中恢复、合成、结算");
        response.resolve();
        await bounded(oldWorker);
        const project = await db.audioDialogueProject.findUniqueOrThrow({ where: { id: generation.projectId } });
        const batch = await db.audioDialogueGeneration.findUniqueOrThrow({ where: { id: generation.id } });
        const billing = await db.audioTask.findUniqueOrThrow({ where: { id: generation.billingAudioTaskId! } });
        const wallet = await db.organizationWallet.findUniqueOrThrow({ where: { orgId: org.id } });
        assert.deepEqual({ project: project.status, batch: batch.status, billing: billing.status, credits: billing.actualCredits, consumed: wallet.totalConsumed, reserved: wallet.balanceReserved }, { project: "SUCCEEDED", batch: "SUCCEEDED", billing: "SUCCEEDED", credits: 7, consumed: 7, reserved: 0 });
        assert.deepEqual(f.state.supplierSegments, ["s1", "s2"]);
        assert.equal(await db.organizationWalletReservation.count({ where: { orgId: org.id } }), 1);
        assert.ok(project.outputAudioAssetId);
      } finally {
        response.resolve();
        await bounded(oldWorker);
      }
    });
  }
});

test("R3 已提交企业预留在功能关闭后仍可恢复并结算，不重新调用企业 gate", async t => {
  const f = await fixture(t);
  const { org, generation } = await enterpriseBatch(f);
  await f.organizations.reserveEnterpriseUsage({ userId: f.user.id, orgId: org.id, points: 7, featureCode: "audio.tts", usageRequestId: `audio-dialogue:${generation.id}`, resourceType: "audio_dialogue", resourceId: generation.projectId });
  Object.defineProperty(f.organizations, "isEnterpriseEnabled", { value: async () => false });
  const error = await f.service.processNext().then(() => null, error => error);
  const project = await db.audioDialogueProject.findUniqueOrThrow({ where: { id: generation.projectId } });
  const wallet = await db.organizationWallet.findUniqueOrThrow({ where: { orgId: org.id } });
  assert.deepEqual({ error: error instanceof Error ? error.message : error, status: project.status, reserved: wallet.balanceReserved, consumed: wallet.totalConsumed }, { error: null, status: "SUCCEEDED", reserved: 0, consumed: 7 });
  assert.equal(await db.organizationWalletReservation.count({ where: { orgId: org.id } }), 1);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).availableCredits, 100);
});

test("R4 相同正文和音色的两句免费保存重试各自使用缓存，整篇完成且不再请求供应商", async t => {
  const f = await fixture(t);
  const input: DialogueInput = { ...draft, speakers: [draft.speakers[0]], segments: draft.segments.map(segment => ({ ...segment, speakerId: "a", text: "Hello." })) };
  f.state.storeFails = true;
  const first = await f.service.quote(f.subject, input);
  assert.equal(first.totalCredits, 4);
  await f.service.confirm(f.subject, first.id);
  await f.service.processNext();
  const failed = await f.service.get(f.subject, first.projectId);
  assert.equal(failed.status, "PARTIAL_FAILED");
  assert.equal(failed.actualCredits, 0);
  f.state.storeFails = false;
  const retry = await f.service.quote(f.subject, { ...input, projectId: failed.id, revision: failed.revision });
  assert.equal(retry.totalCredits, 0);
  await f.service.confirm(f.subject, retry.id);
  await f.service.processNext();
  const project = await f.service.get(f.subject, first.projectId);
  assert.equal(project.status, "SUCCEEDED", "第一句保存不能消耗第二句需要读取的缓存");
  assert.deepEqual(project.segments.map(segment => segment.status), ["SUCCEEDED", "SUCCEEDED"]);
  assert.ok(project.segments.every(segment => segment.audioUrl));
  assert.deepEqual(f.state.supplierSegments, ["s1", "s2"]);
  assert.equal(await db.audioTask.count({ where: { userId: f.user.id, audioDialogueGenerationId: { not: null } } }), 2);
  const children = await db.audioTask.findMany({ where: { audioDialogueGenerationId: first.id } });
  assert.ok(children.every(child => child.status === "SUCCEEDED" && child.outputAudioAssetId));
  assert.equal(project.actualCredits, 0);
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } });
  assert.equal(wallet.availableCredits, 100);
  assert.equal(wallet.frozenCredits, 0);
  assert.equal(wallet.totalConsumedCredits, 0);
});

test("R5 未消费报价不遮蔽执行批次，修改当前内容不能冒充旧分句结果", async t => {
  const f = await fixture(t);
  const executed = await f.service.quote(f.subject, draft);
  const unconfirmed = await f.service.quote(f.subject, { ...draft, projectId: executed.projectId, revision: executed.revision, segmentId: "s1" });
  await db.audioDialogueGeneration.update({ where: { id: unconfirmed.id }, data: { createdAt: new Date(Date.now() + 1000) } });
  await f.service.confirm(f.subject, executed.id);
  await f.service.processNext();
  const project = await f.service.get(f.subject, executed.projectId);
  assert.equal(project.generationId, executed.id);
  assert.equal(project.status, "SUCCEEDED");
  assert.deepEqual(project.segments.map(segment => segment.status), ["SUCCEEDED", "SUCCEEDED"]);
  assert.ok(project.segments.every(segment => segment.audioUrl));
  assert.equal((await f.service.list(f.subject)).find(record => record.id === project.id)?.generationId, executed.id);
  const changed = await f.service.quote(f.subject, { ...draft, projectId: project.id, revision: project.revision, segments: [{ ...draft.segments[0], text: "Changed." }, draft.segments[1]] });
  const current = await f.service.get(f.subject, project.id);
  assert.equal(current.revision, changed.revision);
  assert.equal(current.generationId, executed.id);
  assert.equal(current.segments[0].status, "PENDING");
  assert.equal(current.segments[0].audioUrl, null);
  assert.equal(current.segments[1].audioUrl, project.segments[1].audioUrl);
  assert.equal(current.audioUrl, project.audioUrl, "新版本未保存前保留旧完整音频");
  assert.equal(current.outputRevision, project.revision);
  assert.notEqual(current.outputRevision, current.revision);
  assert.equal((await db.audioDialogueGeneration.findUniqueOrThrow({ where: { id: unconfirmed.id } })).status, "QUOTED");
});

test("R6 体验区查询在 LIMIT 前排除子任务、聚合账单、英语、视频和非体验来源", async t => {
  const f = await fixture(t);
  const other = await fixture(t);
  const quote = await f.service.quote(f.subject, draft);
  const base = { userId: f.user.id, type: "TTS" as const, provider: "fixture", model: "fixture", status: "SUCCEEDED" as const, estimatedCredits: 0, actualCredits: 0 };
  const single = await db.audioTask.create({ data: { ...base, inputText: "单人体验历史", providerPayload: { source: "EXPERIENCE" }, createdAt: new Date(0) } });
  const aggregate = await db.audioTask.create({ data: { ...base, providerPayload: { source: "EXPERIENCE" } } });
  await db.audioDialogueGeneration.update({ where: { id: quote.id }, data: { billingAudioTaskId: aggregate.id } });
  await db.audioTask.createMany({ data: Array.from({ length: 55 }, () => ({ ...base, audioDialogueGenerationId: quote.id, providerPayload: { source: "EXPERIENCE" } })) });
  await db.audioTask.createMany({ data: [
    { ...base, providerPayload: { source: "OTHER" } },
    { ...base, providerPayload: { source: "EXPERIENCE", videoGuidePersistence: {} } },
    { ...base, providerPayload: { source: "EXPERIENCE", dialogueProjectId: quote.projectId } },
    { ...base, type: "VOICE_CLONE", providerPayload: { source: "EXPERIENCE" } },
    { ...base, userId: other.user.id, providerPayload: { source: "EXPERIENCE" } }
  ] });
  const english = await db.audioTask.create({ data: { ...base, providerPayload: { source: "EXPERIENCE" } } });
  await db.englishGuidedStudyMaterial.create({ data: { userId: f.user.id, title: "英语历史隔离测试", sourceType: "TEXT", sourceText: "Hello", levelStandardName: "测试", levelOptionLabel: "测试", aiLevel: "测试", summary: "测试", narration: "Hello", audioDurationSeconds: 1, content: {}, audioTaskId: english.id } });
  const history = await f.audio.listVoiceExperienceTasks(f.subject);
  assert.deepEqual(history.map(task => task.id), [single.id], "被剔除的新任务不能挤掉较早的单人体验记录");
  assert.equal(history[0].isVoiceExperience, true);
  const ordinary = await f.audio.listUserTasks(f.subject);
  assert.equal(ordinary.length, 50, "通用任务历史接口保持原有语义");
  assert.ok(ordinary.some(task => task.id !== single.id));
  assert.ok(ordinary.every(task => "userId" in task && task.userId === f.user.id));
});
