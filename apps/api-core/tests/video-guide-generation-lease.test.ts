import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

import { VideoGuideService } from "../src/video-guide/video-guide.service.js";
import { videoGuideAsrCacheObjectKey } from "../src/video-guide/video-guide-asr-cache.js";
import { createVideoGuideSubtitleCheckpoint } from "../src/video-guide/video-guide-subtitle-checkpoint.js";
import type { NarrationGenerationCheckpoint } from "../src/video-guide/video-guide-narration-checkpoint.js";
import { createNarrationAudioProgress } from "../src/video-guide/video-guide-narration-progress.js";
import {
  createVideoGuideOperationProgress,
  updateVideoGuideOperationProgress
} from "../src/video-guide/video-guide-operation-progress.js";
import {
  createVideoGuideOperationJob,
  leaseVideoGuideOperationJob
} from "../src/video-guide/video-guide-operation-job.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};

interface VideoGuideServiceInternals {
  estimateNarrationAudioGeneration(
    subject: { mode: "ACCOUNT"; userId: string; learnerId: null },
    lessonId: string,
    dto: { narrationTtsModelAlias?: string; narrationVoice?: string }
  ): Promise<{
    estimatedCredits: number;
    revision?: string;
    items: Array<{ description: string; estimatedCredits: number }>;
  }>;
  calculateNarrationTtsAttemptActualCredits(
    content: unknown,
    job: {
      estimatedCredits: number;
      input: { billedCreditsBeforeAttempt?: number };
    }
  ): number;
  resolveNarrationTtsResumeBilling(
    client: {
      ledgerEntry: {
        findUnique(input: unknown): Promise<{ amount: number } | null>;
      };
    },
    content: unknown,
    expected: {
      draftRevision: string;
      narrationTtsModelAlias: string;
      narrationVoice: string;
      totalCredits: number;
    }
  ): Promise<{ billedCredits: number; checkpointId: string | null; remainingCredits: number }>;
  checkUploadedAsset(userId: string, dto: {
    assetType: "MEDIA";
    hash: string;
    originalName: string;
    sizeBytes: number;
  }): Promise<{ exists: boolean }>;
  createOrReferenceVideoGuideAsset(input: {
    assetType: "MEDIA";
    hash: string;
    mediaType: "VIDEO";
    mimeType: string;
    objectKey: string;
    originalName: string;
    sizeBytes: number;
    source: "UPLOAD";
    storageProvider: "S3";
    url: string;
    userId: string;
    asrCache: {
      objectKey: string;
      mimeType: string;
      sizeBytes: number;
    };
  }): Promise<unknown>;
  markGenerating(lessonId: string, generationId: string): Promise<boolean>;
  persistNarrationGenerationCheckpoint(
    lessonId: string,
    generationId: string,
    input: {
      sourceHash: string;
      totalBatches: number;
      nodes: Array<{
        id: string;
        type: "INTRO" | "SENTENCE" | "SUMMARY";
        title: string;
        script: string;
        chunks: unknown[];
      }>;
      metadata: {
        modelName: string | null;
        providerName: string | null;
        taskId: string;
      };
      completed: number;
      message: string;
    }
  ): Promise<NarrationGenerationCheckpoint>;
  prepareVideoGuideAsrMedia(input: {
    checkpoint: ReturnType<typeof createVideoGuideSubtitleCheckpoint>;
    dto: {
      language?: string;
      mediaMimeType: string;
      mediaName: string;
      mediaSizeBytes: number;
      mediaStorageKey: string;
      mediaUrl: string;
    };
    attemptId: string;
    jobId: string;
    mediaName: string;
    onExtracting: () => Promise<void>;
    onHeartbeat: () => Promise<void>;
    onUploading: () => Promise<void>;
    onUploaded: (
      file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
      objectKey: string,
      reusable: boolean
    ) => Promise<void>;
  }): Promise<{
    mediaUrl: string;
    mediaName: string;
    mediaMimeType: string;
    sizeBytes: number;
    objectKey: string | null;
    reusable?: boolean;
  }>;
  persistNarrationAudioProgress(
    lessonId: string,
    progress: ReturnType<typeof createNarrationAudioProgress>,
    lease: {
      attemptId: string;
      jobId: string;
      jobKey: "narrationTtsGenerationJob";
    }
  ): Promise<void>;
  synthesizeNarrationTimeline(
    lessonId: string,
    generationId: string,
    attribution: { userId: string; learnerId: string | null; rootScenarioId: string | null },
    draftNodes: Array<{
      id: string;
      type: "INTRO" | "SENTENCE" | "SUMMARY";
      title: string;
      script: string;
      chunks: unknown[];
      sentenceId?: string;
    }>,
    dto: { narrationTtsModelAlias: string; narrationVoice: string },
    voice: string,
    lease: { attemptId: string; jobId: string; jobKey: "narrationTtsGenerationJob" },
    previousProgress?: unknown
  ): Promise<{
    nodes: Array<{ id: string; audioTaskId: string }>;
    progress: ReturnType<typeof createNarrationAudioProgress>;
  }>;
  persistVideoGuideMediaPlaybackUpgrade(
    asset: {
      id: string;
      assetType: string;
      hash: string;
      sizeBytes: number;
      mimeType: string;
      mediaType: string | null;
      subtitleFormat: string | null;
      storageProvider: string;
      objectKey: string;
      url: string;
      asrObjectKey: string | null;
      asrMimeType: string | null;
      asrSizeBytes: number | null;
      asrPreparedAt: Date | null;
    },
    playbackFile: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    uploaded: { objectKey: string; url: string }
  ): Promise<unknown>;
  releaseVideoGuideAssetReference(assetRefId: string): Promise<void>;
  uploadMediaFile(userId: string, file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }, uploadId?: string): Promise<unknown>;
  getMediaUploadProgress(userId: string, uploadId: string): {
    percent: number;
    status: string;
  } | null;
}

function serviceWithPrisma(prisma: object) {
  const service = new VideoGuideService({} as never, {} as never, courseReviewService as never);
  Object.defineProperty(service, "prisma", { value: prisma });
  return service as unknown as VideoGuideServiceInternals;
}

