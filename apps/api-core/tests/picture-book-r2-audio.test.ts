import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { AudioService } from "../src/audio/audio.service.js";

test("picture book narration stores provider audio on R2 even when other uploads are local", async () => {
  const previousDriver = process.env.UPLOAD_DRIVER;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.UPLOAD_DRIVER = "local";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:3604/test";
  let uploaded = false;
  let localUpload = false;
  let saved: Record<string, unknown> | null = null;
  const service = new AudioService() as unknown as {
    persistTtsAudioToS3(payload: Record<string, unknown>): Promise<{ url: string; objectKey: string; mimeType: string; sizeBytes: number }>;
    createOutputAudioAsset(transaction: unknown, userId: string, payload: Record<string, unknown>, master: unknown): Promise<string>;
    uploadAudioToS3(filename: string, file: unknown, requirePublicUrl: boolean): Promise<{ url: string; objectKey: string }>;
    uploadAudioToLocal(filename: string, file: unknown): Promise<string>;
  };
  service.uploadAudioToS3 = async (_filename, _file, requirePublicUrl) => {
    uploaded = requirePublicUrl;
    return { url: "https://cdn.abei.example/picture-books/audio/test.mp3", objectKey: "picture-books/audio/test.mp3" };
  };
  service.uploadAudioToLocal = async () => {
    localUpload = true;
    return "/api/audio/files/test.mp3";
  };
  globalThis.fetch = async () => new Response(Buffer.from("ID3test"), { status: 200, headers: { "content-type": "audio/mpeg" } });
  try {
    const payload = { audioUrl: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.mp3" };
    const persisted = await service.persistTtsAudioToS3(payload);
    assert.equal(uploaded, true);
    const id = await service.createOutputAudioAsset({ audioAsset: { create: async ({ data }: { data: Record<string, unknown> }) => {
      saved = data;
      return { id: "asset-1" };
    } } }, "user-1", payload, persisted);
    assert.equal(id, "asset-1");
    assert.equal(localUpload, false);
    assert.equal(saved?.storageProvider, "S3");
    assert.equal(saved?.url, "https://cdn.abei.example/picture-books/audio/test.mp3");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDriver === undefined) delete process.env.UPLOAD_DRIVER;
    else process.env.UPLOAD_DRIVER = previousDriver;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
