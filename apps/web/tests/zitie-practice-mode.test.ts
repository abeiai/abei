import assert from "node:assert/strict";
import test from "node:test";

import {
  exampleCountsForMode,
  practiceModesForTemplate,
} from "../src/components/zitie/practice-mode";

test("示范模式只生成一个深色示范字", () => {
  assert.deepEqual(exampleCountsForMode("sample", 6), {
    darkExampleCount: 1,
    traceExampleCount: 0,
  });
});

test("八行笺仅提供示范和隔行", () => {
  assert.deepEqual(practiceModesForTemplate("eight-line"), [
    "sample",
    "alternate",
  ]);
});

test("其他模板在原排版前增加示范", () => {
  assert.deepEqual(practiceModesForTemplate("english"), [
    "sample",
    "word",
    "alternate",
    "letter",
  ]);
});
