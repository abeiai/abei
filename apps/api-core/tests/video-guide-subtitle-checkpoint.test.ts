import assert from "node:assert/strict";
import test from "node:test";

import {
  createVideoGuideSubtitleCheckpoint,
  mergeVideoGuideSubtitleCheckpointContent,
  shouldCleanupVideoGuideSubtitleAsrObject,
  shouldSubmitVideoGuideSubtitleTask,
  videoGuideSubtitleCheckpointFromValue
} from "../src/video-guide/video-guide-subtitle-checkpoint.js";

test("字幕任务检查点保存临时音频和提供商任务编号", () => {
  const checkpoint = createVideoGuideSubtitleCheckpoint({
    jobId: "job-1",
    now: "2026-07-19T10:00:00.000Z"
  });
  const content = mergeVideoGuideSubtitleCheckpointContent(
    { title: "保留内容" },
    {
      ...checkpoint,
      asrObjectKey: "video-guide/asr-temp/job-1.m4a",
      modelInstanceId: "model-1",
      providerInstanceId: "provider-1",
      modelName: "qwen3-asr-flash",
      providerTaskId: "provider-task-1",
      providerStatus: "RUNNING",
      submittedAt: "2026-07-19T10:01:00.000Z"
    }
  );
  const restored = videoGuideSubtitleCheckpointFromValue(content.subtitleGenerationCheckpoint, "job-1");

  assert.equal(content.title, "保留内容");
  assert.equal(restored?.providerTaskId, "provider-task-1");
  assert.equal(restored?.asrObjectKey, "video-guide/asr-temp/job-1.m4a");
  assert.equal(shouldSubmitVideoGuideSubtitleTask(restored), false);
});

test("检查点只属于当前任务，旧任务检查点不会被复用", () => {
  const checkpoint = createVideoGuideSubtitleCheckpoint({
    jobId: "old-job",
    now: "2026-07-19T10:00:00.000Z"
  });

  assert.equal(videoGuideSubtitleCheckpointFromValue(checkpoint, "new-job"), null);
  assert.equal(shouldSubmitVideoGuideSubtitleTask(null), true);
});

test("检查点保留可复用识别音频标记", () => {
  const checkpoint = createVideoGuideSubtitleCheckpoint({
    jobId: "job-cache",
    now: "2026-07-22T08:00:00.000Z"
  });
  const restored = videoGuideSubtitleCheckpointFromValue(
    {
      ...checkpoint,
      asrObjectKey: "video-guide/asr-cache/sha256/ab/cache.m4a",
      asrReusable: true
    },
    "job-cache"
  );

  assert.equal(checkpoint.asrReusable, false);
  assert.equal(restored?.asrReusable, true);
});

test("字幕任务只清理当前任务专属的临时识别音频", () => {
  const checkpoint = {
    ...createVideoGuideSubtitleCheckpoint({
      jobId: "job-cleanup",
      now: "2026-07-22T08:00:00.000Z"
    }),
    asrObjectKey: "video-guide/asr-temp/job-cleanup.m4a"
  };

  assert.equal(shouldCleanupVideoGuideSubtitleAsrObject(checkpoint, true), true);
  assert.equal(
    shouldCleanupVideoGuideSubtitleAsrObject(
      {
        ...checkpoint,
        asrObjectKey: "video-guide/asr-cache/sha256/ab/cache.m4a",
        asrReusable: true
      },
      true
    ),
    false
  );
  assert.equal(shouldCleanupVideoGuideSubtitleAsrObject(checkpoint, false), false);
});