function narrationTtsJob(attemptId: string) {
  return leaseVideoGuideOperationJob(
    createVideoGuideOperationJob({
      operation: "NARRATION_TTS",
      jobId: "job-1",
      operationKey: "operation-1",
      estimatedCredits: 10,
      input: {},
      now: "2026-07-16T00:00:00.000Z"
    }),
    attemptId
  );
}

function createPcmWav(durationSeconds = 1) {
  const sampleRate = 16_000;
  const sampleCount = sampleRate * durationSeconds;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 8_000), 44 + index * 2);
  }

  return buffer;
}

test("失败语音任务从消费流水累计已结算点数并计算剩余报价", async () => {
  const draftRevision = "a".repeat(64);
  const service = serviceWithPrisma({});
  const result = await service.resolveNarrationTtsResumeBilling(
    {
      ledgerEntry: {
        findUnique: async () => ({ amount: -116 })
      }
    },
    {
      narrationTtsGenerationProgress: { status: "FAILED" },
      narrationTtsGenerationJob: {
        version: 1,
        jobId: "job-1",
        attemptId: "attempt-1",
        operation: "NARRATION_TTS",
        operationKey: "operation-1",
        estimatedCredits: 156,
        input: {
          billedCreditsBeforeAttempt: 40,
          checkpointId: "checkpoint-1",
          draftRevision,
          narrationTtsModelAlias: "tts-default",
          narrationVoice: "longxiaoxia_v3"
        },
        createdAt: "2026-08-08T00:00:00.000Z"
      },
      narrationAudioProgress: {
        generationId: "checkpoint-1"
      }
    },
    {
      draftRevision,
      narrationTtsModelAlias: "tts-default",
      narrationVoice: "longxiaoxia_v3",
      totalCredits: 196
    }
  );

  assert.deepEqual(result, {
    billedCredits: 156,
    checkpointId: "checkpoint-1",
    remainingCredits: 40
  });
});

test("失败语音任务只结算本次新增完成且已校验的节点费用", () => {
  const service = serviceWithPrisma({});
  const actualCredits = service.calculateNarrationTtsAttemptActualCredits(
    {
      narrationDraftTimeline: [
        {
          id: "intro",
          type: "INTRO",
          title: "导入",
          script: "a".repeat(900),
          chunks: []
        },
        {
          id: "s_001",
          type: "SENTENCE",
          title: "第一句",
          script: "b".repeat(900),
          chunks: []
        }
      ],
      narrationAudioProgress: {
        nodes: [
          { nodeId: "intro", status: "SUCCEEDED" },
          { nodeId: "s_001", status: "SUCCEEDED" }
        ]
      }
    },
    {
      estimatedCredits: 8,
      input: { billedCreditsBeforeAttempt: 28 }
    }
  );

  assert.equal(actualCredits, 8);
});

test("同文案同音色断点重试的费用接口只返回尚未结算点数", async () => {
  const draft = [
    {
      id: "intro",
      type: "INTRO",
      title: "导入",
      script: "a".repeat(900),
      chunks: []
    },
    {
      id: "s_001",
      type: "SENTENCE",
      title: "第一句",
      script: "b".repeat(900),
      chunks: []
    }
  ];
  const draftRevision = createHash("sha256")
    .update(JSON.stringify(draft.map(({ id, script }) => [id, script])))
    .digest("hex");
  const service = serviceWithPrisma({
    ledgerEntry: {
      findUnique: async () => ({ amount: -28 })
    },
    videoGuideLesson: {
      findFirst: async () => ({
        id: "lesson-1",
        userId: "user-1",
        title: "费用测试",
        status: "FAILED",
        content: {
          narrationDraftTimeline: draft,
          narrationTtsGenerationProgress: { status: "FAILED" },
          narrationTtsGenerationJob: {
            version: 1,
            jobId: "job-1",
            attemptId: "attempt-1",
            operation: "NARRATION_TTS",
            operationKey: "operation-1",
            estimatedCredits: 36,
            input: {
              billedCreditsBeforeAttempt: 0,
              checkpointId: "checkpoint-1",
              draftRevision,
              narrationTtsModelAlias: "tts-default",
              narrationVoice: "longxiaoxia_v3"
            },
            createdAt: "2026-08-08T00:00:00.000Z"
          },
          narrationAudioProgress: {
            generationId: "checkpoint-1"
          }
        }
      })
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 100 })
    }
  });

  const estimate = await service.estimateNarrationAudioGeneration({
    mode: "ACCOUNT",
    userId: "user-1",
    learnerId: null
  }, "lesson-1", {
    narrationTtsModelAlias: "tts-default",
    narrationVoice: "longxiaoxia_v3"
  });

  assert.equal(estimate.estimatedCredits, 8);
  assert.match(estimate.revision ?? "", /^[a-f0-9]{64}$/);
  assert.notEqual(estimate.revision, draftRevision);
});

test("整课讲解语音按实际送入 TTS 的文本字符计费", async () => {
  const script = `# ${"甲".repeat(499)}\n- ${"乙".repeat(500)}`;
  const service = serviceWithPrisma({
    videoGuideLesson: {
      findFirst: async () => ({
        id: "lesson-1",
        userId: "user-1",
        title: "精确计费测试",
        status: "SUCCEEDED",
        content: {
          narrationDraftTimeline: [{
            id: "intro",
            type: "INTRO",
            title: "导入",
            script,
            chunks: []
          }]
        }
      })
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 100 })
    }
  });

  const estimate = await service.estimateNarrationAudioGeneration({
    mode: "ACCOUNT",
    userId: "user-1",
    learnerId: null
  }, "lesson-1");

  assert.equal(estimate.estimatedCredits, 28);
  assert.equal(estimate.items[0]?.estimatedCredits, 28);
  assert.match(estimate.items[0]?.description ?? "", /1000 个文稿字符/);
});

