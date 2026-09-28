import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalBucketStart,
  heartbeatDeltaSeconds,
  heartbeatIsActive,
  preferTimeSlice,
  shanghaiDateKey
} from "../src/learner-learning/learner-learning-time.js";

test("空闲 120 秒、页面隐藏和失焦停止计时，媒体播放可维持活动", () => {
  const now = new Date("2026-08-19T08:00:00.000Z");
  const base = {
    pageVisible: true,
    hasFocus: true,
    mediaPlaying: false,
    lastInteractionAt: "2026-08-19T07:59:00.000Z"
  };

  assert.equal(heartbeatIsActive(base, now), true);
  assert.equal(heartbeatIsActive({ ...base, pageVisible: false }, now), false);
  assert.equal(heartbeatIsActive({ ...base, hasFocus: false }, now), false);
  assert.equal(
    heartbeatIsActive({ ...base, hasFocus: false, mediaPlaying: true }, now),
    true
  );
  assert.equal(
    heartbeatIsActive({
      ...base,
      hasFocus: false,
      mediaPlaying: true,
      lastInteractionAt: "2026-08-19T07:00:00.000Z"
    }, now),
    true
  );
  assert.equal(
    heartbeatIsActive(
      { ...base, lastInteractionAt: "2026-08-19T07:57:59.000Z" },
      now
    ),
    false
  );
});

test("时间规则覆盖心跳上限、边界、规范桶和北京时间分日", () => {
  const now = new Date("2026-08-19T08:00:00.000Z");
  assert.equal(
    heartbeatIsActive(
      {
        pageVisible: true,
        hasFocus: true,
        mediaPlaying: false,
        lastInteractionAt: "2026-08-19T07:58:00.001Z"
      },
      now
    ),
    true
  );
  assert.equal(
    heartbeatIsActive(
      {
        pageVisible: true,
        hasFocus: true,
        mediaPlaying: false,
        lastInteractionAt: "2026-08-19T07:57:59.999Z"
      },
      now
    ),
    false
  );
  assert.equal(
    heartbeatIsActive(
      {
        pageVisible: true,
        hasFocus: true,
        mediaPlaying: false,
        lastInteractionAt: "2026-08-19T08:00:00.001Z"
      },
      now
    ),
    false
  );
  assert.equal(
    heartbeatDeltaSeconds(
      new Date("2026-08-19T07:59:00.000Z"),
      new Date("2026-08-19T08:01:00.000Z")
    ),
    30
  );
  assert.equal(
    heartbeatDeltaSeconds(
      new Date("2026-08-19T08:00:01.000Z"),
      new Date("2026-08-19T08:00:00.000Z")
    ),
    0
  );
  assert.equal(
    canonicalBucketStart(new Date("2026-08-19T08:00:44.000Z")).toISOString(),
    "2026-08-19T08:00:30.000Z"
  );
  assert.equal(shanghaiDateKey(new Date("2026-08-18T16:00:01.000Z")), "2026-08-19");
  assert.equal(shanghaiDateKey(new Date("2026-08-19T15:59:59.000Z")), "2026-08-19");
  assert.equal(shanghaiDateKey(new Date("2026-08-19T16:00:01.000Z")), "2026-08-20");
});

test("同一时间桶优先保留更强的学习信号", () => {
  assert.equal(
    preferTimeSlice(
      {
        activitySignal: "INTERACTION",
        receivedAt: new Date("2026-08-19T08:00:10.000Z")
      },
      {
        activitySignal: "PRACTICE",
        receivedAt: new Date("2026-08-19T08:00:09.000Z")
      }
    ).activitySignal,
    "PRACTICE"
  );
  assert.equal(
    preferTimeSlice(
      {
        activitySignal: "FLASHCARD",
        receivedAt: new Date("2026-08-19T08:00:09.000Z")
      },
      {
        activitySignal: "FLASHCARD",
        receivedAt: new Date("2026-08-19T08:00:10.000Z")
      }
    ).receivedAt.toISOString(),
    "2026-08-19T08:00:10.000Z"
  );
});
