import assert from "node:assert/strict";
import test from "node:test";

import {
  videoGuideAsrCacheFromAsset,
  videoGuideAsrCacheObjectKey
} from "../src/video-guide/video-guide-asr-cache.js";

test("只有完整的媒体资产识别音频字段才可复用", () => {
  assert.equal(videoGuideAsrCacheFromAsset({ asrObjectKey: null }), null);
  assert.equal(
    videoGuideAsrCacheFromAsset({
      asrMimeType: "audio/mp4",
      asrObjectKey: "video-guide/asr-cache/sha256/ab/abcdef.m4a",
      asrPreparedAt: null,
      asrSizeBytes: 1024
    }),
    null
  );
  assert.deepEqual(
    videoGuideAsrCacheFromAsset({
      asrMimeType: "audio/mp4",
      asrObjectKey: "video-guide/asr-cache/sha256/ab/abcdef.m4a",
      asrPreparedAt: new Date("2026-07-22T08:00:00.000Z"),
      asrSizeBytes: 1024
    }),
    {
      mimeType: "audio/mp4",
      objectKey: "video-guide/asr-cache/sha256/ab/abcdef.m4a",
      sizeBytes: 1024
    }
  );
});

test("识别音频 key 由媒体哈希稳定生成", () => {
  const hash = `ab${"1".repeat(62)}`;

  assert.equal(
    videoGuideAsrCacheObjectKey(hash),
    `video-guide/asr-cache/sha256/ab/${hash}.m4a`
  );
  assert.throws(() => videoGuideAsrCacheObjectKey("not-a-hash"), /无效的媒体文件哈希/);
});
