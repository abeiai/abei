import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoGuideNarrationTaskError,
  createNarrationAudioProgress,
  mergeNarrationAudioProgressContent,
  mergeNarrationGenerationLeaseContent,
  narrationGenerationLeaseMatches,
  updateNarrationAudioProgress,
  verifiedNarrationAudioFromTask
} from "../src/video-guide/video-guide-narration-progress.js";

const drafts = [
  { id: "intro", type: "INTRO" as const },
  { id: "s_001", type: "SENTENCE" as const, sentenceId: "s_001" },
  { id: "summary", type: "SUMMARY" as const }
];

function successfulTask() {
  return {
    id: "task-1",
    status: "SUCCEEDED",
    errorCode: null,
    errorMessage: null,
    providerPayload: {
      durationMs: 1234,
      persistence: {
        status: "SUCCEEDED",
        storageProvider: "S3",
        objectKey: "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
        url: "https://cdn.xueleai.com/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
        sha256: "a".repeat(64)
      }
    },
    outputAudioAsset: {
      id: "asset-1",
      storageProvider: "S3",
      objectKey: "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
      url: "https://cdn.xueleai.com/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
      durationMs: null
    }
  };
}

test("逐句语音进度初始化并根据节点状态重算汇总", () => {
  const initialized = createNarrationAudioProgress(
    "generation-1",
    drafts,
    "2026-07-14T00:00:00.000Z"
  );

  assert.equal(initialized.total, 3);
  assert.equal(initialized.completed, 0);
  assert.equal(initialized.failed, 0);
  assert.equal(initialized.currentNodeId, null);
  assert.equal(initialized.nodes.every((node) => node.status === "PENDING"), true);

  const generating = updateNarrationAudioProgress(
    initialized,
    "s_001",
    {
      status: "GENERATING",
      audioTaskId: "task-1"
    },
    "2026-07-14T00:00:01.000Z"
  );
  const uploading = updateNarrationAudioProgress(
    generating,
    "s_001",
    {
      status: "UPLOADING",
      audioTaskId: "task-1"
    },
    "2026-07-14T00:00:02.000Z"
  );
  const verifying = updateNarrationAudioProgress(
    uploading,
    "s_001",
    {
      status: "VERIFYING",
      audioTaskId: "task-1"
    },
    "2026-07-14T00:00:03.000Z"
  );
  const succeeded = updateNarrationAudioProgress(
    verifying,
    "s_001",
    {
      status: "SUCCEEDED",
      audioTaskId: "task-1",
      audioAssetId: "asset-1",
      objectKey: "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
      audioUrl: "https://cdn.xueleai.com/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
      sizeBytes: 1024,
      sha256: "a".repeat(64)
    },
    "2026-07-14T00:00:04.000Z"
  );

  assert.equal(generating.currentNodeId, "s_001");
  assert.equal(uploading.currentNodeId, "s_001");
  assert.equal(succeeded.currentNodeId, null);
  assert.equal(succeeded.completed, 1);
  assert.equal(succeeded.failed, 0);
  assert.equal(succeeded.nodes.find((node) => node.nodeId === "s_001")?.audioAssetId, "asset-1");
});

test("失败节点保留错误码并计入汇总", () => {
  const initialized = createNarrationAudioProgress(
    "generation-1",
    drafts,
    "2026-07-14T00:00:00.000Z"
  );
  const failed = updateNarrationAudioProgress(
    initialized,
    "intro",
    {
      status: "FAILED",
      audioTaskId: "task-intro",
      errorCode: "R2_VERIFY_FAILED",
      errorMessage: "导学语音上传结果校验失败"
    },
    "2026-07-14T00:00:01.000Z"
  );

  assert.equal(failed.failed, 1);
  assert.equal(failed.completed, 0);
  assert.equal(failed.currentNodeId, null);
  assert.equal(failed.nodes[0]?.errorCode, "R2_VERIFY_FAILED");
});

