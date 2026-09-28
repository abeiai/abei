import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";

import { AiService } from "../src/ai/ai.service.js";
import { AudioService } from "../src/audio/audio.service.js";
import { AppException } from "../src/common/app-exception.js";
import { CopybooksService } from "../src/copybooks/copybooks.service.js";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import { LearningFlashcardsService } from "../src/learning-flashcards/learning-flashcards.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";
import { VideoGuideService } from "../src/video-guide/video-guide.service.js";

const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };
const learnerSubject: ProfileSubject = { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" };

const aiScenario = {
  id: "scenario-child",
  name: "学习生成",
  slug: "video-guide-practice-questions",
  costCredits: 2,
  modelBinding: null
};

function installAiCreateFixture(service: AiService) {
  const createdData: Array<Record<string, unknown>> = [];
  const transaction = {
    aiTask: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData.push(data);
        return { id: `ai-task-${createdData.length}`, createdAt: new Date(), ...data };
      },
      update: async ({ where }: { where: { id: string } }) => ({ id: where.id, createdAt: new Date() })
    },
    ...membershipWalletFixture(),
    $queryRaw: async () => [],
    wallet: {
      upsert: async () => ({}),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ availableCredits: 98 })
    },
    creditReservation: { create: async () => ({ id: "reservation-1" }) },
    ledgerEntry: { create: async () => ({ id: "ledger-1" }) }
  };
  Object.defineProperty(service, "prisma", {
    value: {
      aiScenario: { findFirst: async () => aiScenario },
      aiTask: { update: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)
    }
  });
  const internals = service as unknown as {
    preparePromptInput(): Promise<Record<string, unknown>>;
    getModelForScenario(): Promise<null>;
    shouldSaveFullAiContent(): Promise<boolean>;
    generateTextWithFallback(): Promise<Record<string, unknown>>;
    settleSuccessfulTask(id: string): Promise<Record<string, unknown>>;
    ensureWallet(): Promise<void>;
  };
  internals.preparePromptInput = async () => ({
    renderedPrompt: "prompt",
    variables: {},
    knowledgeBaseId: null,
    knowledgeContext: ""
  });
  internals.getModelForScenario = async () => null;
  internals.shouldSaveFullAiContent = async () => false;
  internals.generateTextWithFallback = async () => ({ text: "完成" });
  internals.settleSuccessfulTask = async (id) => ({ id, status: "SUCCEEDED" });
  internals.ensureWallet = async () => undefined;
  return createdData;
}

test("AI 用户任务从服务端身份写入归属且忽略请求体伪造身份", async () => {
  for (const [subject, expectedLearnerId] of [
    [learnerSubject, "learner-1"],
    [accountSubject, null]
  ] as const) {
    const service = new AiService({} as never, {} as never);
    const createdData = installAiCreateFixture(service);

    await service.createTask(subject as never, {
      scenarioId: "scenario-child",
      input: "学习",
      userId: "user-forged",
      learnerId: "learner-forged"
    } as never);

    assert.equal(createdData.length, 1);
    assert.equal(createdData[0]?.userId, "user-1");
    assert.equal(createdData[0]?.learnerId, expectedLearnerId);
  }
});

test("AI 账号查询按 owner 汇总，学习者查询在数据库同时约束 owner 和 learner", async () => {
  const findManyWhere: unknown[] = [];
  const findFirstWhere: unknown[] = [];
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        findMany: async ({ where }: { where: unknown }) => {
          findManyWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          findFirstWhere.push(where);
          return null;
        }
      }
    }
  });

  await service.listUserTasks(accountSubject as never);
  await service.listUserTasks(learnerSubject as never);
  assert.deepEqual(findManyWhere, [
    { userId: "user-1" },
    { userId: "user-1", learnerId: "learner-1" }
  ]);

  await assert.rejects(
    service.getTask(accountSubject as never, "learner-owned-task"),
    (error: unknown) => error instanceof AppException && error.message === "AI 任务不存在"
  );

  for (const id of ["sibling-task", "legacy-null-task", "cross-user-task"]) {
    await assert.rejects(
      service.getTask(learnerSubject as never, id),
      (error: unknown) => error instanceof AppException && error.message === "AI 任务不存在"
    );
  }
  assert.deepEqual(findFirstWhere, [
    { id: "learner-owned-task", userId: "user-1" },
    { id: "sibling-task", userId: "user-1", learnerId: "learner-1" },
    { id: "legacy-null-task", userId: "user-1", learnerId: "learner-1" },
    { id: "cross-user-task", userId: "user-1", learnerId: "learner-1" }
  ]);
});

test("视频轮询在读取模型或 Provider 前按本地任务、当前学习者和固定场景精确定位", async () => {
  const findFirstWhere: unknown[] = [];
  let modelReads = 0;
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        findFirst: async ({ where }: { where: unknown }) => {
          findFirstWhere.push(where);
          return null;
        }
      }
    }
  });
  const internals = service as unknown as {
    getVideoGenerationModel(): Promise<never>;
  };
  internals.getVideoGenerationModel = async () => {
    modelReads += 1;
    throw new Error("不应在任务归属确认前读取模型");
  };

  await assert.rejects(
    service.getVideoGenerationTask(learnerSubject, "local-task-1"),
    (error: unknown) => error instanceof AppException && error.message === "视频任务不存在"
  );
  assert.equal(modelReads, 0);
  assert.deepEqual(findFirstWhere, [{
    id: "local-task-1",
    userId: "user-1",
    learnerId: "learner-1",
    scenario: { slug: "experience-video-generation" }
  }]);
});

test("视频 Provider 接单后原子保存可恢复检查点且调用日志失败不释放任务", async () => {
  const directUpdates: unknown[] = [];
  const checkpointUpdates: unknown[] = [];
  let releaseCalls = 0;
  let providerCallSawUpdates = -1;
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        update: async (input: unknown) => {
          directUpdates.push(input);
          return {};
        },
        updateMany: async (input: unknown) => {
          checkpointUpdates.push(input);
          return { count: 1 };
        }
      }
    }
  });
  const internals = service as unknown as {
    ensureExperienceVideoScenario(): Promise<unknown>;
    getVideoGenerationModel(): Promise<unknown>;
    activeModelFromInstance(): unknown;
    resolveModelRuntimeConfig(): unknown;
    reserveCredits(): Promise<Record<string, unknown>>;
    callDashScopeVideoGeneration(): Promise<Record<string, unknown>>;
    writeAiCallLog(): Promise<void>;
    releaseFailedTask(): Promise<void>;
  };
  internals.ensureExperienceVideoScenario = async () => ({
    id: "scenario-video",
    name: "视频生成",
    slug: "experience-video-generation"
  });
  internals.getVideoGenerationModel = async () => ({
    id: "model-1",
    displayName: "测试视频模型",
    providerModelName: "wan2.7-t2v",
    capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO"],
    inputPrice: { toString: () => "0.02" },
    pricingMode: "VIDEO_SECONDS",
    pricingUnit: "SECOND",
    pricingConfig: null,
    providerInstance: {
      id: "provider-instance-1",
      name: "测试 Provider",
      providerPreset: { adapterType: "DASHSCOPE_VIDEO" }
    }
  });
  internals.activeModelFromInstance = () => ({});
  internals.resolveModelRuntimeConfig = () => ({
    baseUrl: "https://dashscope.example/api/v1",
    apiKeyEncrypted: "encrypted-key"
  });
  internals.reserveCredits = async () => ({
    id: "local-task-1",
    input: {
      text: "生成测试视频",
      variables: { duration: "5" }
    },
    saveFullContent: false,
    createdAt: new Date("2026-08-14T00:00:00Z")
  });
  internals.callDashScopeVideoGeneration = async () => {
    providerCallSawUpdates = directUpdates.length + checkpointUpdates.length;
    return {
      request_id: "provider-request-1",
      output: {
        task_id: "provider-task-1",
        task_status: "RUNNING"
      }
    };
  };
  internals.writeAiCallLog = async () => {
    throw new Error("模拟调用日志写入失败");
  };
  internals.releaseFailedTask = async () => {
    releaseCalls += 1;
  };

  const result = await service.generateVideo(accountSubject, {
    prompt: "生成测试视频",
    modelInstanceId: "model-1",
    ratio: "16:9",
    resolution: "高清 720P",
    duration: 5
  });

  assert.equal(providerCallSawUpdates, 0);
  assert.deepEqual(directUpdates, []);
  assert.equal(checkpointUpdates.length, 1);
  assert.deepEqual(checkpointUpdates[0], {
    where: {
      id: "local-task-1",
      status: { in: ["CREATED", "RESERVED"] }
    },
    data: {
      status: "RUNNING",
      input: {
        text: "生成测试视频",
        variables: { duration: "5" },
        providerTaskId: "provider-task-1"
      },
      output: "视频生成提示词：生成测试视频\n\n任务状态：任务已提交\nProvider 任务编号：provider-task-1\n画面比例：16:9\n清晰度：高清 720P\n时长：5 秒",
      outputPreview: "视频生成提示词：生成测试视频\n\n任务状态：任务已提交\nProvider 任务编号：provider-task-1\n画面比例：16:9\n清晰度：高清 720P\n时长：5 秒",
      outputHash: (checkpointUpdates[0] as { data: { outputHash: string } }).data.outputHash,
      providerName: "测试 Provider",
      modelName: "wan2.7-t2v"
    }
  });
  assert.equal(releaseCalls, 0);
  assert.equal(result.id, "local-task-1");
  assert.equal(result.providerTaskId, "provider-task-1");
});

