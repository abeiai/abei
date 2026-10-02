import assert from "node:assert/strict";
import test from "node:test";
import { MediaService } from "../src/media/media.service.js";

test("generated picture book image is downloaded and saved to R2", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousFetch = globalThis.fetch;
  const storageKeys = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"] as const;
  const previousStorage = Object.fromEntries(storageKeys.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:3604/test";
  Object.assign(process.env, {
    S3_BUCKET: "abeiai", S3_ENDPOINT: "https://test.r2.cloudflarestorage.com",
    S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_PUBLIC_BASE_URL: "https://cdn.abei.example"
  });
  const service = new MediaService() as unknown as {
    archivePictureBookGeneratedImage(userId: string, url: string): Promise<{ url: string }>;
    persistFile(input: Record<string, unknown>): Promise<{ url: string }>;
  };
  let saved: Record<string, unknown> | null = null;
  service.persistFile = async (input) => {
    saved = input;
    return { url: "https://cdn.abei.example/picture-books/images/result.png" };
  };
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=", "base64");
  globalThis.fetch = async () => new Response(image, { status: 200, headers: { "content-type": "image/png" } });
  try {
    const result = await service.archivePictureBookGeneratedImage("user-1", "https://dashscope-a717.oss-accelerate.aliyuncs.com/result.png");
    assert.equal(result.url, "https://cdn.abei.example/picture-books/images/result.png");
    assert.equal(saved?.storageProvider, "S3");
    assert.equal(saved?.sourceType, "AI_GENERATED");
    assert.equal(saved?.createdByUserId, "user-1");
    assert.equal((saved?.file as { buffer: Buffer }).buffer.length, image.length);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    for (const key of storageKeys) {
      if (previousStorage[key] === undefined) delete process.env[key];
      else process.env[key] = previousStorage[key];
    }
  }
});

test("绘本图片从 R2 签名读取，不依赖公开域名的解析", async () => {
  const keys = ["DATABASE_URL", "S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost:3604/test", S3_BUCKET: "abeiai",
    S3_ENDPOINT: "https://test.r2.cloudflarestorage.com", S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test", S3_PUBLIC_BASE_URL: "https://cdn.abei.example"
  });
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=", "base64");
  globalThis.fetch = async (input, init) => {
    if (String(input) !== "https://test.r2.cloudflarestorage.com/abeiai/picture-books/page.png" ||
        !new Headers(init?.headers).get("authorization")?.startsWith("AWS4-HMAC-SHA256 ")) {
      return new Response("旧站点 404", { status: 404, headers: { "content-type": "text/html" } });
    }
    return new Response(image, { headers: { "content-type": "image/png" } });
  };
  try {
    const service = new MediaService();
    const file = await service.readPictureBookStoredImage("https://cdn.abei.example/picture-books/page.png");
    assert.deepEqual(file.buffer, image);
    assert.equal(file.mimetype, "image/png");
    await assert.rejects(service.readPictureBookStoredImage("https://cdn.abei.example/picture-books/page.png?key=other"));
    await assert.rejects(service.readPictureBookStoredImage("https://attacker.example/page.png"));
    await assert.rejects(service.readPictureBookStoredImage("https://cdn.abei.example/picture-books/%2e%2e/secret.png"));
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
