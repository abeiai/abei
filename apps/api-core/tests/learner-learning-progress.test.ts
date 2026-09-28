import assert from "node:assert/strict";
import test from "node:test";
import {
  coveragePercent,
  evaluateMaterialProgress,
  evaluatePartProgress,
  learningSecondsForPlayback,
  materialProgressKey,
  mergePlaybackRanges,
  mergeStableIds
} from "../src/learner-learning/learner-learning-progress.js";

test("播放区间按并集合并，拖到结尾不等于完整播放", () => {
  const ranges = mergePlaybackRanges([], [
    { startSeconds: 0, endSeconds: 20 },
    { startSeconds: 15, endSeconds: 30 },
    { startSeconds: 90, endSeconds: 100 }
  ]);
  assert.deepEqual(ranges, [
    { startSeconds: 0, endSeconds: 30 },
    { startSeconds: 90, endSeconds: 100 }
  ]);
  assert.equal(coveragePercent(ranges, 100), 40);
  assert.equal(
    coveragePercent(
      [
        { startSeconds: 0, endSeconds: 80 },
        { startSeconds: 0, endSeconds: 80 }
      ],
      100
    ),
    80
  );
});

test("媒体和跟读达到 80%，练习全部提交，闪卡完成全轮", () => {
  assert.equal(
    evaluatePartProgress({ kind: "COVERAGE", completed: 8, total: 10 }).status,
    "COMPLETED"
  );
  assert.equal(
    evaluatePartProgress({ kind: "PRACTICE", completed: 9, total: 10 }).status,
    "IN_PROGRESS"
  );
  assert.equal(
    evaluatePartProgress({ kind: "FLASHCARD_ROUND", completed: 10, total: 10 }).status,
    "COMPLETED"
  );
});

test("总体完成要求所有实际存在部分完成", () => {
  const result = evaluateMaterialProgress([
    { status: "COMPLETED", progressPercent: 100 },
    { status: "IN_PROGRESS", progressPercent: 80 }
  ]);
  assert.equal(result.status, "IN_PROGRESS");
  assert.equal(result.progressPercent, 90);
  assert.deepEqual(evaluateMaterialProgress([]), {
    status: "NOT_STARTED",
    progressPercent: 0
  });
});

test("稳定节点只保留服务端白名单，内容版本和墙钟时长独立", () => {
  assert.deepEqual(
    mergeStableIds(["node-2", "forged"], ["node-1", "node-2"], ["node-1", "node-2"]),
    ["node-1", "node-2"]
  );
  assert.notEqual(
    materialProgressKey("learner-1", "VIDEO_GUIDE", "video-1", "hash-v1"),
    materialProgressKey("learner-1", "VIDEO_GUIDE", "video-1", "hash-v2")
  );
  assert.equal(
    learningSecondsForPlayback({ wallClockSeconds: 40, playbackRate: 2 }),
    40
  );
});