test("视频 Provider 直接返回 URL 后可跳过 Provider 并幂等重试本地结算", async () => {
  let taskReads = 0;
  let modelReads = 0;
  const settlements: unknown[] = [];
  const runningTask = {
    id: "local-direct-task",
    userId: "user-1",
    learnerId: null,
    aiModelInstanceId: "model-1",
    status: "RUNNING",
    input: {
      text: "生成同步视频",
      providerVideoUrl: "https://example.com/direct.mp4"
    },
    output: "视频生成提示词：生成同步视频\n\n任务状态：生成完成\n生成视频：https://example.com/direct.mp4",
    outputPreview: "视频生成提示词：生成同步视频\n\n任务状态：生成完成\n生成视频：https://example.com/direct.mp4",
    saveFullContent: false,
    estimatedCredits: 10,
    errorMessage: null,
    providerName: "测试 Provider",
    modelName: "同步视频模型",
    scenario: { id: "scenario-video", slug: "experience-video-generation" }
  };
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        findFirst: async () => {
          taskReads += 1;
          return taskReads === 1
            ? runningTask
            : { ...runningTask, status: "SUCCEEDED" };
        }
      }
    }
  });
  const internals = service as unknown as {
    getVideoGenerationModel(): Promise<never>;
    settleSuccessfulTask(taskId: string, result: unknown, credits: number): Promise<void>;
  };
  internals.getVideoGenerationModel = async () => {
    modelReads += 1;
    throw new Error("已有视频 URL 时不应读取模型或查询 Provider");
  };
  internals.settleSuccessfulTask = async (taskId, result, credits) => {
    settlements.push({ taskId, result, credits });
  };

  const result = await service.getVideoGenerationTask(accountSubject, "local-direct-task");

  assert.equal(modelReads, 0);
  assert.deepEqual(settlements, [{
    taskId: "local-direct-task",
    result: {
      text: runningTask.output,
      provider: "测试 Provider",
      model: "同步视频模型",
      requestId: null
    },
    credits: 10
  }]);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.videoUrl, "https://example.com/direct.mp4");
});

test("异步视频成功 URL 与成功输出在结算前原子保存供失败恢复", async () => {
  const checkpoints: unknown[] = [];
  const runningTask = {
    id: "local-async-task",
    userId: "user-1",
    learnerId: null,
    aiModelInstanceId: "model-1",
    status: "RUNNING",
    input: {
      text: "生成异步视频",
      providerTaskId: "provider-async-task"
    },
    inputPreview: "生成异步视频",
    output: "任务状态：生成中",
    outputPreview: "任务状态：生成中",
    saveFullContent: false,
    estimatedCredits: 10,
    errorMessage: null,
    providerName: "测试 Provider",
    modelName: "异步视频模型",
    scenario: { id: "scenario-video", slug: "experience-video-generation" }
  };
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        findFirst: async () => runningTask,
        updateMany: async (input: unknown) => {
          checkpoints.push(input);
          return { count: 1 };
        }
      }
    }
  });
  const internals = service as unknown as {
    getVideoGenerationModel(): Promise<unknown>;
    resolveModelRuntimeConfig(): unknown;
    queryDashScopeVideoTask(): Promise<Record<string, unknown>>;
    activeModelFromInstance(): unknown;
    writeAiCallLog(): Promise<void>;
    settleSuccessfulTask(): Promise<void>;
  };
  internals.getVideoGenerationModel = async () => ({
    id: "model-1",
    providerModelName: "wan2.7-t2v",
    providerInstance: {
      name: "测试 Provider",
      providerPreset: { adapterType: "DASHSCOPE_VIDEO" }
    }
  });
  internals.resolveModelRuntimeConfig = () => ({
    baseUrl: "https://dashscope.example/api/v1",
    apiKeyEncrypted: "encrypted-key"
  });
  internals.queryDashScopeVideoTask = async () => ({
    request_id: "provider-success-request",
    output: {
      task_id: "provider-async-task",
      task_status: "SUCCEEDED",
      video_url: "https://example.com/async.mp4"
    }
  });
  internals.activeModelFromInstance = () => ({});
  internals.writeAiCallLog = async () => undefined;
  internals.settleSuccessfulTask = async () => {
    throw new Error("模拟结算瞬时失败");
  };

  await assert.rejects(
    service.getVideoGenerationTask(accountSubject, "local-async-task"),
    /模拟结算瞬时失败/u
  );

  assert.equal(checkpoints.length, 1);
  const successText = "视频生成提示词：生成异步视频\n\n任务状态：生成完成\nProvider 任务编号：provider-async-task\n\n生成视频：https://example.com/async.mp4";
  assert.deepEqual(checkpoints[0], {
    where: {
      id: "local-async-task",
      status: { in: ["CREATED", "RESERVED", "RUNNING"] }
    },
    data: {
      input: {
        text: "生成异步视频",
        providerTaskId: "provider-async-task",
        providerVideoUrl: "https://example.com/async.mp4"
      },
      output: successText,
      outputPreview: successText,
      outputHash: (checkpoints[0] as { data: { outputHash: string } }).data.outputHash
    }
  });
});

test("迟到的运行中轮询不会覆盖已结算视频并返回持久化终态", async () => {
  const providerTaskIds: string[] = [];
  const updateManyCalls: unknown[] = [];
  let taskReads = 0;
  const runningTask = {
    id: "local-task-1",
    userId: "user-1",
    learnerId: "learner-1",
    aiModelInstanceId: "model-1",
    status: "RUNNING",
    input: {
      text: "提示词中包含 sibling-provider-task",
      variables: { duration: "5" },
      providerTaskId: "owned-provider-task"
    },
    output: "视频生成提示词：提示词中包含 sibling-provider-task\n\n任务状态：生成中\nProvider 任务编号：owned-provider-task",
    outputPreview: "视频生成提示词：提示词中包含 sibling-provider-task\n\n任务状态：生成中\nProvider 任务编号：owned-provider-task",
    saveFullContent: false,
    estimatedCredits: 10,
    errorMessage: null,
    scenario: { id: "scenario-video", slug: "experience-video-generation" }
  };
  const settledTask = {
    ...runningTask,
    status: "SUCCEEDED",
    output: `${runningTask.output}\n\n生成视频：https://example.com/settled.mp4`,
    outputPreview: `${runningTask.outputPreview}\n\n生成视频：https://example.com/settled.mp4`
  };
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        findFirst: async () => {
          taskReads += 1;
          return taskReads === 1 ? runningTask : settledTask;
        },
        update: async () => {
          throw new Error("迟到轮询不能按 id 无条件覆盖终态");
        },
        updateMany: async (input: unknown) => {
          updateManyCalls.push(input);
          return { count: 0 };
        }
      }
    }
  });
  const internals = service as unknown as {
    getVideoGenerationModel(): Promise<unknown>;
    resolveModelRuntimeConfig(): unknown;
    queryDashScopeVideoTask(input: { taskId: string }): Promise<Record<string, unknown>>;
    activeModelFromInstance(): unknown;
  };
  internals.getVideoGenerationModel = async () => ({
    id: "model-1",
    providerModelName: "wan2.7-t2v",
    providerInstance: {
      name: "视频 Provider",
      providerPreset: { adapterType: "DASHSCOPE_VIDEO" }
    }
  });
  internals.resolveModelRuntimeConfig = () => ({
    baseUrl: "https://dashscope.example/api/v1",
    apiKeyEncrypted: "encrypted-key"
  });
  internals.queryDashScopeVideoTask = async ({ taskId }) => {
    providerTaskIds.push(taskId);
    return {
      request_id: "late-running-request",
      output: {
        task_id: taskId,
        task_status: "RUNNING"
      }
    };
  };
  internals.activeModelFromInstance = () => ({});

  const result = await service.getVideoGenerationTask(learnerSubject, "local-task-1");

  assert.deepEqual(providerTaskIds, ["owned-provider-task"]);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.videoUrl, "https://example.com/settled.mp4");
  assert.equal(updateManyCalls.length, 1);
  const lateUpdate = updateManyCalls[0] as {
    where: unknown;
    data: { output: unknown; outputPreview: unknown; outputHash: unknown };
  };
  assert.deepEqual(lateUpdate.where, {
    id: "local-task-1",
    status: { in: ["CREATED", "RESERVED", "RUNNING"] }
  });
  assert.deepEqual(lateUpdate.data, {
    output: runningTask.outputPreview,
    outputPreview: runningTask.outputPreview,
    outputHash: lateUpdate.data.outputHash
  });
  assert.equal(typeof lateUpdate.data.outputHash, "string");
});

