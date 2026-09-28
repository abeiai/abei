import assert from "node:assert/strict";
import test from "node:test";

import {
  isVideoDurationShort,
  parseVideoDurationSeconds
} from "../src/ai/video-output-duration.js";

test("视频真实时长明显短于请求值时判定为不合格", () => {
  assert.equal(isVideoDurationShort(5, 3.75), true);
  assert.equal(isVideoDurationShort(5, 4.92), false);
});

test("ffprobe 输出解析保留真实视频秒数", () => {
  assert.equal(parseVideoDurationSeconds("3.750000\n"), 3.75);
  assert.throws(() => parseVideoDurationSeconds("N/A"), /视频时长/u);
});
