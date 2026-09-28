import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { DialogueAudioError, mergeDialogueAudio, persistDialogueClip } from "../src/audio/dialogue-audio.js";
import * as pipeline from "../src/audio/dialogue-audio.js";

const run = promisify(execFile);
const identity = { userId: "user-1", projectId: "project-1", generationId: "generation-1" };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
let temporaryRoot: string;
let first: Buffer;
let second: Buffer;
const savedEnv = { ...process.env };

before(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "xueleai-dialogue-test-"));
  Object.assign(process.env, {
    S3_ENDPOINT: "https://r2.example.com",
    S3_BUCKET: "xueleai",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
    S3_PUBLIC_BASE_URL: "https://cdn.example.com/assets",
    S3_FORCE_PATH_STYLE: "1",
    DIALOGUE_AUDIO_R2_PREFIX: "voice/dialogue/",
    DIALOGUE_TTS_DOWNLOAD_ALLOWED_HOSTS: "provider.example,*.aliyuncs.com",
    DIALOGUE_AUDIO_TEMP_DIR: temporaryRoot
  });
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("DIALOGUE_AUDIO_") && !["DIALOGUE_AUDIO_R2_PREFIX", "DIALOGUE_AUDIO_TEMP_DIR"].includes(name)) {
      delete process.env[name];
    }
  }
  first = await tone(16000, 1, 440);
  second = await tone(48000, 2, 880);
});

after(async () => {
  for (const name of Object.keys(process.env)) if (!(name in savedEnv)) delete process.env[name];
  Object.assign(process.env, savedEnv);
  await rm(temporaryRoot, { recursive: true, force: true });
});

