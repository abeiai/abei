import assert from "node:assert/strict";
import test from "node:test";

import { AudioService } from "../src/audio/audio.service.js";

interface AudioServiceInternals {
  releaseFailedAudioTask(taskId: string, errorCode: string, errorMessage: string): Promise<unknown>;
  executeTtsTask(
    taskId: string,
    model: unknown,
    providerVoiceId: string,
    text: string,
    parameters: unknown,
    timeoutMs: number
  ): Promise<unknown>;
}

test("回读失败后的失败补偿不能覆盖已成功语音任务", async () => {
  let transactionCalled = false;
  const service = new AudioService();
  Object.defineProperty(service, "prisma", {
    value: {
      audioTask: {
        findUnique: async () => ({
          id: "task-1",
          userId: "user-1",
          learnerId: null,
          status: "SUCCEEDED",
          billingContext: "PERSONAL",
          reservation: null
        })
      },
      $transaction: async () => {
        transactionCalled = true;
        throw new Error("不应执行失败事务");
      }
    }
  });
  Object.defineProperty(service, "getTaskForExecution", {
    value: async () => ({
      id: "task-1",
      status: "SUCCEEDED"
    })
  });

  const result = await (service as unknown as AudioServiceInternals).releaseFailedAudioTask(
    "task-1",
    "TEMPORARY_READ_FAILED",
    "任务回读失败"
  );

  assert.deepEqual(result, {
    id: "task-1",
    status: "SUCCEEDED"
  });
  assert.equal(transactionCalled, false);
});

test("语音任务进入处理中失败时仍释放已经冻结的点数", async () => {
  const service = new AudioService();
  const releases: Array<{ taskId: string; errorCode: string; errorMessage: string }> = [];
  Object.defineProperty(service, "prisma", {
    value: {
      audioTask: {
        update: async () => {
          throw new Error("数据库暂时不可用");
        }
      }
    }
  });
  Object.defineProperty(service, "releaseFailedAudioTask", {
    value: async (taskId: string, errorCode: string, errorMessage: string) => {
      releases.push({ taskId, errorCode, errorMessage });
      return { id: taskId, status: "FAILED" };
    }
  });

  const result = await (service as unknown as AudioServiceInternals).executeTtsTask(
    "task-1",
    {},
    "voice-1",
    "测试",
    {},
    1000
  );

  assert.deepEqual(result, { id: "task-1", status: "FAILED" });
  assert.deepEqual(releases, [
    {
      taskId: "task-1",
      errorCode: "AUDIO_PROVIDER_FAILED",
      errorMessage: "数据库暂时不可用"
    }
  ]);
});

test("视频导学断点按课件、批次和节点查询已成功语音任务", async () => {
  let whereValue: unknown;
  const service = new AudioService();
  Object.defineProperty(service, "prisma", {
    value: {
      audioTask: {
        findMany: async (input: { where: unknown }) => {
          whereValue = input.where;
          return [];
        }
      }
    }
  });

  const task = await service.findVerifiedVideoGuideNarrationTask("user-1", {
    lessonId: "lesson-1",
    generationId: "checkpoint-1",
    nodeId: "s_001",
    format: "mp3"
  });

  assert.equal(task, null);
  assert.deepEqual(whereValue, {
    userId: "user-1",
    type: "TTS",
    status: {
      in: ["PROCESSING", "SUCCEEDED"]
    },
    AND: [
      {
        providerPayload: {
          path: ["videoGuidePersistence", "lessonId"],
          equals: "lesson-1"
        }
      },
      {
        providerPayload: {
          path: ["videoGuidePersistence", "generationId"],
          equals: "checkpoint-1"
        }
      },
      {
        providerPayload: {
          path: ["videoGuidePersistence", "nodeId"],
          equals: "s_001"
        }
      }
    ]
  });
});

test("进程中断后可以用已持久化的 R2 检查点补偿完成 AudioTask", async () => {
  const persisted = {
    status: "SUCCEEDED",
    storageProvider: "S3",
    objectKey: "video-guide/narration/lesson-1/checkpoint-1/s_001-task-1.mp3",
    url: "https://cdn.xueleai.com/video-guide/narration/lesson-1/checkpoint-1/s_001-task-1.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 1024,
    sha256: "a".repeat(64)
  };
  const service = new AudioService();
  Object.defineProperty(service, "prisma", {
    value: {
      audioTask: {
        findMany: async () => [
          {
            id: "task-1",
            status: "PROCESSING",
            errorCode: null,
            errorMessage: null,
            providerPayload: {
              videoGuidePersistence: {
                lessonId: "lesson-1",
                generationId: "checkpoint-1",
                nodeId: "s_001",
                format: "mp3"
              },
              persistence: persisted
            },
            outputAudioAsset: null
          }
        ]
      }
    }
  });
  Object.defineProperty(service, "verifyPersistedVideoGuideNarrationTask", {
    value: async () => undefined
  });
  Object.defineProperty(service, "settleSuccessfulAudioTask", {
    value: async () => ({ id: "task-1", status: "SUCCEEDED" })
  });

  const task = await service.findVerifiedVideoGuideNarrationTask("user-1", {
    lessonId: "lesson-1",
    generationId: "checkpoint-1",
    nodeId: "s_001",
    format: "mp3"
  });

  assert.deepEqual(task, { id: "task-1", status: "SUCCEEDED" });
});
