import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveVideoGuideSubtitleRecognitionTimeoutMs,
  resolveVideoGuideSubtitleRecoveryStaleMs,
  videoGuideSubtitleRecognitionEstimatedPercent
} from "../src/video-guide/video-guide-subtitle-runtime.js";

test("视频导学字幕识别默认允许两小时并拒绝过短配置", () => {
  assert.equal(resolveVideoGuideSubtitleRecognitionTimeoutMs(undefined), 2 * 60 * 60 * 1000);
  assert.equal(resolveVideoGuideSubtitleRecognitionTimeoutMs(30 * 60 * 1000), 2 * 60 * 60 * 1000);
  assert.equal(resolveVideoGuideSubtitleRecognitionTimeoutMs(3 * 60 * 60 * 1000), 3 * 60 * 60 * 1000);
  assert.equal(resolveVideoGuideSubtitleRecognitionTimeoutMs(24 * 60 * 60 * 1000), 12 * 60 * 60 * 1000);
});

test("视频导学字幕识别等待进度从百分之五十单调推进且不占用落库阶段", () => {
  const submittedAt = "2026-08-10T01:00:00.000Z";
  const asrMediaSizeBytes = 5_400_000;

  const initial = videoGuideSubtitleRecognitionEstimatedPercent({
    asrMediaSizeBytes,
    now: "2026-08-10T01:00:00.000Z",
    submittedAt
  });
  const advanced = videoGuideSubtitleRecognitionEstimatedPercent({
    asrMediaSizeBytes,
    now: "2026-08-10T01:12:00.000Z",
    submittedAt
  });
  const capped = videoGuideSubtitleRecognitionEstimatedPercent({
    asrMediaSizeBytes,
    now: "2026-08-10T03:00:00.000Z",
    submittedAt
  });

  assert.equal(initial, 50);
  assert.ok(advanced > initial);
  assert.ok(advanced < 83);
  assert.equal(capped, 82);
});

test("视频导学字幕恢复窗口大于网关最坏请求时间并短于原十五分钟", () => {
  assert.equal(resolveVideoGuideSubtitleRecoveryStaleMs(undefined), 4 * 60 * 1000);
  assert.equal(resolveVideoGuideSubtitleRecoveryStaleMs(10), 3 * 60 * 1000);
  assert.equal(resolveVideoGuideSubtitleRecoveryStaleMs(300), 5 * 60 * 1000);
});
