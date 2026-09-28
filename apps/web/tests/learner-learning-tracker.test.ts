import assert from "node:assert/strict";
import test from "node:test";
import {
  createTrackerState,
  emptyEventQueue,
  heartbeatPayload,
  nextLearningEvent,
  recordInteraction,
  retryLearningEvent
} from "../src/lib/learner-learning-tracker.js";

test("采集器隐藏和空闲后停止心跳，恢复交互后继续", () => {
  const state = createTrackerState(new Date("2026-08-19T08:00:00.000Z"));
  assert.equal(
    heartbeatPayload(state, new Date("2026-08-19T08:01:59.000Z")).pageVisible,
    true
  );
  assert.equal(
    heartbeatPayload(state, new Date("2026-08-19T08:02:01.000Z")).active,
    false
  );
  const resumed = recordInteraction(state, new Date("2026-08-19T08:02:02.000Z"));
  assert.equal(
    heartbeatPayload(resumed, new Date("2026-08-19T08:02:03.000Z")).active,
    true
  );
});

test("事件序号单调递增且重试保持同一事件 ID", () => {
  const first = nextLearningEvent(emptyEventQueue(), {
    type: "MATERIAL_STARTED",
    partKey: "INTRO"
  });
  const second = nextLearningEvent(first.queue, {
    type: "NODE_LEARNED",
    partKey: "GUIDED",
    itemId: "node-1"
  });
  const retry = retryLearningEvent(second.queue, first.event.eventId);

  assert.equal(first.event.sequence, 1);
  assert.equal(second.event.sequence, 2);
  assert.equal(retry?.eventId, first.event.eventId);
  assert.equal(retry?.sequence, 1);
});

test("事件队列最多保留 200 条低敏事件", () => {
  let queue = emptyEventQueue();
  for (let index = 0; index < 205; index += 1) {
    queue = nextLearningEvent(queue, {
      type: "MATERIAL_STARTED",
      partKey: `PART_${index}`
    }).queue;
  }
  assert.equal(queue.events.length, 200);
  assert.equal(queue.nextSequence, 206);
});
