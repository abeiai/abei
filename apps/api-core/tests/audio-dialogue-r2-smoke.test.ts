import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { persistDialogueClip, mergeDialogueAudio, type PersistedDialogueAudio } from "../src/audio/dialogue-audio.js";
import { deletePersistedVideoGuideNarrationAudio, type VideoGuideNarrationR2Config } from "../src/audio/video-guide-narration-storage.js";

const run = promisify(execFile);
const env = (primary: string, fallback: string, defaultValue = "") => process.env[primary]?.trim() || process.env[fallback]?.trim() || defaultValue;

test("可选真实 R2 验收：分句上传、静音合并及公网下载", {
  skip: process.env.DIALOGUE_R2_SMOKE_ENABLED !== "1",
  timeout: 180_000
}, async () => {
  const identity = {
    userId: process.env.DIALOGUE_R2_SMOKE_USER_ID || `smoke-${randomUUID()}`,
    projectId: process.env.DIALOGUE_R2_SMOKE_PROJECT_ID || `smoke-${randomUUID()}`,
    generationId: `smoke-${randomUUID()}`
  };
  const prefix = (process.env.DIALOGUE_AUDIO_R2_PREFIX?.trim() || "audio/dialogue/").replace(/\/+$/, "") + "/";
  const config: VideoGuideNarrationR2Config = {
    endpoint: env("S3_ENDPOINT", "VIDEO_GUIDE_R2_ENDPOINT"),
    bucket: env("S3_BUCKET", "VIDEO_GUIDE_R2_BUCKET", "xueleai"),
    region: env("S3_REGION", "VIDEO_GUIDE_R2_REGION", "auto"),
    accessKeyId: env("S3_ACCESS_KEY_ID", "VIDEO_GUIDE_R2_ACCESS_KEY_ID"),
    secretAccessKey: env("S3_SECRET_ACCESS_KEY", "VIDEO_GUIDE_R2_SECRET_ACCESS_KEY"),
    publicBaseUrl: env("S3_PUBLIC_BASE_URL", "VIDEO_GUIDE_R2_PUBLIC_BASE_URL"),
    pathStyle: env("S3_FORCE_PATH_STYLE", "VIDEO_GUIDE_R2_FORCE_PATH_STYLE", "1") !== "0",
    prefix: `${prefix}${identity.userId}/${identity.projectId}/${identity.generationId}/`,
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
    providerDownloadAllowedHosts: ["*.aliyuncs.com"]
  };
  const directory = await mkdtemp(join(tmpdir(), "xueleai-dialogue-live-"));
  const assets: PersistedDialogueAudio[] = [];
  let verified = false;
  try {
    for (const [index, rate, channels] of [[1, 16000, 1], [2, 48000, 2]]) {
      const path = join(directory, `${index}.wav`);
      await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=${index * 440}:sample_rate=${rate}:duration=0.2`, "-ac", String(channels), "-c:a", "pcm_s16le", path]);
      assets.push(await persistDialogueClip({ ...identity, segmentId: `s${index}`, payload: { audioBase64: (await readFile(path)).toString("base64") } }));
    }
    assets.push(await mergeDialogueAudio({ ...identity, segments: assets.map((asset, index) => ({ url: asset.url, pauseSeconds: index ? 0.4 : 0.5 })), format: "wav", sampleRate: 24000 }));
    assert.ok(Math.abs(assets[2].durationMs - 1300) < 100);
    for (const asset of assets) {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(30_000) });
      assert.equal(response.status, 200);
      assert.equal((await response.arrayBuffer()).byteLength, asset.sizeBytes);
      assert.match(response.headers.get("content-type") || "", /^audio\//);
    }
    verified = true;
    console.log(JSON.stringify({ identity, assets }));
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (!verified || process.env.DIALOGUE_R2_SMOKE_KEEP !== "1") {
      for (const asset of assets) await deletePersistedVideoGuideNarrationAudio(asset, { config });
    }
  }
});
