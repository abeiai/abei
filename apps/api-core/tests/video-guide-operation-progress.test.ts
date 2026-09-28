import assert from "node:assert/strict";
import test from "node:test";

import {
  createVideoGuideOperationProgress,
  failedVideoGuideOperationProgress,
  isActiveVideoGuideOperationProgress,
  mergeVideoGuideOperationProgressContent,
  updateVideoGuideOperationProgress,
  videoGuideOperationProgressFromValue
} from "../src/video-guide/video-guide-operation-progress.js";
import * as operationProgress from "../src/video-guide/video-guide-operation-progress.js";

test("讲解语音使用独立的异步进度字段", () => {
  const progress = createVideoGuideOperationProgress({
    operation: "NARRATION_TTS",
    phase: "QUEUED",
    message: "讲解语音任务排队中",
    now: "2026-07-15T01:00:00.000Z",
    total: 6
  });
  const content = mergeVideoGuideOperationProgressContent(
    { narrationScript: "讲解文稿" },
    "narrationTtsGenerationProgress",
    progress
  );

  assert.equal(progress.operation, "NARRATION_TTS");
  assert.deepEqual(
    videoGuideOperationProgressFromValue(content.narrationTtsGenerationProgress),
    progress
  );
  assert.equal(content.narrationScript, "讲解文稿");
});

test("旧课件缺少进度字段时仍能写入异步任务失败终态", () => {
  const failed = failedVideoGuideOperationProgress(null, {
    operation: "SUBTITLE",
    errorMessage: "语音识别接口不可用",
    message: "字幕文件生成失败，可以重新提交",
    now: "2026-07-15T01:05:00.000Z"
  });

  assert.equal(failed.operation, "SUBTITLE");
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.phase, "FAILED");
  assert.equal(failed.errorMessage, "语音识别接口不可用");
  assert.equal(failed.finishedAt, "2026-07-15T01:05:00.000Z");
});

test("视频导学异步操作从排队状态开始并明确可以离开页面", () => {
  const progress = createVideoGuideOperationProgress({
    operation: "NARRATION",
    phase: "QUEUED",
    message: "导学任务排队中",
    now: "2026-07-15T01:00:00.000Z",
    total: 12
  });

  assert.deepEqual(progress, {
    version: 1,
    operation: "NARRATION",
    status: "QUEUED",
    phase: "QUEUED",
    completed: 0,
    total: 12,
    percent: 0,
    message: "导学任务排队中",
    canLeave: true,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: "2026-07-15T01:00:00.000Z"
  });
});

test("视频导学异步操作按真实完成数量计算进度并保留开始时间", () => {
  const queued = createVideoGuideOperationProgress({
    operation: "SUBTITLE",
    phase: "QUEUED",
    message: "字幕识别任务排队中",
    now: "2026-07-15T01:00:00.000Z",
    total: 4
  });
  const running = updateVideoGuideOperationProgress(
    queued,
    {
      status: "RUNNING",
      phase: "RECOGNIZING",
      completed: 1,
      message: "正在识别语音"
    },
    "2026-07-15T01:01:00.000Z"
  );
  const advanced = updateVideoGuideOperationProgress(
    running,
    {
      completed: 3,
      phase: "STORING",
      message: "正在保存字幕"
    },
    "2026-07-15T01:02:00.000Z"
  );

  assert.equal(running.startedAt, "2026-07-15T01:01:00.000Z");
  assert.equal(advanced.startedAt, running.startedAt);
  assert.equal(advanced.percent, 75);
  assert.equal(advanced.completed, 3);
});

test("视频导学异步操作在校验、失败和恢复阶段都不会回退预估进度", () => {
  const queued = createVideoGuideOperationProgress({
    operation: "SUBTITLE",
    phase: "QUEUED",
    message: "字幕识别任务排队中",
    now: "2026-08-10T01:00:00.000Z",
    total: 6
  });
  const running = updateVideoGuideOperationProgress(
    queued,
    {
      status: "RUNNING",
      phase: "RECOGNIZING",
      completed: 3,
      percent: 68,
      message: "语音识别任务处理中"
    },
    "2026-08-10T01:10:00.000Z"
  );
  const staleEstimate = updateVideoGuideOperationProgress(
    running,
    {
      completed: 3,
      percent: 62
    },
    "2026-08-10T01:11:00.000Z"
  );
  const validating = updateVideoGuideOperationProgress(
    staleEstimate,
    {
      completed: 4,
      phase: "VALIDATING"
    },
    "2026-08-10T01:12:00.000Z"
  );
  const failed = updateVideoGuideOperationProgress(
    validating,
    {
      status: "FAILED",
      phase: "FAILED"
    },
    "2026-08-10T01:13:00.000Z"
  );
  const recovered = updateVideoGuideOperationProgress(
    validating,
    {
      status: "QUEUED",
      completed: 0,
      phase: "RECOVERED"
    },
    "2026-08-10T01:13:00.000Z"
  );

  assert.equal(running.percent, 68);
  assert.equal(staleEstimate.percent, 68);
  assert.equal(validating.percent, 68);
  assert.equal(failed.percent, 68);
  assert.equal(recovered.percent, 68);
});

