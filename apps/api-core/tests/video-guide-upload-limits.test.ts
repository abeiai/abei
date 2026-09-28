import assert from "node:assert/strict";
import test from "node:test";

import {
  videoGuideAudioMaxBytes,
  videoGuideMediaMaxBytes,
  videoGuideMediaMaxBytesFor,
  videoGuideVideoMaxBytes
} from "../src/video-guide/video-guide-upload-limits.js";

test("视频导学按媒体类型使用不同的上传上限", () => {
  assert.equal(videoGuideVideoMaxBytes, 500 * 1024 * 1024);
  assert.equal(videoGuideAudioMaxBytes, 100 * 1024 * 1024);
  assert.equal(videoGuideMediaMaxBytes, videoGuideVideoMaxBytes);
  assert.equal(videoGuideMediaMaxBytesFor("VIDEO"), videoGuideVideoMaxBytes);
  assert.equal(videoGuideMediaMaxBytesFor("AUDIO"), videoGuideAudioMaxBytes);
});
