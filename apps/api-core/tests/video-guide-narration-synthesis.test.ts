import assert from "node:assert/strict";
import test from "node:test";

import { synthesizeVideoGuideNarrationTimeline } from "../src/video-guide/video-guide-narration-synthesis.js";
import * as narrationSynthesis from "../src/video-guide/video-guide-narration-synthesis.js";
import { verifiedNarrationAudioFromTask } from "../src/video-guide/video-guide-narration-progress.js";

const drafts = [
  { id: "intro", type: "INTRO" as const, script: "导入" },
  { id: "s_001", type: "SENTENCE" as const, sentenceId: "s_001", script: "第一句" },
  { id: "summary", type: "SUMMARY" as const, script: "总结" }
];

test("视频导学平台音色选择解析为音色资产而不是系统音色", () => {
  const resolveSelection = (narrationSynthesis as Record<string, unknown>)
    .resolveVideoGuideNarrationVoiceSelection;

  assert.equal(typeof resolveSelection, "function");

  const resolve = resolveSelection as (value: string) => {
    voice?: string;
    voiceAssetId?: string;
  };

  assert.deepEqual(resolve("voice:platform-designed"), {
    voiceAssetId: "platform-designed"
  });
  assert.deepEqual(resolve("system-voice"), {
    voice: "system-voice"
  });
});

test("RPM 限流使用长退避而普通网络错误保持短退避", () => {
  const resolveDelay = (narrationSynthesis as Record<string, unknown>)
    .resolveNarrationRetryDelayMs;

  assert.equal(typeof resolveDelay, "function");

  const resolve = resolveDelay as (error: unknown, attempt: number, baseDelayMs: number) => number;

  assert.equal(
    resolve(
      {
        code: "MINIMAX_STATUS_1002",
        message: "rate limit exceeded(RPM)"
      },
      1,
      1_000
    ),
    20_000
  );
  assert.equal(
    resolve(
      {
        code: "MINIMAX_STATUS_1002",
        message: "rate limit exceeded(RPM)"
      },
      2,
      1_000
    ),
    40_000
  );
  assert.equal(
    resolve(
      {
        code: "PROVIDER_NETWORK_ERROR",
        message: "read ECONNRESET"
      },
      1,
      1_000
    ),
    1_000
  );
});

function taskFor(nodeId: string) {
  const objectKey = `video-guide/narration/lesson-1/generation-1/${nodeId}-task.mp3`;

  return {
    id: `${nodeId}-task`,
    status: "SUCCEEDED",
    errorCode: null,
    errorMessage: null,
    providerPayload: {
      durationMs: 1000,
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
}

test("逐句语音按顺序生成并上报完整阶段", async () => {
  const events: string[] = [];
  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    synthesize: async (node, onPersistenceStatus) => {
      await onPersistenceStatus({
        stage: "UPLOADING",
        audioTaskId: `${node.id}-task`
      });
      await onPersistenceStatus({
        stage: "VERIFYING",
        audioTaskId: `${node.id}-task`
      });
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async (event) => {
      events.push(`${event.nodeId}:${event.status}`);
    }
  });

  assert.deepEqual(events.slice(0, 4), [
    "intro:GENERATING",
    "intro:UPLOADING",
    "intro:VERIFYING",
    "intro:SUCCEEDED"
  ]);
  assert.deepEqual(result.map((node) => node.id), ["intro", "s_001", "summary"]);
  assert.equal(result[1]?.audioAssetId, "s_001-asset");
  assert.equal(result[1]?.audioUrl.startsWith("https://cdn.xueleai.com/"), true);
});

test("某句失败后记录错误并停止后续语音生成", async () => {
  const invoked: string[] = [];
  const events: Array<{ nodeId: string; status: string; errorCode?: string | null }> = [];

  await assert.rejects(
    () =>
      synthesizeVideoGuideNarrationTimeline({
        nodes: drafts,
        synthesize: async (node, onPersistenceStatus) => {
          invoked.push(node.id);

          if (node.id === "s_001") {
            await onPersistenceStatus({
              stage: "UPLOADING",
              audioTaskId: "s_001-task"
            });

            return {
              ...taskFor(node.id),
              status: "FAILED",
              errorCode: "R2_VERIFY_INVALID",
              errorMessage: "导学语音上传结果与源文件不一致",
              outputAudioAsset: null
            };
          }

          return taskFor(node.id);
        },
        verifyTask: (task) =>
          verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
        onProgress: async (event) => {
          events.push(event);
        }
      }),
    /导学语音上传结果与源文件不一致/
  );

  assert.deepEqual(invoked, ["intro", "s_001"]);
  assert.equal(events.at(-1)?.nodeId, "s_001");
  assert.equal(events.at(-1)?.status, "FAILED");
  assert.equal(events.at(-1)?.errorCode, "R2_VERIFY_INVALID");
});

test("语音网关连接重置时自动重试当前句并继续生成", async () => {
  let attempts = 0;
  let rateLimitAcquisitions = 0;
  const events: Array<{ nodeId: string; status: string }> = [];

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: [drafts[1]!],
    retryDelayMs: 0,
    beforeSynthesize: async () => {
      rateLimitAcquisitions += 1;
    },
    synthesize: async (node) => {
      attempts += 1;

      if (attempts === 1) {
        return {
          ...taskFor(node.id),
          status: "FAILED",
          errorCode: "AUDIO_PROVIDER_FAILED",
          errorMessage: "read ECONNRESET",
          outputAudioAsset: null
        };
      }

      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async (event) => {
      events.push(event);
    }
  });

  assert.equal(attempts, 2);
  assert.equal(rateLimitAcquisitions, 2);
  assert.deepEqual(events.map((event) => event.status), ["GENERATING", "GENERATING", "SUCCEEDED"]);
  assert.equal(result[0]?.audioTaskId, "s_001-task");
});

