import assert from "node:assert/strict";
import test from "node:test";

import { VideoGuideService } from "../src/video-guide/video-guide.service.js";
import {
  mergeNarrationGenerationCheckpoint,
  mergeNarrationGenerationCheckpointContent,
  type NarrationGenerationCheckpoint
} from "../src/video-guide/video-guide-narration-checkpoint.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};

interface GenerationInput {
  attribution: {
    userId: string;
    learnerId: string | null;
    rootScenarioId: string | null;
  };
  content: unknown;
  cues: Array<{
    sentenceId: string;
    text: string;
    timeRange: string;
    startSeconds: number;
    endSeconds: number;
  }>;
  generationId: string;
  lessonId: string;
  mediaTitle: string;
}

interface VideoGuideServiceInternals {
  generateNarrationTimelineDraftInBatches(input: GenerationInput): Promise<{
    nodes: Array<{ id: string; type: string }>;
  }>;
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
        sentenceId?: string;
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
}

const cues = Array.from({ length: 9 }, (_, index) => {
  const sequence = index + 1;
  const sentenceId = `s_${String(sequence).padStart(3, "0")}`;

  return {
    sentenceId,
    text: `Sentence ${sequence}.`,
    timeRange: `00:${String(index).padStart(2, "0")} - 00:${String(sequence).padStart(2, "0")}`,
    startSeconds: index,
    endSeconds: sequence
  };
});

function serviceHarness(initialCheckpoint: NarrationGenerationCheckpoint | null = null) {
  const calls: Array<{
    userId: string;
    learnerId: string | null;
    rootScenarioId: string | null;
    mode: string;
    maxTokens: number | undefined;
    reasoningEnabled: unknown;
    rows: Array<{
      sentenceId: string;
      total: number;
      previousText: string | null;
      nextText: string | null;
    }>;
  }> = [];
  const persisted: NarrationGenerationCheckpoint[] = [];
  const persistedProgress: Array<{ completed: number; message: string }> = [];
  let activeSentenceCalls = 0;
  let maxActiveSentenceCalls = 0;
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      userId: string;
      learnerId: string | null;
      rootScenarioId: string | null;
      maxTokens?: number;
      reasoningEnabled?: boolean;
      variables: Record<string, string>;
    }) => {
      const mode = input.variables.generationMode;
      const rows = JSON.parse(input.variables.subtitleJson) as Array<{
        sentenceId: string;
        total: number;
        previousText: string | null;
        nextText: string | null;
      }>;
      calls.push({
        userId: input.userId,
        learnerId: input.learnerId,
        rootScenarioId: input.rootScenarioId,
        mode,
        maxTokens: input.maxTokens,
        reasoningEnabled: input.reasoningEnabled,
        rows
      });

      if (mode === "SENTENCES") {
        activeSentenceCalls += 1;
        maxActiveSentenceCalls = Math.max(maxActiveSentenceCalls, activeSentenceCalls);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeSentenceCalls -= 1;
      }

      const text =
        mode === "INTRO"
          ? JSON.stringify({ intro: { script: "课程导入。" } })
          : mode === "SUMMARY"
            ? JSON.stringify({ summary: { script: "课程总结。" } })
            : JSON.stringify({
                sentences: rows.map((row) => ({
                  sentenceId: row.sentenceId,
                  script: `${row.sentenceId} 的老师讲解。`
                }))
              });

      return {
        taskId: `task-${calls.length}`,
        text,
        providerName: "aliyun",
        modelName: "qwen-plus"
      };
    }
  };
  const service = new VideoGuideService(
    {} as never,
    aiService as never,
    courseReviewService as never
  ) as unknown as VideoGuideServiceInternals;
  let latestCheckpoint: NarrationGenerationCheckpoint | null = initialCheckpoint;

  service.persistNarrationGenerationCheckpoint = async (_lessonId, _generationId, input) => {
    latestCheckpoint = mergeNarrationGenerationCheckpoint(latestCheckpoint, {
      sourceHash: input.sourceHash,
      batchSize: 4,
      totalBatches: input.totalBatches,
      nodes: input.nodes,
      metadata: input.metadata,
      now: `2026-07-16T00:00:0${persisted.length}.000Z`
    });
    persisted.push(latestCheckpoint);
    persistedProgress.push({
      completed: input.completed,
      message: input.message
    });
    return latestCheckpoint;
  };

  return {
    calls,
    persisted,
    persistedProgress,
    service,
    checkpoint: () => latestCheckpoint,
    maxActiveSentenceCalls: () => maxActiveSentenceCalls
  };
}

const learnerAttribution = {
  userId: "user-1",
  learnerId: "learner-1",
  rootScenarioId: "video-root"
};

test("导入、四句批次和总结分别生成且全部显式关闭思考", async () => {
  const harness = serviceHarness();
  const result = await harness.service.generateNarrationTimelineDraftInBatches({
    attribution: learnerAttribution,
    content: {},
    cues,
    generationId: "generation-1",
    lessonId: "lesson-1",
    mediaTitle: "Nine Sentences"
  });

  assert.deepEqual(harness.calls.map((call) => call.mode), [
    "INTRO",
    "SENTENCES",
    "SENTENCES",
    "SENTENCES",
    "SUMMARY"
  ]);
  assert.deepEqual(
    harness.calls.filter((call) => call.mode === "SENTENCES").map((call) => call.rows.length),
    [4, 4, 1]
  );
  assert.equal(harness.calls.every((call) => call.reasoningEnabled === false), true);
  assert.equal(harness.calls.every((call) =>
    call.userId === "user-1"
    && call.learnerId === "learner-1"
    && call.rootScenarioId === "video-root"), true);
  assert.equal(harness.maxActiveSentenceCalls(), 2);
  assert.equal(
    harness.calls.filter((call) => call.mode === "SENTENCES").every((call) => (call.maxTokens ?? 0) <= 2200),
    true
  );
  const firstSentenceBatch = harness.calls.find((call) => call.mode === "SENTENCES")?.rows;
  assert.equal(firstSentenceBatch?.[0]?.total, cues.length);
  assert.equal(firstSentenceBatch?.[3]?.nextText, cues[4]?.text);
  assert.equal(harness.persisted.length, 5);
  assert.equal(harness.persistedProgress.at(-1)?.completed, 95);
  assert.match(harness.persistedProgress.at(-1)?.message ?? "", /9\/9/);
  assert.deepEqual(result.nodes.map((node) => node.id), [
    "intro",
    ...cues.map((cue) => cue.sentenceId),
    "summary"
  ]);
});

