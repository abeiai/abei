import assert from "node:assert/strict";
import test from "node:test";

import { AudioController } from "../src/audio/audio.controller.js";
import { AudioService } from "../src/audio/audio.service.js";
import { AppException } from "../src/common/app-exception.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";

const request = { marker: "learner-audio-request" };
const learnerSubject: ProfileSubject = { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" };

const privateAudioAsset = {
  id: "sample-main-account",
  userId: "user-1",
  type: "SOURCE_SAMPLE",
  storageProvider: "S3",
  url: "https://private.example/source.wav",
  objectKey: "private/source.wav",
  mimeType: "audio/wav",
  durationMs: 12_000,
  sizeBytes: 42_000,
  sampleRate: 24_000,
  channels: 1,
  createdAt: new Date("2026-08-14T00:00:00Z")
};

const privateConsent = {
  id: "consent-1",
  userId: "user-1",
  voiceAssetId: "voice-ready",
  sourceAudioAssetId: privateAudioAsset.id,
  consentText: "私密授权原文",
  consentType: "AUTHORIZED_VOICE",
  ownerName: "真实姓名",
  ownerContact: "13800000000",
  agreedAt: new Date("2026-08-14T00:00:00Z"),
  statement: "私密授权原文",
  ip: "203.0.113.8",
  userAgent: "private-browser",
  createdAt: new Date("2026-08-14T00:00:00Z")
};

function voice(id: string, status: string, isPlatform = false) {
  return {
    id,
    userId: isPlatform ? "platform-user" : "user-1",
    provider: "aliyun",
    providerVoiceId: `${id}-provider`,
    name: `音色 ${id}`,
    type: isPlatform ? "PLATFORM" : "CLONED",
    targetModel: "cosyvoice-v2",
    status,
    visibility: "PRIVATE",
    language: "zh-CN",
    description: "可执行音色",
    previewAudioUrl: "https://public.example/preview.wav",
    sourceAudioAsset: privateAudioAsset,
    previewAudioAsset: privateAudioAsset,
    consent: privateConsent,
    targetConsent: null,
    reviewNote: "内部审核意见",
    disabledReason: "内部停用原因",
    reviewedAt: new Date("2026-08-14T00:00:00Z"),
    deletedAt: null,
    isPlatform,
    createdAt: new Date("2026-08-14T00:00:00Z"),
    updatedAt: new Date("2026-08-14T00:00:00Z")
  };
}

function fullTask() {
  return {
    id: "audio-task-1",
    isVoiceExperience: true,
    userId: "user-1",
    user: { id: "user-1", email: "private@example.com", nickname: "主账号" },
    billingContext: "PERSONAL",
    organizationId: null,
    organizationMemberId: null,
    type: "TTS",
    typeName: "语音合成",
    status: "SUCCEEDED",
    statusName: "已完成",
    provider: "aliyun",
    model: "cosyvoice-v2",
    providerInstanceId: "provider-instance-private",
    modelInstanceId: "model-instance-1",
    voiceAssetId: "voice-ready",
    inputText: "学习者自己的输入",
    inputTextLength: 8,
    sourceAudioAssetId: null,
    outputAudioAssetId: "output-1",
    estimatedCredits: 20,
    actualCredits: 18,
    errorCode: null,
    errorMessage: null,
    requestId: "provider-request-private",
    providerPayload: { apiKeyPreview: "secret", raw: "private" },
    createdAt: new Date("2026-08-14T00:00:00Z"),
    updatedAt: new Date("2026-08-14T00:01:00Z"),
    finishedAt: new Date("2026-08-14T00:01:00Z"),
    voiceAsset: { id: "voice-ready", name: "可用音色", providerVoiceId: "provider-voice", targetModel: "cosyvoice-v2", status: "READY", visibility: "PRIVATE", consent: privateConsent },
    voiceConsent: privateConsent,
    sourceAudioAsset: privateAudioAsset,
    outputAudioAsset: { ...privateAudioAsset, id: "output-1", type: "TTS_OUTPUT", url: "https://public.example/output.wav" },
    reservation: { id: "reservation-private", amount: 20, status: "SETTLED", statusName: "已结算", expiresAt: new Date("2026-08-14T01:00:00Z") },
    ledgerEntries: [{ id: "ledger-private", amount: -18, balanceAfter: 982 }],
    usageLogs: [{ id: "usage-private", providerRequestId: "provider-request-private" }]
  };
}

function assertNoPrivateAudioFields(value: Record<string, unknown>) {
  for (const key of [
    "userId", "user", "organizationId", "organizationMemberId", "providerInstanceId",
    "providerPayload", "requestId", "reservation", "ledgerEntries", "usageLogs", "voiceConsent",
    "sourceAudioAsset", "reviewNote", "disabledReason", "reviewedAt", "deletedAt", "objectKey"
  ]) {
    assert.equal(key in value, false, `学习者响应不得包含 ${key}`);
  }
}

test("学习者音色列表只查询 READY 可执行音色并返回无资产、授权和审核信息的投影", async () => {
  const service = new AudioService();
  const queries: Array<Record<string, unknown>> = [];
  Object.defineProperty(service, "prisma", {
    value: {
      voiceAsset: {
        findMany: async (query: Record<string, unknown>) => {
          queries.push(query);
          const where = query.where as { isPlatform: boolean };
          return where.isPlatform ? [voice("voice-platform", "READY", true)] : [voice("voice-ready", "READY"), voice("voice-creating", "CREATING")];
        }
      },
      userAudioPreference: { findUnique: async () => ({ defaultVoiceAssetId: "voice-hidden", defaultSystemVoiceId: "system-hidden" }) },
      systemConfig: { findUnique: async () => null }
    }
  });
  const method = (service as unknown as { listLearnerVoiceAssets?: (userId: string) => Promise<Record<string, unknown>> }).listLearnerVoiceAssets;
  assert.equal(typeof method, "function", "AudioService 必须提供学习者专用音色查询");

  const result = await method!.call(service, "user-1") as {
    customVoices: Array<Record<string, unknown>>;
    platformVoices: Array<Record<string, unknown>>;
    systemVoices: Array<Record<string, unknown>>;
    defaultVoice: { voiceAssetId: string | null; systemVoiceId: string | null };
  };

  assert.deepEqual(result.customVoices.map((item) => item.id), ["voice-ready"]);
  assert.deepEqual(result.platformVoices.map((item) => item.id), ["voice-platform"]);
  assert.equal(result.platformVoices[0]?.visibility, "PUBLIC");
  assert.equal("visibility" in result.customVoices[0]!, false);
  assert.deepEqual(result.defaultVoice, { voiceAssetId: null, systemVoiceId: null });
  assert.ok(result.systemVoices.every((item) => item.status === "READY"));
  const learnerSystemVoiceKeys = new Set([
    "id", "providerVoiceId", "name", "type", "typeName", "targetModel", "supportedModels",
    "status", "statusName", "language", "languages", "description", "trait", "scene", "age",
    "accent", "gender", "ageCategory", "avatarUrl", "ssmlSupported", "instructSupported", "timestampSupported",
    "previewAudioUrl", "isDefault"
  ]);
  result.systemVoices.forEach((item) => {
    Object.keys(item).forEach((key) => assert.equal(learnerSystemVoiceKeys.has(key), true, `系统音色不得透传 ${key}`));
    assertNoPrivateAudioFields(item);
  });
  [...result.customVoices, ...result.platformVoices].forEach(assertNoPrivateAudioFields);
  assert.equal(queries.length, 2);
  for (const query of queries) {
    const where = query.where as { isPlatform?: boolean; status?: string; providerVoiceId?: unknown; visibility?: string };
    assert.equal(where.status, "READY");
    assert.deepEqual(where.providerVoiceId, { not: null });
    if (where.isPlatform) assert.equal(where.visibility, "PUBLIC");
    assert.equal("include" in query, false);
  }
});

test("学习者 TTS、复刻和设计创建响应仅保留执行字段", async () => {
  const service = new AudioService();
  const task = fullTask();
  const fullVoice = voice("voice-created", "READY");
  Object.assign(service as unknown as Record<string, unknown>, {
    createTtsTask: async () => task,
    createVoiceCloneTask: async () => fullVoice,
    createVoiceDesignTask: async () => fullVoice
  });
  const capability = { assertLearnerSample: () => undefined };
  const controller = new AudioController(
    service,
    { me: async () => ({ id: "user-1" }) } as never,
    { requireSelected: async () => learnerSubject } as never,
    {
      assertScenarioAuthorized: async (_subject: ProfileSubject, slug: string) => ({ slug, requiredCapabilities: ["AUDIO", "TTS"] }),
      runWithScenarioAuthorization: async (_subject: ProfileSubject, _root: string, callback: () => Promise<unknown>) => callback()
    } as never,
    capability as never
  );

  const tts = (await controller.createTtsTask(request, { text: "测试", scenarioId: "article-to-speech" } as never)).data as Record<string, unknown>;
  const clone = (await controller.createVoiceCloneTask(request, { sourceAudioAssetId: "sample-1", learnerSampleProof: "valid-proof" } as never)).data as Record<string, unknown>;
  const design = (await controller.createVoiceDesignTask(request, { prompt: "温和", name: "温和音色" } as never)).data as Record<string, unknown>;

  assert.deepEqual(Object.keys(tts).sort(), ["errorCode", "errorMessage", "finishedAt", "id", "inputText", "isVoiceExperience", "model", "outputAudioAsset", "status", "statusName", "type", "typeName", "updatedAt", "voiceAssetId"].sort());
  assert.equal(tts.isVoiceExperience, true);
  assert.deepEqual(tts.outputAudioAsset, { id: "output-1", url: "https://public.example/output.wav", mimeType: "audio/wav", durationMs: 12_000, sizeBytes: 42_000 });
  assertNoPrivateAudioFields(tts);
  for (const projected of [clone, design]) {
    assert.deepEqual(Object.keys(projected).sort(), ["accent", "ageCategory", "avatarUrl", "description", "gender", "id", "isPlatform", "language", "name", "previewAudioUrl", "providerVoiceId", "status", "statusName", "targetModel", "type", "typeName"].sort());
    assertNoPrivateAudioFields(projected);
  }
});

test("学习者 TTS 在模型解析和计费副作用前拒绝隐藏系统音色与私有平台音色", async () => {
  const service = new AudioService();
  let sideEffects = 0;
  Object.assign(service as unknown as Record<string, unknown>, {
    ensureDashScopeAudioDefaults: async () => { sideEffects += 1; },
    getModelByAlias: async () => { sideEffects += 1; throw new Error("不应解析模型"); }
  });
  Object.defineProperty(service, "prisma", {
    value: {
      voiceAsset: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          where.id === "private-platform"
            && !Array.isArray(where.OR)
            && where.visibility !== "PUBLIC"
            ? voice("private-platform", "READY", true)
            : null,
        findUnique: async () => { sideEffects += 1; return voice("private-platform", "READY", true); }
      },
      systemConfig: { findUnique: async () => null }
    }
  });

  for (const dto of [
    { text: "测试", voice: "hidden-provider-voice" },
    { text: "测试", voiceAssetId: "private-platform" }
  ]) {
    await assert.rejects(
      service.createTtsTask({
        userId: "user-1",
        learnerId: "learner-1",
        rootScenarioId: "article-to-speech"
      }, dto as never),
      (error: unknown) => error instanceof AppException
    );
    assert.equal(sideEffects, 0, "学习者非法音色不得进入默认配置、模型解析或计费链路");
  }

  await assert.rejects(
    service.synthesizeTtsForExternalBilling(
      {
        userId: "user-1",
        learnerId: "learner-1",
        rootScenarioId: "article-to-speech"
      },
      { text: "后台测试", voice: "hidden-provider-voice", source: "EXPERIENCE" }
    ),
    (error: unknown) => error instanceof AppException
  );
  assert.equal(sideEffects, 0, "学习者后台 TTS 同样不得绕过可用音色边界");
});

