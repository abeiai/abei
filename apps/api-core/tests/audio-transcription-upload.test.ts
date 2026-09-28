import assert from "node:assert/strict";
import test from "node:test";

import { AudioService } from "../src/audio/audio.service.js";

test("跟读存储支持独立的 30 MB 上限且普通音频仍遵循原配置", async () => {
  const previousLimit = process.env.AUDIO_UPLOAD_MAX_BYTES;
  process.env.AUDIO_UPLOAD_MAX_BYTES = String(20 * 1024 * 1024);
  let stored = 0;
  const service = new AudioService();
  Object.assign(service, {
    uploadAudioToS3: async () => { stored += 1; return { objectKey: "reading.mp3", url: "https://example.com/reading.mp3" }; },
    assertPublicAudioUrlReadable: async () => undefined,
    prisma: { audioAsset: { create: async ({ data }: { data: Record<string, unknown> }) => data } },
    toAudioAsset: (asset: unknown) => asset
  });
  const maxBytes = 30 * 1024 * 1024;
  const file = { originalname: "reading.mp3", mimetype: "audio/mpeg", size: maxBytes, buffer: Buffer.alloc(maxBytes) };
  try {
    await service.uploadAudioAssetForTranscription("user-1", "TTS_OUTPUT", file, maxBytes);
    assert.equal(stored, 1);
    await assert.rejects(service.uploadAudioAssetForTranscription("user-1", "TTS_OUTPUT", { ...file, size: maxBytes + 1 }, maxBytes), /30MB/u);
    await assert.rejects(service.uploadAudioAsset("user-1", "TTS_OUTPUT", file), /20MB/u);
    await assert.rejects(service.uploadAudioAssetForTranscription("user-1", "TTS_OUTPUT", file), /20MB/u);
    assert.equal(stored, 1);
  } finally {
    if (previousLimit === undefined) delete process.env.AUDIO_UPLOAD_MAX_BYTES;
    else process.env.AUDIO_UPLOAD_MAX_BYTES = previousLimit;
  }
});

