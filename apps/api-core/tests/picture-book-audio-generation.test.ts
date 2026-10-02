import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { AudioService } from "../src/audio/audio.service.js";
import { downloadTtsProviderAudio, VideoGuideNarrationStorageError } from "../src/audio/video-guide-narration-storage.js";

const bytes = Buffer.from("ID3picture-book-audio");
const providerUrl = "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/page.mp3";
const networkError = () => new TypeError("fetch failed", { cause: Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }) });
const audioResponse = () => new Response(bytes, { headers: { "content-type": "audio/mpeg" } });

test("绘本语音下载遇到连接超时后重试同一文件", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    if (urls.length === 1) throw networkError();
    return audioResponse();
  };
  assert.deepEqual(await downloadTtsProviderAudio(providerUrl, 1024, fetchImpl), bytes);
  assert.deepEqual(urls, [providerUrl, providerUrl]);
});

test("绘本语音下载中断后重新读取完整文件", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    if (++calls === 1) return new Response(new ReadableStream({ start(controller) { controller.error(networkError()); } }), { headers: { "content-type": "audio/mpeg" } });
    return audioResponse();
  };
  assert.deepEqual(await downloadTtsProviderAudio(providerUrl, 1024, fetchImpl), bytes);
  assert.equal(calls, 2);
});

test("绘本语音下载持续失败最多请求三次并返回中文错误", async () => {
  let calls = 0;
  await assert.rejects(downloadTtsProviderAudio(providerUrl, 1024, async () => { calls++; throw networkError(); }),
    (error: unknown) => error instanceof VideoGuideNarrationStorageError && error.code === "TTS_OUTPUT_DOWNLOAD_FAILED" && /语音文件下载失败/.test(error.message));
  assert.equal(calls, 3);
});

test("绘本语音下载不重试永久错误和不允许的重定向", async () => {
  for (const response of [new Response(null, { status: 404 }), new Response(null, { status: 302, headers: { location: "http://localhost:3602/private" } })]) {
    let calls = 0;
    await assert.rejects(downloadTtsProviderAudio(providerUrl, 1024, async () => { calls++; return response; }));
    assert.equal(calls, 1);
  }
});

async function uploadWithFetch(fetchImpl: typeof fetch) {
  const keys = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL", "S3_FORCE_PATH_STYLE", "S3_KEY_PREFIX"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { S3_BUCKET: "abeiai", S3_ENDPOINT: "https://test.r2.cloudflarestorage.com", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_PUBLIC_BASE_URL: "https://cdn.abei.example", S3_FORCE_PATH_STYLE: "1", S3_KEY_PREFIX: "picture-books/" });
  globalThis.fetch = fetchImpl;
  try {
    const service = Object.create(AudioService.prototype) as { uploadAudioToS3: (name: string, file: { buffer: Buffer; mimetype: string; size: number }, requirePublicUrl: boolean) => Promise<{ objectKey: string; url: string }> };
    return await service.uploadAudioToS3("page.mp3", { buffer: bytes, mimetype: "audio/mpeg", size: bytes.length }, true);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
}

test("绘本 R2 上传重试网络超时和服务端错误，沿用同一个对象和文件", async () => {
  const urls: string[] = [];
  const stored = await uploadWithFetch(async (input, init) => {
    urls.push(String(input));
    assert.deepEqual(init?.body, bytes);
    assert.ok(init?.signal, "上传必须设置超时");
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
    if (urls.length === 1) throw networkError();
    return new Response(null, { status: urls.length === 2 ? 503 : 200 });
  });
  assert.equal(urls.length, 3);
  assert.equal(new Set(urls).size, 1);
  assert.equal(stored.objectKey, "picture-books/audio/page.mp3");
  assert.equal(stored.url, `https://cdn.abei.example/${stored.objectKey}`);
});

test("绘本 R2 上传持续超时后返回中文错误，最多请求三次", async () => {
  let calls = 0;
  await assert.rejects(uploadWithFetch(async () => { calls++; throw networkError(); }),
    (error: unknown) => error instanceof VideoGuideNarrationStorageError && error.code === "R2_UPLOAD_FAILED" && /语音.*上传.*失败/.test(error.message) && !error.message.includes("fetch failed"));
  assert.equal(calls, 3);
});

test("绘本 R2 拒绝上传时返回配置提示且不重试", async () => {
  let calls = 0;
  await assert.rejects(uploadWithFetch(async () => { calls++; return new Response(null, { status: 403 }); }), /对象存储拒绝上传/);
  assert.equal(calls, 1);
});
