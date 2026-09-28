import assert from "node:assert/strict";
import test from "node:test";
import {
  NarrationBatchOutputError,
  VIDEO_GUIDE_NARRATION_BATCH_SIZE,
  createNarrationBatches,
  mapWithConcurrency,
  runAdaptiveNarrationBatch
} from "../src/video-guide/video-guide-narration-batches.js";

test("视频导学逐句文案固定每批四句", () => {
  assert.equal(VIDEO_GUIDE_NARRATION_BATCH_SIZE, 4);
});

test("createNarrationBatches keeps sentence order", () => {
  const batches = createNarrationBatches(["s_001", "s_002", "s_003", "s_004", "s_005"], 2);

  assert.deepEqual(batches, [
    ["s_001", "s_002"],
    ["s_003", "s_004"],
    ["s_005"]
  ]);
});

test("runAdaptiveNarrationBatch retries a transient failure", async () => {
  let attempts = 0;

  const result = await runAdaptiveNarrationBatch({
    items: ["s_001", "s_002"],
    maxAttempts: 2,
    generate: async (items) => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("temporary");
      }

      return items.map((item) => `done:${item}`);
    }
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, ["done:s_001", "done:s_002"]);
});

test("runAdaptiveNarrationBatch splits a repeatedly failing batch", async () => {
  const calls: string[][] = [];

  const result = await runAdaptiveNarrationBatch({
    items: ["s_001", "s_002", "s_003", "s_004"],
    maxAttempts: 2,
    generate: async (items) => {
      calls.push(items);

      if (items.length > 2) {
        throw new NarrationBatchOutputError("response truncated");
      }

      return items.map((item) => `done:${item}`);
    }
  });

  assert.deepEqual(calls, [
    ["s_001", "s_002", "s_003", "s_004"],
    ["s_001", "s_002", "s_003", "s_004"],
    ["s_001", "s_002"],
    ["s_003", "s_004"]
  ]);
  assert.deepEqual(result, ["done:s_001", "done:s_002", "done:s_003", "done:s_004"]);
});

test("runAdaptiveNarrationBatch does not split provider failures", async () => {
  const calls: string[][] = [];

  await assert.rejects(
    runAdaptiveNarrationBatch({
      items: ["s_001", "s_002", "s_003", "s_004"],
      maxAttempts: 2,
      generate: async (items) => {
        calls.push(items);
        throw new Error("provider unavailable");
      }
    }),
    /provider unavailable/
  );

  assert.deepEqual(calls, [
    ["s_001", "s_002", "s_003", "s_004"],
    ["s_001", "s_002", "s_003", "s_004"]
  ]);
});

test("runAdaptiveNarrationBatch fails fast when an error is not retryable", async () => {
  let attempts = 0;

  await assert.rejects(
    runAdaptiveNarrationBatch({
      items: ["s_001", "s_002"],
      maxAttempts: 3,
      shouldRetry: () => false,
      generate: async () => {
        attempts += 1;
        throw new Error("invalid credential");
      }
    }),
    /invalid credential/
  );

  assert.equal(attempts, 1);
});

test("runAdaptiveNarrationBatch reports successful splits before a later sentence fails", async () => {
  const persisted: string[][] = [];

  await assert.rejects(
    runAdaptiveNarrationBatch({
      items: ["s_001", "s_002", "s_003", "s_004"],
      maxAttempts: 1,
      generate: async (items) => {
        if (items.length > 1) {
          throw new NarrationBatchOutputError("split required");
        }

        if (items[0] === "s_004") {
          throw new NarrationBatchOutputError("invalid final sentence");
        }

        return items.map((item) => `done:${item}`);
      },
      onSuccess: async (_results, items) => {
        persisted.push(items);
      }
    }),
    /invalid final sentence/
  );

  assert.deepEqual(persisted, [["s_001"], ["s_002"], ["s_003"]]);
});

test("mapWithConcurrency preserves result order and enforces the worker limit", async () => {
  let active = 0;
  let maxActive = 0;

  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 2 : 5));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.equal(maxActive, 2);
});

test("mapWithConcurrency stops claiming queued work but waits for in-flight work after a failure", async () => {
  const completed: number[] = [];
  const started: number[] = [];

  await assert.rejects(
    mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      started.push(value);

      if (value === 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        throw new Error("first batch failed");
      }

      await new Promise((resolve) => setTimeout(resolve, 8));
      completed.push(value);
      return value;
    }),
    /first batch failed/
  );

  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(completed, [2]);
});

test("runAdaptiveNarrationBatch surfaces a single sentence failure", async () => {
  await assert.rejects(
    runAdaptiveNarrationBatch({
      items: ["s_005"],
      maxAttempts: 2,
      generate: async () => {
        throw new Error("invalid output");
      }
    }),
    /invalid output/
  );
});