test("只有原子抢占 QUEUED 成功的调度者获得生成租约", async () => {
  const updates: unknown[] = [];
  const queuedProgress = createVideoGuideOperationProgress({
    operation: "NARRATION",
    phase: "QUEUED",
    message: "导学文案任务已提交",
    now: "2026-07-15T00:00:00.000Z",
    total: 100
  });
  const service = serviceWithPrisma({
    videoGuideLesson: {
      findUnique: async () => ({
        status: "QUEUED",
        content: {
          summary: "已有内容",
          narrationGenerationProgress: queuedProgress
        }
      }),
      updateMany: async (input: unknown) => {
        updates.push(input);
        return { count: 0 };
      }
    }
  });

  assert.equal(await service.markGenerating("lesson-1", "generation-2"), false);
  const update = updates[0] as {
    data: { content: { narrationGenerationId?: string; narrationGenerationProgress?: { status?: string } }; status: string };
    where: { id: string; status: string };
  };

  assert.deepEqual(update.where, { id: "lesson-1", status: "QUEUED" });
  assert.equal(update.data.status, "GENERATING");
  assert.equal(update.data.content.narrationGenerationId, "generation-2");
  assert.equal(update.data.content.narrationGenerationProgress?.status, "RUNNING");
});

test("每个成功文案部分通过 generationId CAS 同时写入检查点和进度", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const runningProgress = updateVideoGuideOperationProgress(
    createVideoGuideOperationProgress({
      operation: "NARRATION",
      phase: "QUEUED",
      message: "导学文案任务已提交",
      now: "2026-07-16T00:00:00.000Z",
      total: 100
    }),
    {
      status: "RUNNING",
      phase: "WRITING"
    },
    "2026-07-16T00:01:00.000Z"
  );
  const service = serviceWithPrisma({
    videoGuideLesson: {
      findUnique: async () => ({
        status: "GENERATING",
        content: {
          summary: "已有内容",
          narrationGenerationId: "generation-1",
          narrationGenerationProgress: runningProgress
        }
      }),
      updateMany: async (input: Record<string, unknown>) => {
        updates.push(input);
        return { count: 1 };
      }
    }
  });

  const checkpoint = await service.persistNarrationGenerationCheckpoint(
    "lesson-1",
    "generation-1",
    {
      sourceHash: "source-hash",
      totalBatches: 2,
      nodes: [
        {
          id: "intro",
          type: "INTRO",
          title: "导入讲解",
          script: "课程导入。",
          chunks: []
        }
      ],
      metadata: {
        modelName: "qwen-plus",
        providerName: "aliyun",
        taskId: "task-intro"
      },
      completed: 20,
      message: "导入讲解已生成"
    }
  );

  const update = updates[0] as {
    where: Record<string, unknown>;
    data: {
      content: {
        summary: string;
        narrationGenerationCheckpoint: NarrationGenerationCheckpoint;
        narrationGenerationProgress: { completed: number; message: string };
      };
    };
  };
  assert.equal(checkpoint.nodes[0]?.id, "intro");
  assert.deepEqual(update.where, {
    id: "lesson-1",
    status: "GENERATING",
    content: {
      path: ["narrationGenerationId"],
      equals: "generation-1"
    }
  });
  assert.equal(update.data.content.summary, "已有内容");
  assert.equal(update.data.content.narrationGenerationCheckpoint.nodes[0]?.id, "intro");
  assert.equal(update.data.content.narrationGenerationProgress.completed, 20);
  assert.equal(update.data.content.narrationGenerationProgress.message, "导入讲解已生成");
});

test("逐句语音进度写入使用任务 attemptId 作为数据库 CAS 条件", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const runningProgress = updateVideoGuideOperationProgress(
    createVideoGuideOperationProgress({
      operation: "NARRATION_TTS",
      phase: "QUEUED",
      message: "导学文案任务已提交",
      now: "2026-07-15T00:00:00.000Z",
      total: 100
    }),
    {
      status: "RUNNING",
      phase: "PREPARING"
    },
    "2026-07-15T00:01:00.000Z"
  );
  const service = serviceWithPrisma({
    videoGuideLesson: {
      findUnique: async () => ({
        status: "GENERATING",
        content: {
          summary: "已有内容",
          narrationTtsGenerationJob: narrationTtsJob("attempt-1"),
          narrationTtsGenerationProgress: runningProgress
        }
      }),
      updateMany: async (input: Record<string, unknown>) => {
        updates.push(input);
        return { count: 1 };
      }
    }
  });
  const progress = createNarrationAudioProgress(
    "generation-1",
    [{ id: "intro", type: "INTRO" }],
    "2026-07-14T00:00:00.000Z"
  );

  await service.persistNarrationAudioProgress("lesson-1", progress, {
    attemptId: "attempt-1",
    jobId: "job-1",
    jobKey: "narrationTtsGenerationJob"
  });

  assert.deepEqual((updates[0]?.where as Record<string, unknown>).AND, [
    {
      content: {
        path: ["narrationTtsGenerationJob", "jobId"],
        equals: "job-1"
      }
    },
    {
      content: {
        path: ["narrationTtsGenerationJob", "attemptId"],
        equals: "attempt-1"
      }
    }
  ]);
});

test("旧语音任务 attemptId 不能覆盖新一轮生成进度", async () => {
  let updateCalled = false;
  const service = serviceWithPrisma({
    videoGuideLesson: {
      findUnique: async () => ({
        status: "GENERATING",
        content: {
          narrationTtsGenerationJob: narrationTtsJob("attempt-2")
        }
      }),
      updateMany: async () => {
        updateCalled = true;
        return { count: 1 };
      }
    }
  });
  const oldProgress = createNarrationAudioProgress(
    "generation-1",
    [{ id: "intro", type: "INTRO" }],
    "2026-07-14T00:00:00.000Z"
  );

  await assert.rejects(
    () =>
      service.persistNarrationAudioProgress("lesson-1", oldProgress, {
        attemptId: "attempt-1",
        jobId: "job-1",
        jobKey: "narrationTtsGenerationJob"
      }),
    /当前导学课件已开始新的生成任务/
  );
  assert.equal(updateCalled, false);
});