test("学习者 AI 与音频历史只返回执行所需字段且不泄露账号级隐私", async () => {
  const now = new Date("2026-08-14T00:00:00Z");
  const privateAiTask = {
    id: "ai-private",
    userId: "user-1",
    learnerId: "learner-1",
    user: { id: "user-1", email: "private@example.com" },
    billingContext: "PERSONAL",
    organizationId: "org-private",
    organizationMemberId: "member-private",
    scenarioId: "scenario-child",
    knowledgeBaseId: "kb-private",
    aiProviderId: "provider-private",
    aiModelId: "model-private",
    status: "SUCCEEDED",
    input: { text: "完整私密输入", knowledgeContext: "私密知识库片段" },
    renderedPrompt: "私密完整 Prompt",
    output: "私密完整输出",
    inputPreview: "学习输入",
    outputPreview: "学习输出",
    inputHash: "private-input-hash",
    outputHash: "private-output-hash",
    saveFullContent: true,
    errorMessage: null,
    estimatedCredits: 8,
    actualCredits: 7,
    providerName: "private-provider",
    modelName: "private-model",
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
    scenario: {
      id: "scenario-child",
      name: "学习生成",
      slug: "video-guide-practice-questions",
      description: null,
      requiredCapabilities: ["TEXT"]
    },
    reservation: { id: "reservation-private", amount: 8, status: "SETTLED", expiresAt: now },
    callLogs: [{ id: "call-private", provider: "private-provider", createdAt: now }],
    ledgerEntries: [{ id: "ledger-private", amount: -7, balanceAfter: 93, createdAt: now }]
  };
  const ai = new AiService({} as never, {} as never);
  Object.defineProperty(ai, "prisma", {
    value: {
      aiTask: {
        findMany: async () => [privateAiTask],
        findFirst: async () => privateAiTask
      }
    }
  });

  const privateAudioTask = {
    id: "audio-private",
    _count: { englishGuidedStudyMaterials: 0 },
    userId: "user-1",
    learnerId: "learner-1",
    scenarioId: "scenario-root",
    user: { id: "user-1", email: "private@example.com" },
    billingContext: "PERSONAL",
    organizationId: "org-private",
    organizationMemberId: "member-private",
    type: "TTS",
    status: "SUCCEEDED",
    provider: "private-provider",
    model: "private-model",
    providerInstanceId: "provider-instance-private",
    modelInstanceId: "model-instance-private",
    voiceAssetId: "voice-private",
    inputText: "学习者输入",
    inputTextLength: 5,
    sourceAudioAssetId: null,
    outputAudioAssetId: "output-1",
    estimatedCredits: 5,
    actualCredits: 4,
    errorCode: null,
    errorMessage: null,
    requestId: "provider-request-private",
    providerPayload: { apiKeyPreview: "secret", source: "VIDEO_GUIDE" },
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
    voiceAsset: {
      id: "voice-private",
      consent: { ownerContact: "13800000000", ip: "203.0.113.8", userAgent: "private-browser" }
    },
    sourceAudioAsset: null,
    outputAudioAsset: {
      id: "output-1",
      userId: "user-1",
      type: "TTS_OUTPUT",
      storageProvider: "S3",
      url: "https://public.example/output.mp3",
      objectKey: "private/output.mp3",
      mimeType: "audio/mpeg",
      durationMs: 1000,
      sizeBytes: 2048,
      sampleRate: 24000,
      channels: 1,
      createdAt: now
    },
    reservation: { id: "reservation-private", amount: 5, status: "SETTLED", expiresAt: now },
    ledgerEntries: [{ id: "ledger-private", amount: -4, balanceAfter: 96, createdAt: now }],
    usageLogs: [{ id: "usage-private", providerRequestId: "provider-request-private" }]
  };
  const audio = new AudioService();
  Object.defineProperty(audio, "prisma", {
    value: {
      audioTask: {
        findMany: async () => [privateAudioTask],
        findFirst: async () => privateAudioTask
      }
    }
  });

  const aiResponses = [
    ...(await ai.listUserTasks(learnerSubject as never)),
    await ai.getTask(learnerSubject as never, "ai-private")
  ] as Array<Record<string, unknown>>;
  const audioResponses = [
    ...(await audio.listUserTasks(learnerSubject as never)),
    await audio.getUserTask(learnerSubject as never, "audio-private")
  ] as Array<Record<string, unknown>>;
  const aiForbidden = [
    "userId", "user", "billingContext", "organizationId", "organizationMemberId", "knowledgeBaseId",
    "aiProviderId", "aiModelId", "input", "renderedPrompt", "output", "inputHash", "outputHash",
    "saveFullContent", "estimatedCredits", "actualCredits", "providerName", "modelName", "inputTokens",
    "outputTokens", "totalTokens", "reservation", "callLogs", "ledgerEntries"
  ];
  const audioForbidden = [
    "userId", "user", "billingContext", "organizationId", "organizationMemberId", "provider",
    "providerInstanceId", "modelInstanceId", "inputTextLength", "sourceAudioAssetId", "outputAudioAssetId",
    "estimatedCredits", "actualCredits", "requestId", "providerPayload", "voiceAsset", "voiceConsent",
    "sourceAudioAsset", "reservation", "ledgerEntries", "usageLogs"
  ];
  for (const response of aiResponses) {
    aiForbidden.forEach((key) => assert.equal(key in response, false, `学习者 AI 响应不得包含 ${key}`));
    assert.deepEqual(Object.keys(response).sort(), [
      "createdAt", "errorMessage", "finishedAt", "id", "inputPreview", "outputPreview", "scenario",
      "scenarioId", "status", "statusName", "updatedAt"
    ].sort());
  }
  for (const response of audioResponses) {
    audioForbidden.forEach((key) => assert.equal(key in response, false, `学习者音频响应不得包含 ${key}`));
  }
});

test("异步 AI 子任务在 await 前冻结原学习者与已校验根场景", async () => {
  let releaseAuthorization!: () => void;
  const authorizationGate = new Promise<void>((resolve) => {
    releaseAuthorization = resolve;
  });
  const authorizationCalls: unknown[] = [];
  const createdData: Array<Record<string, unknown>> = [];
  const service = new AiService({} as never, {
    assertInternalScenarioAuthorized: async (...args: unknown[]) => {
      authorizationCalls.push(args);
      await authorizationGate;
    }
  } as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData.push(data);
          return { id: "ai-child-1", providerName: null, modelName: null, ...data };
        },
        update: async () => ({ id: "ai-child-1" })
      }
    }
  });
  const internals = service as unknown as {
    ensureVideoGuidePracticeQuestionsScenario(): Promise<Record<string, unknown>>;
    preparePromptInput(): Promise<Record<string, unknown>>;
    getModelForScenario(): Promise<null>;
    shouldSaveFullAiContent(): Promise<boolean>;
    generateTextWithFallback(): Promise<Record<string, unknown>>;
  };
  internals.ensureVideoGuidePracticeQuestionsScenario = async () => aiScenario;
  internals.preparePromptInput = async () => ({
    renderedPrompt: "prompt",
    variables: {},
    knowledgeBaseId: null,
    knowledgeContext: ""
  });
  internals.getModelForScenario = async () => null;
  internals.shouldSaveFullAiContent = async () => false;
  internals.generateTextWithFallback = async () => ({ text: "完成" });

  const input = {
    userId: "user-1",
    learnerId: "learner-1" as string | null,
    rootScenarioId: "video-root",
    scenarioSlug: "video-guide-practice-questions",
    input: "生成练习"
  };
  const pending = service.generateScenarioTextForExternalBilling(input as never);
  await Promise.resolve();
  input.learnerId = "learner-sibling";
  input.rootScenarioId = "forged-later-root";
  releaseAuthorization();
  await pending;

  assert.deepEqual(authorizationCalls, [[{
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "video-root"
  }, "video-guide-practice-questions"]]);
  assert.equal(createdData[0]?.userId, "user-1");
  assert.equal(createdData[0]?.learnerId, "learner-1");
});

