import assert from "node:assert/strict";
import test from "node:test";
import {
  flushVideoPlaybackRange,
  videoGuidePartKey
} from "../src/lib/video-guide-learning-tracking.js";

test("视频导学五阶段映射固定", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(videoGuidePartKey), [
    "AUTONOMOUS",
    "GUIDED",
    "HIGHLIGHTS",
    "PRACTICE",
    "READ_ALONG"
  ]);
  assert.throws(() => videoGuidePartKey(5), RangeError);
});

test("跳播不生成跨越区间", () => {
  assert.equal(flushVideoPlaybackRange(10, 90, true), null);
  assert.deepEqual(flushVideoPlaybackRange(10, 14, true), {
    startSeconds: 10,
    endSeconds: 14
  });
  assert.equal(flushVideoPlaybackRange(10, 14, false), null);
  assert.equal(flushVideoPlaybackRange(14, 10, true), null);
});