test("检查点完整时恢复生成不会重复调用模型", async () => {
  const first = serviceHarness();
  await first.service.generateNarrationTimelineDraftInBatches({
    attribution: learnerAttribution,
    content: {},
    cues,
    generationId: "generation-1",
    lessonId: "lesson-1",
    mediaTitle: "Nine Sentences"
  });
  const checkpoint = first.checkpoint();
  assert.ok(checkpoint);

  const resumed = serviceHarness();
  const result = await resumed.service.generateNarrationTimelineDraftInBatches({
    attribution: learnerAttribution,
    content: mergeNarrationGenerationCheckpointContent({}, checkpoint),
    cues,
    generationId: "generation-2",
    lessonId: "lesson-1",
    mediaTitle: "Nine Sentences"
  });

  assert.equal(resumed.calls.length, 0);
  assert.equal(resumed.persisted.length, 0);
  assert.deepEqual(result.nodes.map((node) => node.id), [
    "intro",
    ...cues.map((cue) => cue.sentenceId),
    "summary"
  ]);
});

test("部分检查点恢复时只生成剩余句子批次和总结", async () => {
  const first = serviceHarness();
  await first.service.generateNarrationTimelineDraftInBatches({
    attribution: learnerAttribution,
    content: {},
    cues,
    generationId: "generation-1",
    lessonId: "lesson-1",
    mediaTitle: "Nine Sentences"
  });
  const partialCheckpoint = first.persisted[1];
  assert.ok(partialCheckpoint);
  assert.deepEqual(
    partialCheckpoint.nodes.map((node) => node.id),
    ["intro", "s_001", "s_002", "s_003", "s_004"]
  );

  const resumed = serviceHarness(partialCheckpoint);
  const result = await resumed.service.generateNarrationTimelineDraftInBatches({
    attribution: learnerAttribution,
    content: mergeNarrationGenerationCheckpointContent({}, partialCheckpoint),
    cues,
    generationId: "generation-2",
    lessonId: "lesson-1",
    mediaTitle: "Nine Sentences"
  });

  assert.deepEqual(resumed.calls.map((call) => call.mode), ["SENTENCES", "SENTENCES", "SUMMARY"]);
  assert.deepEqual(
    resumed.calls.filter((call) => call.mode === "SENTENCES").map((call) => call.rows.map((row) => row.sentenceId)),
    [
      ["s_005", "s_006", "s_007", "s_008"],
      ["s_009"]
    ]
  );
  assert.equal(resumed.calls.every((call) => call.reasoningEnabled === false), true);
  assert.equal(resumed.persisted.length, 3);
  assert.deepEqual(result.nodes.map((node) => node.id), [
    "intro",
    ...cues.map((cue) => cue.sentenceId),
    "summary"
  ]);
});

test("拆分后的成功句子立即写入检查点，后续失败不会丢失", async () => {
  const partialCues = cues.slice(0, 4);
  let checkpoint: NarrationGenerationCheckpoint | null = null;
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: Record<string, string>;
    }) => {
      const mode = input.variables.generationMode;
      const rows = JSON.parse(input.variables.subtitleJson) as Array<{ sentenceId: string }>;
      const text =
        mode === "INTRO"
          ? JSON.stringify({ intro: { script: "课程导入。" } })
          : mode === "SUMMARY"
            ? JSON.stringify({ summary: { script: "课程总结。" } })
            : rows.length > 1 || rows[0]?.sentenceId === "s_004"
              ? JSON.stringify({ sentences: [] })
              : JSON.stringify({
                  sentences: [{ sentenceId: rows[0]?.sentenceId, script: "老师讲解。" }]
                });

      return {
        taskId: `task-${mode}-${rows.map((row) => row.sentenceId).join("-")}`,
        text,
        providerName: "aliyun",
        modelName: "qwen-plus"
      };
    }
  };
  const service = new VideoGuideService(
    {} as never,
    aiService as never,
    courseReviewService as never
  ) as unknown as VideoGuideServiceInternals;

  service.persistNarrationGenerationCheckpoint = async (_lessonId, _generationId, input) => {
    checkpoint = mergeNarrationGenerationCheckpoint(checkpoint, {
      sourceHash: input.sourceHash,
      batchSize: 4,
      totalBatches: input.totalBatches,
      nodes: input.nodes,
      metadata: input.metadata,
      now: new Date().toISOString()
    });
    return checkpoint;
  };

  await assert.rejects(
    service.generateNarrationTimelineDraftInBatches({
      attribution: learnerAttribution,
      content: {},
      cues: partialCues,
      generationId: "generation-partial",
      lessonId: "lesson-partial",
      mediaTitle: "Partial persistence"
    }),
    /s_004/
  );

  assert.deepEqual(checkpoint?.nodes.map((node) => node.id), ["intro", "s_001", "s_002", "s_003"]);
});