test("视频、英文和闪卡子任务的实际 AiTask data 保留完整服务端归属", async () => {
  const childScenarios = [
    ["video-guide-practice-questions", "video-child", "video-root"],
    ["english-guided-study-practice", "english-child", "english-root"],
    ["learning-flashcards-deck", "flashcards-child", "flashcards-root"]
  ] as const;
  const authorizationCalls: unknown[] = [];
  const createdData: Array<Record<string, unknown>> = [];
  const service = new AiService({} as never, {
    assertInternalScenarioAuthorized: async (...args: unknown[]) => {
      authorizationCalls.push(args);
    }
  } as never);
  Object.defineProperty(service, "prisma", {
    value: {
      aiTask: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData.push(data);
          return { id: `ai-child-${createdData.length}`, providerName: null, modelName: null, ...data };
        },
        update: async ({ where }: { where: { id: string } }) => ({ id: where.id })
      }
    }
  });
  const internals = service as unknown as {
    ensureVideoGuidePracticeQuestionsScenario(): Promise<Record<string, unknown>>;
    ensureEnglishGuidedStudyPracticeScenario(): Promise<Record<string, unknown>>;
    ensureLearningFlashcardsDeckScenario(): Promise<Record<string, unknown>>;
    preparePromptInput(): Promise<Record<string, unknown>>;
    getModelForScenario(): Promise<null>;
    shouldSaveFullAiContent(): Promise<boolean>;
    generateTextWithFallback(): Promise<Record<string, unknown>>;
  };
  const scenario = (id: string, slug: string) => ({ ...aiScenario, id, slug });
  internals.ensureVideoGuidePracticeQuestionsScenario = async () => scenario("video-child", "video-guide-practice-questions");
  internals.ensureEnglishGuidedStudyPracticeScenario = async () => scenario("english-child", "english-guided-study-practice");
  internals.ensureLearningFlashcardsDeckScenario = async () => scenario("flashcards-child", "learning-flashcards-deck");
  internals.preparePromptInput = async () => ({
    renderedPrompt: "prompt",
    variables: {},
    knowledgeBaseId: null,
    knowledgeContext: ""
  });
  internals.getModelForScenario = async () => null;
  internals.shouldSaveFullAiContent = async () => false;
  internals.generateTextWithFallback = async () => ({ text: "完成" });

  for (const [scenarioSlug, , rootScenarioId] of childScenarios) {
    await service.generateScenarioTextForExternalBilling({
      userId: "user-1",
      learnerId: "learner-1",
      rootScenarioId,
      scenarioSlug,
      input: "生成学习内容"
    });
  }

  assert.deepEqual(
    createdData.map(({ userId, learnerId, scenarioId }) => ({ userId, learnerId, scenarioId })),
    childScenarios.map(([, scenarioId]) => ({
      userId: "user-1",
      learnerId: "learner-1",
      scenarioId
    }))
  );
  assert.deepEqual(
    authorizationCalls,
    childScenarios.map(([scenarioSlug, , rootScenarioId]) => [{
      userId: "user-1",
      learnerId: "learner-1",
      rootScenarioId
    }, scenarioSlug])
  );
});

test("英文图片提取和学习闪卡生产服务把完整归属传给 AI 子任务", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const ai = {
    generateScenarioTextForExternalBilling: async (input: Record<string, unknown>) => {
      calls.push(input);
      return {
        taskId: `task-${calls.length}`,
        text: calls.length === 1
          ? JSON.stringify({ title: "图片正文", bodyText: "English text", ignoredContent: "" })
          : "{}",
        providerName: null,
        modelName: null
      };
    }
  };
  const attribution = {
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "english-root"
  };
  const english = new EnglishGuidedStudyService({} as never, ai as never, {} as never, {} as never);
  await english.extractImageText(attribution, {
    imageName: "lesson.png",
    imageMimeType: "image/png",
    imageSizeBytes: 128,
    imageDataUrl: "data:image/png;base64,AA=="
  });

  const flashcards = new LearningFlashcardsService(ai as never, {} as never);
  Object.assign(flashcards as unknown as Record<string, unknown>, {
    resolveGenerationSource: async () => ({
      title: "闪卡来源",
      sourceName: "来源",
      sourceText: "source text",
      textbookId: null,
      textbookRange: null
    }),
    createDeckRecord: async () => ({ id: "deck-1" })
  });
  await flashcards.generateDeck({
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "flashcards-root"
  }, {
    sourceType: "UPLOAD",
    sourceText: "source text",
    strategy: "SUBJECT_KNOWLEDGE",
    cardTypes: ["问答卡"],
    targetCardCount: 3
  });

  assert.deepEqual(calls.map(({ userId, learnerId, rootScenarioId, scenarioSlug }) => ({
    userId,
    learnerId,
    rootScenarioId,
    scenarioSlug
  })), [
    {
      userId: "user-1",
      learnerId: "learner-1",
      rootScenarioId: "english-root",
      scenarioSlug: "english-guided-study-image-extraction"
    },
    {
      userId: "user-1",
      learnerId: "learner-1",
      rootScenarioId: "flashcards-root",
      scenarioSlug: "learning-flashcards-deck"
    }
  ]);
});

const audioModel = {
  modelInstanceId: "audio-model-1",
  providerInstanceId: "audio-provider-1",
  providerKey: "audio-provider",
  providerName: "语音提供商",
  providerDisplayName: "语音提供商",
  adapterType: "DASHSCOPE_AUDIO",
  modelName: "tts-model",
  baseUrl: "https://audio.example.com",
  webSocketUrl: null,
  region: null,
  apiKeyEncrypted: null,
  apiKeyEnvName: "TEST_AUDIO_KEY",
  capabilityTags: ["TTS"],
  inputPrice: 0,
  outputPrice: 0,
  pricingMode: "CHARACTERS",
  pricingUnit: "CHARACTER",
  pricingConfig: null
};

function installAudioCreateFixture(service: AudioService) {
  const createdData: Array<Record<string, unknown>> = [];
  const transaction = {
    audioTask: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData.push(data);
        return { id: `audio-task-${createdData.length}`, createdAt: new Date(), ...data };
      },
      update: async ({ where }: { where: { id: string } }) => ({ id: where.id, createdAt: new Date() })
    },
    ...membershipWalletFixture(),
    $queryRaw: async () => [],
    wallet: {
      upsert: async () => ({}),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ availableCredits: 99 })
    },
    creditReservation: { create: async () => ({ id: "reservation-1" }) },
    ledgerEntry: { create: async () => ({ id: "ledger-1" }) }
  };
  Object.defineProperty(service, "prisma", {
    value: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)
    }
  });
  const internals = service as unknown as {
    ensureDashScopeAudioDefaults(): Promise<void>;
    resolvePreferredTtsModel(): Promise<Record<string, unknown>>;
    getModelByAlias(): Promise<Record<string, unknown>>;
    resolveVoice(): Promise<Record<string, unknown>>;
    calculatePricingQuote(): Promise<Record<string, unknown>>;
    ensureWallet(): Promise<void>;
    getTaskForExecution(context: unknown, id: string): Promise<Record<string, unknown>>;
  };
  internals.ensureDashScopeAudioDefaults = async () => undefined;
  internals.resolvePreferredTtsModel = async () => ({ modelNames: [], label: undefined });
  internals.getModelByAlias = async () => audioModel;
  internals.resolveVoice = async () => ({ providerVoiceId: "voice-1", voiceAssetId: null });
  internals.calculatePricingQuote = async () => ({
    estimatedCredits: 1,
    ruleId: "rule-1",
    pricingSource: "RULE",
    billingMode: "PER_CHARACTER",
    creditsPerUnit: 1,
    minimumCredits: 1,
    modelMultiplier: 1,
    usageCount: 1
  });
  internals.ensureWallet = async () => undefined;
  internals.getTaskForExecution = async (_context, id) => ({ id, status: "RESERVED" });
  return createdData;
}

