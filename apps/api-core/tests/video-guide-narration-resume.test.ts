import assert from "node:assert/strict";
import test from "node:test";

import { resumableNarrationTtsCheckpointId } from "../src/video-guide/video-guide-narration-resume.js";

const expected = {
  draftRevision: "draft-revision-1",
  narrationTtsModelAlias: "tts-default",
  narrationVoice: "longxia"
};

function failedContent(overrides: Record<string, unknown> = {}) {
  return {
    narrationTtsGenerationProgress: {
      version: 1,
      operation: "NARRATION_TTS",
      status: "FAILED"
    },
    narrationTtsGenerationJob: {
      version: 1,
      jobId: "job-1",
      attemptId: "attempt-1",
      operation: "NARRATION_TTS",
      operationKey: "operation-1",
      estimatedCredits: 3,
      createdAt: "2026-08-08T00:00:00.000Z",
      input: {
        ...expected,
        checkpointId: "checkpoint-1"
      }
    },
    narrationAudioProgress: {
      generationId: "checkpoint-1"
    },
    ...overrides
  };
}

test("相同文案、音色和模型的失败任务复用原断点", () => {
  assert.equal(
    resumableNarrationTtsCheckpointId(failedContent(), expected),
    "checkpoint-1"
  );
});

test("文案或音色发生变化时不复用失败任务断点", () => {
  assert.equal(
    resumableNarrationTtsCheckpointId(failedContent(), {
      ...expected,
      draftRevision: "draft-revision-2"
    }),
    null
  );
  assert.equal(
    resumableNarrationTtsCheckpointId(failedContent(), {
      ...expected,
      narrationVoice: "longwan"
    }),
    null
  );
});

test("已成功任务主动重新合成时创建新断点", () => {
  assert.equal(
    resumableNarrationTtsCheckpointId(
      failedContent({
        narrationTtsGenerationProgress: {
          version: 1,
          operation: "NARRATION_TTS",
          status: "SUCCEEDED"
        }
      }),
      expected
    ),
    null
  );
});
