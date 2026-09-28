import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EnglishGuidedStudyService,
  englishGuidedStudyReadAlongAsrMaxPollAttempts,
  englishGuidedStudyReadAlongAsrMaxSubmissionAttempts
} from "../src/english-guided-study/english-guided-study.service.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};
const accountSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null } as const;
const learnerSubject = { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" } as const;

test("英文带学文稿确认后只提交后台任务而不在请求内调用模型", async () => {
  const harness = createAsyncHarness();
  let aiCalls = 0;
  const service = new EnglishGuidedStudyService(
    {} as never,
    {
      generateScenarioTextForExternalBilling: async () => {
        aiCalls += 1;
        throw new Error("提交阶段不应调用模型");
      }
    } as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });
  const input = {
    title: "Hello",
    sourceType: "TEXT" as const,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  const queued = await service.submitMaterialGeneration(learnerSubject, {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = queued.content as {
    contentGenerationJob?: {
      input: Record<string, unknown>;
      operation: string;
    };
    contentGenerationProgress?: { canLeave: boolean; status: string };
  };

  assert.equal(aiCalls, 0);
  assert.equal(content.contentGenerationJob?.operation, "CONTENT");
  assert.equal(
    Object.values(content.contentGenerationJob?.input ?? {}).some((value) => value === undefined),
    false
  );
  assert.equal(content.contentGenerationProgress?.status, "QUEUED");
  assert.equal(content.contentGenerationProgress?.canLeave, true);
  assert.equal(harness.records.get(queued.id)?.learnerId, "learner-1");
  assert.ok(harness.wallet.frozenCredits > 0);
});

test("重新生成排队后返回本次选择的英语等级而不是旧材料等级", async () => {
  const material = {
    ...createReadyMaterial(),
    levelOptionLabel: "初一",
    aiLevel: "E3",
    content: {
      ...createReadyMaterial().content,
      level: {
        standardName: "基于所在学段年级",
        optionLabel: "初一",
        aiLevel: "E3"
      }
    }
  };
  const harness = createAsyncHarness(material);
  const service = createSubmissionService(harness);
  const input = {
    materialId: material.id,
    title: "新的内容标题",
    sourceType: "TEXT" as const,
    sourceText: material.sourceText,
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "高三高考",
    aiLevel: "E6",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  const queued = await service.submitMaterialGeneration(accountSubject, {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = queued.content as {
    contentTitle?: string | null;
    level?: {
      standardName?: string;
      optionLabel?: string;
      aiLevel?: string;
    };
  };

  assert.equal(queued.title, "新的内容标题");
  assert.equal(content.contentTitle, "新的内容标题");
  assert.equal(queued.levelOptionLabel, "高三高考");
  assert.equal(queued.aiLevel, "E6");
  assert.equal(content.level?.optionLabel, "高三高考");
  assert.equal(content.level?.aiLevel, "E6");
});

test("英文带学语音确认后只提交后台任务而不在请求内调用 TTS", async () => {
  const material = createReadyMaterial();
  const harness = createAsyncHarness(material);
  let ttsCalls = 0;
  const service = new EnglishGuidedStudyService(
    {
      synthesizeTtsForExternalBilling: async () => {
        ttsCalls += 1;
        throw new Error("提交阶段不应调用 TTS");
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });
  const settings = {
    voice: "longanyang",
    speed: 1
  };
  const estimate = await service.estimateMaterialAudioGeneration(accountSubject, material.id, settings);
  const queued = await service.submitMaterialAudioGeneration(accountSubject, material.id, {
    ...settings,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = queued.content as {
    audioGenerationJob?: {
      input: Record<string, unknown>;
      operation: string;
    };
    audioGenerationProgress?: { canLeave: boolean; status: string };
  };

  assert.equal(ttsCalls, 0);
  assert.equal(content.audioGenerationJob?.operation, "AUDIO");
  assert.equal(
    Object.values(content.audioGenerationJob?.input ?? {}).some((value) => value === undefined),
    false
  );
  assert.equal(content.audioGenerationProgress?.status, "QUEUED");
  assert.equal(content.audioGenerationProgress?.canLeave, true);
  assert.ok(harness.wallet.frozenCredits > 0);
});

test("英文带学练习作为独立后台任务提交且不重复冻结点数", async () => {
  const material = createReadyMaterial();
  const harness = createAsyncHarness(material);
  let aiCalls = 0;
  const service = new EnglishGuidedStudyService(
    {} as never,
    {
      generateScenarioTextForExternalBilling: async () => {
        aiCalls += 1;
        throw new Error("提交阶段不应调用模型");
      }
    } as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });

  const queued = await service.submitMaterialPracticeGeneration(accountSubject, material.id, {});
  const content = queued.content as {
    practiceGenerationJob?: {
      input: Record<string, unknown>;
      operation: string;
    };
    practiceGenerationProgress?: { canLeave: boolean; status: string };
  };

  assert.equal(aiCalls, 0);
  assert.equal(content.practiceGenerationJob?.operation, "PRACTICE");
  assert.deepEqual(content.practiceGenerationJob?.input, {});
  assert.equal(content.practiceGenerationProgress?.status, "QUEUED");
  assert.equal(content.practiceGenerationProgress?.canLeave, true);
  assert.equal(harness.wallet.frozenCredits, 0);
});

test("英文跟读音频确认后只提交后台任务而不在请求内调用 TTS", async () => {
  const material = createReadyMaterial();
  const harness = createAsyncHarness(material);
  let ttsCalls = 0;
  const service = new EnglishGuidedStudyService(
    {
      synthesizeTtsForExternalBilling: async () => {
        ttsCalls += 1;
        throw new Error("提交阶段不应调用 TTS");
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });
  const settings = {
    voice: "longanyang",
    speed: 1
  };
  const estimate = await service.estimateMaterialReadAlongGeneration(
    accountSubject,
    material.id,
    settings
  );
  const queued = await service.submitMaterialReadAlongGeneration(accountSubject, material.id, {
    ...settings,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = queued.content as {
    readAlongGenerationJob?: {
      estimatedCredits: number;
      input: { mode: string };
      operation: string;
    };
    readAlongGenerationProgress?: { canLeave: boolean; status: string };
  };

  assert.equal(ttsCalls, 0);
  assert.equal(content.readAlongGenerationJob?.operation, "READ_ALOUD");
  assert.equal(content.readAlongGenerationJob?.input.mode, "GENERATE");
  assert.equal(content.readAlongGenerationProgress?.status, "QUEUED");
  assert.equal(content.readAlongGenerationProgress?.canLeave, true);
  assert.ok(harness.wallet.frozenCredits > 0);
});

test("上传跟读音频确认后按服务端时长冻结点数且不在请求内调用 ASR", async () => {
  const material = createReadyMaterial();
  const harness = createAsyncHarness(material);
  let asrCalls = 0;
  const service = new EnglishGuidedStudyService(
    {
      uploadAudioAssetForTranscription: async (_userId: string, _type: string, _file: unknown, maxBytes: number) => {
        assert.equal(maxBytes, 30 * 1024 * 1024);
        return {
        id: "uploaded-audio-1",
        url: "https://example.com/uploaded.mp3",
        mimeType: "audio/mpeg",
        durationMs: 60_001,
        sizeBytes: 1024
        };
      },
      generateSrtFromMediaUrl: async () => {
        asrCalls += 1;
        throw new Error("提交阶段不应调用 ASR");
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });

  const file = {
    originalname: "teacher-reading.mp3",
    mimetype: "audio/mpeg",
    size: 1024,
    buffer: Buffer.from("audio")
  };
  const estimate = await service.estimateMaterialReadAlongUpload(accountSubject, material.id, {
    audioDurationMs: 60_001,
    audioMimeType: file.mimetype,
    audioName: file.originalname,
    audioSizeBytes: file.size
  });
  const queued = await service.submitMaterialReadAlongUpload(accountSubject, material.id, file, {
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = queued.content as {
    readAlongGenerationJob?: {
      estimatedCredits: number;
      input: { mode: string };
      operation: string;
    };
    readAlongGenerationProgress?: { status: string };
  };

  assert.equal(asrCalls, 0);
  assert.equal(content.readAlongGenerationJob?.operation, "READ_ALOUD");
  assert.equal(content.readAlongGenerationJob?.input.mode, "UPLOAD");
  assert.equal(content.readAlongGenerationJob?.estimatedCredits, 4);
  assert.equal(content.readAlongGenerationProgress?.status, "QUEUED");
  assert.deepEqual(harness.wallet, {
    availableCredits: 9_996,
    frozenCredits: 4,
    totalConsumedCredits: 0
  });
  assert.equal(harness.entries.size, 1);
});

test("同一计费分钟内中文文件名经 multipart 解码变化不会使上传确认失效", async () => {
  const material = createReadyMaterial();
  const harness = createAsyncHarness(material);
  const deletedAssetIds: string[] = [];
  const service = new EnglishGuidedStudyService(
    {
      uploadAudioAssetForTranscription: async () => ({
        id: "uploaded-audio-unicode-name",
        url: "https://example.com/uploaded.mp3",
        mimeType: "audio/mpeg",
        durationMs: 45_000,
        sizeBytes: 1024
      }),
      deleteAudioAsset: async (_userId: string, assetId: string) => {
        deletedAssetIds.push(assetId);
        return {};
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });
  const browserFilename = "跟读训练.mp3";
  const multipartFilename = Buffer.from(browserFilename, "utf8").toString("latin1");
  const file = {
    originalname: multipartFilename,
    mimetype: "audio/mpeg",
    size: 1024,
    buffer: Buffer.from("audio")
  };
  const estimate = await service.estimateMaterialReadAlongUpload(accountSubject, material.id, {
    audioDurationMs: 45_000,
    audioMimeType: file.mimetype,
    audioName: browserFilename,
    audioSizeBytes: file.size
  });

  const queued = await service.submitMaterialReadAlongUpload(accountSubject, material.id, file, {
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = queued.content as {
    readAlongGenerationJob?: { estimatedCredits: number; input: { mode: string } };
  };

  assert.equal(content.readAlongGenerationJob?.input.mode, "UPLOAD");
  assert.equal(content.readAlongGenerationJob?.estimatedCredits, 2);
  assert.deepEqual(deletedAssetIds, []);
  assert.deepEqual(harness.wallet, {
    availableCredits: 9_998,
    frozenCredits: 2,
    totalConsumedCredits: 0
  });
});

test("上传音频服务端计费分钟变化时拒绝旧确认并清理新资产", async () => {
  const material = createReadyMaterial();
  const harness = createAsyncHarness(material);
  const deletedAssetIds: string[] = [];
  const service = new EnglishGuidedStudyService(
    {
      uploadAudioAssetForTranscription: async () => ({
        id: "uploaded-audio-minute-changed",
        url: "https://example.com/uploaded.mp3",
        mimeType: "audio/mpeg",
        durationMs: 60_001,
        sizeBytes: 1024
      }),
      deleteAudioAsset: async (_userId: string, assetId: string) => {
        deletedAssetIds.push(assetId);
        return {};
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });
  const file = {
    originalname: "teacher-reading.mp3",
    mimetype: "audio/mpeg",
    size: 1024,
    buffer: Buffer.from("audio")
  };
  const estimate = await service.estimateMaterialReadAlongUpload(accountSubject, material.id, {
    audioDurationMs: 60_000,
    audioMimeType: file.mimetype,
    audioName: file.originalname,
    audioSizeBytes: file.size
  });

  await assert.rejects(
    service.submitMaterialReadAlongUpload(accountSubject, material.id, file, {
      billingConfirmed: true,
      billingRequestId: estimate.requestId,
      billingRevision: estimate.revision
    }),
    /音频实际时长对应消耗 4 点，请重新确认/u
  );
  assert.deepEqual(deletedAssetIds, ["uploaded-audio-minute-changed"]);
  assert.deepEqual(harness.wallet, {
    availableCredits: 10_000,
    frozenCredits: 0,
    totalConsumedCredits: 0
  });
  assert.equal(harness.entries.size, 0);
});

test("上传跟读音频识别仍在处理中时保存任务编号并重新排队", async () => {
  const material = createReadyMaterial();
  const job = createRunningUploadReadAlongJob();
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = runningReadAlongProgress();
  const harness = createAsyncHarness(material);
  const deletedAssetIds: string[] = [];
  const scheduled: Array<{ delayMs: number; operation: string }> = [];
  let synchronousAsrCalls = 0;
  let submitCalls = 0;
  let queryCalls = 0;
  const service = new EnglishGuidedStudyService(
    {
      generateSrtFromMediaUrl: async () => {
        synchronousAsrCalls += 1;
        throw new Error("不应再调用同步 ASR");
      },
      submitSrtGenerationTask: async () => {
        submitCalls += 1;
        return {
          providerTaskId: "provider-task-1",
          providerStatus: "PENDING",
          status: "PENDING",
          modelInstanceId: "model-instance-1",
          providerInstanceId: "provider-instance-1",
          modelName: "qwen3-asr-flash",
          providerName: "阿里云百炼",
          requestId: "submit-request-1"
        };
      },
      querySrtGenerationTask: async () => {
        queryCalls += 1;
        return {
          providerTaskId: "provider-task-1",
          providerStatus: "RUNNING",
          status: "PENDING",
          modelName: "qwen3-asr-flash",
          providerName: "阿里云百炼",
          requestId: "query-request-1",
          subtitleText: null,
          wordTimeline: []
        };
      },
      deleteAudioAsset: async (_userId: string, assetId: string) => {
        deletedAssetIds.push(assetId);
        return {};
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: (
      _materialId: string,
      operation: string,
      delayMs = 0
    ) => scheduled.push({ delayMs, operation })
  });

  await service.generateMaterialReadAlong(
    "user-1",
    material.id,
    job.input,
    { operationJob: job }
  );

  const content = harness.records.get(material.id)?.content as {
    readAlongGenerationJob: {
      attemptId: string | null;
      input: { asrCheckpoint?: { providerTaskId?: string; pollAttempts?: number } };
    };
    readAlongGenerationProgress: { message: string; status: string };
  };
  assert.equal(synchronousAsrCalls, 0);
  assert.equal(submitCalls, 1);
  assert.equal(queryCalls, 1);
  assert.equal(content.readAlongGenerationJob.input.asrCheckpoint?.providerTaskId, "provider-task-1");
  assert.equal(content.readAlongGenerationJob.input.asrCheckpoint?.pollAttempts, 1);
  assert.equal(content.readAlongGenerationJob.attemptId, null);
  assert.equal(content.readAlongGenerationProgress.status, "QUEUED");
  assert.match(content.readAlongGenerationProgress.message, /无需重新上传/u);
  assert.deepEqual(deletedAssetIds, []);
  assert.deepEqual(scheduled, [{ delayMs: 10_000, operation: "READ_ALOUD" }]);
});

test("上传跟读音频恢复时复用超过十分钟的识别任务并完成时间轴", async () => {
  const material = createReadyMaterial();
  const job = createRunningUploadReadAlongJob({
    asrCheckpoint: {
      version: 1,
      providerTaskId: "provider-task-existing",
      providerStatus: "RUNNING",
      modelInstanceId: "model-instance-1",
      providerInstanceId: "provider-instance-1",
      modelName: "qwen3-asr-flash",
      providerName: "阿里云百炼",
      requestId: "submit-request-existing",
      submittedAt: "2026-08-26T00:00:00.000Z",
      lastPolledAt: "2026-08-26T00:09:59.000Z",
      pollAttempts: 12,
      transientFailures: 0
    }
  });
  job.estimatedCredits = 4;
  (job.input.audioAsset as { durationMs?: number }).durationMs = 60_001;
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = runningReadAlongProgress();
  const harness = createAsyncHarness(material);
  harness.wallet.availableCredits = 9_996;
  harness.wallet.frozenCredits = 4;
  harness.entries.set(`${job.operationKey}:reserve`, {
    amount: -4,
    idempotencyKey: `${job.operationKey}:reserve`,
    type: "RESERVE"
  });
  let submitCalls = 0;
  let queryCalls = 0;
  const service = new EnglishGuidedStudyService(
    {
      submitSrtGenerationTask: async () => {
        submitCalls += 1;
        throw new Error("恢复任务不应重复提交 ASR");
      },
      querySrtGenerationTask: async (input: { providerTaskId: string }) => {
        queryCalls += 1;
        assert.equal(input.providerTaskId, "provider-task-existing");
        return {
          providerTaskId: input.providerTaskId,
          providerStatus: "SUCCEEDED",
          status: "SUCCEEDED",
          modelName: "qwen3-asr-flash",
          providerName: "阿里云百炼",
          requestId: "query-request-success",
          durationMs: 1500,
          subtitleText: "1\n00:00:00,000 --> 00:00:01,500\nHello world.",
          wordTimeline: [
            { text: "Hello", startSeconds: 0, endSeconds: 0.7 },
            { text: "world", startSeconds: 0.8, endSeconds: 1.5 }
          ]
        };
      },
      cleanupExternalNarrationAudio: async () => ({ cleaned: 0 })
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, { prisma: harness.prisma });

  const generated = await service.generateMaterialReadAlong(
    "user-1",
    material.id,
    job.input,
    { operationJob: job }
  );
  const content = generated.content as {
    readAlong?: { durationMs: number; source: string };
    readAlongGenerationProgress?: { status: string };
  };

  assert.equal(submitCalls, 0);
  assert.equal(queryCalls, 1);
  assert.equal(content.readAlong?.source, "UPLOAD");
  assert.equal(content.readAlong?.durationMs, 60_001);
  assert.equal(content.readAlongGenerationProgress?.status, "SUCCEEDED");
  assert.deepEqual(harness.wallet, {
    availableCredits: 9_996,
    frozenCredits: 0,
    totalConsumedCredits: 4
  });
  assert.equal(harness.entries.has(`${job.operationKey}:consume`), true);
});

test("上传音频识别长期处理中达到轮询上限后停止重排", async () => {
  const material = createReadyMaterial();
  const job = createRunningUploadReadAlongJob({
    asrCheckpoint: {
      version: 1,
      providerTaskId: "provider-task-pending-forever",
      providerStatus: "RUNNING",
      modelInstanceId: "model-instance-1",
      providerInstanceId: "provider-instance-1",
      modelName: "qwen3-asr-flash",
      providerName: "阿里云百炼",
      requestId: "submit-request-pending-forever",
      submittedAt: "2026-08-28T00:00:00.000Z",
      lastPolledAt: "2026-08-28T00:59:50.000Z",
      pollAttempts: englishGuidedStudyReadAlongAsrMaxPollAttempts() - 1,
      transientFailures: 0
    }
  });
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = runningReadAlongProgress();
  const harness = createAsyncHarness(material);
  const scheduled: string[] = [];
  const service = new EnglishGuidedStudyService(
    {
      querySrtGenerationTask: async () => ({
        providerTaskId: "provider-task-pending-forever",
        providerStatus: "RUNNING",
        status: "PENDING",
        modelName: "qwen3-asr-flash",
        providerName: "阿里云百炼",
        requestId: "query-request-pending-forever",
        durationMs: null,
        subtitleText: null,
        wordTimeline: []
      })
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => scheduled.push("scheduled")
  });

  await assert.rejects(
    service.generateMaterialReadAlong("user-1", material.id, job.input, { operationJob: job }),
    /上传音频识别失败，请重新上传音频或稍后重试/u
  );
  assert.deepEqual(scheduled, []);
});

test("上传音频识别任务多次提交失败后停止重排", async () => {
  const material = createReadyMaterial();
  const job = createRunningUploadReadAlongJob({
    asrSubmissionAttempts: englishGuidedStudyReadAlongAsrMaxSubmissionAttempts() - 1
  });
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = runningReadAlongProgress();
  const harness = createAsyncHarness(material);
  const scheduled: string[] = [];
  const service = new EnglishGuidedStudyService(
    {
      submitSrtGenerationTask: async () => {
        throw Object.assign(new Error("PROVIDER_TIMEOUT"), { code: "PROVIDER_TIMEOUT" });
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => scheduled.push("scheduled")
  });

  await assert.rejects(
    service.generateMaterialReadAlong("user-1", material.id, job.input, { operationJob: job }),
    /上传音频识别失败，请重新上传音频或稍后重试/u
  );
  assert.deepEqual(scheduled, []);
});

test("古诗文示范朗读上传使用中文识别并生成标题作者时间轴", async () => {
  const material = createReadyMaterial();
  material.title = "静夜思";
  material.sourceText = "举头望明月，低头思故乡。";
  material.content = {
    ...material.content,
    scene: "GUSHIWEN",
    contentTitle: "静夜思",
    author: "李白",
    sourceText: "举头望明月，低头思故乡。",
    sentences: [{
      id: "s1",
      text: "床前明月光，疑是地上霜。",
      script: "先读第一句。",
      explanation: "月光照在床前。",
      grammarFocus: "",
      points: []
    }]
  };
  const harness = createAsyncHarness(material);
  const languages: Array<string | null | undefined> = [];
  const service = new EnglishGuidedStudyService(
    {
      submitSrtGenerationTask: async (input: { language?: string | null }) => {
        languages.push(input.language);
        return {
          providerTaskId: "gushiwen-provider-task",
          providerStatus: "PENDING",
          status: "PENDING",
          modelInstanceId: "model-instance-1",
          providerInstanceId: "provider-instance-1",
          modelName: "test-asr",
          providerName: "test-provider",
          requestId: "submit-request-1"
        };
      },
      querySrtGenerationTask: async () => {
        return {
          providerTaskId: "gushiwen-provider-task",
          providerStatus: "SUCCEEDED",
          status: "SUCCEEDED",
          subtitleText: "1\n00:00:00,100 --> 00:00:00,700\n静夜思\n\n2\n00:00:00,900 --> 00:00:01,300\n李白\n\n3\n00:00:01,600 --> 00:00:02,600\n举头望明月，低头思故乡。",
          durationMs: 3200,
          modelName: "test-asr",
          providerName: "test-provider",
          requestId: "request-1",
          wordTimeline: [
            { text: "静夜思", startSeconds: 0.1, endSeconds: 0.7 },
            { text: "李白", startSeconds: 0.9, endSeconds: 1.3 },
            { text: "举头望明月，低头思故乡。", startSeconds: 1.6, endSeconds: 2.6 }
          ]
        };
      },
      cleanupExternalNarrationAudio: async () => ({ cleaned: 0 })
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, { prisma: harness.prisma });
  const job = {
    version: 1 as const,
    jobId: "gushiwen-upload-job",
    attemptId: "gushiwen-upload-attempt",
    operation: "READ_ALOUD" as const,
    operationKey: "gushiwen-upload-operation",
    estimatedCredits: 0,
    input: {
      mode: "UPLOAD" as const,
      audioAsset: {
        id: "gushiwen-audio",
        mimeType: "audio/mpeg",
        name: "静夜思.mp3",
        sizeBytes: 1024,
        url: "https://example.com/jing-ye-si.mp3"
      }
    },
    createdAt: "2026-08-20T00:00:00.000Z"
  };
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = {
    version: 1,
    operation: "READ_ALOUD",
    status: "RUNNING",
    phase: "RECOGNIZING_READ_ALOUD",
    completed: 15,
    total: 100,
    percent: 15,
    message: "正在识别上传音频",
    canLeave: true,
    errorMessage: null,
    startedAt: "2026-08-20T00:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-08-20T00:00:01.000Z"
  };

  const generated = await service.generateMaterialReadAlong(
    "user-1",
    material.id,
    job.input,
    { operationJob: job }
  );
  const readAlong = (generated.content as {
    readAlong?: { cues: Array<{ text: string; unitType: string }> };
  }).readAlong;

  assert.deepEqual(languages, ["zh-CN"]);
  assert.deepEqual(readAlong?.cues.map((cue) => cue.unitType), ["TITLE", "AUTHOR", "BODY"]);
  assert.deepEqual(readAlong?.cues.map((cue) => cue.text), [
    "静夜思",
    "李白",
    "举头望明月，低头思故乡。"
  ]);
});

test("上传音频 ASR 失败时不以估算时间轴覆盖原跟读内容", async () => {
  const material = createReadyMaterial();
  const previousReadAlong = { marker: "previous-read-along" };
  material.content.readAlong = previousReadAlong;
  const harness = createAsyncHarness(material);
  const job = {
    version: 1 as const,
    jobId: "read-along-upload-job-asr-failed",
    attemptId: "read-along-upload-attempt-asr-failed",
    operation: "READ_ALOUD" as const,
    operationKey: "read-along-upload-operation-asr-failed",
    estimatedCredits: 0,
    input: {
      mode: "UPLOAD" as const,
      audioAsset: {
        id: "uploaded-audio-asr-failed",
        mimeType: "audio/mpeg",
        name: "reading.mp3",
        sizeBytes: 1024,
        url: ""
      }
    },
    createdAt: "2026-08-10T00:00:00.000Z"
  };
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = runningReadAlongProgress();
  const service = new EnglishGuidedStudyService(
    {
      submitSrtGenerationTask: async () => ({
        providerTaskId: "provider-task-terminal-failure",
        providerStatus: "PENDING",
        status: "PENDING",
        modelInstanceId: "model-instance-1",
        providerInstanceId: "provider-instance-1",
        modelName: "qwen3-asr-flash",
        providerName: "阿里云百炼",
        requestId: "submit-request-terminal-failure"
      }),
      querySrtGenerationTask: async () => {
        throw Object.assign(new Error("FILE_DOWNLOAD_FAILED"), {
          code: "FILE_DOWNLOAD_FAILED"
        });
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma
  });

  await assert.rejects(
    () => service.generateMaterialReadAlong(
      "user-1",
      material.id,
      job.input,
      { operationJob: job }
    ),
    /上传音频识别失败，请重新上传音频或稍后重试/u
  );
  assert.equal(material.content.readAlong, previousReadAlong);
});

test("跟读音频任务恢复后复用检查点并只生成剩余原文句子", async () => {
  const material = createReadyMaterial();
  material.sourceText = "Hello world. Welcome back.";
  material.content.sourceText = material.sourceText;
  material.content.sentences.push({
    id: "s2",
    text: "Welcome back.",
    script: "再看 Welcome back。",
    explanation: "欢迎回来。",
    grammarFocus: "",
    points: []
  });
  const harness = createAsyncHarness(material);
  let ttsCalls = 0;
  let asrCalls = 0;
  const service = new EnglishGuidedStudyService(
    {
      synthesizeTtsForExternalBilling: async () => {
        ttsCalls += 1;

        return {
          id: "audio-2",
          status: "SUCCEEDED",
          errorMessage: null,
          providerPayload: null,
          outputAudioAsset: {
            url: "https://example.com/s2.mp3",
            durationMs: 1800
          }
        };
      },
      generateSrtFromMediaUrl: async () => {
        asrCalls += 1;
        return {
          subtitleText: "1\n00:00:00,000 --> 00:00:01,800\nWelcome back.",
          wordTimeline: [
            { text: "Welcome", startSeconds: 0.1, endSeconds: 0.8 },
            { text: "back", startSeconds: 0.8, endSeconds: 1.4 }
          ]
        };
      },
      cleanupExternalNarrationAudio: async () => ({ cleaned: 0 })
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma
  });
  const estimate = await service.estimateMaterialReadAlongGeneration(
    accountSubject,
    material.id,
    {
      billingRequestId: "read-along-resume",
      voice: "longanyang",
      speed: 1
    }
  );
  const job = {
    version: 1 as const,
    jobId: "read-along-job-1",
    attemptId: "read-along-attempt-1",
    operation: "READ_ALOUD" as const,
    operationKey: "read-along-operation-1",
    estimatedCredits: estimate.estimatedCredits,
    input: {
      mode: "GENERATE" as const,
      settings: {
        billingConfirmed: true,
        billingRequestId: estimate.requestId,
        billingRevision: estimate.revision,
        voice: "longanyang",
        speed: 1
      },
      generatedNodes: [
        {
          id: "read-along-node-1",
          unitId: "read-along-title",
          unitType: "TITLE" as const,
          sentenceId: null,
          text: "Hello",
          audioTaskId: "audio-title",
          audioUrl: "https://example.com/title.mp3",
          durationMs: 800,
          timingSource: "ASR_WORDS" as const,
          words: [
            { text: "Hello", startChar: 0, endChar: 5, startSeconds: 0.1, endSeconds: 0.6 }
          ]
        },
        {
          id: "read-along-node-2",
          unitId: "read-along-body-s1",
          unitType: "BODY" as const,
          sentenceId: "s1",
          text: "Hello world.",
          audioTaskId: "audio-1",
          audioUrl: "https://example.com/s1.mp3",
          durationMs: 1500,
          timingSource: "ASR_WORDS" as const,
          words: [
            { text: "Hello", startChar: 0, endChar: 5, startSeconds: 0.1, endSeconds: 0.5 },
            { text: "world", startChar: 6, endChar: 11, startSeconds: 0.5, endSeconds: 1.1 }
          ]
        }
      ]
    },
    createdAt: "2026-07-27T00:00:00.000Z"
  };
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = {
    version: 1,
    operation: "READ_ALOUD",
    status: "RUNNING",
    phase: "SYNTHESIZING_READ_ALOUD",
    completed: 2,
    total: 3,
    percent: 67,
    message: "正在生成全文诵读音频",
    canLeave: true,
    errorMessage: null,
    startedAt: "2026-07-27T00:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-07-27T00:00:01.000Z"
  };

  const generated = await service.generateMaterialReadAlong(
    "user-1",
    material.id,
    job.input,
    { billingAlreadyReserved: true, operationJob: job }
  );
  const readAlong = (generated.content as {
    readAlong?: {
      durationMs: number;
      nodes: Array<{ audioTaskId: string }>;
    };
  }).readAlong;

  assert.equal(ttsCalls, 1);
  assert.equal(asrCalls, 1);
  assert.deepEqual(
    readAlong?.nodes.map((node) => node.audioTaskId),
    ["audio-title", "audio-1", "audio-2"]
  );
  assert.equal(readAlong?.durationMs, 4100);
});

test("上传跟读音频异步处理失败后清理本次上传资源", async () => {
  const material = createReadyMaterial();
  const job = {
    version: 1 as const,
    jobId: "read-along-upload-job-1",
    attemptId: "read-along-upload-attempt-1",
    operation: "READ_ALOUD" as const,
    operationKey: "read-along-upload-operation-1",
    estimatedCredits: 4,
    input: {
      mode: "UPLOAD" as const,
      audioAsset: {
        id: "uploaded-audio-1",
        mimeType: "audio/mpeg",
        name: "reading.mp3",
        sizeBytes: 1024,
        url: "https://example.com/reading.mp3"
      }
    },
    createdAt: "2026-07-27T00:00:00.000Z"
  };
  material.content.readAlongGenerationJob = job;
  material.content.readAlongGenerationProgress = {
    version: 1,
    operation: "READ_ALOUD",
    status: "RUNNING",
    phase: "RECOGNIZING_READ_ALOUD",
    completed: 15,
    total: 100,
    percent: 15,
    message: "正在识别上传音频",
    canLeave: true,
    errorMessage: null,
    startedAt: "2026-07-27T00:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-07-27T00:00:01.000Z"
  };
  const harness = createAsyncHarness(material);
  harness.wallet.availableCredits = 9_996;
  harness.wallet.frozenCredits = 4;
  harness.entries.set(`${job.operationKey}:reserve`, {
    amount: -4,
    idempotencyKey: `${job.operationKey}:reserve`,
    type: "RESERVE"
  });
  const deletedAssetIds: string[] = [];
  const service = new EnglishGuidedStudyService(
    {
      cleanupExternalNarrationAudio: async () => ({ cleaned: 0 }),
      deleteAudioAsset: async (_userId: string, assetId: string) => {
        deletedAssetIds.push(assetId);
        return {};
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma
  });

  await (
    service as unknown as {
      failEnglishGuidedStudyOperation: (
        materialId: string,
        config: {
          operation: "READ_ALOUD";
          jobKey: "readAlongGenerationJob";
          progressKey: "readAlongGenerationProgress";
        },
        operationJob: typeof job,
        errorMessage: string,
        userId: string
      ) => Promise<void>;
    }
  ).failEnglishGuidedStudyOperation(
    material.id,
    {
      operation: "READ_ALOUD",
      jobKey: "readAlongGenerationJob",
      progressKey: "readAlongGenerationProgress"
    },
    job,
    "音频识别失败",
    "user-1"
  );

  assert.deepEqual(deletedAssetIds, ["uploaded-audio-1"]);
  assert.equal(
    (harness.records.get(material.id)?.content.readAlongGenerationProgress as { status: string }).status,
    "FAILED"
  );
  assert.deepEqual(harness.wallet, {
    availableCredits: 10_000,
    frozenCredits: 0,
    totalConsumedCredits: 0
  });
  assert.equal(harness.entries.has(`${job.operationKey}:release-failed`), true);
  assert.equal(
    harness.entries.get(`${job.operationKey}:release-failed`)?.note,
    "跟读上传音频识别失败，已释放冻结点数"
  );
});

test("英文带学练习任务在原材料上生成十道题", async () => {
  const material = createReadyMaterial();
  const job = {
    version: 1 as const,
    jobId: "practice-job-1",
    attemptId: "practice-attempt-1",
    operation: "PRACTICE" as const,
    operationKey: "practice-operation-1",
    estimatedCredits: 0,
    input: {},
    createdAt: "2026-07-27T00:00:00.000Z"
  };
  material.content = {
    ...material.content,
    practiceGenerationJob: job,
    practiceGenerationProgress: {
      version: 1,
      operation: "PRACTICE",
      status: "RUNNING",
      phase: "PREPARING_PRACTICE",
      completed: 2,
      total: 100,
      percent: 2,
      message: "正在整理文稿中的学习重点",
      canLeave: true,
      errorMessage: null,
      startedAt: "2026-07-27T00:00:00.000Z",
      finishedAt: null,
      updatedAt: "2026-07-27T00:00:00.000Z"
    }
  };
  const harness = createAsyncHarness(material);
  const service = new EnglishGuidedStudyService(
    {} as never,
    {
      generateScenarioTextForExternalBilling: async (input: { scenarioSlug: string }) => {
        assert.equal(input.scenarioSlug, "english-guided-study-practice");

        return {
          taskId: "practice-ai-task-1",
          providerName: "test-provider",
          modelName: "test-model",
          text: JSON.stringify({
            questions: Array.from({ length: 10 }, (_, index) => ({
              id: `model-question-${index + 1}`,
              question: `What is the best answer for question ${index + 1}?`,
              options: ["Option A", "Option B", "Option C", "Option D"],
              answer: index % 4,
              explanation: "The lesson text and teaching notes support this answer."
            }))
          })
        };
      }
    } as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma
  });

  const generated = await service.generateMaterialPractice(
    "user-1",
    material.id,
    {},
    { operationJob: job }
  );
  const content = generated.content as {
    practiceGenerationProgress: { status: string };
    questions: Array<{ id: string }>;
  };

  assert.equal(harness.records.size, 1);
  assert.equal(content.questions.length, 10);
  assert.deepEqual(content.questions.map((question) => question.id), [
    "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"
  ]);
  assert.equal(content.practiceGenerationProgress.status, "SUCCEEDED");
});

test("英文带学后台任务执行期间不能删除材料", async () => {
  const harness = createAsyncHarness();
  const service = createSubmissionService(harness);
  const input = {
    title: "Hello",
    sourceType: "TEXT" as const,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  const queued = await service.submitMaterialGeneration(accountSubject, {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  await assert.rejects(
    () => service.deleteMaterial(accountSubject, queued.id),
    /当前材料正在后台生成/
  );
  assert.equal(harness.records.has(queued.id), true);
  assert.ok(harness.wallet.frozenCredits > 0);
});

test("英文带学超时冻结清理不会退款仍在后台执行的任务", async () => {
  const harness = createAsyncHarness();
  const service = createSubmissionService(harness);
  const input = {
    sourceType: "TEXT" as const,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  await service.submitMaterialGeneration(accountSubject, {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const frozenCredits = harness.wallet.frozenCredits;

  await (
    service as unknown as {
      recoverExpiredEnglishGuidedStudyCredits: () => Promise<void>;
    }
  ).recoverExpiredEnglishGuidedStudyCredits();

  assert.equal(harness.wallet.frozenCredits, frozenCredits);
  assert.equal(
    Array.from(harness.entries.keys()).some((key) => key.endsWith(":release-failed")),
    false
  );
});

function createSubmissionService(harness: ReturnType<typeof createAsyncHarness>) {
  const service = new EnglishGuidedStudyService(
    {} as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: harness.prisma,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });

  return service;
}

function createAsyncHarness(initialMaterial?: ReturnType<typeof createReadyMaterial>) {
  const now = new Date("2026-07-25T00:00:00.000Z");
  const wallet = {
    availableCredits: 10_000,
    frozenCredits: 0,
    totalConsumedCredits: 0
  };
  const entries = new Map<string, Record<string, unknown>>();
  const records = new Map<string, any>();

  if (initialMaterial) {
    records.set(initialMaterial.id, initialMaterial);
  }

  const materialStore = {
    findFirst: async ({ where }: any) => {
      if (Array.isArray(where.OR)) {
        return Array.from(records.values()).find((material) =>
          where.OR.some((condition: any) => {
            const path = condition.content?.path;
            const expected = condition.content?.equals;
            let value: unknown = material.content;

            for (const key of Array.isArray(path) ? path : []) {
              value = value && typeof value === "object"
                ? (value as Record<string, unknown>)[key]
                : undefined;
            }

            return value === expected;
          })
        ) ?? null;
      }

      const material = records.get(where.id);
      return material?.userId === where.userId ? material : null;
    },
    create: async ({ data }: any) => {
      const material = {
        ...data,
        pinnedAt: null,
        createdAt: now,
        updatedAt: now
      };
      records.set(material.id, material);
      return material;
    },
    update: async ({ where, data }: any) => {
      const current = records.get(where.id);
      const material = {
        ...current,
        ...data,
        updatedAt: now
      };
      records.set(material.id, material);
      return material;
    },
    updateMany: async ({ where, data }: any) => {
      const current = records.get(where.id);

      if (!current) {
        return { count: 0 };
      }

      records.set(where.id, {
        ...current,
        ...data,
        updatedAt: now
      });
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const material = records.get(where.id);

      if (!material) {
        throw new Error("Material not found");
      }

      return material;
    },
    delete: async ({ where }: any) => {
      const material = records.get(where.id);
      records.delete(where.id);
      return material;
    }
  };
  const transaction: any = {
    $queryRaw: async () => [{ locked: 1 }],
    englishGuidedStudyMaterial: materialStore,
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => wallet,
      updateMany: async ({ where, data }: any) => {
        const required = where.availableCredits?.gte ?? 0;

        if (wallet.availableCredits < required) {
          return { count: 0 };
        }

        wallet.availableCredits -= data.availableCredits?.decrement ?? 0;
        wallet.frozenCredits += data.frozenCredits?.increment ?? 0;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => wallet,
      update: async ({ data }: any) => {
        wallet.availableCredits += data.availableCredits?.increment ?? 0;
        wallet.availableCredits -= data.availableCredits?.decrement ?? 0;
        wallet.frozenCredits += data.frozenCredits?.increment ?? 0;
        wallet.frozenCredits -= data.frozenCredits?.decrement ?? 0;
        wallet.totalConsumedCredits += data.totalConsumedCredits?.increment ?? 0;
        return wallet;
      }
    },
    ledgerEntry: {
      findUnique: async ({ where }: any) => entries.get(where.idempotencyKey) ?? null,
      findMany: async () => Array.from(entries.values()),
      create: async ({ data }: any) => {
        const entry = {
          id: `entry-${entries.size + 1}`,
          createdAt: now,
          ...data
        };
        entries.set(data.idempotencyKey, entry);
        return entry;
      }
    }
  };
  const prisma = {
    ...transaction,
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction)
  };

  return { entries, prisma, records, wallet };
}

function createReadyMaterial() {
  const now = new Date("2026-07-27T00:00:00.000Z");

  return {
    id: "material-audio-async",
    userId: "user-1",
    title: "Hello",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    summary: "学习简单问候。",
    narration: "我们来学习 Hello world。",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      id: "material-audio-async",
      title: "Hello",
      sourceText: "Hello world.",
      level: {
        standardName: "基于所在学段年级",
        optionLabel: "小学三四年级",
        aiLevel: "E1"
      },
      explanationMode: "SENTENCE",
      summary: "学习简单问候。",
      narration: "我们来学习 Hello world。",
      audioUrl: null,
      audioTaskId: null,
      audioDurationSeconds: 0,
      audioTimeline: [],
      narrationTimelineV2: null,
      sentences: [
        {
          id: "s1",
          text: "Hello world.",
          script: "我们来学习 Hello world。",
          explanation: "一句问候。",
          grammarFocus: "",
          points: []
        }
      ],
      questions: []
    },
    pinnedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function createRunningUploadReadAlongJob(input: {
  asrCheckpoint?: Record<string, unknown>;
  asrSubmissionAttempts?: number;
} = {}) {
  return {
    version: 1 as const,
    jobId: "read-along-upload-job-resumable",
    attemptId: "read-along-upload-attempt-resumable",
    operation: "READ_ALOUD" as const,
    operationKey: "read-along-upload-operation-resumable",
    estimatedCredits: 0,
    input: {
      mode: "UPLOAD" as const,
      audioAsset: {
        id: "uploaded-audio-resumable",
        mimeType: "audio/mpeg",
        name: "reading.mp3",
        sizeBytes: 1024,
        url: "https://example.com/reading.mp3"
      },
      ...input
    },
    createdAt: "2026-08-26T00:00:00.000Z"
  };
}

function runningReadAlongProgress() {
  return {
    version: 1,
    operation: "READ_ALOUD",
    status: "RUNNING",
    phase: "RECOGNIZING_READ_ALOUD",
    completed: 15,
    total: 100,
    percent: 15,
    message: "正在识别上传音频",
    canLeave: true,
    errorMessage: null,
    startedAt: "2026-08-26T00:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-08-26T00:00:01.000Z"
  };
}
