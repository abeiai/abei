import assert from "node:assert/strict";
import test from "node:test";

import { encryptSecret } from "@xueleai/database";
import { getProviderAdapter } from "../src/ai/provider-adapters.js";

const encryptionKey = "test-secret-encryption-key-32-characters-long";

test("ElevenLabs Provider 连接测试通过本地 Gateway 探测 TTS 权限且不由 API Core 直连", async () => {
  const previousFetch = global.fetch;
  const previousEncryptionKey = process.env.SECRET_ENCRYPTION_KEY;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
  global.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, message: "连接成功", modelVerified: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const adapter = getProviderAdapter("ELEVENLABS_AUDIO");
    const result = await adapter.testConnection({
      baseUrl: "https://api.elevenlabs.io",
      apiKeyEncrypted: encryptSecret("test-elevenlabs-key"),
      modelName: "eleven_multilingual_v2",
      gatewayBaseUrl: "http://127.0.0.1:3323",
      timeoutMs: 1000
    });

    assert.equal(adapter.type, "ELEVENLABS_AUDIO");
    assert.deepEqual(result, { success: true, message: "连接成功", modelVerified: false });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "http://127.0.0.1:3323/audio/providers/elevenlabs/test");
    assert.equal(requests[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      baseUrl: "https://api.elevenlabs.io",
      apiKey: "test-elevenlabs-key",
      model: "eleven_multilingual_v2",
      providerKey: "elevenlabs_audio",
      adapterType: "ELEVENLABS_AUDIO",
      timeoutMs: 1000
    });
    assert.equal(requests[0]?.url.includes("text-to-speech"), false);
  } finally {
    global.fetch = previousFetch;
    if (previousEncryptionKey === undefined) {
      delete process.env.SECRET_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});

test("ElevenLabs Provider 连接失败只返回脱敏中文错误", async () => {
  const previousFetch = global.fetch;
  const previousEncryptionKey = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        detail: {
          errorMessage: "ElevenLabs API Key 无效或无权访问",
          debug: "test-elevenlabs-key"
        }
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );

  try {
    const result = await getProviderAdapter("ELEVENLABS_AUDIO").testConnection({
      baseUrl: "https://api.elevenlabs.io",
      apiKeyEncrypted: encryptSecret("test-elevenlabs-key"),
      modelName: "eleven_v3",
      gatewayBaseUrl: "http://127.0.0.1:3323",
      timeoutMs: 1000
    });

    assert.deepEqual(result, {
      success: false,
      message: "ElevenLabs API Key 无效或无权访问"
    });
    assert.equal(result.message.includes("test-elevenlabs-key"), false);
  } finally {
    global.fetch = previousFetch;
    if (previousEncryptionKey === undefined) {
      delete process.env.SECRET_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});
