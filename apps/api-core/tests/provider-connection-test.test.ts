import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret } from "@xueleai/database";
import { AiService } from "../src/ai/ai.service.js";
import { getProviderAdapter } from "../src/ai/provider-adapters.js";

process.env.DATABASE_URL ??= "postgresql://abei:test@127.0.0.1:3609/abei_test";
const encryptionKey = "provider-connection-regression-test-key-2026";

test("连接测试优先默认聊天模型，避免其它模型免费额度耗尽误停供应商", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
  let testedModel = "";
  let savedStatus = "";
  globalThis.fetch = async (_url, init) => {
    testedModel = JSON.parse(String(init?.body)).model;
    return testedModel === "qwen3.8-flash"
      ? Response.json({ choices: [{ message: { content: "OK" } }] })
      : Response.json({ error: { code: "AllocationQuota.FreeTierOnly" } }, { status: 403 });
  };
  const service = new AiService({} as never, {} as never);
  Object.defineProperty(service, "prisma", { value: {
    aiProviderPreset: { findUnique: async (args: { include: { instances: { include: { modelInstances: { include?: unknown } } } } }) => ({
      id: "provider", providerKey: "dashscope", adapterType: "OPENAI_COMPATIBLE", apiKeyEnvName: "DASHSCOPE_API_KEY", region: "CHINA",
      instances: [{ id: "instance", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", region: "CHINA",
        credential: { apiKeyEncrypted: encryptSecret("test-key") },
        modelInstances: [
          { providerModelName: "qwen-plus", capabilityTags: ["TEXT"], aliases: [] },
          { providerModelName: "qwen3.8-flash", capabilityTags: ["TEXT", "VISION"],
            ...(args.include.instances.include.modelInstances.include ? { aliases: [{ aliasKey: "default-chat" }] } : {}) }
        ]
      }]
    }) },
    aiProviderInstance: { update: async (args: { data: { status: string } }) => { savedStatus = args.data.status; } }
  } });
  try {
    const result = await service.testProviderInstance("provider");
    assert.equal(result.success, true);
    assert.equal(testedModel, "qwen3.8-flash");
    assert.equal(savedStatus, "ENABLED");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
    else process.env.SECRET_ENCRYPTION_KEY = previousKey;
  }
});

for (const item of [
  { status: 403, code: "AllocationQuota.FreeTierOnly", expected: /免费额度.*用尽/ },
  { status: 403, code: "Arrearage", expected: /欠费|余额不足/ },
  { status: 403, code: "AccessDenied", expected: /权限|授权/ },
  { status: 401, code: "invalid_api_key", expected: /API Key 无效/ },
  { status: 403, code: "InvalidApiKey", expected: /API Key 无效/ }
]) {
  test(`连接测试区分 ${item.code}，且不透传上游密钥或消息`, async () => {
    const previousFetch = globalThis.fetch;
    const previousKey = process.env.SECRET_ENCRYPTION_KEY;
    process.env.SECRET_ENCRYPTION_KEY = encryptionKey;
    globalThis.fetch = async () => Response.json({ error: { code: item.code, message: "sensitive-upstream-key" } }, { status: item.status });
    try {
      const result = await getProviderAdapter("OPENAI_COMPATIBLE").testConnection({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", modelName: "qwen-plus",
        apiKeyEncrypted: encryptSecret("test-key"), capabilityTags: ["TEXT"], timeoutMs: 1000
      });
      assert.equal(result.success, false);
      assert.match(result.message, item.expected);
      assert.ok(!result.message.includes("sensitive-upstream-key"));
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
      else process.env.SECRET_ENCRYPTION_KEY = previousKey;
    }
  });
}
