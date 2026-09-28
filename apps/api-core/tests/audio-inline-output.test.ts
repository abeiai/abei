import assert from "node:assert/strict";
import test from "node:test";

import { AudioService } from "../src/audio/audio.service.js";

test("Base64 语音合成结果保存为可播放的 R2 音频资源", async () => {
  let assetData: Record<string, unknown> | null = null;
  let uploadedFile: { mimetype: string; size: number; buffer: Buffer } | null = null;

  const service = new AudioService();
  const internals = service as unknown as {
    createOutputAudioAsset: (
      transaction: unknown,
      userId: string,
      payload: Record<string, unknown>
    ) => Promise<string | null>;
    uploadAudioToS3: (
      filename: string,
      file: { mimetype: string; size: number; buffer: Buffer },
      requirePublicUrl: boolean
    ) => Promise<{ objectKey: string; url: string }>;
  };
  internals.uploadAudioToS3 = async (_filename, file, requirePublicUrl) => {
    assert.equal(requirePublicUrl, true);
    uploadedFile = file;
    return {
      objectKey: "uploads/audio/20260828-test.mp3",
      url: "https://cdn.xueleai.com/uploads/audio/20260828-test.mp3"
    };
  };
  const transaction = {
    audioAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assetData = data;
        return { id: "audio-asset-1" };
      }
    }
  };

  const id = await internals.createOutputAudioAsset(transaction, "user-1", {
    audioBase64: Buffer.from("ID3test").toString("base64"),
    audioMimeType: "audio/mpeg"
  });

  assert.equal(id, "audio-asset-1");
  assert.equal(assetData?.type, "TTS_OUTPUT");
  assert.equal(assetData?.storageProvider, "S3");
  assert.equal(assetData?.objectKey, "uploads/audio/20260828-test.mp3");
  assert.equal(assetData?.url, "https://cdn.xueleai.com/uploads/audio/20260828-test.mp3");
  assert.equal(uploadedFile?.mimetype, "audio/mpeg");
  assert.equal(uploadedFile?.size, 7);
});

test("供应商不能通过 voiceMaster 字段伪造已验证的母版资源", async () => {
  const service = new AudioService() as unknown as {
    createOutputAudioAsset: (transaction: unknown, userId: string, payload: Record<string, unknown>) => Promise<string | null>;
  };
  const transaction = { audioAsset: { create: async () => { throw new Error("untrusted master must not create an asset"); } } };
  assert.equal(await service.createOutputAudioAsset(transaction, "user-1", {
    voiceMaster: { url: "https://evil.example/master.wav", objectKey: "master.wav", mimeType: "audio/wav", sizeBytes: 100 }
  }), null);
});