test("MiniMax RPM 限流时自动重试当前句而不是终止整份课件", async () => {
  let attempts = 0;

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: [drafts[1]!],
    retryDelayMs: 0,
    synthesize: async (node) => {
      attempts += 1;

      if (attempts === 1) {
        return {
          ...taskFor(node.id),
          status: "FAILED",
          errorCode: "MINIMAX_STATUS_1002",
          errorMessage: "rate limit exceeded(RPM)",
          outputAudioAsset: null
        };
      }

      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.equal(attempts, 2);
  assert.equal(result[0]?.audioTaskId, "s_001-task");
});

test("逐句语音最多同时生成三段并保持原始节点顺序", async () => {
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    id: `s_${String(index + 1).padStart(3, "0")}`,
    type: "SENTENCE" as const,
    sentenceId: `s_${String(index + 1).padStart(3, "0")}`,
    script: `第 ${index + 1} 句`
  }));
  let active = 0;
  let maximumActive = 0;

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes,
    concurrency: 3,
    synthesize: async (node) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, node.id === "s_001" ? 12 : 4));
      active -= 1;
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.equal(maximumActive, 3);
  assert.deepEqual(result.map((node) => node.id), nodes.map((node) => node.id));
});

test("每个语音模型调用都先取得全局启动许可", async () => {
  const events: string[] = [];

  await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    beforeSynthesize: async (node) => {
      events.push(`limit:${node.id}`);
    },
    synthesize: async (node) => {
      events.push(`synthesize:${node.id}`);
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.equal(events.filter((event) => event.startsWith("limit:")).length, drafts.length);
  for (const node of drafts) {
    const limitIndex = events.indexOf(`limit:${node.id}`);
    const synthesizeIndex = events.indexOf(`synthesize:${node.id}`);

    assert.notEqual(limitIndex, -1);
    assert.ok(limitIndex < synthesizeIndex);
  }
});

test("并发生成时进度回调始终串行执行", async () => {
  let activeProgressWrites = 0;
  let maximumProgressWrites = 0;

  await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    synthesize: async (node, onPersistenceStatus) => {
      await onPersistenceStatus({
        stage: "UPLOADING",
        audioTaskId: `${node.id}-task`
      });
      await onPersistenceStatus({
        stage: "VERIFYING",
        audioTaskId: `${node.id}-task`
      });
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => {
      activeProgressWrites += 1;
      maximumProgressWrites = Math.max(maximumProgressWrites, activeProgressWrites);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeProgressWrites -= 1;
    }
  });

  assert.equal(maximumProgressWrites, 1);
});

test("恢复任务时跳过已经完成且校验通过的语音节点", async () => {
  const completed = new Map([
    [
      "intro",
      verifiedNarrationAudioFromTask(
        taskFor("intro"),
        "video-guide/narration/",
        "https://cdn.xueleai.com"
      )
    ],
    [
      "summary",
      verifiedNarrationAudioFromTask(
        taskFor("summary"),
        "video-guide/narration/",
        "https://cdn.xueleai.com"
      )
    ]
  ]);
  const synthesized: string[] = [];

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    completed,
    synthesize: async (node) => {
      synthesized.push(node.id);
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.deepEqual(synthesized, ["s_001"]);
  assert.deepEqual(result.map((node) => node.id), ["intro", "s_001", "summary"]);
  assert.equal(result[0]?.audioTaskId, "intro-task");
  assert.equal(result[2]?.audioTaskId, "summary-task");
});

test("检查点尚未落库时可以从已完成语音任务补偿恢复", async () => {
  const synthesized: string[] = [];
  const recovered = verifiedNarrationAudioFromTask(
    taskFor("intro"),
    "video-guide/narration/",
    "https://cdn.xueleai.com"
  );

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    recoverCompleted: async (node) => (node.id === "intro" ? recovered : null),
    synthesize: async (node) => {
      synthesized.push(node.id);
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.deepEqual(synthesized, ["s_001", "summary"]);
  assert.equal(result[0]?.audioTaskId, "intro-task");
});

test("成功状态落库失败时保留原始持久化错误", async () => {
  const statuses: string[] = [];

  await assert.rejects(
    synthesizeVideoGuideNarrationTimeline({
      nodes: [drafts[0]!],
      synthesize: async (node) => taskFor(node.id),
      verifyTask: (task) =>
        verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
      onProgress: async (event) => {
        statuses.push(event.status);

        if (event.status === "SUCCEEDED") {
          throw new Error("DB_WRITE_FAILED");
        }
      }
    }),
    /DB_WRITE_FAILED/
  );

  assert.deepEqual(statuses, ["GENERATING", "SUCCEEDED"]);
});

test("逐句语音最多同时生成三段并保持原始节点顺序", async () => {
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    id: `s_${String(index + 1).padStart(3, "0")}`,
    type: "SENTENCE" as const,
    sentenceId: `s_${String(index + 1).padStart(3, "0")}`,
    script: `第 ${index + 1} 句`
  }));
  let active = 0;
  let maximumActive = 0;

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes,
    concurrency: 3,
    synthesize: async (node) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, node.id === "s_001" ? 12 : 4));
      active -= 1;
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.equal(maximumActive, 3);
  assert.deepEqual(result.map((node) => node.id), nodes.map((node) => node.id));
});