test("视频导学异步操作完成和失败时写入终态", () => {
  const queued = createVideoGuideOperationProgress({
    operation: "PRACTICE",
    phase: "QUEUED",
    message: "随堂练习排队中",
    now: "2026-07-15T01:00:00.000Z",
    total: 10
  });
  const completed = updateVideoGuideOperationProgress(
    queued,
    {
      status: "SUCCEEDED",
      phase: "COMPLETED",
      completed: 10,
      message: "随堂练习已生成"
    },
    "2026-07-15T01:03:00.000Z"
  );
  const failed = updateVideoGuideOperationProgress(
    queued,
    {
      status: "FAILED",
      phase: "FAILED",
      errorMessage: "模型返回格式不正确",
      message: "随堂练习生成失败"
    },
    "2026-07-15T01:04:00.000Z"
  );

  assert.equal(completed.percent, 100);
  assert.equal(completed.finishedAt, "2026-07-15T01:03:00.000Z");
  assert.equal(failed.finishedAt, "2026-07-15T01:04:00.000Z");
  assert.equal(failed.errorMessage, "模型返回格式不正确");
});

test("视频导学异步进度合并时不覆盖课件已有内容", () => {
  const progress = createVideoGuideOperationProgress({
    operation: "NARRATION",
    phase: "QUEUED",
    message: "导学任务排队中",
    now: "2026-07-15T01:00:00.000Z",
    total: 3
  });
  const content = mergeVideoGuideOperationProgressContent(
    {
      summary: "原有课件摘要",
      questions: []
    },
    "narrationGenerationProgress",
    progress
  );

  assert.equal(content.summary, "原有课件摘要");
  assert.deepEqual(content.questions, []);
  assert.deepEqual(content.narrationGenerationProgress, progress);
});

test("视频导学只把排队和运行中的操作视为活跃任务", () => {
  assert.equal(isActiveVideoGuideOperationProgress({ status: "QUEUED" }), true);
  assert.equal(isActiveVideoGuideOperationProgress({ status: "RUNNING" }), true);
  assert.equal(isActiveVideoGuideOperationProgress({ status: "SUCCEEDED" }), false);
  assert.equal(isActiveVideoGuideOperationProgress({ status: "FAILED" }), false);
  assert.equal(isActiveVideoGuideOperationProgress(null), false);
});

test("媒体转换进度按用户隔离并保持单调递增", () => {
  const Store = (operationProgress as Record<string, unknown>).VideoGuideMediaUploadProgressStore;

  assert.equal(typeof Store, "function");

  const store = new (Store as new (input?: { now?: () => number; ttlMs?: number }) => {
    begin: (userId: string, uploadId: string) => void;
    complete: (userId: string, uploadId: string) => void;
    get: (userId: string, uploadId: string) => { percent: number; status: string } | null;
    update: (userId: string, uploadId: string, input: { percent: number; stage: string }) => void;
  })({ now: () => Date.parse("2026-08-08T01:00:00.000Z") });

  store.begin("user-a", "upload-1");
  store.update("user-a", "upload-1", { percent: 42, stage: "TRANSCODING" });
  store.update("user-a", "upload-1", { percent: 20, stage: "TRANSCODING" });

  assert.equal(store.get("user-b", "upload-1"), null);
  assert.equal(store.get("user-a", "upload-1")?.percent, 42);
  assert.equal(store.get("user-a", "upload-1")?.status, "RUNNING");

  store.complete("user-a", "upload-1");
  assert.equal(store.get("user-a", "upload-1")?.percent, 100);
  assert.equal(store.get("user-a", "upload-1")?.status, "SUCCEEDED");
});

test("媒体转换进度过期后不再返回", () => {
  const Store = (operationProgress as Record<string, unknown>).VideoGuideMediaUploadProgressStore;

  assert.equal(typeof Store, "function");

  let now = Date.parse("2026-08-08T01:00:00.000Z");
  const store = new (Store as new (input?: { now?: () => number; ttlMs?: number }) => {
    begin: (userId: string, uploadId: string) => void;
    get: (userId: string, uploadId: string) => unknown;
  })({ now: () => now, ttlMs: 1_000 });

  store.begin("user-a", "upload-2");
  now += 1_001;

  assert.equal(store.get("user-a", "upload-2"), null);
});