test("学习者声音样本能力绑定用户、学习者、资产、根和有效期并拒绝伪造", async () => {
  const module = await import("../src/audio/learner-audio-capability.js").catch(() => ({})) as Record<string, unknown>;
  const Capability = module.LearnerAudioCapabilityService as undefined | (new (secret: string) => {
    issueLearnerSample(subject: ProfileSubject, assetId: string, root: string, now?: Date): string;
    assertLearnerSample(proof: string, subject: ProfileSubject, assetId: string, root: string, now?: Date): void;
  });
  assert.equal(typeof Capability, "function", "必须实现学习者声音样本短期签名能力");
  const service = new Capability!("learner-audio-test-secret");
  const now = new Date("2026-08-14T00:00:00Z");
  const proof = service.issueLearnerSample(learnerSubject, "sample-1", "my-voice-clone", now);

  service.assertLearnerSample(proof, learnerSubject, "sample-1", "my-voice-clone", new Date("2026-08-14T00:04:59Z"));
  for (const action of [
    () => service.assertLearnerSample(`${proof}forged`, learnerSubject, "sample-1", "my-voice-clone", now),
    () => service.assertLearnerSample(proof, { ...learnerSubject, learnerId: "learner-2" }, "sample-1", "my-voice-clone", now),
    () => service.assertLearnerSample(proof, learnerSubject, "sample-main-account", "my-voice-clone", now),
    () => service.assertLearnerSample(proof, learnerSubject, "sample-1", "brand-voice-design", now),
    () => service.assertLearnerSample(proof, learnerSubject, "sample-1", "my-voice-clone", new Date("2026-08-14T00:05:00Z"))
  ]) {
    assert.throws(action, (error: unknown) => error instanceof AppException && error.message === "声音样本授权已失效，请重新上传");
  }
});

