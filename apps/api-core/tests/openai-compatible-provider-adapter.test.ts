import assert from "node:assert/strict";
import test from "node:test";

import { encryptSecret } from "@xueleai/database";
import { getProviderAdapter } from "../src/ai/provider-adapters.js";

const encryptionKey = "test-secret-encryption-key-32-characters-long";

test("图片 Provider 使用 models 接口测试连接且不发起生成请求", async () => {
  const previousFetch = globalThis.fetch;
  const previousEncryptionKey = process.env.SECRET_ENCRYPTION_KEY;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const result = await getProviderAdapter("OPENAI_COMPATIBLE").testConnection({
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3/",
      apiKeyEncrypted: encryptSecret("test-ark-key"),
      modelName: "doubao-seedream-5-0-pro-260628",
      capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT"],
      timeoutMs: 1000
    });

    assert.deepEqual(result, { success: true, message: "连接成功" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://ark.cn-beijing.volces.com/api/v3/models");
    assert.equal(requests[0]?.init?.method, "GET");
    assert.equal(requests[0]?.init?.body, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEncryptionKey === undefined) {
      delete process.env.SECRET_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});

test("阿贝智能连接测试必须在 models 中找到所选模型", async () => {
  const previousFetch = globalThis.fetch;
  const previousEncryptionKey = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
  let listed = false;
  globalThis.fetch = async () => Response.json({ data: listed ? [{ id: "IndexTTS-2.5" }] : [] });

  try {
    const input = {
      baseUrl: "https://dmx04.sdts.net.cn/v1",
      apiKeyEncrypted: encryptSecret("test-key"),
      modelName: "IndexTTS-2.5",
      capabilityTags: ["AUDIO", "TTS"],
      timeoutMs: 1000
    };
    assert.deepEqual(await getProviderAdapter("OPENAI_COMPATIBLE").testConnection(input), {
      success: false,
      message: "连接成功，但当前 API Key 无法访问所选模型"
    });
    listed = true;
    assert.deepEqual(await getProviderAdapter("OPENAI_COMPATIBLE").testConnection(input), {
      success: true,
      message: "模型连接成功",
      modelVerified: true
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEncryptionKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
    else process.env.SECRET_ENCRYPTION_KEY = previousEncryptionKey;
  }
});