async function tone(rate: number, channels: number, frequency: number, format: "wav" | "mp3" | "opus" | "m4a" = "wav", sampleCount?: number) {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-dialogue-fixture-"));
  const path = join(directory, `tone.${format}`);
  const codec = { wav: "pcm_s16le", mp3: "libmp3lame", opus: "libopus", m4a: "aac" }[format];
  try {
    await run("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=${rate}:duration=${sampleCount ? sampleCount / rate + 0.1 : 0.2}`,
      ...(sampleCount ? ["-af", `atrim=end_sample=${sampleCount}`] : []),
      "-ac", String(channels), "-c:a", codec, path
    ]);
    return await readFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type Stored = { bytes: Buffer; headers: Headers };

function r2(options: {
  badHead?: "size" | "mime" | "hash";
  corruptReadback?: boolean;
  putFailures?: number;
  headFailures?: number;
  failDelete?: boolean;
  provider?: (url: string, init: RequestInit) => Response;
} = {}) {
  const objects = new Map<string, Stored>();
  const events: { method: string; url: string }[] = [];
  let putAttempts = 0;
  let headAttempts = 0;
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    events.push({ method, url: url.toString() });
    assert.equal(init.redirect, "manual", "no implicit redirects at either network boundary");
    if (url.hostname !== "r2.example.com" && url.hostname !== "xueleai.r2.example.com") {
      assert.equal(new Headers(init.headers).has("authorization"), false);
      assert.ok(options.provider, `unexpected external download: ${url}`);
      return options.provider(url.toString(), init);
    }
    verifySignature(url, init);
    const key = url.hostname === "r2.example.com" ? url.pathname.slice("/xueleai/".length) : url.pathname.slice(1);
    if (method === "PUT") {
      putAttempts += 1;
      if (putAttempts <= (options.putFailures ?? 0)) return new Response(null, { status: 503 });
      const bytes = Buffer.from(init.body as Uint8Array);
      const headers = new Headers(init.headers);
      assert.equal(headers.get("x-amz-content-sha256"), digest(bytes));
      assert.equal(headers.get("content-md5"), createHash("md5").update(bytes).digest("base64"));
      const previous = objects.get(key);
      if (previous) assert.deepEqual(bytes, previous.bytes, "storage retries must not overwrite a different version");
      objects.set(key, { bytes: Buffer.from(bytes), headers });
      return new Response(null, { status: 200 });
    }
    if (method === "DELETE") {
      if (options.failDelete) return new Response(null, { status: 503 });
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const stored = objects.get(key);
    if (!stored) return new Response(null, { status: 404 });
    const headers = {
      "content-length": String(stored.bytes.length),
      "content-type": stored.headers.get("content-type")!,
      "x-amz-meta-sha256": digest(stored.bytes)
    };
    if (method === "HEAD") {
      headAttempts += 1;
      if (headAttempts <= (options.headFailures ?? 0)) return new Response(null, { status: 503 });
      if (options.badHead === "size") headers["content-length"] = "1";
      if (options.badHead === "mime") headers["content-type"] = "text/html";
      if (options.badHead === "hash") headers["x-amz-meta-sha256"] = "0".repeat(64);
      return new Response(null, { status: 200, headers });
    }
    assert.equal(method, "GET");
    const bytes = Buffer.from(stored.bytes);
    if (options.corruptReadback) bytes[bytes.length - 1] ^= 1;
    return new Response(bytes, { status: 200, headers });
  };
  return { fetchImpl, objects, events };
}

// Independently reconstruct SigV4 at the HTTP boundary: a wrong path/host/header cannot pass.
function verifySignature(url: URL, init: RequestInit) {
  const headers = new Headers(init.headers);
  const auth = headers.get("authorization")!;
  assert.ok(auth?.startsWith("AWS4-HMAC-SHA256 Credential=test-access-key/"));
  const names = /SignedHeaders=([^,]+)/.exec(auth)![1].split(";");
  const timestamp = headers.get("x-amz-date")!;
  const scope = `${timestamp.slice(0, 8)}/auto/s3/aws4_request`;
  const canonical = [
    init.method, url.pathname, "",
    names.map(name => `${name}:${headers.get(name)!.trim().replace(/\s+/g, " ")}`).join("\n") + "\n",
    names.join(";"), headers.get("x-amz-content-sha256")
  ].join("\n");
  const message = ["AWS4-HMAC-SHA256", timestamp, scope, digest(Buffer.from(canonical))].join("\n");
  let key: Buffer = Buffer.from("AWS4test-secret-key");
  for (const value of [timestamp.slice(0, 8), "auto", "s3", "aws4_request"]) key = createHmac("sha256", key).update(value).digest();
  const signature = createHmac("sha256", key).update(message).digest("hex");
  assert.equal(headers.get("host"), url.host);
  assert.ok(auth.endsWith(`Signature=${signature}`), "signature must match the actual request");
}

function save(bytes: Buffer, storage: ReturnType<typeof r2>, segmentId = "segment-1") {
  return persistDialogueClip({ ...identity, segmentId, payload: { audioBase64: bytes.toString("base64") } }, storage);
}

test("课件音频合并真实分段并缓存，上传音频保留原始字节", async () => {
  const render = Reflect.get(pipeline, "renderCourseAudioDownload");
  assert.equal(typeof render, "function", "课件音频合并入口已实现");
  const storage = r2();
  const clips = [await save(first, storage, "first"), await save(second, storage, "second")];
  const sources = clips.map(clip => ({ ...clip, storageProvider: "S3" }));
  const input = { userId: "user-1", materialId: "lesson-1", revision: "a".repeat(64), sources, original: false };
  const merged = await render(input, storage);
  assert.equal(merged.mimeType, "audio/mpeg");
  assert.ok(merged.bytes.length > 0);
  const puts = storage.events.filter(event => event.method === "PUT").length;
  const cached = await render(input, storage);
  assert.deepEqual(cached.bytes, merged.bytes);
  assert.equal(storage.events.filter(event => event.method === "PUT").length, puts);
  const original = await render({ ...input, sources: [sources[0]], original: true }, storage);
  assert.deepEqual(original.bytes, first);
  assert.equal(original.mimeType, "audio/wav");
  const mergedKey = [...storage.objects.keys()].find(key => key.startsWith("audio/course-downloads/"))!;
  const wav = await pipeline.renderVoiceDownload({ userId: "user-1", source: {
    url: `https://cdn.example.com/assets/${mergedKey}`, objectKey: mergedKey, storageProvider: "S3", sizeBytes: merged.bytes.length
  }, format: "wav" }, storage);
  const samples = wavSamples(wav.bytes);
  assert.equal(samples.length, 9600);
  assert.ok(zeroCrossings(samples.subarray(0, 4800)) > 160 && zeroCrossings(samples.subarray(0, 4800)) < 200);
  assert.ok(zeroCrossings(samples.subarray(4800)) > 330 && zeroCrossings(samples.subarray(4800)) < 390);
  await render({ ...input, revision: "b".repeat(64) }, storage);
  assert.equal(storage.events.filter(event => event.method === "PUT").length, puts + 1);
  await assertClean();
});

test("课件 MP3 尾部编码填充不应误报完整性失败，仍保留全部原始采样", async () => {
  for (const sampleCount of [5761, 5768, 5807]) {
    const storage = r2();
    const fixture = await tone(24000, 1, 440, "wav", sampleCount);
    assert.equal(wavSamples(fixture).length, sampleCount);
    const source = await save(fixture, storage);
    const input = { userId: "user-1", materialId: `padding-${sampleCount}`, revision: "e".repeat(64),
      sources: [{ ...source, storageProvider: "S3" }], original: false };
    const merged = await pipeline.renderCourseAudioDownload(input, storage);
    const objectKey = [...storage.objects.keys()].find(key => key.startsWith("audio/course-downloads/"))!;
    const wav = await pipeline.renderVoiceDownload({ userId: "user-1", source: {
      url: `https://cdn.example.com/assets/${objectKey}`, objectKey, storageProvider: "S3"
    }, format: "wav" }, storage);
    const decoded = wavSamples(wav.bytes);
    assert.ok(decoded.length >= sampleCount, "no original samples may be lost");
    assert.ok(decoded.length - sampleCount <= 576, "padding must fit one 24kHz MP3 frame");
    assert.ok(decoded.subarray(sampleCount - 100, sampleCount).some(sample => Math.abs(sample) > 100), "the final audio is retained");
    assert.deepEqual((await pipeline.renderCourseAudioDownload(input, storage)).bytes, merged.bytes);
  }
  await assertClean();
});

test("课件 MP3 因输出上限截断时仍拒绝发布缓存", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-course-truncation-"));
  try {
    const path = join(directory, "source.flac");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "2", "-c:a", "flac", path]);
    const limitedPath = join(directory, "limited.mp3");
    await run("ffmpeg", ["-v", "error", "-i", path, "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k", "-fs", "12000", limitedPath]);
    const outputLimit = (await readFile(limitedPath)).length;
    const storage = r2();
    const source = await save(await readFile(path), storage);
    await withEnv({ DIALOGUE_AUDIO_MAX_OUTPUT_BYTES: String(outputLimit) }, async () => {
      await assert.rejects(pipeline.renderCourseAudioDownload({ userId: "user-1", materialId: "truncated",
        revision: "f".repeat(64), sources: [{ ...source, storageProvider: "S3" }], original: false }, storage),
      (error: unknown) => error instanceof DialogueAudioError && error.code === "AUDIO_INVALID" && /不完整/.test(error.message));
    });
    assert.equal(storage.objects.size, 1, "only the original survives; no truncated export is published");
    await assertClean();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function assertClean() {
  assert.deepEqual(await readdir(temporaryRoot), [], "no temporary audio survives completion or failure");
}

test("课件合成音频使用生成时的存储配置，上传原件仍读取上传存储", async () => {
  for (const publicBase of ["https://narration.example/assets", "https://cdn.example.com/assets"]) {
    await withEnv({ VIDEO_GUIDE_R2_ENDPOINT: "https://narration-storage.example", VIDEO_GUIDE_R2_BUCKET: "narration",
      VIDEO_GUIDE_R2_PUBLIC_BASE_URL: publicBase, VIDEO_GUIDE_R2_FORCE_PATH_STYLE: "1" }, async () => {
      const storage = r2();
      const original = await save(second, storage);
      const objectKey = "video-guide/narration/english-guided-study/lesson/generation/node.mp3";
      let sourceReads = 0;
      const fetchImpl: typeof fetch = async (url, init = {}) => {
        if (String(url).startsWith("https://narration-storage.example/")) {
          assert.equal(String(url), `https://narration-storage.example/narration/${objectKey}`);
          assert.equal(init.method, "GET");
          verifySignature(new URL(String(url)), init);
          sourceReads++;
          return new Response(first, { headers: { "content-type": "audio/wav", "content-length": String(first.length) } });
        }
        return storage.fetchImpl(url, init);
      };
      const input = { userId: "user-1", materialId: "lesson", revision: "c".repeat(64), original: false,
        sources: [{ url: `${publicBase}/${objectKey}`, objectKey, storageProvider: "S3", mimeType: "audio/wav" }] };
      assert.equal((await pipeline.renderCourseAudioDownload(input, { fetchImpl })).mimeType, "audio/mpeg");
      assert.equal(sourceReads, 1);
      const uploaded = await pipeline.renderCourseAudioDownload({ ...input, original: true,
        sources: [{ ...original, storageProvider: "S3" }] }, { fetchImpl });
      assert.deepEqual(uploaded.bytes, second);
      assert.equal(sourceReads, 1);
    });
  }
  await assertClean();
});

test("共享课件缓存不能被另一下载请求的校验失败删除", async () => {
  const storage = r2();
  const source = await save(first, storage);
  const input = { userId: "user-1", materialId: "lesson", revision: "d".repeat(64), original: false,
    sources: [{ ...source, storageProvider: "S3" }] };
  let signalPublished!: () => void;
  let failVerification!: () => void;
  const published = new Promise<void>(resolve => { signalPublished = resolve; });
  const verification = new Promise<void>(resolve => { failVerification = resolve; });
  const fetchImpl: typeof fetch = async (url, init = {}) => {
    if (init.method === "HEAD" && String(url).includes("audio/course-downloads/")) {
      signalPublished();
      await verification;
      return new Response(null, { status: 403 });
    }
    return storage.fetchImpl(url, init);
  };
  const firstRequest = assert.rejects(pipeline.renderCourseAudioDownload(input, { fetchImpl }), /校验失败/);
  await published;
  try {
    const concurrent = await pipeline.renderCourseAudioDownload(input, storage);
    assert.equal(concurrent.mimeType, "audio/mpeg");
  } finally { failVerification(); }
  await firstRequest;
  assert.equal(storage.events.filter(event => event.method === "DELETE").length, 0);
  assert.ok([...storage.objects.keys()].some(key => key.startsWith("audio/course-downloads/")));
  await assertClean();
});

async function withEnv(values: Record<string, string>, action: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  try { await action(); }
  finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test("persists real Base64 WAV only after signed upload, HEAD and byte checksum verification", async () => {
  const storage = r2();
  const result = await save(first, storage);
  assert.equal(result.url, `https://cdn.example.com/assets/${result.objectKey}`);
  assert.match(result.objectKey, /^voice\/dialogue\/user-1\/project-1\/generation-1\/clips\/segment-1-[a-f0-9-]+\.wav$/);
  assert.equal(result.mimeType, "audio/wav");
  assert.equal(result.sizeBytes, first.length);
  assert.equal(result.sampleRate, 16000);
  assert.equal(result.channels, 1);
  assert.ok(Math.abs(result.durationMs - 200) < 10);
  assert.deepEqual(storage.objects.get(result.objectKey)!.bytes, first);
  assert.deepEqual(storage.events.map(event => event.method), ["PUT", "HEAD", "GET"]);
  await assertClean();
});

test("normalizes mixed rates/channels and includes both literal trailing pauses, preserving sentence order", async () => {
  const storage = r2();
  const a = await save(first, storage);
  const b = await save(second, storage, "segment-2");
  const output = await mergeDialogueAudio({
    ...identity, segments: [{ url: a.url, pauseSeconds: 0.5 }, { url: b.url, pauseSeconds: 0.4 }],
    format: "wav", sampleRate: 24000
  }, storage);
  assert.ok(Math.abs(output.durationMs - 1300) < 10, `expected 1300ms, got ${output.durationMs}`);
  assert.equal(output.sampleRate, 24000);
  assert.equal(output.channels, 1);
  assert.equal(output.mimeType, "audio/wav");
  const bytes = storage.objects.get(output.objectKey)!.bytes;
  const samples = wavSamples(bytes);
  assert.equal(samples.length, 31200);
  assert.ok(zeroCrossings(samples.subarray(0, 4800)) > 160);
  assert.ok(zeroCrossings(samples.subarray(0, 4800)) < 190);
  assert.ok(zeroCrossings(samples.subarray(16800, 21600)) > 330);
  assert.ok(zeroCrossings(samples.subarray(16800, 21600)) < 370);
  assert.ok(samples.subarray(4800, 16800).every(value => value === 0), "first pause must be real PCM silence");
  assert.ok(samples.subarray(21600).every(value => value === 0), "last pause must be present in the file");
  await assertClean();
});

function wavSamples(bytes: Buffer) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset + 4);
    if (bytes.toString("ascii", offset, offset + 4) === "data") {
      const samples = new Int16Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(offset + 8 + i * 2);
      return samples;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("no PCM data chunk");
}

function zeroCrossings(samples: Int16Array) {
  let count = 0;
  for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) count++;
  return count;
}