test("学习者复刻必须使用本身份检查上传返回的证明且失败时不调用 service mutation", async () => {
  const module = await import("../src/audio/learner-audio-capability.js").catch(() => ({})) as Record<string, unknown>;
  const Capability = module.LearnerAudioCapabilityService as undefined | (new (secret: string) => {
    issueLearnerSample(subject: ProfileSubject, assetId: string, root: string, now?: Date): string;
    assertLearnerSample(proof: string, subject: ProfileSubject, assetId: string, root: string, now?: Date): void;
  });
  assert.equal(typeof Capability, "function", "必须实现学习者声音样本短期签名能力");
  const capability = new Capability!("learner-audio-controller-secret");
  let mutations = 0;
  const audio = new AudioService();
  Object.assign(audio as unknown as Record<string, unknown>, {
    uploadAudioAsset: async () => privateAudioAsset,
    createVoiceCloneTask: async () => { mutations += 1; return voice("voice-created", "READY"); }
  });
  const controller = new AudioController(
    audio,
    { me: async () => ({ id: "user-1" }) } as never,
    { requireSelected: async () => learnerSubject } as never,
    {
      assertScenarioAuthorized: async () => ({ slug: "my-voice-clone" }),
      runWithScenarioAuthorization: async (_subject: ProfileSubject, _root: string, callback: () => Promise<unknown>) => callback()
    } as never,
    capability as never
  );

  const upload = (await controller.uploadAsset(request, "SOURCE_SAMPLE", {} as never)).data as Record<string, unknown>;
  assert.equal(upload.id, "sample-main-account");
  assert.equal(typeof upload.learnerSampleProof, "string");
  assert.equal("url" in upload, false);
  assert.equal("objectKey" in upload, false);

  for (const dto of [
    { sourceAudioAssetId: "sample-main-account" },
    { sourceAudioAssetId: "sample-main-account", learnerSampleProof: "forged" },
    { sourceAudioAssetId: "sample-other", learnerSampleProof: upload.learnerSampleProof }
  ]) {
    await assert.rejects(
      controller.createVoiceCloneTask(request, dto as never),
      (error: unknown) => error instanceof AppException && error.message === "声音样本授权已失效，请重新上传"
    );
  }
  assert.equal(mutations, 0);

  await controller.createVoiceCloneTask(request, {
    sourceAudioAssetId: "sample-main-account",
    learnerSampleProof: upload.learnerSampleProof
  } as never);
  assert.equal(mutations, 1);
});
