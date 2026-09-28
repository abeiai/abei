import assert from "node:assert/strict";
import test from "node:test";
import {
  completedGuidedNodeIds,
  flushGuidedStudyPlaybackRange,
  guidedStudyPartKey
} from "../src/lib/english-guided-study-tracking.js";

test("英文和古诗文共用四部分映射", () => {
  assert.equal(guidedStudyPartKey("demonstration"), "DEMONSTRATION");
  assert.equal(guidedStudyPartKey("guided"), "GUIDED");
  assert.equal(guidedStudyPartKey("practice"), "PRACTICE");
  assert.equal(guidedStudyPartKey("readAlong"), "READ_ALONG");
});

test("本地恢复位置不会直接标记服务端节点完成", () => {
  assert.deepEqual(
    completedGuidedNodeIds(
      { restored: true, index: 0 },
      { restored: true, index: 8 },
      ["n1", "n2"]
    ),
    []
  );
  assert.deepEqual(
    completedGuidedNodeIds(
      { restored: false, index: -1 },
      { restored: false, index: 1 },
      ["n1", "n2", "n3"]
    ),
    ["n1", "n2"]
  );
});

test("示范朗读跳播不生成跨越区间", () => {
  assert.equal(flushGuidedStudyPlaybackRange(2, 30, true), null);
  assert.deepEqual(flushGuidedStudyPlaybackRange(2, 8, true), {
    startSeconds: 2,
    endSeconds: 8
  });
});