for (const format of ["mp3", "opus"] as const) {
  test(`encodes a playable ${format} with zero and final pauses and accurate probed metadata`, async () => {
    const storage = r2();
    const clip = await save(first, storage);
    const output = await mergeDialogueAudio({
      ...identity, segments: [{ url: clip.url, pauseSeconds: 0 }, { url: clip.url, pauseSeconds: 0.4 }],
      format, sampleRate: 16000
    }, storage);
    assert.ok(Math.abs(output.durationMs - 800) < 100);
    assert.equal(output.mimeType, format === "mp3" ? "audio/mpeg" : "audio/ogg");
    assert.equal(output.sampleRate, format === "mp3" ? 16000 : 48000);
    assert.ok(output.sizeBytes > 0);
    assert.match(output.objectKey, new RegExp(`\\.${format}$`));
    await assertClean();
  });
}

test("acquires nested provider URL with a validated relative redirect and never returns the temporary URL", async () => {
  const storage = r2({ provider: url => url.endsWith("/start")
    ? new Response(null, { status: 302, headers: { location: "/audio.wav" } })
    : new Response(first, { headers: { "content-type": "audio/wav" } }) });
  const output = await persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { output: { audio: { url: "https://provider.example/start" } } } }, storage);
  assert.ok(output.url.startsWith("https://cdn.example.com/assets/"));
  assert.deepEqual(storage.objects.get(output.objectKey)!.bytes, first);
  await assertClean();
});

