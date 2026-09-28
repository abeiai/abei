import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedStudentPhotoSourceUrl, uploadPrivateStudentPhoto } from "../src/copybooks/copybook-storage.js";
import { AppException } from "../src/common/app-exception.js";

test("学生证照归档接受阿里云和火山引擎产物地址", () => {
  assert.equal(isTrustedStudentPhotoSourceUrl("https://dashscope-0484.oss-accelerate.aliyuncs.com/a.png?Expires=1"), true);
  assert.equal(isTrustedStudentPhotoSourceUrl("https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/a.jpeg?X-Tos-Signature=x"), true);
  assert.equal(isTrustedStudentPhotoSourceUrl("https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/a.jpeg"), true);
  assert.equal(isTrustedStudentPhotoSourceUrl("https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/a.jpeg"), true);
  assert.equal(isTrustedStudentPhotoSourceUrl("https://dmx04.sdts.net.cn/dl/images/a.png"), true);
});

test("学生证照归档拒绝伪装域名和内网地址", () => {
  for (const url of [
    "http://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/a.jpeg",
    "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com.evil.example/a.jpeg",
    "https://127.0.0.1/a.jpeg",
    "https://user:password@ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/a.jpeg",
    "https://other.tos-cn-beijing.volces.com/a.jpeg",
    "https://dmx04.sdts.net.cn.evil.example/dl/images/a.png",
    "https://dmx04.sdts.net.cn/admin/a.png"
  ]) assert.equal(isTrustedStudentPhotoSourceUrl(url), false, url);
});

test("火山引擎产物可加密归档，存储请求不包含原图字节", async () => {
  const names = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "JWT_ACCESS_SECRET"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const source = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let stored: Buffer | null = null;
  try {
    process.env.S3_ENDPOINT = "https://storage.example";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.JWT_ACCESS_SECRET = "test-jwt-secret";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.endsWith("volces.com")) {
        return new Response(new Uint8Array(source), { headers: { "Content-Type": "image/jpeg" } });
      }
      assert.equal(url.hostname, "storage.example");
      assert.equal(init?.method, "PUT");
      stored = Buffer.from(init?.body as Buffer);
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const key = await uploadPrivateStudentPhoto("task", 1,
      "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/image.jpeg?X-Tos-Signature=x");
    assert.match(key, /^student-photos\/task\/1-[a-f0-9]{32}\.jpg$/);
    assert.ok(stored);
    assert.equal(stored.length, source.length + 28);
    assert.notDeepEqual(stored, source);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("证照图片下载网络异常会重试并返回明确错误", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  try {
    globalThis.fetch = (async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(
      () => uploadPrivateStudentPhoto("task", 1,
        "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/image.jpeg"),
      (error: unknown) => error instanceof AppException &&
        error.code === 50201 && error.message.includes("证照图片读取失败")
    );
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("证照保存网络异常返回明确错误", async () => {
  const names = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "JWT_ACCESS_SECRET"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.S3_ENDPOINT = "https://storage.example";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.JWT_ACCESS_SECRET = "test-jwt-secret";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (new URL(String(input)).hostname.endsWith("volces.com")) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } });
      }
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(
      () => uploadPrivateStudentPhoto("task", 1,
        "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/image.jpeg"),
      (error: unknown) => error instanceof AppException &&
        error.code === 50201 && error.message.includes("证照保存失败")
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