test("恢复语音任务时服务层只合成未完成节点", async (context) => {
  const previousPublicBaseUrl = process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.xueleai.com";
  context.after(() => {
    if (previousPublicBaseUrl === undefined) {
      delete process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
    } else {
      process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = previousPublicBaseUrl;
    }
  });

  const calls: string[] = [];
  const persisted: Array<ReturnType<typeof createNarrationAudioProgress>> = [];
  const draftNodes = [
    { id: "intro", type: "INTRO" as const, title: "导入", script: "导入", chunks: [] },
    {
      id: "s_001",
      type: "SENTENCE" as const,
      sentenceId: "s_001",
      title: "第一句",
      script: "第一句",
      chunks: []
    }
  ];
  const taskForNode = (nodeId: string) => {
    const taskId = `${nodeId}-task`;
    const objectKey = `video-guide/narration/lesson-1/job-1/${taskId}.mp3`;

    return {
      id: taskId,
      status: "SUCCEEDED",
      errorCode: null,
      errorMessage: null,
      providerPayload: {
        persistence: {
          status: "SUCCEEDED",
          storageProvider: "S3",
          objectKey,
          url: `https://cdn.xueleai.com/${objectKey}`,
          mimeType: "audio/mpeg",
          sizeBytes: 1024,
          sha256: "b".repeat(64)
        }
      },
      outputAudioAsset: {
        id: `${nodeId}-asset`,
        storageProvider: "S3",
        objectKey,
        url: `https://cdn.xueleai.com/${objectKey}`,
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
        durationMs: null
      }
    };
  };
  const audioService = {
    findVerifiedVideoGuideNarrationTask: async (
      _userId: string,
      input: { nodeId: string }
    ) => (input.nodeId === "intro" ? taskForNode("intro") : null),
    synthesizeTtsForExternalBilling: async (
      _userId: string,
      input: {
        text: string;
        onPersistenceStatus: (event: {
          stage: "UPLOADING" | "VERIFYING";
          audioTaskId: string;
        }) => Promise<void>;
      }
    ) => {
      calls.push(input.text);
      const nodeId = input.text === "导入" ? "intro" : "s_001";
      const taskId = `${nodeId}-task`;

      await input.onPersistenceStatus({ stage: "UPLOADING", audioTaskId: taskId });
      await input.onPersistenceStatus({ stage: "VERIFYING", audioTaskId: taskId });

      return taskForNode(nodeId);
    }
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.defineProperty(service, "persistNarrationAudioProgress", {
    value: async (_lessonId: string, progress: ReturnType<typeof createNarrationAudioProgress>) => {
      persisted.push(progress);
    }
  });
  Object.defineProperty(service, "narrationTtsRateLimiter", {
    value: { acquire: async () => undefined }
  });

  const result = await (service as unknown as VideoGuideServiceInternals).synthesizeNarrationTimeline(
    "lesson-1",
    "job-1",
    { userId: "user-1", learnerId: null, rootScenarioId: null },
    draftNodes,
    { narrationTtsModelAlias: "tts-default", narrationVoice: "longxia" },
    "longxia",
    { attemptId: "attempt-1", jobId: "job-1", jobKey: "narrationTtsGenerationJob" }
  );

  assert.deepEqual(calls, ["第一句"]);
  assert.equal(persisted[0]?.completed, 0);
  assert.equal(persisted.some((progress) => progress.completed === 1), true);
  assert.equal(result.progress.completed, 2);
  assert.deepEqual(result.nodes.map((node) => node.id), ["intro", "s_001"]);
});

test("失效执行器会撤销已创建的字幕素材引用", async () => {
  const calls: string[] = [];
  const service = serviceWithPrisma({
    $transaction: async (callback: (transaction: object) => Promise<void>) =>
      callback({
        videoGuideAssetRef: {
          findUnique: async () => ({ id: "ref-1", assetId: "asset-1" }),
          delete: async () => {
            calls.push("delete-ref");
          }
        },
        videoGuideAsset: {
          updateMany: async () => {
            calls.push("decrement-ref-count");
            return { count: 1 };
          }
        }
      })
  });

  await service.releaseVideoGuideAssetReference("ref-1");

  assert.deepEqual(calls, ["delete-ref", "decrement-ref-count"]);
});

test("创建媒体资产时原子保存识别音频缓存字段", async () => {
  let createdData: Record<string, unknown> | undefined;
  const service = serviceWithPrisma({
    $transaction: async (callback: (transaction: object) => Promise<unknown>) =>
      callback({
        videoGuideAssetRef: {
          create: async () => ({ id: "ref-1", assetId: "asset-1" })
        },
        videoGuideAsset: {
          update: async () => ({
            id: "asset-1",
            ...createdData,
            lastReferencedAt: new Date(),
            refCount: 1
          })
        }
      }),
    videoGuideAsset: {
      findUnique: async () => null,
      create: async (input: { data: Record<string, unknown> }) => {
        createdData = input.data;
        return {
          id: "asset-1",
          ...input.data
        };
      }
    }
  });

  await service.createOrReferenceVideoGuideAsset({
    assetType: "MEDIA",
    hash: `ab${"1".repeat(62)}`,
    mediaType: "VIDEO",
    mimeType: "video/mp4",
    objectKey: "video-guide/media/sha256/ab/video.mp4",
    originalName: "lesson.mp4",
    sizeBytes: 2_048,
    source: "UPLOAD",
    storageProvider: "S3",
    url: "https://cdn.xueleai.com/video-guide/media/sha256/ab/video.mp4",
    userId: "user-1",
    asrCache: {
      objectKey: "video-guide/asr-cache/sha256/ab/cache.m4a",
      mimeType: "audio/mp4",
      sizeBytes: 512
    }
  });

  assert.equal(createdData?.asrObjectKey, "video-guide/asr-cache/sha256/ab/cache.m4a");
  assert.equal(createdData?.asrMimeType, "audio/mp4");
  assert.equal(createdData?.asrSizeBytes, 512);
  assert.ok(createdData?.asrPreparedAt instanceof Date);
});

test("R2 媒体上传同时生成、校验并保存稳定识别音频缓存", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    publicBaseUrl: process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];
  let createdData: Record<string, unknown> | undefined;
  const source = createPcmWav();
  const hash = createHash("sha256").update(source).digest("hex");
  const expectedAsrObjectKey = videoGuideAsrCacheObjectKey(hash);

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    requests.push({ method, url });

    return method === "GET"
      ? new Response(Uint8Array.from([0]), { status: 206 })
      : new Response(null, { status: 200 });
  };

  try {
    const service = serviceWithPrisma({
      $transaction: async (callback: (transaction: object) => Promise<unknown>) =>
        callback({
          videoGuideAssetRef: {
            create: async () => ({ id: "ref-upload", assetId: "asset-upload" })
          },
          videoGuideAsset: {
            update: async () => ({
              id: "asset-upload",
              ...createdData,
              lastReferencedAt: new Date(),
              refCount: 1
            })
          }
        }),
      videoGuideAsset: {
        findUnique: async () => null,
        create: async (input: { data: Record<string, unknown> }) => {
          createdData = input.data;
          return {
            id: "asset-upload",
            ...input.data
          };
        }
      }
    });

    await service.uploadMediaFile("user-1", {
      buffer: source,
      mimetype: "audio/wav",
      originalname: "lesson.wav",
      size: source.length
    }, "upload-progress-1");

    assert.equal(requests.filter((request) => request.method === "PUT").length, 2);
    assert.equal(requests.filter((request) => request.method === "GET").length, 1);
    assert.ok(requests.some((request) => request.method === "PUT" && request.url.includes(expectedAsrObjectKey)));
    assert.equal(createdData?.asrObjectKey, expectedAsrObjectKey);
    assert.equal(createdData?.asrMimeType, "audio/mp4");
    assert.ok(typeof createdData?.asrSizeBytes === "number" && createdData.asrSizeBytes > 0);
    assert.equal(service.getMediaUploadProgress("user-1", "upload-progress-1")?.percent, 100);
    assert.equal(service.getMediaUploadProgress("user-1", "upload-progress-1")?.status, "SUCCEEDED");
    assert.equal(service.getMediaUploadProgress("user-2", "upload-progress-1"), null);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_PUBLIC_BASE_URL: previousEnv.publicBaseUrl,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("R2 PUT 长时间无响应时按配置超时并返回中文错误", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY,
    timeout: process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS
  };
  const previousFetch = globalThis.fetch;
  const source = createPcmWav();

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS = "20";
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async () => null
      }
    });
    const outcome = await Promise.race([
      service.uploadMediaFile("user-1", {
        buffer: source,
        mimetype: "audio/wav",
        originalname: "lesson.wav",
        size: source.length
      }).then(
        () => "unexpected-success",
        (error: unknown) => error instanceof Error ? error.message : String(error)
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("request-hung"), 150))
    ]);

    assert.equal(outcome, "Cloudflare R2 媒体文件上传超时");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS: previousEnv.timeout
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("字幕任务慢速上传期间持续续租并使用执行器独占临时 key", async () => {
  const source = createPcmWav();
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": source.length,
      "Content-Type": "audio/wav"
    });
    response.end(source);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    heartbeat: process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  let heartbeatDuringUpload = 0;
  let putStarted = false;
  let putUrl = "";

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS = "10";
  globalThis.fetch = async (input, init) => {
    if (init?.method === "PUT") {
      putStarted = true;
      putUrl = String(input);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(null, { status: 200 });
    }

    return new Response(Uint8Array.from([0]), { status: 206 });
  };

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async () => null
      }
    });
    const prepared = await service.prepareVideoGuideAsrMedia({
      checkpoint: createVideoGuideSubtitleCheckpoint({
        jobId: "job-temporary",
        now: "2026-07-22T08:00:00.000Z"
      }),
      attemptId: "attempt-two",
      dto: {
        mediaMimeType: "audio/wav",
        mediaName: "temporary.wav",
        mediaSizeBytes: source.length,
        mediaStorageKey: "video-guide/media/temporary.wav",
        mediaUrl: `http://127.0.0.1:${address.port}/temporary.wav`
      },
      jobId: "job-temporary",
      mediaName: "temporary.wav",
      onExtracting: async () => undefined,
      onHeartbeat: async () => {
        if (putStarted) {
          heartbeatDuringUpload += 1;
        }
      },
      onUploading: async () => undefined,
      onUploaded: async () => undefined
    });

    assert.ok(heartbeatDuringUpload > 0);
    assert.match(putUrl, /job-temporary-attempt-two-[a-f0-9]{16}\.m4a/);
    assert.match(prepared.objectKey ?? "", /job-temporary-attempt-two-[a-f0-9]{16}\.m4a$/);
  } finally {
    globalThis.fetch = previousFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS: previousEnv.heartbeat
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("字幕任务上传续租永久挂起时仍按上传截止时间退出", async () => {
  const source = createPcmWav();
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": source.length,
      "Content-Type": "audio/wav"
    });
    response.end(source);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    deleteTimeout: process.env.VIDEO_GUIDE_R2_DELETE_TIMEOUT_MS,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    heartbeat: process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY,
    timeout: process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS
  };
  const previousFetch = globalThis.fetch;
  let deleteStarted = false;
  let putStarted = false;

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS = "10";
  process.env.VIDEO_GUIDE_R2_DELETE_TIMEOUT_MS = "20";
  process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS = "20";
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PUT") {
      putStarted = true;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }

    if (init?.method === "DELETE") {
      deleteStarted = true;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }

    return new Response(Uint8Array.from([0]), { status: 206 });
  };

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async () => null
      }
    });
    const outcome = await Promise.race([
      service.prepareVideoGuideAsrMedia({
        checkpoint: createVideoGuideSubtitleCheckpoint({
          jobId: "job-stalled-heartbeat",
          now: "2026-07-22T08:00:00.000Z"
        }),
        attemptId: "attempt-stalled-heartbeat",
        dto: {
          mediaMimeType: "audio/wav",
          mediaName: "stalled-heartbeat.wav",
          mediaSizeBytes: source.length,
          mediaStorageKey: "video-guide/media/stalled-heartbeat.wav",
          mediaUrl: `http://127.0.0.1:${address.port}/stalled-heartbeat.wav`
        },
        jobId: "job-stalled-heartbeat",
        mediaName: "stalled-heartbeat.wav",
        onExtracting: async () => undefined,
        onHeartbeat: async () => {
          if (putStarted) {
            await new Promise<void>(() => undefined);
          }
        },
        onUploading: async () => undefined,
        onUploaded: async () => undefined
      }).then(
        () => "unexpected-success",
        (error: unknown) => error instanceof Error ? error.message : String(error)
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("request-hung"), 200))
    ]);

    assert.equal(outcome, "Cloudflare R2 媒体文件上传超时");
    assert.equal(deleteStarted, true);
  } finally {
    globalThis.fetch = previousFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS: previousEnv.heartbeat,
      VIDEO_GUIDE_R2_DELETE_TIMEOUT_MS: previousEnv.deleteTimeout,
      VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS: previousEnv.timeout
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("字幕任务临时音频上传成功后丢失租约时删除本次对象", async () => {
  const source = createPcmWav();
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": source.length,
      "Content-Type": "audio/wav"
    });
    response.end(source);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    heartbeat: process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY,
    timeout: process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS
  };
  const previousFetch = globalThis.fetch;
  let deleteCalls = 0;
  let putStarted = false;

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS = "10";
  process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS = "200";
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PUT") {
      putStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(null, { status: 200 });
    }

    if (init?.method === "DELETE") {
      deleteCalls += 1;
      return new Response(null, { status: 204 });
    }

    return new Response(Uint8Array.from([0]), { status: 206 });
  };

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async () => null
      }
    });
    const outcome = await service.prepareVideoGuideAsrMedia({
      checkpoint: createVideoGuideSubtitleCheckpoint({
        jobId: "job-lost-lease",
        now: "2026-07-22T08:00:00.000Z"
      }),
      attemptId: "attempt-lost-lease",
      dto: {
        mediaMimeType: "audio/wav",
        mediaName: "lost-lease.wav",
        mediaSizeBytes: source.length,
        mediaStorageKey: "video-guide/media/lost-lease.wav",
        mediaUrl: `http://127.0.0.1:${address.port}/lost-lease.wav`
      },
      jobId: "job-lost-lease",
      mediaName: "lost-lease.wav",
      onExtracting: async () => undefined,
      onHeartbeat: async () => {
        if (putStarted) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          throw new Error("字幕任务租约已失效");
        }
      },
      onUploading: async () => undefined,
      onUploaded: async () => undefined
    }).then(
      () => "unexpected-success",
      (error: unknown) => error instanceof Error ? error.message : String(error)
    );

    assert.equal(outcome, "字幕任务租约已失效");
    assert.equal(deleteCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS: previousEnv.heartbeat,
      VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS: previousEnv.timeout
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("字幕任务命中媒体资产缓存时不执行远程视频提取", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    disabled: process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  let extractingCalls = 0;

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED = "1";
  globalThis.fetch = async () => new Response(Uint8Array.from([0]), { status: 206 });

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async (input: { where?: { objectKey?: string } }) =>
          input.where?.objectKey
            ? {
                id: "asset-cache",
                assetType: "MEDIA",
                hash: `ab${"2".repeat(62)}`,
                sizeBytes: 10_000,
                mimeType: "video/mp4",
                mediaType: "VIDEO",
                subtitleFormat: null,
                storageProvider: "S3",
                objectKey: "video-guide/media/sha256/ab/video.mp4",
                url: "https://cdn.example.com/video-guide/media/sha256/ab/video.mp4",
                asrObjectKey: "video-guide/asr-cache/sha256/ab/cache.m4a",
                asrMimeType: "audio/mp4",
                asrSizeBytes: 2_048,
                asrPreparedAt: new Date("2026-07-22T08:00:00.000Z")
              }
            : null
      }
    });
    const prepared = await service.prepareVideoGuideAsrMedia({
      checkpoint: createVideoGuideSubtitleCheckpoint({
        jobId: "job-cache",
        now: "2026-07-22T08:00:00.000Z"
      }),
      attemptId: "attempt-cache",
      dto: {
        mediaMimeType: "video/mp4",
        mediaName: "lesson.mp4",
        mediaSizeBytes: 10_000,
        mediaStorageKey: "video-guide/media/sha256/ab/video.mp4",
        mediaUrl: "https://cdn.example.com/video-guide/media/sha256/ab/video.mp4"
      },
      jobId: "job-cache",
      mediaName: "lesson.mp4",
      onExtracting: async () => {
        extractingCalls += 1;
      },
      onHeartbeat: async () => undefined,
      onUploading: async () => undefined,
      onUploaded: async () => undefined
    });

    assert.equal(prepared.objectKey, "video-guide/asr-cache/sha256/ab/cache.m4a");
    assert.equal(prepared.reusable, true);
    assert.equal(extractingCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_PREPROCESS_DISABLED: previousEnv.disabled
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("历史课件持有旧媒体 key 时按 key 内哈希找到已升级共享资产", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    disabled: process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  const hash = `ab${"6".repeat(62)}`;

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED = "1";
  globalThis.fetch = async () => new Response(Uint8Array.from([0]), { status: 206 });

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async (input: {
          where?: {
            objectKey?: string;
            assetType_hash_sizeBytes?: { assetType: string; hash: string; sizeBytes: number };
          };
        }) =>
          input.where?.assetType_hash_sizeBytes
            ? {
                id: "asset-upgraded",
                assetType: "MEDIA",
                hash,
                sizeBytes: 10_000,
                mimeType: "video/mp4",
                mediaType: "VIDEO",
                subtitleFormat: null,
                storageProvider: "S3",
                objectKey: `video-guide/media/sha256/ab/66/${hash}.mp4`,
                url: `https://cdn.example.com/video-guide/media/sha256/ab/66/${hash}.mp4`,
                asrObjectKey: `video-guide/asr-cache/sha256/ab/${hash}.m4a`,
                asrMimeType: "audio/mp4",
                asrSizeBytes: 2_048,
                asrPreparedAt: new Date("2026-07-22T08:00:00.000Z")
              }
            : null
      }
    });
    const oldObjectKey = `video-guide/media/sha256/ab/66/${hash}.mov`;
    const prepared = await service.prepareVideoGuideAsrMedia({
      checkpoint: createVideoGuideSubtitleCheckpoint({
        jobId: "job-old-key",
        now: "2026-07-22T08:00:00.000Z"
      }),
      attemptId: "attempt-old-key",
      dto: {
        mediaMimeType: "video/quicktime",
        mediaName: "lesson.mov",
        mediaSizeBytes: 10_000,
        mediaStorageKey: oldObjectKey,
        mediaUrl: `https://cdn.example.com/${oldObjectKey}`
      },
      jobId: "job-old-key",
      mediaName: "lesson.mov",
      onExtracting: async () => undefined,
      onHeartbeat: async () => undefined,
      onUploading: async () => undefined,
      onUploaded: async () => undefined
    });

    assert.equal(prepared.objectKey, `video-guide/asr-cache/sha256/ab/${hash}.m4a`);
    assert.equal(prepared.reusable, true);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_PREPROCESS_DISABLED: previousEnv.disabled
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("媒体资产缓存不可读时清空缓存字段并回退原媒体", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    disabled: process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  const invalidations: Array<{
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }> = [];
  const asset = {
    id: "asset-invalid-cache",
    assetType: "MEDIA",
    hash: `ab${"3".repeat(62)}`,
    sizeBytes: 10_000,
    mimeType: "video/mp4",
    mediaType: "VIDEO",
    subtitleFormat: null,
    storageProvider: "S3",
    objectKey: "video-guide/media/sha256/ab/invalid-video.mp4",
    url: "https://cdn.example.com/video-guide/media/sha256/ab/invalid-video.mp4",
    asrObjectKey: "video-guide/asr-cache/sha256/ab/invalid-cache.m4a",
    asrMimeType: "audio/mp4",
    asrSizeBytes: 2_048,
    asrPreparedAt: new Date("2026-07-22T08:00:00.000Z")
  };

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED = "1";
  globalThis.fetch = async () => new Response(null, { status: 403 });

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async () => asset,
        updateMany: async (input: { data: Record<string, unknown>; where: Record<string, unknown> }) => {
          invalidations.push(input);
          return { count: 1 };
        }
      }
    });
    const prepared = await service.prepareVideoGuideAsrMedia({
      checkpoint: createVideoGuideSubtitleCheckpoint({
        jobId: "job-invalid-cache",
        now: "2026-07-22T08:00:00.000Z"
      }),
      attemptId: "attempt-invalid-cache",
      dto: {
        mediaMimeType: "video/mp4",
        mediaName: "lesson.mp4",
        mediaSizeBytes: 10_000,
        mediaStorageKey: asset.objectKey,
        mediaUrl: asset.url
      },
      jobId: "job-invalid-cache",
      mediaName: "lesson.mp4",
      onExtracting: async () => undefined,
      onHeartbeat: async () => undefined,
      onUploading: async () => undefined,
      onUploaded: async () => undefined
    });

    assert.equal(prepared.objectKey, null);
    assert.equal(prepared.reusable, false);
    assert.deepEqual(invalidations[0]?.data, {
      asrMimeType: null,
      asrObjectKey: null,
      asrPreparedAt: null,
      asrSizeBytes: null
    });
    assert.equal(invalidations[0]?.where.asrPreparedAt, asset.asrPreparedAt);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_PREPROCESS_DISABLED: previousEnv.disabled
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("重复上传命中旧媒体资产时利用本地缓冲区补齐识别音频缓存", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    publicBaseUrl: process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  const source = createPcmWav();
  const hash = createHash("sha256").update(source).digest("hex");
  const asrUpdates: Array<Record<string, unknown>> = [];
  const requests: Array<{ method: string; url: string }> = [];
  const asset = {
    id: "asset-existing",
    assetType: "MEDIA",
    hash,
    sizeBytes: source.length,
    mimeType: "audio/wav",
    mediaType: "AUDIO",
    subtitleFormat: null,
    storageProvider: "S3",
    objectKey: `video-guide/media/sha256/${hash.slice(0, 2)}/lesson.wav`,
    url: "https://cdn.example.com/video-guide/media/lesson.wav",
    asrObjectKey: null,
    asrMimeType: null,
    asrSizeBytes: null,
    asrPreparedAt: null
  };

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    requests.push({ method, url });

    return method === "GET"
      ? new Response(Uint8Array.from([0]), { status: 206 })
      : new Response(null, { status: 200 });
  };

  try {
    const service = serviceWithPrisma({
      $transaction: async (callback: (transaction: object) => Promise<unknown>) =>
        callback({
          videoGuideAssetRef: {
            create: async () => ({ id: "ref-existing", assetId: asset.id })
          },
          videoGuideAsset: {
            update: async () => ({ ...asset, refCount: 2 })
          }
        }),
      videoGuideAsset: {
        findUnique: async () => asset,
        update: async (input: { data: Record<string, unknown> }) => {
          asrUpdates.push(input.data);
          return { ...asset, ...input.data };
        }
      }
    });

    await service.uploadMediaFile("user-1", {
      buffer: source,
      mimetype: "audio/wav",
      originalname: "lesson.wav",
      size: source.length
    });

    assert.equal(requests.filter((request) => request.method === "PUT").length, 1);
    assert.equal(requests.filter((request) => request.method === "GET").length, 1);
    assert.equal(asrUpdates[0]?.asrObjectKey, videoGuideAsrCacheObjectKey(hash));
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_PUBLIC_BASE_URL: previousEnv.publicBaseUrl,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("查重命中缺少识别缓存的旧媒体时要求上传一次本地文件", async () => {
  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  let referenceCalls = 0;
  const hash = `ab${"4".repeat(62)}`;

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = "https://r2.example.com";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";

  try {
    const service = serviceWithPrisma({
      $transaction: async () => {
        referenceCalls += 1;
        throw new Error("缺少缓存时不应提前创建素材引用");
      },
      videoGuideAsset: {
        findUnique: async () => ({
          id: "asset-missing-cache",
          assetType: "MEDIA",
          hash,
          sizeBytes: 32_044,
          mimeType: "audio/wav",
          mediaType: "AUDIO",
          subtitleFormat: null,
          storageProvider: "S3",
          objectKey: "video-guide/media/sha256/ab/missing-cache.wav",
          url: "https://cdn.example.com/video-guide/media/missing-cache.wav",
          asrObjectKey: null,
          asrMimeType: null,
          asrSizeBytes: null,
          asrPreparedAt: null
        })
      }
    });

    const result = await service.checkUploadedAsset("user-1", {
      assetType: "MEDIA",
      hash,
      originalName: "lesson.wav",
      sizeBytes: 32_044
    });

    assert.equal(result.exists, false);
    assert.equal(referenceCalls, 0);
  } finally {
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("共享媒体升级网页播放格式时同步更新全部课件引用", async () => {
  const lessonUpdates: Array<Record<string, unknown>> = [];
  const asset = {
    id: "asset-playback",
    assetType: "MEDIA",
    hash: `ab${"5".repeat(62)}`,
    sizeBytes: 10_000,
    mimeType: "video/quicktime",
    mediaType: "VIDEO",
    subtitleFormat: null,
    storageProvider: "S3",
    objectKey: "video-guide/media/sha256/ab/original.mov",
    url: "https://cdn.example.com/video-guide/media/sha256/ab/original.mov",
    asrObjectKey: null,
    asrMimeType: null,
    asrSizeBytes: null,
    asrPreparedAt: null
  };
  const service = serviceWithPrisma({
    $transaction: async (callback: (transaction: object) => Promise<unknown>) =>
      callback({
        videoGuideAsset: {
          update: async (input: { data: Record<string, unknown> }) => ({
            ...asset,
            ...input.data
          })
        },
        videoGuideLesson: {
          updateMany: async (input: Record<string, unknown>) => {
            lessonUpdates.push(input);
            return { count: 2 };
          }
        }
      })
  });

  await service.persistVideoGuideMediaPlaybackUpgrade(
    asset,
    {
      buffer: Buffer.from("playback"),
      mimetype: "video/mp4",
      originalname: "lesson.mp4",
      size: 8_000
    },
    {
      objectKey: "video-guide/media/sha256/ab/playback.mp4",
      url: "https://cdn.example.com/video-guide/media/sha256/ab/playback.mp4"
    }
  );

  assert.deepEqual(lessonUpdates[0]?.where, {
    OR: [
      { mediaStorageKey: asset.objectKey },
      { mediaUrl: asset.url }
    ]
  });
  assert.deepEqual(lessonUpdates[0]?.data, {
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 8_000,
    mediaStorageKey: "video-guide/media/sha256/ab/playback.mp4",
    mediaUrl: "https://cdn.example.com/video-guide/media/sha256/ab/playback.mp4"
  });
});

test("历史媒体首次生成字幕时远程提取并回填稳定识别音频缓存", async () => {
  const source = createPcmWav();
  const hash = createHash("sha256").update(source).digest("hex");
  const asset = {
    id: "asset-history",
    assetType: "MEDIA",
    hash,
    sizeBytes: source.length,
    mimeType: "audio/wav",
    mediaType: "AUDIO",
    subtitleFormat: null,
    storageProvider: "S3",
    objectKey: `video-guide/media/sha256/${hash.slice(0, 2)}/history.wav`,
    url: "https://cdn.example.com/video-guide/media/history.wav",
    asrObjectKey: null,
    asrMimeType: null,
    asrSizeBytes: null,
    asrPreparedAt: null
  };
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": source.length,
      "Content-Type": "audio/wav"
    });
    response.end(source);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const previousEnv = {
    accessKeyId: process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET,
    disabled: process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED,
    driver: process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER,
    endpoint: process.env.VIDEO_GUIDE_R2_ENDPOINT,
    forcePathStyle: process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE,
    secretAccessKey: process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY
  };
  const previousFetch = globalThis.fetch;
  const cacheUpdates: Array<Record<string, unknown>> = [];
  let extractingCalls = 0;
  let uploadedReusable = false;

  process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER = "r2";
  process.env.VIDEO_GUIDE_R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.VIDEO_GUIDE_R2_BUCKET = "xueleai";
  process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID = "test-access";
  process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE = "1";
  delete process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED;
  globalThis.fetch = async (_input, init) =>
    init?.method === "PUT"
      ? new Response(null, { status: 200 })
      : new Response(Uint8Array.from([0]), { status: 206 });

  try {
    const service = serviceWithPrisma({
      videoGuideAsset: {
        findUnique: async () => asset,
        update: async (input: { data: Record<string, unknown> }) => {
          cacheUpdates.push(input.data);
          return { ...asset, ...input.data };
        }
      }
    });
    const prepared = await service.prepareVideoGuideAsrMedia({
      checkpoint: createVideoGuideSubtitleCheckpoint({
        jobId: "job-history",
        now: "2026-07-22T08:00:00.000Z"
      }),
      attemptId: "attempt-history",
      dto: {
        mediaMimeType: "audio/wav",
        mediaName: "history.wav",
        mediaSizeBytes: source.length,
        mediaStorageKey: asset.objectKey,
        mediaUrl: asset.url
      },
      jobId: "job-history",
      mediaName: "history.wav",
      onExtracting: async () => {
        extractingCalls += 1;
      },
      onHeartbeat: async () => undefined,
      onUploading: async () => undefined,
      onUploaded: async (_file, _objectKey, reusable) => {
        uploadedReusable = reusable;
      }
    });

    assert.equal(extractingCalls, 1);
    assert.equal(uploadedReusable, true);
    assert.equal(prepared.reusable, true);
    assert.equal(prepared.objectKey, videoGuideAsrCacheObjectKey(hash));
    assert.equal(cacheUpdates[0]?.asrObjectKey, videoGuideAsrCacheObjectKey(hash));
    assert.ok(cacheUpdates[0]?.asrPreparedAt instanceof Date);
  } finally {
    globalThis.fetch = previousFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries({
      VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER: previousEnv.driver,
      VIDEO_GUIDE_R2_ENDPOINT: previousEnv.endpoint,
      VIDEO_GUIDE_R2_BUCKET: previousEnv.bucket,
      VIDEO_GUIDE_R2_ACCESS_KEY_ID: previousEnv.accessKeyId,
      VIDEO_GUIDE_R2_SECRET_ACCESS_KEY: previousEnv.secretAccessKey,
      VIDEO_GUIDE_R2_FORCE_PATH_STYLE: previousEnv.forcePathStyle,
      VIDEO_GUIDE_ASR_PREPROCESS_DISABLED: previousEnv.disabled
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