test("upgrades DashScope's signed HTTP WAV result to HTTPS without changing the object path or signature", async () => {
  const storage = r2({ provider: () => new Response(first, { headers: { "content-type": "audio/x-wav" } }) });
  const output = await persistDialogueClip({
    ...identity, segmentId: "segment-1", requireWav: true,
    payload: { audioUrl: "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/tts/voice%20clip.wav?OSSAccessKeyId=test&Expires=2000000000&Signature=ab%2Bcd%2Fef%3D" }
  }, storage);
  assert.equal(storage.events[0].url, "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/tts/voice%20clip.wav?OSSAccessKeyId=test&Expires=2000000000&Signature=ab%2Bcd%2Fef%3D");
  assert.equal(output.mimeType, "audio/wav");
  assert.deepEqual(storage.objects.get(output.objectKey)!.bytes, first);
  assert.ok(storage.events.every(event => event.url.startsWith("https://")));
  await assertClean();
});

function dashScopeStreamingWav() {
  const samples = wavSamples(first);
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(0x7fffffbf, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(0x7fffff9b, 40);
  samples.forEach((sample, index) => bytes.writeInt16LE(sample, 44 + index * 2));
  return bytes;
}

test("canonicalizes the official DashScope streaming WAV length placeholders without changing PCM samples", async () => {
  const bytes = dashScopeStreamingWav();
  const storage = r2({ provider: () => new Response(bytes, { headers: {
    "content-type": "audio/x-wav", "content-length": String(bytes.length)
  } }) });
  const output = await persistDialogueClip({ ...identity, segmentId: "segment-1", requireWav: true,
    payload: { audioUrl: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav" }
  }, storage);
  const stored = storage.objects.get(output.objectKey)!.bytes;
  assert.equal(stored.readUInt32LE(4), stored.length - 8);
  assert.equal(stored.readUInt32LE(40), stored.length - 44);
  assert.deepEqual(stored.subarray(44), bytes.subarray(44));
  assert.equal(output.mimeType, "audio/wav");
  assert.equal(output.sampleRate, 16000);
  assert.equal(output.durationMs, 200);
  await assertClean();
});

test("does not repair ordinary truncated WAV, incomplete PCM frames, non-PCM or another provider's streaming header", async () => {
  const streaming = dashScopeStreamingWav();
  const nonPcm = Buffer.from(streaming); nonPcm.writeUInt16LE(3, 20);
  const wrongLength = Buffer.from(streaming); wrongLength.writeUInt32LE(0x7fffff99, 40);
  for (const [bytes, host] of [
    [first.subarray(0, first.length - 2), "dashscope-result-bj.oss-cn-beijing.aliyuncs.com"],
    [Buffer.concat([streaming, Buffer.from([0])]), "dashscope-result-bj.oss-cn-beijing.aliyuncs.com"],
    [nonPcm, "dashscope-result-bj.oss-cn-beijing.aliyuncs.com"],
    [wrongLength, "dashscope-result-bj.oss-cn-beijing.aliyuncs.com"],
    [streaming, "provider.example"]
  ] as const) {
    const storage = r2({ provider: () => new Response(bytes, { headers: { "content-type": "audio/wav" } }) });
    await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", requireWav: true,
      payload: { audioUrl: `https://${host}/audio.wav` }
    }, storage), (error: unknown) => error instanceof DialogueAudioError && error.code === "AUDIO_INVALID");
    assert.equal(storage.objects.size, 0);
  }
  await assertClean();
});