test("语音识别音频强制上传到 R2 并返回公网地址", async () => {
  const previousEnv = {
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    S3_KEY_PREFIX: process.env.S3_KEY_PREFIX,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_REGION: process.env.S3_REGION,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    UPLOAD_DRIVER: process.env.UPLOAD_DRIVER,
    VIDEO_GUIDE_R2_PUBLIC_BASE_URL: process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL
  };
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  Object.assign(process.env, {
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_BUCKET: "test-bucket",
    S3_ENDPOINT: "https://r2.example.com",
    S3_FORCE_PATH_STYLE: "1",
    S3_KEY_PREFIX: "uploads/",
    S3_PUBLIC_BASE_URL: "",
    S3_REGION: "auto",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
    UPLOAD_DRIVER: "local",
    VIDEO_GUIDE_R2_PUBLIC_BASE_URL: "https://cdn.example.com"
  });
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response(Buffer.from("a"), { status: 200 });
  };

  try {
    const service = new AudioService();
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: {
        audioAsset: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            ...data,
            id: "audio-asset-1",
            durationMs: null,
            sampleRate: null,
            channels: null,
            createdAt: new Date("2026-08-10T00:00:00.000Z")
          })
        }
      }
    });

    const asset = await service.uploadAudioAssetForTranscription(
      "user-1",
      "TTS_OUTPUT",
      {
        originalname: "reading.mp3",
        mimetype: "audio/mpeg",
        size: 5,
        buffer: Buffer.from("audio")
      }
    );

    assert.equal(asset.storageProvider, "S3");
    assert.match(
      asset.url,
      /^https:\/\/cdn\.example\.com\/video-guide\/narration\/english-guided-study\/read-along-upload\//u
    );
    assert.match(
      asset.objectKey,
      /^video-guide\/narration\/english-guided-study\/read-along-upload\//u
    );
    assert.match(
      requestedUrls[0] ?? "",
      /^https:\/\/r2\.example\.com\/test-bucket\/video-guide\/narration\/english-guided-study\/read-along-upload\//u
    );
    assert.equal(requestedUrls[1], asset.url);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("语音识别将 CDN 音频地址转换为 R2 临时签名地址", async () => {
  const previousEnv = {
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_REGION: process.env.S3_REGION,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    VIDEO_GUIDE_R2_PUBLIC_BASE_URL: process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL
  };
  const originalFetch = globalThis.fetch;
  let gatewayMediaUrl = "";

  Object.assign(process.env, {
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_BUCKET: "test-bucket",
    S3_ENDPOINT: "https://r2.example.com",
    S3_FORCE_PATH_STYLE: "1",
    S3_PUBLIC_BASE_URL: "",
    S3_REGION: "auto",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
    VIDEO_GUIDE_R2_PUBLIC_BASE_URL: "https://cdn.example.com"
  });
  globalThis.fetch = async () => new Response(Buffer.from("a"), { status: 206 });

  try {
    const service = new AudioService();
    Object.assign(service as unknown as Record<string, unknown>, {
      ensureDashScopeAudioDefaults: async () => undefined,
      getModelByAlias: async () => ({
        modelName: "qwen3-asr-flash",
        providerName: "阿里云百炼"
      }),
      callAudioGateway: async (
        _path: string,
        _model: Record<string, unknown>,
        body: Record<string, unknown>
      ) => {
        gatewayMediaUrl = String(body.mediaUrl ?? "");
        return {
          subtitleText: "1\n00:00:00,000 --> 00:00:01,000\nHello"
        };
      }
    });

    await service.generateSrtFromMediaUrl({
      mediaMimeType: "audio/mpeg",
      mediaName: "reading.mp3",
      mediaUrl: "https://cdn.example.com/video-guide/narration/english-guided-study/read-along-upload/reading.mp3"
    });

    const parsedUrl = new URL(gatewayMediaUrl);
    assert.equal(parsedUrl.origin, "https://r2.example.com");
    assert.equal(
      parsedUrl.pathname,
      "/test-bucket/video-guide/narration/english-guided-study/read-along-upload/reading.mp3"
    );
    assert.equal(parsedUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.equal(parsedUrl.searchParams.get("X-Amz-Expires"), "7200");
    assert.ok(parsedUrl.searchParams.get("X-Amz-Signature"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("异步语音识别提交同样使用可读取的 R2 临时签名地址", async () => {
  const previousEnv = {
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_REGION: process.env.S3_REGION,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    VIDEO_GUIDE_R2_PUBLIC_BASE_URL: process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL
  };
  const originalFetch = globalThis.fetch;
  let gatewayMediaUrl = "";
  let readableChecks = 0;

  Object.assign(process.env, {
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_BUCKET: "test-bucket",
    S3_ENDPOINT: "https://r2.example.com",
    S3_FORCE_PATH_STYLE: "1",
    S3_PUBLIC_BASE_URL: "",
    S3_REGION: "auto",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
    VIDEO_GUIDE_R2_PUBLIC_BASE_URL: "https://cdn.example.com"
  });
  globalThis.fetch = async () => {
    readableChecks += 1;
    return new Response(Buffer.from("a"), { status: 206 });
  };

  try {
    const service = new AudioService();
    Object.assign(service as unknown as Record<string, unknown>, {
      ensureDashScopeAudioDefaults: async () => undefined,
      getModelByAlias: async () => ({
        modelInstanceId: "model-instance-1",
        modelName: "qwen3-asr-flash",
        providerInstanceId: "provider-instance-1",
        providerName: "阿里云百炼"
      }),
      callAudioGateway: async (
        path: string,
        _model: Record<string, unknown>,
        body: Record<string, unknown>
      ) => {
        assert.equal(path, "/audio/asr/tasks");
        gatewayMediaUrl = String(body.mediaUrl ?? "");
        return {
          providerTaskId: "provider-task-1",
          providerStatus: "PENDING",
          status: "PENDING"
        };
      }
    });

    await service.submitSrtGenerationTask({
      mediaMimeType: "audio/mpeg",
      mediaName: "reading.mp3",
      mediaUrl: "https://cdn.example.com/video-guide/narration/english-guided-study/read-along-upload/reading.mp3"
    });

    const parsedUrl = new URL(gatewayMediaUrl);
    assert.equal(readableChecks, 1);
    assert.equal(parsedUrl.origin, "https://r2.example.com");
    assert.equal(
      parsedUrl.pathname,
      "/test-bucket/video-guide/narration/english-guided-study/read-along-upload/reading.mp3"
    );
    assert.equal(parsedUrl.searchParams.get("X-Amz-Expires"), "7200");
    assert.ok(parsedUrl.searchParams.get("X-Amz-Signature"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