test("音频任务写入服务端学习者和已校验根场景且账号显式写 null", async () => {
  for (const [attribution, expectedLearnerId, expectedScenarioId] of [
    [{ userId: "user-1", learnerId: "learner-1", rootScenarioId: "scenario-root" }, "learner-1", "scenario-root"],
    [{ userId: "user-1", learnerId: null, rootScenarioId: null }, null, null]
  ] as const) {
    const service = new AudioService();
    const createdData = installAudioCreateFixture(service);

    await service.createTtsTask(attribution as never, {
      text: "你好",
      scenarioId: "scenario-forged",
      userId: "user-forged",
      learnerId: "learner-forged"
    } as never);

    assert.equal(createdData.length, 1);
    assert.equal(createdData[0]?.userId, "user-1");
    assert.equal(createdData[0]?.learnerId, expectedLearnerId);
    assert.equal(createdData[0]?.scenarioId, expectedScenarioId);
  }
});

test("音频账号查询按 owner 汇总，学习者详情在数据库拒绝兄弟、旧空归属和跨用户记录", async () => {
  const findManyWhere: unknown[] = [];
  const findFirstWhere: unknown[] = [];
  const service = new AudioService();
  Object.defineProperty(service, "prisma", {
    value: {
      audioTask: {
        findMany: async ({ where }: { where: unknown }) => {
          findManyWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          findFirstWhere.push(where);
          return null;
        }
      }
    }
  });

  await service.listUserTasks(accountSubject as never);
  await service.listUserTasks(learnerSubject as never);
  assert.deepEqual(findManyWhere, [
    { userId: "user-1" },
    { userId: "user-1", learnerId: "learner-1" }
  ]);

  await assert.rejects(
    service.getUserTask(accountSubject as never, "learner-owned-task"),
    (error: unknown) => error instanceof AppException && error.message === "语音任务不存在"
  );

  for (const id of ["sibling-task", "legacy-null-task", "cross-user-task"]) {
    await assert.rejects(
      service.getUserTask(learnerSubject as never, id),
      (error: unknown) => error instanceof AppException && error.message === "语音任务不存在"
    );
  }
  assert.deepEqual(findFirstWhere, [
    { id: "learner-owned-task", userId: "user-1" },
    { id: "sibling-task", userId: "user-1", learnerId: "learner-1" },
    { id: "legacy-null-task", userId: "user-1", learnerId: "learner-1" },
    { id: "cross-user-task", userId: "user-1", learnerId: "learner-1" }
  ]);
});

test("异步外部 TTS 在 await 前冻结原学习者和固定根场景", async () => {
  let releaseDefaults!: () => void;
  const defaultsGate = new Promise<void>((resolve) => {
    releaseDefaults = resolve;
  });
  const createdData: Array<Record<string, unknown>> = [];
  const service = new AudioService();
  Object.defineProperty(service, "prisma", {
    value: {
      audioTask: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData.push(data);
          return { id: "audio-child-1", ...data };
        }
      }
    }
  });
  const internals = service as unknown as {
    ensureDashScopeAudioDefaults(): Promise<void>;
    resolvePreferredTtsModel(): Promise<Record<string, unknown>>;
    getModelByAlias(): Promise<Record<string, unknown>>;
    resolveVoice(): Promise<Record<string, unknown>>;
    executeTtsTask(): Promise<Record<string, unknown>>;
  };
  internals.ensureDashScopeAudioDefaults = async () => defaultsGate;
  internals.resolvePreferredTtsModel = async () => ({ modelNames: [], label: undefined });
  internals.getModelByAlias = async () => audioModel;
  internals.resolveVoice = async () => ({ providerVoiceId: "voice-1", voiceAssetId: null });
  internals.executeTtsTask = async () => ({ id: "audio-child-1", status: "SUCCEEDED" });

  const attribution = {
    userId: "user-1",
    learnerId: "learner-1" as string | null,
    rootScenarioId: "video-root" as string | null
  };
  const pending = service.synthesizeTtsForExternalBilling(attribution as never, {
    text: "异步语音",
    source: "TOOL"
  });
  await Promise.resolve();
  attribution.learnerId = "learner-sibling";
  attribution.rootScenarioId = "forged-later-root";
  releaseDefaults();
  await pending;

  assert.equal(createdData[0]?.userId, "user-1");
  assert.equal(createdData[0]?.learnerId, "learner-1");
  assert.equal(createdData[0]?.scenarioId, "video-root");
});

test("字帖账号创建显式写 learner null 并忽略客户端伪造身份", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY_ID,
    secret: process.env.S3_SECRET_ACCESS_KEY
  };
  process.env.S3_ENDPOINT = "https://r2.example.com";
  process.env.S3_BUCKET = "copybooks";
  process.env.S3_ACCESS_KEY_ID = "test-access";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret";
  globalThis.fetch = async () => new Response(null, { status: 200 });

  try {
    const createdData: Array<Record<string, unknown>> = [];
    const wallet = {
      getWallet: async () => ({ availableCredits: 98 }),
      consumeCopybookGenerateCreditsInTransaction: async () => ({
        credits: 2,
        ...membershipWalletFixture(),
        wallet: { availableCredits: 98 }
      })
    };
    const service = new CopybooksService(
      { renderPdf: async () => Buffer.from("pdf") } as never,
      wallet as never
    );
    Object.defineProperty(service, "prisma", {
      value: {
        ...membershipWalletFixture(),
        wallet: { findUnique: async () => ({ availableCredits: 100 }) },
        $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
          copybookRecord: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              createdData.push(data);
              return { id: "copybook-1", createdAt: new Date(), ...data };
            }
          }
        })
      }
    });

    await service.generate(accountSubject as never, {
      layout: { pages: [{ watermark: null }] },
      userId: "user-forged",
      learnerId: "learner-forged"
    } as never);

    assert.equal(createdData[0]?.userId, "user-1");
    assert.equal(createdData[0]?.learnerId, null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("S3_ENDPOINT", originalEnv.endpoint);
    restoreEnv("S3_BUCKET", originalEnv.bucket);
    restoreEnv("S3_ACCESS_KEY_ID", originalEnv.accessKey);
    restoreEnv("S3_SECRET_ACCESS_KEY", originalEnv.secret);
  }
});

test("字帖账号列表、详情和删除查询只约束 owner 且 service 接收 ProfileSubject", async () => {
  const findManyWhere: unknown[] = [];
  const findFirstWhere: unknown[] = [];
  const service = new CopybooksService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      copybookRecord: {
        findMany: async ({ where }: { where: unknown }) => {
          findManyWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          findFirstWhere.push(where);
          return null;
        }
      }
    }
  });

  await service.list(accountSubject as never);
  await assert.rejects(service.pdf(accountSubject as never, "copybook-missing"), /字帖记录不存在/);
  await assert.rejects(service.delete(accountSubject as never, "copybook-missing"), /字帖记录不存在/);

  assert.deepEqual(findManyWhere, [{ userId: "user-1" }]);
  assert.deepEqual(findFirstWhere, [
    { id: "copybook-missing", userId: "user-1" },
    { id: "copybook-missing", userId: "user-1" }
  ]);
});

test("视频导学草稿从服务端身份写入归属且查询按当前身份复合过滤", async () => {
  const createdData: Array<Record<string, unknown>> = [];
  const findManyWhere: unknown[] = [];
  const findFirstWhere: unknown[] = [];
  const lesson = videoLessonRecord({ learnerId: "learner-1" });
  const service = new VideoGuideService({} as never, {} as never, {} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      videoGuideLesson: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData.push(data);
          return { ...lesson, ...data };
        },
        findMany: async ({ where }: { where: unknown }) => {
          findManyWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          findFirstWhere.push(where);
          return null;
        }
      }
    }
  });

  await service.createDraftLesson(learnerSubject as never, {
    mediaName: "lesson.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example.com/lesson.mp4",
    userId: "forged-user",
    learnerId: "forged-learner"
  } as never);
  await service.createDraftLesson(accountSubject, {
    mediaName: "account-lesson.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 2048,
    mediaUrl: "https://cdn.example.com/account-lesson.mp4"
  });
  await service.listUserLessons(accountSubject as never);
  await service.listUserLessons(learnerSubject as never);
  await assert.rejects(
    service.getUserLesson(learnerSubject as never, "sibling-or-legacy"),
    /导学课件不存在/
  );

  assert.deepEqual(createdData.map(({ userId, learnerId }) => ({ userId, learnerId })), [
    { userId: "user-1", learnerId: "learner-1" },
    { userId: "user-1", learnerId: null }
  ]);
  assert.deepEqual(findManyWhere, [
    { userId: "user-1" },
    { userId: "user-1", learnerId: "learner-1" }
  ]);
  assert.deepEqual(findFirstWhere, [
    { id: "sibling-or-legacy", userId: "user-1", learnerId: "learner-1" }
  ]);
});