test("DashScope HTTP compatibility still requires the configured hostname allowlist", async () => {
  await withEnv({ DIALOGUE_TTS_DOWNLOAD_ALLOWED_HOSTS: "provider.example" }, async () => {
    const storage = r2();
    await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: {
      audioUrl: "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav"
    } }, storage), /地址|来源/);
    assert.equal(storage.events.length, 0);
  });
  await assertClean();
});

test("a provider redirect cannot downgrade HTTPS even to the official DashScope result hostname", async () => {
  const storage = r2({ provider: () => new Response(null, { status: 302, headers: {
    location: "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav"
  } }) });
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: {
    audioUrl: "https://provider.example/start"
  } }, storage), /地址|来源/);
  assert.equal(storage.events.length, 1);
  assert.equal(storage.objects.size, 0);
  await assertClean();
});

test("an upgraded DashScope HTTPS failure never falls back to an HTTP connection", async () => {
  const storage = r2({ provider: () => new Response(null, { status: 503 }) });
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: {
    audioUrl: "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav"
  } }, storage), (error: unknown) => error instanceof DialogueAudioError && error.code === "DOWNLOAD_FAILED");
  assert.ok(storage.events.length > 0);
  assert.ok(storage.events.every(event => event.url === "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav"));
  assert.equal(storage.objects.size, 0);
  await assertClean();
});

test("reuses persisted clips from an older generation without overwriting any output version", async () => {
  const storage = r2();
  const a = await save(first, storage);
  const b = await save(second, storage);
  assert.notEqual(a.objectKey, b.objectKey);
  const input = { ...identity, generationId: "generation-2", segments: [{ url: a.url, pauseSeconds: 0.5 }], format: "wav" as const, sampleRate: 16000 };
  const old = await mergeDialogueAudio(input, storage);
  const next = await mergeDialogueAudio(input, storage);
  assert.notEqual(old.objectKey, next.objectKey);
  assert.equal(storage.objects.size, 4);
  await assertClean();
});

test("rejects unsafe addresses before downloading, including redirects, userinfo, non-HTTPS and IP aliases", async () => {
  for (const url of [
    "http://provider.example/audio", "https://127.0.0.1/audio", "https://2130706433/audio",
    "https://[::1]/audio", "https://localhost/audio", "https://provider.example.evil/audio",
    "https://user:password@provider.example/audio", "https://provider.example:3329/audio",
    "file:///etc/passwd", "https://aliyuncs.com/audio", "https://provider.example./audio",
    "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.example/audio.wav",
    "http://fake.dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav",
    "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com:3329/audio.wav",
    "http://user:password@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav",
    "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav#fragment"
  ]) {
    const storage = r2();
    await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioUrl: url } }, storage), /地址|来源/);
    assert.equal(storage.events.length, 0);
  }
  const storage = r2({ provider: () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } }) });
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioUrl: "https://provider.example/start" } }, storage), /地址|来源/);
  assert.equal(storage.events.length, 1);
  await assertClean();
});

test("rejects foreign-project, foreign-user and non-clip storage URLs before network access", async () => {
  for (const path of [
    "voice/dialogue/user-2/project-1/generation-1/clips/segment.wav",
    "voice/dialogue/user-1/project-2/generation-1/clips/segment.wav",
    "voice/dialogue/user-1/project-1/generation-1/merged/audio.wav",
    "voice/dialogue/user-1/project-1/generation-1/clips/%252e%252e/audio.wav"
  ]) {
    const storage = r2();
    await assert.rejects(mergeDialogueAudio({ ...identity, segments: [{ url: `https://cdn.example.com/assets/${path}`, pauseSeconds: 0.5 }], format: "wav", sampleRate: 16000 }, storage), /地址|来源|归属/);
    assert.equal(storage.events.length, 0);
  }
  await assertClean();
});

for (const badHead of ["size", "mime", "hash"] as const) {
  test(`rejects R2 ${badHead} verification mismatch and deletes only the unpublished object`, async () => {
    const storage = r2({ badHead });
    await assert.rejects(save(first, storage), /校验|一致/);
    assert.equal(storage.objects.size, 0);
    assert.ok(storage.events.some(event => event.method === "DELETE"));
    await assertClean();
  });
}

test("readback checksum detects corruption even when HEAD metadata matches", async () => {
  const storage = r2({ corruptReadback: true });
  await assert.rejects(save(first, storage), /校验|一致/);
  assert.equal(storage.objects.size, 0);
  await assertClean();
});

test("bounded storage retries retain the acquired audio and perform no supplier resynthesis", async () => {
  const storage = r2({ putFailures: 2, headFailures: 2, provider: () => new Response(first, { headers: { "content-type": "audio/wav" } }) });
  const output = await persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { previewAudioUrl: "https://provider.example/audio.wav" } }, storage);
  assert.deepEqual(storage.objects.get(output.objectKey)!.bytes, first);
  assert.equal(storage.events.filter(event => event.url.startsWith("https://provider.example/")).length, 1);
  assert.equal(storage.events.filter(event => event.method === "PUT").length, 3);
  await assertClean();
});

