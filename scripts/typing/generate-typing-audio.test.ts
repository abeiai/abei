import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { requestTypingAudio } from "./generate-typing-audio.js";

test("通过 Gateway 发送固定 cosyvoice/loongemily 请求并读取 base64 音频", async (context) => {
  let received: Record<string, unknown> | null = null;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      received = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        audioBase64: Buffer.from("ID3-greet-audio").toString("base64")
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("测试服务器地址无效");
  }

  const audio = await requestTypingAudio({
    apiKey: "test-secret",
    baseUrl: "https://dashscope.example/api/v1",
    gatewayUrl: `http://127.0.0.1:${address.port}`,
    model: "cosyvoice-v3-flash",
    region: "cn-beijing",
    text: "greet",
    voice: "loongemily_v3",
    webSocketUrl: "wss://dashscope.example/api-ws/v1/inference"
  });

  assert.equal(audio.toString("utf8"), "ID3-greet-audio");
  assert.deepEqual(received, {
    adapterType: "DASHSCOPE_AUDIO",
    apiKey: "test-secret",
    baseUrl: "https://dashscope.example/api/v1",
    format: "mp3",
    model: "cosyvoice-v3-flash",
    providerKey: "aliyun_dashscope_audio",
    region: "cn-beijing",
    sampleRate: 24000,
    speed: 1,
    text: "greet",
    timeoutMs: 45000,
    voice: "loongemily_v3",
    webSocketUrl: "wss://dashscope.example/api-ws/v1/inference"
  });
});

test("下载 Gateway 返回的临时音频 URL", async (context) => {
  const expected = Buffer.from("ID3-url-audio");
  const server = createServer((request, response) => {
    if (request.url === "/audio/tts") {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ audioUrl: `http://127.0.0.1:${port}/result.mp3` }));
      return;
    }

    response.setHeader("Content-Type", "audio/mpeg");
    response.end(expected);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("测试服务器地址无效");
  }

  const audio = await requestTypingAudio({
    apiKey: "test-secret",
    baseUrl: "https://dashscope.example/api/v1",
    gatewayUrl: `http://127.0.0.1:${address.port}`,
    model: "cosyvoice-v3-flash",
    region: "cn-beijing",
    text: "go by",
    voice: "loongemily_v3",
    webSocketUrl: null
  });

  assert.deepEqual(audio, expected);
});