test("视频导学直接创建课件把服务端学习者写入实际 lesson data", async () => {
  let createdData: Record<string, unknown> | undefined;
  const lesson = videoLessonRecord({ learnerId: "learner-1", status: "QUEUED" });
  const transaction = {
    videoGuideLesson: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return { ...lesson, ...data };
      }
    }
  };
  const service = new VideoGuideService({} as never, {} as never, {} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      videoGuideLesson: { findUnique: async () => null },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)
    }
  });
  Object.assign(service as unknown as Record<string, unknown>, {
    estimateLessonGeneration: async () => ({ estimatedCredits: 1 }),
    assertBillingConfirmed: () => undefined,
    reserveVideoGuideCredits: async () => undefined,
    scheduleGeneration: () => undefined
  });

  await service.createLesson(learnerSubject, {
    mediaName: "lesson.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example.com/lesson.mp4",
    subtitleName: "lesson.srt",
    subtitleFormat: "SRT",
    subtitleSizeBytes: 64,
    subtitleUrl: "https://cdn.example.com/lesson.srt",
    subtitleText: "1\n00:00:00,000 --> 00:00:01,000\nHello world.",
    billingConfirmed: true
  });

  assert.equal(createdData?.userId, "user-1");
  assert.equal(createdData?.learnerId, "learner-1");
});

test("视频导学异步子任务只从持久化课件恢复原学习者和固定根场景", async () => {
  const authorizationCalls: unknown[] = [];
  const service = new VideoGuideService({} as never, {} as never, {} as never, {
    assertScenarioAuthorized: async (...args: unknown[]) => {
      authorizationCalls.push(args);
      return { id: "video-root", slug: "video-guide-narration" };
    },
    runWithScenarioAuthorization: async (_subject: unknown, _slug: string, callback: () => Promise<unknown>) => callback()
  } as never);
  Object.defineProperty(service, "prisma", {
    value: {
      videoGuideLesson: {
        findUnique: async () => ({ userId: "user-1", learnerId: "learner-1" })
      }
    }
  });
  let childAttribution: unknown;

  await (service as unknown as {
    runWithStoredLessonAuthorization(
      lessonId: string,
      callback: (attribution: unknown) => Promise<void>
    ): Promise<void>;
  }).runWithStoredLessonAuthorization("lesson-1", async (attribution) => {
    childAttribution = attribution;
  });

  assert.deepEqual(authorizationCalls, [[learnerSubject, "video-guide-narration"]]);
  assert.deepEqual(childAttribution, {
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "video-root"
  });
});

test("英文带学新排队记录写入当前学习者且账号与学习者查询条件不同", async () => {
  const createdData: Array<Record<string, unknown>> = [];
  const findManyWhere: unknown[] = [];
  const findFirstWhere: unknown[] = [];
  const material = englishMaterialRecord({ learnerId: "learner-1" });
  const transaction = {
    englishGuidedStudyMaterial: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData.push(data);
        return { ...material, ...data };
      }
    }
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, {} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction),
      englishGuidedStudyMaterial: {
        findMany: async ({ where }: { where: unknown }) => {
          findManyWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          findFirstWhere.push(where);
          return null;
        }
      }
    }
  });
  Object.assign(service as unknown as Record<string, unknown>, {
    estimateMaterialGeneration: async () => ({
      availableCredits: 100,
      enoughCredits: true,
      estimatedCredits: 1,
      items: [],
      operation: "ENGLISH_GUIDED_STUDY_CONTENT",
      requestId: "billing-request-0001",
      revision: "revision-1",
      title: "生成英文带学讲稿"
    }),
    lockEnglishGuidedStudyMaterial: async () => undefined,
    reserveEnglishGuidedStudyCredits: async () => undefined,
    scheduleEnglishGuidedStudyOperation: () => undefined
  });

  await service.submitMaterialGeneration(learnerSubject as never, {
    title: "Hello",
    sourceType: "TEXT",
    sourceText: "Hello world.",
    levelStandardName: "学段",
    levelOptionLabel: "三年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE",
    billingConfirmed: true,
    billingRequestId: "billing-request-0001",
    billingRevision: "revision-1",
    userId: "forged-user",
    learnerId: "forged-learner"
  } as never);
  await service.submitMaterialGeneration(accountSubject, {
    title: "Account Hello",
    sourceType: "TEXT",
    sourceText: "Hello from account.",
    levelStandardName: "学段",
    levelOptionLabel: "三年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE",
    billingConfirmed: true,
    billingRequestId: "billing-request-account",
    billingRevision: "revision-1"
  });
  await service.listUserMaterials(accountSubject as never);
  await service.listUserMaterials(learnerSubject as never);
  await assert.rejects(
    service.getUserMaterial(learnerSubject as never, "sibling-or-legacy"),
    /英文带学材料不存在/
  );

  assert.deepEqual(createdData.map(({ userId, learnerId }) => ({ userId, learnerId })), [
    { userId: "user-1", learnerId: "learner-1" },
    { userId: "user-1", learnerId: null }
  ]);
  assert.deepEqual(findManyWhere, [
    { userId: "user-1" },
    { userId: "user-1", learnerId: "learner-1" }
  ]);
  assert.deepEqual(findFirstWhere, [
    { id: "sibling-or-legacy", userId: "user-1", learnerId: "learner-1" }
  ]);
});

test("英文带学异步恢复只从持久化材料传播原学习者和固定根场景", async () => {
  const authorizationCalls: unknown[] = [];
  const service = new EnglishGuidedStudyService({} as never, {} as never, {} as never, {
    assertScenarioAuthorized: async (...args: unknown[]) => {
      authorizationCalls.push(args);
      return { id: "english-root", slug: "english-guided-study-material" };
    },
    runWithScenarioAuthorization: async (_subject: unknown, _slug: string, callback: () => Promise<unknown>) => callback()
  } as never);
  Object.defineProperty(service, "prisma", {
    value: {
      englishGuidedStudyMaterial: {
        findUnique: async () => ({ userId: "user-1", learnerId: "learner-1" })
      }
    }
  });
  let childAttribution: unknown;

  await (service as unknown as {
    runWithStoredMaterialAuthorization(
      materialId: string,
      callback: (attribution: unknown) => Promise<void>
    ): Promise<void>;
  }).runWithStoredMaterialAuthorization("material-1", async (attribution) => {
    childAttribution = attribution;
  });

  assert.deepEqual(authorizationCalls, [[learnerSubject, "english-guided-study-material"]]);
  assert.deepEqual(childAttribution, {
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "english-root"
  });
});

test("闪卡生成和导入都把服务端学习者写入实际 deck data", async () => {
  const createdData: Array<Record<string, unknown>> = [];
  const ai = {
    generateScenarioTextForExternalBilling: async () => ({
      taskId: "task-1",
      text: JSON.stringify({
        title: "学习卡组",
        summary: "摘要",
        knowledgeMap: [],
        cards: [{ type: "问答", front: "A", back: "B", source: "课文", tags: [] }]
      }),
      providerName: null,
      modelName: null
    })
  };
  const service = new LearningFlashcardsService(ai as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      learningFlashcardDeck: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData.push(data);
          return flashcardDeckRecord(data);
        }
      }
    }
  });
  Object.assign(service as unknown as Record<string, unknown>, {
    resolveGenerationSource: async () => ({
      title: "学习卡组",
      sourceName: "课文",
      sourceText: "source text",
      textbookId: null,
      textbookRange: null
    })
  });

  const generatedDeck = await service.generateDeck({
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "flashcard-root"
  }, {
    sourceType: "UPLOAD",
    sourceText: "source text",
    strategy: "SUBJECT_KNOWLEDGE",
    cardTypes: ["问答"],
    targetCardCount: 1
  });
  const importedDeck = await service.importDeck(learnerSubject as never, {
    title: "导入卡组",
    importText: "front,back\nA,B",
    strategy: "SUBJECT_KNOWLEDGE",
    userId: "forged-user",
    learnerId: "forged-learner"
  } as never);
  const accountDeck = await service.importDeck(accountSubject, {
    title: "账号卡组",
    importText: "front,back\nC,D",
    strategy: "SUBJECT_KNOWLEDGE"
  });

  assert.deepEqual(createdData.map(({ userId, learnerId }) => ({ userId, learnerId })), [
    { userId: "user-1", learnerId: "learner-1" },
    { userId: "user-1", learnerId: "learner-1" },
    { userId: "user-1", learnerId: null }
  ]);
  for (const response of [generatedDeck, importedDeck]) {
    for (const forbidden of ["userId", "learnerId", "aiTask", "providerName", "modelName"]) {
      assert.equal(forbidden in (response as Record<string, unknown>), false, `学习者创建响应不得包含 ${forbidden}`);
    }
  }
  assert.equal(accountDeck.userId, "user-1");
  assert.equal(accountDeck.learnerId, null);
});