test("exhausted upload retries fail with Chinese errors and clean ambiguous uploads", async () => {
  const storage = r2({ putFailures: 20 });
  await assert.rejects(save(first, storage), /上传|保存/);
  assert.equal(storage.events.filter(event => event.method === "PUT").length, 3);
  assert.ok(storage.events.some(event => event.method === "DELETE"));
  await assertClean();
});

test("failed merged upload keeps all successful clips and the prior complete version", async () => {
  const storage = r2();
  const clip = await save(first, storage);
  const input = { ...identity, segments: [{ url: clip.url, pauseSeconds: 0.5 }], format: "wav" as const, sampleRate: 16000 };
  const old = await mergeDialogueAudio(input, storage);
  const original = storage.fetchImpl;
  const failedTransport: typeof fetch = async (url, init) => init?.method === "PUT"
    ? new Response(null, { status: 503 }) : original(url, init);
  await assert.rejects(mergeDialogueAudio(input, { fetchImpl: failedTransport }), /上传|保存/);
  assert.equal(storage.objects.size, 2);
  assert.ok(storage.objects.has(old.objectKey));
  assert.ok(storage.objects.has(clip.objectKey));
  await assertClean();
});

test("rejects malformed/empty/non-audio Base64 rather than publishing fake success", async () => {
  for (const audioBase64 of ["", "%%%%", "A", "YQ===", Buffer.from("not audio").toString("base64")]) {
    const storage = r2();
    await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioBase64 } }, storage), /音频|语音/);
    assert.equal(storage.objects.size, 0);
  }
  const storage = r2();
  const output = await persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioBase64: `data:audio/wav;base64,${first.toString("base64")}` } }, storage);
  assert.deepEqual(storage.objects.get(output.objectKey)!.bytes, first);
  await assertClean();
});

test("enforces file/network limits even without Content-Length and cancels oversized streams", async () => {
  await withEnv({ DIALOGUE_AUDIO_MAX_CLIP_BYTES: "100" }, async () => {
    const storage = r2();
    await assert.rejects(save(first, storage), /大小|限制/);
    assert.equal(storage.events.length, 0);
    let canceled = false;
    const stream = r2({ provider: () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(101)); },
      cancel() { canceled = true; }
    }), { headers: { "content-type": "audio/wav" } }) });
    await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioUrl: "https://provider.example/audio" } }, stream), /大小|限制/);
    assert.equal(canceled, true);
  });
  await assertClean();
});

test("validates pause precision/range, output rate/format, segment cap and safe object identifiers", async () => {
  for (const pauseSeconds of [-0.1, 5.1, 0.15, NaN, Infinity]) {
    const storage = r2();
    await assert.rejects(mergeDialogueAudio({ ...identity, segments: [{ url: "https://provider.example/audio", pauseSeconds }], format: "wav", sampleRate: 16000 }, storage), /停顿/);
    assert.equal(storage.events.length, 0);
  }
  const storage = r2();
  for (const overrides of [{ segments: [] }, { sampleRate: 44100 }, { format: "aac" }, { segments: Array.from({ length: 101 }, () => ({ url: "https://provider.example/audio", pauseSeconds: 0.5 })) }]) {
    await assert.rejects(mergeDialogueAudio({ ...identity, segments: [{ url: "https://provider.example/audio", pauseSeconds: 0.5 }], format: "wav", sampleRate: 16000, ...overrides } as Parameters<typeof mergeDialogueAudio>[0], storage), /参数|格式|采样|段/);
  }
  await assert.rejects(persistDialogueClip({ ...identity, projectId: "../escape", segmentId: "segment-1", payload: { audioBase64: first.toString("base64") } }, storage), /标识/);
  assert.equal(storage.events.length, 0);
  await assertClean();
});

test("bounds temporary disk and actual media subprocess time, cleaning both failure paths", async () => {
  await withEnv({ DIALOGUE_AUDIO_MAX_TEMP_BYTES: "100" }, async () => {
    const storage = r2();
    await assert.rejects(save(first, storage), /临时|磁盘|限制/);
    assert.equal(storage.objects.size, 0);
    await assertClean();
  });
  await withEnv({ DIALOGUE_AUDIO_PROCESS_TIMEOUT_MS: "1" }, async () => {
    const storage = r2();
    await assert.rejects(save(first, storage), /超时/);
    assert.equal(storage.objects.size, 0);
    await assertClean();
  });
});

test("network timeout covers stalled response bodies, not just response headers", async () => {
  await withEnv({ DIALOGUE_AUDIO_REQUEST_TIMEOUT_MS: "25" }, async () => {
    let canceled = false;
    const storage = r2({ provider: () => new Response(new ReadableStream({
      cancel() { canceled = true; }
    }), { headers: { "content-type": "audio/wav" } }) });
    await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioUrl: "https://provider.example/audio" } }, storage), /超时/);
    assert.equal(canceled, true);
    assert.equal(storage.objects.size, 0);
  });
  await assertClean();
});

test("supports virtual-host S3 endpoints without changing public URLs", async () => {
  await withEnv({ S3_FORCE_PATH_STYLE: "0" }, async () => {
    const storage = r2();
    const result = await save(first, storage);
    assert.ok(storage.events.every(event => event.url.startsWith("https://xueleai.r2.example.com/")));
    assert.equal(result.url, `https://cdn.example.com/assets/${result.objectKey}`);
  });
  await assertClean();
});

