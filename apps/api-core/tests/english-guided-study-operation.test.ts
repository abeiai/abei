import assert from "node:assert/strict";
import test from "node:test";

import {
  createEnglishGuidedStudyJob,
  createEnglishGuidedStudyProgress,
  englishGuidedStudyAttemptMatches,
  englishGuidedStudyJobFromValue,
  leaseEnglishGuidedStudyJob,
  shouldRecoverEnglishGuidedStudyOperation,
  updateEnglishGuidedStudyProgress
} from "../src/english-guided-study/english-guided-study-operation.js";

test("英文带学后台任务记录排队、执行和完成进度", () => {
  const queued = createEnglishGuidedStudyProgress({
    operation: "CONTENT",
    phase: "QUEUED",
    message: "已提交",
    now: "2026-07-27T00:00:00.000Z",
    total: 4
  });
  const running = updateEnglishGuidedStudyProgress(
    queued,
    {
      status: "RUNNING",
      phase: "WRITING",
      completed: 2,
      message: "正在生成"
    },
    "2026-07-27T00:00:01.000Z"
  );
  const completed = updateEnglishGuidedStudyProgress(
    running,
    {
      status: "SUCCEEDED",
      phase: "COMPLETED",
      message: "生成完成"
    },
    "2026-07-27T00:00:02.000Z"
  );

  assert.equal(running.percent, 50);
  assert.equal(running.canLeave, true);
  assert.equal(completed.percent, 100);
  assert.equal(completed.finishedAt, "2026-07-27T00:00:02.000Z");
});

test("英文带学后台任务支持租约校验和服务重启恢复", () => {
  const job = createEnglishGuidedStudyJob({
    operation: "AUDIO",
    jobId: "job-1",
    operationKey: "operation-1",
    estimatedCredits: 20,
    input: { voice: "longanyang" },
    now: "2026-07-27T00:00:00.000Z"
  });
  const leased = leaseEnglishGuidedStudyJob(job, "attempt-1");
  const running = updateEnglishGuidedStudyProgress(
    createEnglishGuidedStudyProgress({
      operation: "AUDIO",
      phase: "QUEUED",
      message: "已提交",
      now: "2026-07-27T00:00:00.000Z"
    }),
    {
      status: "RUNNING",
      phase: "SYNTHESIZING"
    },
    "2026-07-27T00:00:01.000Z"
  );

  assert.equal(englishGuidedStudyJobFromValue(leased)?.attemptId, "attempt-1");
  assert.equal(englishGuidedStudyAttemptMatches(leased, "job-1", "attempt-1"), true);
  assert.equal(
    shouldRecoverEnglishGuidedStudyOperation(running, "2026-07-27T00:03:00.000Z", 120_000),
    true
  );
});

test("英文带学练习使用独立的后台任务类型", () => {
  const job = createEnglishGuidedStudyJob({
    operation: "PRACTICE",
    jobId: "practice-job-1",
    operationKey: "practice-operation-1",
    estimatedCredits: 0,
    input: {},
    now: "2026-07-27T00:00:00.000Z"
  });
  const progress = createEnglishGuidedStudyProgress({
    operation: "PRACTICE",
    phase: "QUEUED",
    message: "练习任务已提交",
    now: "2026-07-27T00:00:00.000Z"
  });

  assert.equal(englishGuidedStudyJobFromValue(job)?.operation, "PRACTICE");
  assert.equal(progress.operation, "PRACTICE");
  assert.equal(progress.status, "QUEUED");
});

test("英文跟读训练使用独立且可恢复的后台任务类型", () => {
  const job = createEnglishGuidedStudyJob({
    operation: "READ_ALOUD",
    jobId: "read-aloud-job-1",
    operationKey: "read-aloud-operation-1",
    estimatedCredits: 12,
    input: { mode: "GENERATE", voice: "longanyang" },
    now: "2026-07-29T00:00:00.000Z"
  });
  const progress = createEnglishGuidedStudyProgress({
    operation: "READ_ALOUD",
    phase: "QUEUED",
    message: "跟读音频任务已提交",
    now: "2026-07-29T00:00:00.000Z"
  });

  assert.equal(englishGuidedStudyJobFromValue(job)?.operation, "READ_ALOUD");
  assert.equal(progress.operation, "READ_ALOUD");
  assert.equal(progress.status, "QUEUED");
});
