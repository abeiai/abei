import assert from "node:assert/strict";
import test from "node:test";
import { legacyLogFile } from "../src/operations/legacy-ai-log-files.js";

test("历史 R2 素材使用固定迁移路径读取并保留音视频 Range", async () => {
  const previousFetch = globalThis.fetch;
  const previousBase = process.env.S3_PUBLIC_BASE_URL;
  const previousBucket = process.env.S3_BUCKET;
  process.env.S3_PUBLIC_BASE_URL = "https://media.example.invalid";
  process.env.S3_BUCKET = "abeiai";
  let called: { url: string; options: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, options: RequestInit) => {
    called = { url, options };
    return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Length": "3", "Content-Range": "bytes 0-2/8" } });
  }) as typeof fetch;
  const asset = { status: "AVAILABLE", mediaType: "AUDIO", mimeType: "audio/mpeg", storageKey: `r2:picture-books/legacy-sync/abeiai-v1/${"a".repeat(64)}.mp3`, filename: "测试.mp3" };
  try {
    const result = await legacyLogFile(asset, "bytes=0-2");
    assert.equal(result.status, 206);
    assert.equal(result.headers["Content-Range"], "bytes 0-2/8");
    assert.equal((called!.options.headers as Record<string, string>).Range, "bytes=0-2");
    assert.equal(called!.options.redirect, "error");
    let length = 0;
    for await (const chunk of result.stream) length += chunk.length;
    assert.equal(length, 3);
    for (const storageKey of ["r2:https://old.example/api/media", "r2:picture-books/../secret.mp3", "r2:other/file.mp3"])
      await assert.rejects(() => legacyLogFile({ ...asset, storageKey }));
    await assert.rejects(() => legacyLogFile(asset, "bytes=0-2,4-6"));
    globalThis.fetch = (async () => new Response("<html>missing</html>", { headers: { "Content-Type": "text/html", "Content-Length": "20" } })) as typeof fetch;
    await assert.rejects(() => legacyLogFile(asset));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.S3_PUBLIC_BASE_URL; else process.env.S3_PUBLIC_BASE_URL = previousBase;
    if (previousBucket === undefined) delete process.env.S3_BUCKET; else process.env.S3_BUCKET = previousBucket;
  }
});