test("default duration limits allow long compressed sentences and a dialogue longer than 30 minutes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-dialogue-fixture-"));
  try {
    const path = join(directory, "long.flac");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "601", "-c:a", "flac", path]);
    const storage = r2();
    const clip = await save(await readFile(path), storage);
    assert.equal(clip.durationMs, 601000);
    const output = await mergeDialogueAudio({
      ...identity, segments: Array.from({ length: 3 }, () => ({ url: clip.url, pauseSeconds: 0.5 })),
      format: "wav", sampleRate: 16000
    }, storage);
    assert.ok(Math.abs(output.durationMs - 1804500) < 10);
    await assertClean();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects even a sub-100ms final encode truncation instead of publishing a shortened pause", async () => {
  const storage = r2();
  const clip = await save(first, storage);
  // 78-byte FFmpeg WAV header + 20480 PCM bytes: ~0.64s instead of the required 0.7s.
  await withEnv({ DIALOGUE_AUDIO_MAX_OUTPUT_BYTES: "20558" }, async () => {
    await assert.rejects(mergeDialogueAudio({ ...identity, segments: [{ url: clip.url, pauseSeconds: 0.5 }], format: "wav", sampleRate: 16000 }, storage), /大小|限制|时长|完整/);
  });
  assert.equal(storage.objects.size, 1);
  await assertClean();
});

test("invalid storage namespace is rejected before any object is uploaded", async () => {
  for (const prefix of ["voice//dialogue", "voice/../dialogue", "voice/./dialogue"]) {
    await withEnv({ DIALOGUE_AUDIO_R2_PREFIX: prefix }, async () => {
      const storage = r2();
      await assert.rejects(save(first, storage), /目录|配置/);
      assert.equal(storage.events.length, 0);
    });
  }
  await assertClean();
});

test("storage failure exports an actionable safe error and marks remote cleanup failure without masking it", async () => {
  const storage = r2({ badHead: "hash", failDelete: true });
  await assert.rejects(save(first, storage), (error: unknown) => {
    assert.ok(error instanceof DialogueAudioError);
    assert.equal(error.code, "VERIFY_INVALID");
    assert.equal(error.retryable, false);
    assert.equal(error.cleanupFailed, true);
    assert.match(error.message, /校验|一致/);
    assert.doesNotMatch(error.message, /test-secret|test-access|r2\.example|ffmpeg.* at/);
    return true;
  });
  await assertClean();
});

test("an empty optional Base64 field falls back to the provider URL", async () => {
  const storage = r2({ provider: () => new Response(first, { headers: { "content-type": "audio/wav" } }) });
  const output = await persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioBase64: "", audioUrl: "https://provider.example/audio.wav" } }, storage);
  assert.deepEqual(storage.objects.get(output.objectKey)!.bytes, first);
  await assertClean();
});

test("persists native MP3, Opus and AAC and merges compressed cross-provider clips without padding drift", async () => {
  const storage = r2();
  const mp3 = await save(await tone(24000, 1, 440, "mp3"), storage);
  const opus = await save(await tone(48000, 2, 880, "opus"), storage, "segment-2");
  const aac = await save(await tone(24000, 1, 440, "m4a"), storage, "segment-3");
  assert.equal(mp3.mimeType, "audio/mpeg");
  assert.equal(opus.mimeType, "audio/ogg");
  assert.equal(aac.mimeType, "audio/mp4");
  const output = await mergeDialogueAudio({ ...identity, segments: [{ url: mp3.url, pauseSeconds: 0.5 }, { url: opus.url, pauseSeconds: 0.4 }], format: "wav", sampleRate: 24000 }, storage);
  assert.ok(Math.abs(output.durationMs - 1300) < 10);
  await assertClean();
});

test("provider redirect loops, bad MIME and interrupted streams fail without publishing storage objects", async () => {
  const loop = r2({ provider: () => new Response(null, { status: 302, headers: { location: "/loop" } }) });
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { output: { url: "https://provider.example/loop" } } }, loop), /重定向/);
  assert.equal(loop.events.length, 4);
  const html = r2({ provider: () => new Response("login", { headers: { "content-type": "text/html" } }) });
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audio_url: "https://provider.example/file" } }, html), /类型/);
  assert.equal(html.events.length, 1);
  const interrupted = r2({ provider: () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("private upstream credentials")); }
  }), { headers: { "content-type": "audio/wav" } }) });
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioUrl: "https://provider.example/file" } }, interrupted), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /网络|下载/);
    assert.doesNotMatch(error.message, /credentials/);
    return true;
  });
  assert.equal(interrupted.objects.size, 0);
  await assertClean();
});

test("a failed ambiguous PUT supplies its unique unpublished key for remote cleanup recovery", async () => {
  const storage = r2({ failDelete: true });
  const original = storage.fetchImpl;
  const ambiguous: typeof fetch = async (url, init) => {
    const response = await original(url, init);
    if (init?.method === "PUT") throw new Error("upstream timeout with secret credentials");
    return response;
  };
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "segment-1", payload: { audioBase64: first.toString("base64") } }, { fetchImpl: ambiguous }), (error: unknown) => {
    assert.ok(error instanceof DialogueAudioError);
    const key = error.unpublishedObjectKey;
    assert.ok(key && storage.objects.has(key));
    assert.equal(error.cleanupFailed, true);
    assert.match(error.message, /上传|保存/);
    assert.doesNotMatch(error.message, /secret credentials/);
    return true;
  });
  assert.equal(storage.objects.size, 1);
  await assertClean();
});

