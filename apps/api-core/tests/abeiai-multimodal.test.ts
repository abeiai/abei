import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;

test("阿贝智能音频与视频附件完整传入网关 messages", async () => {
  const { encryptSecret } = await import("@xueleai/database");
  const { getProviderAdapter } = await import("../src/ai/provider-adapters.js");
  const adapter = getProviderAdapter("OPENAI_COMPATIBLE");
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ output: "ok", text: "ok" });
  };

  try {
    for (const [modelName, type, mimeType] of [
      ["Qwen2-Audio-7B-Instruct", "audio", "audio/wav"],
      ["Qwen3-VL-8B-Instruct", "video", "video/mp4"]
    ]) {
      await adapter.generateText({
        gatewayBaseUrl: "http://127.0.0.1:3323",
        scenarioSlug: "experience-ai-chat",
        baseUrl: "https://dmx04.sdts.net.cn/v1",
        apiKeyEncrypted: encryptSecret("sk-unit-test"),
        modelName,
        prompt: "描述内容",
        input: "描述内容",
        temperature: 0.7,
        maxTokens: 3000,
        timeoutMs: 1000,
        attachments: [{ name: "input", type, mimeType, size: 4, dataUrl: `data:${mimeType};base64,AAAA` }]
      });
    }

    const contents = requests.map((request) => {
      const messages = request.messages as Array<{ content: unknown }>;
      return messages[0]?.content as Array<Record<string, unknown>>;
    });
    assert.equal(contents[0]?.[1]?.type, "audio_url");
    assert.equal(contents[1]?.[1]?.type, "video_url");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("阿贝智能文本模型未配置输入输出价格时不得调用", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  const service = new AiService(undefined as never, undefined as never) as unknown as {
    activeModelFromInstance(model: Record<string, unknown>, scenario: Record<string, unknown>, alias: string | null): unknown;
    resolveModelRuntimeConfig(): Record<string, unknown>;
  };
  service.resolveModelRuntimeConfig = () => ({ apiKeyEncrypted: "encrypted", baseUrl: "https://dmx04.sdts.net.cn/v1" });
  const model = {
    id: "model-1",
    displayName: "Qwen3.5",
    providerModelName: "Qwen3.5-122B-A10B-FP8",
    capabilityTags: ["TEXT", "STREAMING"],
    inputPrice: { toString: () => "0" },
    outputPrice: { toString: () => "0" },
    isEnabled: true,
    providerInstance: {
      id: "provider-1",
      name: "阿贝智能",
      status: "ENABLED",
      providerPreset: { adapterType: "OPENAI_COMPATIBLE", apiKeyEnvName: "ABEIAI_API_KEY" }
    }
  };
  assert.throws(
    () => service.activeModelFromInstance(model, { requiredCapabilities: ["TEXT", "STREAMING"] }, null),
    /配置输入和输出价格/
  );
});

test("阿贝智能语音 Provider 未通过测试时不能直接启用", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  let savedStatus: string | undefined;
  const service = new AiService(undefined as never, undefined as never) as unknown as {
    prisma: Record<string, unknown>;
    getProviderPreset(id: string): Promise<{ id: string }>;
    updateProviderInstance(id: string, dto: Record<string, unknown>): Promise<{ id: string }>;
  };
  service.prisma = {
    aiProviderPreset: {
      findUnique: async () => ({
        id: "preset-1",
        providerKey: "abeiai_audio",
        adapterType: "OPENAI_COMPATIBLE",
        instances: [{ id: "instance-1", baseUrl: "https://dmx04.sdts.net.cn/v1", status: "DISABLED", lastTestResult: null }]
      })
    },
    aiProviderInstance: {
      update: async ({ data }: { data: { status?: string } }) => {
        savedStatus = data.status;
        return { id: "instance-1" };
      }
    }
  };
  service.getProviderPreset = async (id) => ({ id });

  await service.updateProviderInstance("preset-1", { status: "ENABLED" });
  assert.equal(savedStatus, "DISABLED");
});