test("R2 断点补偿可以将待处理节点直接标记为成功", () => {
  const initialized = createNarrationAudioProgress(
    "generation-1",
    drafts,
    "2026-07-14T00:00:00.000Z"
  );
  const recovered = updateNarrationAudioProgress(
    initialized,
    "intro",
    {
      status: "SUCCEEDED",
      audioTaskId: "task-intro",
      audioAssetId: "asset-intro",
      objectKey: "video-guide/narration/lesson-1/generation-1/intro-task-intro.mp3",
      audioUrl: "https://cdn.xueleai.com/video-guide/narration/lesson-1/generation-1/intro-task-intro.mp3",
      sizeBytes: 1024,
      sha256: "b".repeat(64)
    },
    "2026-07-14T00:00:01.000Z"
  );

  assert.equal(recovered.completed, 1);
  assert.equal(recovered.nodes[0]?.status, "SUCCEEDED");
});

test("保存逐句语音进度时保留课件已有内容", () => {
  const progress = createNarrationAudioProgress("generation-1", drafts, "2026-07-14T00:00:00.000Z");
  const content = mergeNarrationAudioProgressContent(
    {
      summary: "已有课件摘要",
      narrationTimeline: [{ id: "legacy" }]
    },
    progress
  );

  assert.equal(content.summary, "已有课件摘要");
  assert.deepEqual(content.narrationTimeline, [{ id: "legacy" }]);
  assert.equal((content.narrationAudioProgress as typeof progress).generationId, "generation-1");
});

test("导学语音生成租约只允许当前 generationId 更新", () => {
  const first = mergeNarrationGenerationLeaseContent(
    {
      summary: "已有课件摘要"
    },
    "generation-1"
  );
  const second = mergeNarrationGenerationLeaseContent(first, "generation-2");

  assert.equal(narrationGenerationLeaseMatches(first, "generation-1"), true);
  assert.equal(narrationGenerationLeaseMatches(first, "generation-2"), false);
  assert.equal(narrationGenerationLeaseMatches(second, "generation-1"), false);
  assert.equal(narrationGenerationLeaseMatches(second, "generation-2"), true);
  assert.equal(second.summary, "已有课件摘要");
});

test("已校验音频任务返回时间线需要的真实资产字段", () => {
  const verified = verifiedNarrationAudioFromTask(
    successfulTask(),
    "video-guide/narration/",
    "https://cdn.xueleai.com"
  );

  assert.deepEqual(verified, {
    audioTaskId: "task-1",
    audioAssetId: "asset-1",
    url: "https://cdn.xueleai.com/video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
    objectKey: "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    durationMs: 1234
  });
});

test("伪成功音频任务缺少任一持久化条件时都会被拒绝", () => {
  const cases: Array<[string, (task: ReturnType<typeof successfulTask>) => void]> = [
    ["任务未成功", (task) => { task.status = "FAILED"; }],
    ["缺少资产", (task) => { task.outputAudioAsset = null as never; }],
    ["存储类型错误", (task) => { task.outputAudioAsset.storageProvider = "LOCAL"; }],
    ["对象前缀错误", (task) => { task.outputAudioAsset.objectKey = "uploads/audio.mp3"; }],
    ["CDN 地址错误", (task) => { task.outputAudioAsset.url = "https://provider.example/audio.mp3"; }],
    ["MIME 错误", (task) => { task.outputAudioAsset.mimeType = "application/octet-stream"; }],
    ["文件为空", (task) => { task.outputAudioAsset.sizeBytes = 0; }],
    ["哈希缺失", (task) => { (task.providerPayload.persistence as Record<string, unknown>).sha256 = ""; }]
  ];

  for (const [name, mutate] of cases) {
    const task = successfulTask();
    mutate(task);

    assert.throws(
      () => verifiedNarrationAudioFromTask(task, "video-guide/narration/", "https://cdn.xueleai.com"),
      (error: unknown) => error instanceof VideoGuideNarrationTaskError,
      name
    );
  }
});