test("explicit duration/output limits fail without changing stored clips or the old complete output", async () => {
  const storage = r2();
  const clip = await save(first, storage);
  const input = { ...identity, segments: [{ url: clip.url, pauseSeconds: 0.5 }], format: "wav" as const, sampleRate: 16000 };
  const old = await mergeDialogueAudio(input, storage);
  await withEnv({ DIALOGUE_AUDIO_MAX_DURATION_SECONDS: "1" }, async () => {
    await assert.rejects(mergeDialogueAudio({ ...input, segments: [{ url: clip.url, pauseSeconds: 1 }] }, storage), /时长|限制/);
  });
  await withEnv({ DIALOGUE_AUDIO_MAX_OUTPUT_BYTES: "100" }, async () => {
    await assert.rejects(mergeDialogueAudio(input, storage), /大小|限制|完整/);
  });
  assert.equal(storage.objects.size, 2);
  assert.ok(storage.objects.has(old.objectKey));
  await assertClean();
});

test("new masters reject compressed supplier audio instead of labelling MP3 as a lossless master", async () => {
  const storage = r2();
  await assert.rejects(persistDialogueClip({ ...identity, segmentId: "master", requireWav: true,
    payload: { audioBase64: (await tone(24000, 1, 440, "mp3")).toString("base64") } }, storage), /WAV|母版/);
  assert.equal(storage.objects.size, 0);
  const master = await persistDialogueClip({ ...identity, segmentId: "master", requireWav: true,
    payload: { audioBase64: first.toString("base64") } }, storage);
  assert.equal(master.mimeType, "audio/wav");
  assert.deepEqual(storage.objects.get(master.objectKey)!.bytes, first);
  await assertClean();
});

test("downloads preserve exact WAV master bytes and encode a valid MP3 without R2 writes", async () => {
  assert.equal(typeof pipeline.renderVoiceDownload, "function", "binary export is available");
  const storage = r2();
  const master = await save(second, storage);
  const source = { ...master, storageProvider: "S3" };
  const writes = storage.events.filter(e => e.method === "PUT").length;
  const wav = await pipeline.renderVoiceDownload({ userId: identity.userId, source, format: "wav" }, storage);
  assert.equal(wav.mimeType, "audio/wav");
  assert.deepEqual(wav.bytes, second);
  const mp3 = await pipeline.renderVoiceDownload({ userId: identity.userId, source, format: "mp3" }, storage);
  assert.equal(mp3.mimeType, "audio/mpeg");
  assert.notDeepEqual(mp3.bytes, second);
  const exportedClip = await save(mp3.bytes, storage, "exported");
  assert.equal(exportedClip.mimeType, "audio/mpeg");
  assert.equal(exportedClip.sampleRate, 48000);
  assert.equal(exportedClip.channels, 2);
  assert.equal(storage.events.filter(e => e.method === "PUT").length, writes + 1);
  await assertClean();
});

test("export rejects URL/key mismatch, path traversal and invalid format before network access", async () => {
  assert.equal(typeof pipeline.renderVoiceDownload, "function");
  const storage = r2();
  for (const source of [
    { url: "https://evil.example/audio.wav", objectKey: "voice/master.wav", storageProvider: "S3" },
    { url: "https://cdn.example.com/assets/voice/../master.wav", objectKey: "voice/../master.wav", storageProvider: "S3" },
    { url: "http://localhost:3329/secret", objectKey: "provider", storageProvider: "LOCAL" }
  ]) await assert.rejects(pipeline.renderVoiceDownload({ userId: identity.userId, source, format: "wav" }, storage), /地址|来源/);
  await assert.rejects(pipeline.renderVoiceDownload({ userId: identity.userId,
    source: { url: "https://cdn.example.com/assets/master.wav", objectKey: "master.wav", storageProvider: "S3" },
    format: "opus" as "wav" }, storage), /格式/);
  assert.equal(storage.events.length, 0);
  await assertClean();
});

test("legacy MP3 assets can download WAV without resynthesis; export output limits clean temp files", async () => {
  assert.equal(typeof pipeline.renderVoiceDownload, "function");
  const storage = r2();
  const clip = await save(await tone(24000, 1, 440, "mp3"), storage);
  const input = { userId: identity.userId, source: { ...clip, storageProvider: "S3" }, format: "wav" as const };
  const wav = await pipeline.renderVoiceDownload(input, storage);
  assert.equal(wav.mimeType, "audio/wav");
  const persisted = await save(wav.bytes, storage, "legacy-wav");
  assert.equal(persisted.durationMs, 200);
  await withEnv({ DIALOGUE_AUDIO_MAX_OUTPUT_BYTES: "100" }, async () => {
    await assert.rejects(pipeline.renderVoiceDownload(input, storage), /大小|限制|完整|时长/);
  });
  await assertClean();
});

test("uncommitted master cleanup deletes only the exact scoped clip", async () => {
  assert.equal(typeof pipeline.deleteDialogueClip, "function");
  const storage = r2();
  const master = await save(first, storage);
  await assert.rejects(pipeline.deleteDialogueClip({ ...identity, url: master.url.replace("user-1", "user-2") }, storage), /地址|来源/);
  assert.equal(storage.objects.size, 1);
  await pipeline.deleteDialogueClip({ ...identity, url: master.url }, storage);
  assert.equal(storage.objects.size, 0);
});
