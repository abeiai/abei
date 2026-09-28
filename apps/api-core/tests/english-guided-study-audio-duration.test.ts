import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFfprobeDurationMs,
  totalNarrationDurationMs
} from "../src/english-guided-study/english-guided-study-audio-duration.js";

test("ffprobe 秒数转换为毫秒并保留真实精度", () => {
  assert.equal(parseFfprobeDurationMs("189.288000\n"), 189_288);
  assert.equal(parseFfprobeDurationMs("0.1049"), 105);
  assert.equal(parseFfprobeDurationMs("60.0001"), 60_001);
});

test("ffprobe 非法输出不能返回估算时长", () => {
  assert.throws(() => parseFfprobeDurationMs("N/A"), /无法读取讲解音频真实时长/);
  assert.throws(() => parseFfprobeDurationMs("0"), /无法读取讲解音频真实时长/);
});

test("节点总时长严格等于真实节点时长之和", () => {
  assert.equal(totalNarrationDurationMs([{ durationMs: 1_250 }, { durationMs: 2_875 }, { durationMs: 400 }]), 4_525);
});
