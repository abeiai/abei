import assert from "node:assert/strict";
import test from "node:test";
import {
  createVideoGuideOperationJob,
  leaseVideoGuideOperationJob,
  mergeVideoGuideOperationJobContent,
  shouldRecoverVideoGuideOperation,
  videoGuideOperationAttemptMatches,
  videoGuideOperationJobFromValue
} from "../src/video-guide/video-guide-operation-job.js";
import { createVideoGuideOperationProgress, updateVideoGuideOperationProgress } from "../src/video-guide/video-guide-operation-progress.js";

test("讲解语音任务可独立持久化并恢复", () => {
  const job = createVideoGuideOperationJob({
    operation: "NARRATION_TTS",
    jobId: "tts-job-1",
    operationKey: "tts-billing-1",
    estimatedCredits: 18,
    input: { narrationVoice: "voice-1" },
    now: "2026-07-15T00:00:00.000Z"
  });
  const content = mergeVideoGuideOperationJobContent(
    { narrationScript: "讲解文稿" },
    "narrationTtsGenerationJob",
    job
  );
  const restored = videoGuideOperationJobFromValue<{ narrationVoice: string }>(
    content.narrationTtsGenerationJob
  );

  assert.equal(restored?.operation, "NARRATION_TTS");
  assert.equal(restored?.operationKey, "tts-billing-1");
  assert.equal(restored?.input.narrationVoice, "voice-1");
});

test("异步任务把恢复所需参数和结算键持久化到课件内容", () => {
  const job = createVideoGuideOperationJob({
    operation: "SUBTITLE",
    jobId: "job-1",
    operationKey: "billing-1",
    estimatedCredits: 20,
    input: { mediaUrl: "https://cdn.example.com/video.mp4" },
    now: "2026-07-15T00:00:00.000Z"
  });
  const content = mergeVideoGuideOperationJobContent({ summary: "保留" }, "subtitleGenerationJob", job);

  assert.equal(content.summary, "保留");
  assert.equal(videoGuideOperationJobFromValue(content.subtitleGenerationJob)?.operationKey, "billing-1");
  assert.deepEqual(videoGuideOperationJobFromValue(content.subtitleGenerationJob)?.input, {
    mediaUrl: "https://cdn.example.com/video.mp4"
  });
  assert.equal(videoGuideOperationJobFromValue(content.subtitleGenerationJob)?.attemptId, null);
});

test("恢复后的新执行租约会拒绝旧执行器继续写入", () => {
  const queued = createVideoGuideOperationJob({
    operation: "PRACTICE",
    jobId: "job-1",
    operationKey: "billing-1",
    estimatedCredits: 20,
    input: {},
    now: "2026-07-15T00:00:00.000Z"
  });
  const firstAttempt = leaseVideoGuideOperationJob(queued, "attempt-1");
  const recoveredAttempt = leaseVideoGuideOperationJob(firstAttempt, "attempt-2");

  assert.equal(videoGuideOperationAttemptMatches(firstAttempt, "job-1", "attempt-1"), true);
  assert.equal(videoGuideOperationAttemptMatches(recoveredAttempt, "job-1", "attempt-1"), false);
  assert.equal(videoGuideOperationAttemptMatches(recoveredAttempt, "job-1", "attempt-2"), true);
});

test("排队任务立即恢复，运行任务只有超过租约时间才恢复", () => {
  const queued = createVideoGuideOperationProgress({
    operation: "NARRATION",
    phase: "QUEUED",
    message: "排队",
    now: "2026-07-15T00:00:00.000Z"
  });
  const running = updateVideoGuideOperationProgress(
    queued,
    { status: "RUNNING", phase: "WRITING" },
    "2026-07-15T00:04:00.000Z"
  );

  assert.equal(shouldRecoverVideoGuideOperation(queued, "2026-07-15T00:05:00.000Z", 300_000), true);
  assert.equal(shouldRecoverVideoGuideOperation(running, "2026-07-15T00:05:00.000Z", 300_000), false);
  assert.equal(shouldRecoverVideoGuideOperation(running, "2026-07-15T00:10:00.000Z", 300_000), true);
});