test("每个语音模型调用都先取得全局启动许可", async () => {
  const events: string[] = [];

  await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    beforeSynthesize: async (node) => {
      events.push(`limit:${node.id}`);
    },
    synthesize: async (node) => {
      events.push(`synthesize:${node.id}`);
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.equal(events.filter((event) => event.startsWith("limit:")).length, drafts.length);
  for (const node of drafts) {
    const limitIndex = events.indexOf(`limit:${node.id}`);
    const synthesizeIndex = events.indexOf(`synthesize:${node.id}`);

    assert.notEqual(limitIndex, -1);
    assert.ok(limitIndex < synthesizeIndex);
  }
});

test("并发生成时进度回调始终串行执行", async () => {
  let activeProgressWrites = 0;
  let maximumProgressWrites = 0;

  await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    synthesize: async (node, onPersistenceStatus) => {
      await onPersistenceStatus({
        stage: "UPLOADING",
        audioTaskId: `${node.id}-task`
      });
      await onPersistenceStatus({
        stage: "VERIFYING",
        audioTaskId: `${node.id}-task`
      });
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => {
      activeProgressWrites += 1;
      maximumProgressWrites = Math.max(maximumProgressWrites, activeProgressWrites);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeProgressWrites -= 1;
    }
  });

  assert.equal(maximumProgressWrites, 1);
});

test("恢复任务时跳过已经完成且校验通过的语音节点", async () => {
  const completed = new Map([
    [
      "intro",
      verifiedNarrationAudioFromTask(
        taskFor("intro"),
        "video-guide/narration/",
        "https://cdn.xueleai.com"
      )
    ],
    [
      "summary",
      verifiedNarrationAudioFromTask(
        taskFor("summary"),
        "video-guide/narration/",
        "https://cdn.xueleai.com"
      )
    ]
  ]);
  const synthesized: string[] = [];

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    completed,
    synthesize: async (node) => {
      synthesized.push(node.id);
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.deepEqual(synthesized, ["s_001"]);
  assert.deepEqual(result.map((node) => node.id), ["intro", "s_001", "summary"]);
  assert.equal(result[0]?.audioTaskId, "intro-task");
  assert.equal(result[2]?.audioTaskId, "summary-task");
});

test("检查点尚未落库时可以从已完成语音任务补偿恢复", async () => {
  const synthesized: string[] = [];
  const recovered = verifiedNarrationAudioFromTask(
    taskFor("intro"),
    "video-guide/narration/",
    "https://cdn.xueleai.com"
  );

  const result = await synthesizeVideoGuideNarrationTimeline({
    nodes: drafts,
    concurrency: 3,
    recoverCompleted: async (node) => (node.id === "intro" ? recovered : null),
    synthesize: async (node) => {
      synthesized.push(node.id);
      return taskFor(node.id);
    },
    verifyTask: (task) =>
      verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
    onProgress: async () => undefined
  });

  assert.deepEqual(synthesized, ["s_001", "summary"]);
  assert.equal(result[0]?.audioTaskId, "intro-task");
});

test("成功状态落库失败时保留原始持久化错误", async () => {
  const statuses: string[] = [];

  await assert.rejects(
    synthesizeVideoGuideNarrationTimeline({
      nodes: [drafts[0]!],
      synthesize: async (node) => taskFor(node.id),
      verifyTask: (task) =>
        verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
      onProgress: async (event) => {
        statuses.push(event.status);

        if (event.status === "SUCCEEDED") {
          throw new Error("DB_WRITE_FAILED");
        }
      }
    }),
    /DB_WRITE_FAILED/
  );

  assert.deepEqual(statuses, ["GENERATING", "SUCCEEDED"]);
});
