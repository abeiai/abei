import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  extractVideoGuideAsrAudioFromBuffer,
  videoGuideHistoricalAsrPreprocessTimeoutFallbackMs
} from "../src/video-guide/video-guide-media-transcode.js";
import * as mediaTranscode from "../src/video-guide/video-guide-media-transcode.js";

function createTinyVideoWithAudio() {
  const directory = mkdtempSync(join(tmpdir(), "xueleai-asr-source-"));
  const outputPath = join(directory, "source.mp4");

  try {
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=64x36:duration=0.5:rate=5",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=0.5:sample_rate=44100",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath
    ]);

    return readFileSync(outputPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("上传缓冲区直接生成十六千赫兹单声道识别音频", async () => {
  const source = createTinyVideoWithAudio();
  const progressEvents: number[] = [];
  const result = await extractVideoGuideAsrAudioFromBuffer(
    {
      buffer: source,
      mimetype: "video/mp4",
      originalname: "lesson.mp4",
      size: source.length
    },
    {
      onProgress: (percent) => progressEvents.push(percent)
    }
  );
  const directory = mkdtempSync(join(tmpdir(), "xueleai-asr-output-"));
  const outputPath = join(directory, "output.m4a");

  try {
    writeFileSync(outputPath, result.buffer);
    const probe = JSON.parse(execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=sample_rate,channels",
      "-of",
      "json",
      outputPath
    ], { encoding: "utf8" })) as {
      streams: Array<{ channels: number; sample_rate: string }>;
    };

    assert.equal(result.mimetype, "audio/mp4");
    assert.equal(result.originalname, "lesson.asr.m4a");
    assert.ok(result.size > 0);
    assert.ok(progressEvents.some((percent) => percent > 0 && percent < 100));
    assert.equal(probe.streams[0]?.sample_rate, "16000");
    assert.equal(probe.streams[0]?.channels, 1);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("历史媒体远程提取的默认超时为九十分钟", () => {
  assert.equal(videoGuideHistoricalAsrPreprocessTimeoutFallbackMs, 90 * 60 * 1_000);
});

test("FFmpeg 时间轴按媒体总时长换算真实转换进度", () => {
  const calculateProgress = (mediaTranscode as Record<string, unknown>).videoGuideFfmpegProgressPercent;

  assert.equal(typeof calculateProgress, "function");

  const progress = calculateProgress as (outTime: string, durationSeconds: number) => number | null;

  assert.equal(progress("00:00:25.000000", 100), 25);
  assert.equal(progress("00:01:39.900000", 100), 99);
  assert.equal(progress("invalid", 100), null);
  assert.equal(progress("00:00:10.000000", 0), null);
});