test("闪卡列表详情和编辑在学习者模式同时约束 owner 与 learner", async () => {
  const findManyWhere: unknown[] = [];
  const deckFindFirstWhere: unknown[] = [];
  const cardFindFirstWhere: unknown[] = [];
  let updateCalls = 0;
  const service = new LearningFlashcardsService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      learningFlashcardDeck: {
        findMany: async ({ where }: { where: unknown }) => {
          findManyWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: { where: unknown }) => {
          deckFindFirstWhere.push(where);
          return null;
        }
      },
      learningFlashcard: {
        findFirst: async ({ where }: { where: unknown }) => {
          cardFindFirstWhere.push(where);
          return null;
        },
        update: async () => {
          updateCalls += 1;
          return null;
        }
      }
    }
  });

  await service.listUserDecks(accountSubject as never);
  await service.listUserDecks(learnerSubject as never);
  await assert.rejects(service.getUserDeck(learnerSubject as never, "sibling-deck"), /闪卡组不存在/);
  await assert.rejects(service.updateCard(learnerSubject as never, "shared-card", { front: "篡改" }), /闪卡不存在/);

  assert.deepEqual(findManyWhere, [
    { userId: "user-1" },
    { userId: "user-1", learnerId: "learner-1" }
  ]);
  assert.deepEqual(deckFindFirstWhere, [
    { id: "sibling-deck", userId: "user-1", learnerId: "learner-1" }
  ]);
  assert.deepEqual(cardFindFirstWhere, [
    { id: "shared-card", deck: { userId: "user-1", learnerId: "learner-1" } }
  ]);
  assert.equal(updateCalls, 0);
});

test("学习者可复习获授权课程当前审核版本的共享卡组且只写自己的 review", async () => {
  const harness = sharedFlashcardReviewHarness("APPROVED_CURRENT");

  await harness.service.reviewCard(learnerSubject, "shared-card", { grade: "MASTERED" });

  const initialWhere = harness.candidateWheres()[0] as {
    revision: { is: { approvedFor: { is: Record<string, unknown> } } };
  };
  assert.deepEqual(initialWhere.revision.is.approvedFor.is.learnerAuthorizations, {
    some: { learnerId: "learner-1" }
  });
  assert.deepEqual(harness.reviewData(), [{
    userId: "user-1",
    learnerId: "learner-1",
    deckId: "shared-deck",
    cardId: "shared-card",
    grade: "MASTERED"
  }]);
});

test("主账号保留自有或已加入课程当前审核版本的共享闪卡复习能力", async () => {
  const harness = sharedFlashcardReviewHarness("APPROVED_CURRENT");

  await harness.service.reviewCard(accountSubject, "shared-card", { grade: "GOOD" });

  const initialWhere = harness.candidateWheres()[0] as {
    revision: { is: { approvedFor: { is: Record<string, unknown> } } };
  };
  const courseWhere = initialWhere.revision.is.approvedFor.is;
  assert.equal("learnerAuthorizations" in courseWhere, false);
  assert.deepEqual(courseWhere.OR, [
    { userId: "user-1" },
    { enrollments: { some: { userId: "user-1" } } }
  ]);
  assert.deepEqual(harness.reviewData(), [{
    userId: "user-1",
    learnerId: null,
    deckId: "shared-deck",
    cardId: "shared-card",
    grade: "GOOD"
  }]);
});

test("共享课程闪卡只在审核快照与当前实际卡组完全一致时于同一事务写复习", async () => {
  const harness = sharedFlashcardReviewHarness("APPROVED_CURRENT");

  const review = await harness.service.reviewCard(learnerSubject, "shared-card", { grade: "MASTERED" });

  assert.equal(review.id, "review-shared");
  assert.equal(harness.transactionCalls(), 1);
  assert.equal(harness.reviewWrites(), 1);
  assert.ok(harness.lockCalls() >= 6, "写入前必须锁定课程、publication、卡组、卡片与授权关系");
  assert.ok(
    harness.lockQueries().some((query) => (
      query.includes('FROM "learning_flashcard_decks"') && query.includes("FOR UPDATE")
    )),
    "共享卡组必须锁定父记录，阻止快照校验后并发新增卡片"
  );
  assert.deepEqual(harness.candidateWheres()[0], {
    materialType: "LEARNING_FLASHCARD",
    learningFlashcardDeckId: { not: null },
    learningFlashcardDeck: {
      is: {
        status: "READY",
        cards: { some: { id: "shared-card" } }
      }
    },
    publication: {
      is: {
        materialType: "LEARNING_FLASHCARD",
        learningFlashcardDeckId: { not: null },
        status: "APPROVED",
        approvedHash: { not: null }
      }
    },
    revision: {
      is: {
        approvedFor: {
          is: {
            approvedRevisionId: { not: null },
            publishedAt: { not: null },
            learnerAuthorizations: { some: { learnerId: "learner-1" } }
          }
        }
      }
    }
  });
});

test("共享课程闪卡实际内容漂移但审核状态陈旧时失败关闭且不写复习", async () => {
  const harness = sharedFlashcardReviewHarness("HASH_DRIFT");

  await assert.rejects(
    harness.service.reviewCard(learnerSubject, "shared-card", { grade: "GOOD" }),
    /闪卡不存在/
  );
  assert.equal(harness.reviewWrites(), 0);
});

test("共享课程闪卡 publication 当前 hash 已漂移时失败关闭且不写复习", async () => {
  const harness = sharedFlashcardReviewHarness("CURRENT_HASH_DRIFT");

  await assert.rejects(
    harness.service.reviewCard(learnerSubject, "shared-card", { grade: "GOOD" }),
    /闪卡不存在/
  );
  assert.equal(harness.reviewWrites(), 0);
});

test("学习账号复习已授权公开课程闪卡时不要求主账号先加入课程", async () => {
  const harness = sharedFlashcardReviewHarness("UNENROLLED");

  await harness.service.reviewCard(learnerSubject, "shared-card", { grade: "GOOD" });

  const courseWhere = (harness.candidateWheres()[0] as {
    revision: { is: { approvedFor: { is: Record<string, unknown> } } };
  }).revision.is.approvedFor.is;
  assert.equal("OR" in courseWhere, false);
  assert.equal(harness.reviewWrites(), 1);
});

for (const state of ["WITHDRAWN", "UNGRANTED", "SUPERSEDED_REVISION"] as const) {
  test(`共享课程闪卡在 ${state} 状态下失败关闭且不写复习`, async () => {
    const harness = sharedFlashcardReviewHarness(state);

    await assert.rejects(
      harness.service.reviewCard(learnerSubject, "shared-card", { grade: "GOOD" }),
      /闪卡不存在/
    );
    assert.equal(harness.reviewWrites(), 0);
  });
}

test("共享课程闪卡锁定后撤销授权时重检失败且不写复习", async () => {
  const harness = sharedFlashcardReviewHarness("REVOKED_ON_RECHECK");

  await assert.rejects(
    harness.service.reviewCard(learnerSubject, "shared-card", { grade: "GOOD" }),
    /闪卡不存在/
  );
  assert.equal(harness.transactionCalls(), 1);
  assert.equal(harness.reviewWrites(), 0);
});

test("未获授权或已撤审课程卡组不能复习且拒绝前不执行写入", async () => {
  const harness = sharedFlashcardReviewHarness("WITHDRAWN");

  await assert.rejects(
    harness.service.reviewCard(learnerSubject, "shared-card", { grade: "GOOD" }),
    /闪卡不存在/
  );
  assert.equal(harness.reviewWrites(), 0);
});

test("学习者更新或删除兄弟视频课件时拒绝且不执行 mutation", async () => {
  const findFirstWhere: unknown[] = [];
  let updateCalls = 0;
  let deleteCalls = 0;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async ({ where }: { where: unknown }) => {
        findFirstWhere.push(where);
        return null;
      },
      update: async () => {
        updateCalls += 1;
        return null;
      },
      delete: async () => {
        deleteCalls += 1;
        return null;
      }
    }
  };
  const service = new VideoGuideService({} as never, {} as never, {} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      videoGuideLesson: transaction.videoGuideLesson,
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)
    }
  });

  await assert.rejects(
    service.updateLessonTitle(learnerSubject, "sibling-video", { title: "越权修改" }),
    /导学课件不存在/
  );
  await assert.rejects(
    service.deleteUserLesson(learnerSubject, "legacy-video"),
    /导学课件不存在/
  );

  assert.deepEqual(findFirstWhere, [
    { id: "sibling-video", userId: "user-1", learnerId: "learner-1" },
    { id: "legacy-video", userId: "user-1", learnerId: "learner-1" }
  ]);
  assert.equal(updateCalls, 0);
  assert.equal(deleteCalls, 0);
});

