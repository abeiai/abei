import assert from "node:assert/strict";
import test from "node:test";
import { MediaService } from "../src/media/media.service.js";
import { AppException } from "../src/common/app-exception.js";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=", "base64");
const env = { DATABASE_URL: "postgresql://test:test@localhost:3604/test", S3_BUCKET: "abeiai", S3_ENDPOINT: "https://test.r2.cloudflarestorage.com", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_PUBLIC_BASE_URL: "https://cdn.abei.example", S3_FORCE_PATH_STYLE: "1", S3_KEY_PREFIX: "" };
async function withMedia(operation: (service: MediaService) => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const fetchImpl = globalThis.fetch;
  Object.assign(process.env, env);
  try { await operation(new MediaService()); }
  finally {
    globalThis.fetch = fetchImpl;
    for (const key of Object.keys(env)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
}

test("绘本文件连接失败或文件流超时后重传，允许较慢的完整文件下载", async () => withMedia(async service => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.ok(init?.signal);
    if (calls === 1) throw new TypeError("fetch failed");
    if (calls === 2) return new Response(new ReadableStream({ start(controller) { controller.error(new DOMException("timed out", "TimeoutError")); } }), { headers: { "content-type": "image/png" } });
    return new Response(image, { headers: { "content-type": "image/png" } });
  };
  const file = await service.readPictureBookStoredImage("https://cdn.abei.example/page.png");
  assert.deepEqual(file.buffer, image);
  assert.equal(calls, 3);
}));

test("R2 语音读取遇到临时错误后恢复", async () => withMedia(async service => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? new Response("busy", { status: 503 }) : new Response("ID3audio", { headers: { "content-type": "audio/mpeg" } });
  assert.equal((await service.readPictureBookStoredAudio("https://cdn.abei.example/page.mp3")).buffer.toString(), "ID3audio");
  assert.equal(calls, 2);
}));

test("重试耗尽返回明确的中文错误，永久错误和无效文件不重试", async () => withMedia(async service => {
  for (const failure of ["timeout", "forbidden", "html", "oversize"] as const) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (failure === "timeout") throw new DOMException("timed out", "TimeoutError");
      if (failure === "forbidden") return new Response("denied", { status: 403 });
      if (failure === "html") return new Response("not an image", { headers: { "content-type": "text/html" } });
      return new Response(Buffer.alloc(10 * 1024 * 1024 + 1), { headers: { "content-type": "image/png" } });
    };
    await assert.rejects(service.readPictureBookStoredImage("https://cdn.abei.example/page.png"), error => error instanceof AppException && /图片.*(失败|限制)/.test(error.message));
    assert.equal(calls, failure === "timeout" ? 3 : 1);
  }
}));

test("生成图片下载重试后仅保存一次资产", async () => withMedia(async service => {
  let calls = 0, saves = 0;
  Object.assign(service, { persistFile: async () => { saves++; return { url: "https://cdn.abei.example/result.png" }; } });
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError("fetch failed"); return new Response(image, { headers: { "content-type": "image/png" } }); };
  assert.equal((await service.archivePictureBookGeneratedImage("user", "https://dashscope-a717.oss-accelerate.aliyuncs.com/result.png")).url, "https://cdn.abei.example/result.png");
  assert.equal(calls, 2);
  assert.equal(saves, 1);
}));

test("R2 上传重试沿用对象键和文件内容，永久错误不重试", async () => withMedia(async service => {
  const uploader = service as unknown as { uploadToS3(filename: string, file: unknown): Promise<string> };
  const file = { mimetype: "image/png", buffer: image, size: image.length, originalname: "page.png" };
  const requests: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: init?.body });
    assert.ok(init?.signal);
    if (requests.length === 1) throw new TypeError("fetch failed");
    return new Response(null, { status: requests.length === 2 ? 503 : 200 });
  };
  assert.equal(await uploader.uploadToS3("page.png", file), "https://cdn.abei.example/page.png");
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.url === requests[0].url && request.body === image));
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 403 }); };
  await assert.rejects(uploader.uploadToS3("page.png", file), /R2.*上传失败/);
  assert.equal(calls, 1);
}));
