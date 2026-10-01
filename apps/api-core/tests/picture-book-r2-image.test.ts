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