test("学习者置顶或删除兄弟英文材料时拒绝且不执行 mutation", async () => {
  const findFirstWhere: unknown[] = [];
  let updateCalls = 0;
  let deleteCalls = 0;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    englishGuidedStudyMaterial: {
      findFirst: async ({ where }: { where: unknown }) => {
        findFirstWhere.push(where);
        return null;
      },
      delete: async () => {
        deleteCalls += 1;
        return null;
      }
    }
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, {} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      englishGuidedStudyMaterial: {
        findFirst: transaction.englishGuidedStudyMaterial.findFirst,
        update: async () => {
          updateCalls += 1;
          return null;
        }
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)
    }
  });

  await assert.rejects(service.pinMaterial(learnerSubject, "sibling-material"), /英文带学材料不存在/);
  await assert.rejects(service.deleteMaterial(learnerSubject, "legacy-material"), /英文带学材料不存在/);

  assert.deepEqual(findFirstWhere, [
    { id: "sibling-material", userId: "user-1", learnerId: "learner-1" },
    { id: "legacy-material", userId: "user-1", learnerId: "learner-1" }
  ]);
  assert.equal(updateCalls, 0);
  assert.equal(deleteCalls, 0);
});

test("学习者闪卡历史不返回账号归属和模型内部字段", async () => {
  const deck = {
    ...flashcardDeckRecord({
      userId: "user-1",
      learnerId: "learner-1",
      title: "学习卡组",
      sourceType: "UPLOAD",
      sourceName: "私密来源",
      textbookId: null,
      textbookRange: null,
      detailRequest: "只生成易错题",
      strategy: "SUBJECT_KNOWLEDGE",
      cardTypes: ["问答"],
      targetCardCount: 1,
      summary: "摘要",
      knowledgeMap: [],
      status: "READY",
      aiTaskId: "task-private",
      providerName: "provider-private",
      modelName: "model-private"
    }),
    aiTask: {
      id: "task-private",
      status: "SUCCEEDED",
      providerName: "provider-private",
      modelName: "model-private"
    }
  };
  const service = new LearningFlashcardsService({} as never, {} as never);
  Object.defineProperty(service, "prisma", {
    value: {
      learningFlashcardDeck: {
        findMany: async () => [deck]
      }
    }
  });

  const [response] = await service.listUserDecks(learnerSubject);
  for (const forbidden of ["userId", "learnerId", "aiTask", "providerName", "modelName"]) {
    assert.equal(forbidden in (response as Record<string, unknown>), false, `学习者闪卡响应不得包含 ${forbidden}`);
  }
});

function videoLessonRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-08-14T00:00:00.000Z");
  return {
    id: "lesson-1",
    userId: "user-1",
    learnerId: null,
    title: "视频导学",
    mediaName: "lesson.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example.com/lesson.mp4",
    mediaStorageKey: "lesson.mp4",
    subtitleName: null,
    subtitleFormat: null,
    subtitleSizeBytes: null,
    subtitleUrl: null,
    subtitleStorageKey: null,
    status: "DRAFT",
    shareToken: "share-token",
    content: {},
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    ...overrides
  };
}

function englishMaterialRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-08-14T00:00:00.000Z");
  return {
    id: "material-1",
    userId: "user-1",
    learnerId: null,
    title: "Hello",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "学段",
    levelOptionLabel: "三年级",
    aiLevel: "E1",
    summary: "",
    narration: "",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {},
    pinnedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function flashcardDeckRecord(data: Record<string, unknown>) {
  const now = new Date("2026-08-14T00:00:00.000Z");
  const nestedCards = (data.cards as { create?: Array<Record<string, unknown>> } | undefined)?.create ?? [];
  return {
    id: `deck-${String(data.title)}`,
    learnerId: null,
    sourceText: "",
    textbook: null,
    aiTask: null,
    errorMessage: null,
    reviews: [],
    createdAt: now,
    updatedAt: now,
    ...data,
    cards: nestedCards.map((card, index) => flashcardCardRecord(`card-${index + 1}`, `deck-${String(data.title)}`))
  };
}

function flashcardCardRecord(id: string, deckId: string) {
  const now = new Date("2026-08-14T00:00:00.000Z");
  return {
    id,
    deckId,
    type: "问答",
    front: "A",
    back: "B",
    source: "课文",
    tags: [],
    sortOrder: 0,
    reviews: [],
    createdAt: now,
    updatedAt: now
  };
}

type SharedFlashcardReviewState =
  | "APPROVED_CURRENT"
  | "HASH_DRIFT"
  | "CURRENT_HASH_DRIFT"
  | "WITHDRAWN"
  | "UNGRANTED"
  | "UNENROLLED"
  | "SUPERSEDED_REVISION"
  | "REVOKED_ON_RECHECK";

function sharedFlashcardReviewHarness(state: SharedFlashcardReviewState) {
  let transactionCount = 0;
  let writes = 0;
  let locks = 0;
  const lockQueries: string[] = [];
  let legacyCardQueries = 0;
  let candidateQueries = 0;
  const candidateWhere: unknown[] = [];
  const reviews: Array<Record<string, unknown>> = [];
  const approvedCard = flashcardCardRecord("shared-card", "shared-deck");
  const approvedDeck = {
    id: "shared-deck",
    userId: "course-author",
    learnerId: null,
    title: "审核闪卡",
    summary: "审核摘要",
    knowledgeMap: [],
    status: "READY",
    cards: [approvedCard]
  };
  const approvedHash = hashCourseSnapshot(snapshotCourseMaterial("LEARNING_FLASHCARD", approvedDeck));
  const currentDeck = state === "HASH_DRIFT"
    ? { ...approvedDeck, cards: [{ ...approvedCard, front: "审核后被修改" }] }
    : approvedDeck;
  const candidate = {
    id: "course-item-1",
    revisionId: "revision-approved",
    publicationId: "publication-1",
    learningFlashcardDeckId: "shared-deck",
    publication: {
      id: "publication-1",
      status: "APPROVED",
      approvedHash,
      currentHash: state === "CURRENT_HASH_DRIFT" ? "drifted-current-hash" : approvedHash,
      learningFlashcardDeckId: "shared-deck"
    },
    revision: {
      courseId: "course-1",
      approvedFor: {
        id: "course-1",
        userId: "course-author",
        approvedRevisionId: "revision-approved",
        publishedAt: new Date("2026-08-14T00:00:00.000Z")
      }
    }
  };
  const initiallyEligible = [
    "APPROVED_CURRENT",
    "HASH_DRIFT",
    "CURRENT_HASH_DRIFT",
    "UNENROLLED",
    "REVOKED_ON_RECHECK"
  ].includes(state);
  const transaction = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      locks += 1;
      lockQueries.push(Array.from(strings).join("?"));
      return [{ locked: 1 }];
    },
    learningFlashcard: {
      findFirst: async () => null
    },
    courseRevisionItem: {
      findFirst: async ({ where }: { where: unknown }) => {
        candidateWhere.push(where);
        candidateQueries += 1;
        if (!initiallyEligible) return null;
        if (state === "REVOKED_ON_RECHECK" && candidateQueries > 1) return null;
        return candidate;
      }
    },
    learningFlashcardDeck: {
      findUnique: async () => currentDeck
    },
    learningFlashcardReview: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes += 1;
        reviews.push(data);
        return { id: "review-shared", createdAt: new Date(), ...data };
      }
    }
  };
  const legacyPrisma = {
    ...transaction,
    learningFlashcard: {
      findFirst: async () => {
        legacyCardQueries += 1;
        return legacyCardQueries === 1 ? null : approvedCard;
      }
    },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => {
      transactionCount += 1;
      return callback(transaction);
    }
  };
  const service = new LearningFlashcardsService({} as never, {} as never);
  Object.defineProperty(service, "prisma", { value: legacyPrisma });

  return {
    candidateWheres: () => candidateWhere,
    lockCalls: () => locks,
    lockQueries: () => lockQueries,
    reviewData: () => reviews,
    reviewWrites: () => writes,
    service,
    transactionCalls: () => transactionCount
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
