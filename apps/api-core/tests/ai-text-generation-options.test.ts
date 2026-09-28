import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret } from "@xueleai/database";

import {
  AiService,
  AiProviderGenerationError,
  isRetryableAiProviderGenerationError,
  resolveTextGenerationReasoningOptions
} from "../src/ai/ai.service.js";

interface AiServiceInternals {
  ensureVideoGuideNarrationTimelineScenario(): Promise<Record<string, unknown>>;
  preparePromptInput(): Promise<Record<string, unknown>>;
  getModelForScenario(): Promise<null>;
  shouldSaveFullAiContent(): Promise<boolean>;
  generateTextWithFallback(...args: unknown[]): Promise<Record<string, unknown>>;
  generateText(...args: unknown[]): Promise<Record<string, unknown>>;
  getModelByAlias(...args: unknown[]): Promise<Record<string, unknown> | null>;
}

const testEncryptionKey = "video-guide-reasoning-test-key-2026";

function activeModel(
  modelName: string,
  capabilityTags: string[],
  fallbackModelAlias: string | null = null
) {
  return {
    id: `model-${modelName}`,
    providerId: "provider-1",
    fallbackModelId: null,
    fallbackModelAlias,
    adapterType: "OPENAI_COMPATIBLE",
    displayName: modelName,
    modelName,
    capabilityTags,
    inputPrice: { toString: () => "0" },
    outputPrice: { toString: () => "0" },
    provider: {
      id: "provider-1",
      name: "阿里云百炼",
      baseUrl: "https://dashscope.example.com",
      apiKeyEncrypted: encryptSecret("test-api-key", testEncryptionKey)
    }
  };
}

function scenario(fallbackModelAlias: string | null = null) {
  return {
    id: "scenario-1",
    name: "视频导学逐句串讲时间线",
    slug: "video-guide-narration-timeline",
    fallbackModelId: null,
    modelBinding: fallbackModelAlias ? { fallbackModelAlias } : null
  };
}

function aiServiceInternals() {
  const service = new AiService({} as never, { assertInternalScenarioAuthorized: () => undefined } as never);

  Object.defineProperty(service, "prisma", {
    value: {
      aiCallLog: {
        create: async () => ({ id: "log-1" })
      }
    }
  });

  return service as unknown as AiServiceInternals;
}

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("非流式文本参数在支持推理的模型上显式关闭思考", () => {
  assert.deepEqual(resolveTextGenerationReasoningOptions(["TEXT", "REASONING"], false), {
    reasoningSwitchSupported: true,
    reasoningEnabled: false
  });
  assert.deepEqual(resolveTextGenerationReasoningOptions(["TEXT", "REASONING"], true), {
    reasoningSwitchSupported: true,
    reasoningEnabled: true
  });
  assert.deepEqual(resolveTextGenerationReasoningOptions(["TEXT"], true), {
    reasoningSwitchSupported: false,
    reasoningEnabled: false
  });
});

test("外部计费场景把关闭思考选项传入非流式生成链路", async () => {
  let receivedOptions: unknown;
  const service = new AiService({} as never, { assertInternalScenarioAuthorized: () => undefined } as never);
  const internals = service as unknown as AiServiceInternals;
  const prisma = {
    aiTask: {
      create: async () => ({
        id: "task-1",
        providerName: null,
        modelName: null
      }),
      update: async () => ({ id: "task-1" })
    }
  };

  Object.defineProperty(service, "prisma", { value: prisma });
  internals.ensureVideoGuideNarrationTimelineScenario = async () => ({
    id: "scenario-1",
    name: "视频导学逐句串讲时间线",
    slug: "video-guide-narration-timeline"
  });
  internals.preparePromptInput = async () => ({
    renderedPrompt: "prompt",
    variables: {},
    knowledgeBaseId: null,
    knowledgeContext: ""
  });
  internals.getModelForScenario = async () => null;
  internals.shouldSaveFullAiContent = async () => false;
  internals.generateTextWithFallback = async (...args: unknown[]) => {
    receivedOptions = args[6];

    return {
      text: '{"intro":{"script":"导入"}}',
      provider: "aliyun",
      model: "qwen-plus"
    };
  };

  await service.generateScenarioTextForExternalBilling({
    userId: "user-1",
    learnerId: null,
    rootScenarioId: null,
    scenarioSlug: "video-guide-narration-timeline",
    input: "生成导入",
    variables: {
      mediaTitle: "Yoghurt",
      subtitleJson: "[]"
    },
    reasoningEnabled: false
  } as Parameters<AiService["generateScenarioTextForExternalBilling"]>[0] & {
    reasoningEnabled: boolean;
  });

  assert.deepEqual(receivedOptions, {
    maxTokens: undefined,
    reasoningEnabled: false
  });
});

test("内部子场景授权依赖缺失时在读取场景或产生计费副作用前失败关闭", async () => {
  const service = new AiService({} as never, undefined as never);
  const internals = service as unknown as AiServiceInternals;
  let scenarioReads = 0;
  internals.ensureVideoGuideNarrationTimelineScenario = async () => {
    scenarioReads += 1;
    throw new Error("不应在授权依赖缺失后继续");
  };

  await assert.rejects(
    service.generateScenarioTextForExternalBilling({
      userId: "user-1",
      learnerId: null,
      rootScenarioId: null,
      scenarioSlug: "video-guide-narration-timeline",
      input: "测试"
    }),
    (error: unknown) => error instanceof TypeError
  );
  assert.equal(scenarioReads, 0);
});

test("非流式适配器请求按模型能力发送关闭思考参数", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SECRET_ENCRYPTION_KEY;
  const originalMaxTokens = process.env.AI_PROVIDER_MAX_TOKENS;
  const requestBodies: Array<Record<string, unknown>> = [];
  process.env.SECRET_ENCRYPTION_KEY = testEncryptionKey;
  delete process.env.AI_PROVIDER_MAX_TOKENS;
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

    return new Response(JSON.stringify({ text: "ok" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  try {
    const service = aiServiceInternals();

    await service.generateText(
      "input",
      "prompt",
      scenario(),
      "task-reasoning",
      activeModel("qwen-plus", ["TEXT", "REASONING"]),
      [],
      { reasoningEnabled: false }
    );
    await service.generateText(
      "input",
      "prompt",
      scenario(),
      "task-text",
      activeModel("text-only", ["TEXT"]),
      [],
      { reasoningEnabled: false }
    );

    assert.deepEqual(
      requestBodies.map((body) => ({
        reasoningSwitchSupported: body.reasoningSwitchSupported,
        reasoningEnabled: body.reasoningEnabled,
        maxTokens: body.maxTokens
      })),
      [
        {
          reasoningSwitchSupported: true,
          reasoningEnabled: false,
          maxTokens: 16_000
        },
        {
          reasoningSwitchSupported: false,
          reasoningEnabled: false,
          maxTokens: 16_000
        }
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironmentValue("SECRET_ENCRYPTION_KEY", originalKey);
    restoreEnvironmentValue("AI_PROVIDER_MAX_TOKENS", originalMaxTokens);
  }
});

test("主模型失败切换备用模型后继续保持关闭思考", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SECRET_ENCRYPTION_KEY;
  const requestBodies: Array<Record<string, unknown>> = [];
  process.env.SECRET_ENCRYPTION_KEY = testEncryptionKey;
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({ errorCode: "PRIMARY_FAILED", message: "failed" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    return new Response(JSON.stringify({ text: "fallback ok" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  try {
    const service = aiServiceInternals();
    service.getModelByAlias = async () => activeModel("qwen-flash", ["TEXT", "REASONING"]);

    const result = await service.generateTextWithFallback(
      "input",
      "prompt",
      scenario("fast-chat"),
      "task-fallback",
      activeModel("qwen-plus", ["TEXT", "REASONING"], "fast-chat"),
      [],
      { reasoningEnabled: false }
    );

    assert.equal(result.text, "fallback ok");
    assert.deepEqual(
      requestBodies.map((body) => ({
        reasoningSwitchSupported: body.reasoningSwitchSupported,
        reasoningEnabled: body.reasoningEnabled
      })),
      [
        {
          reasoningSwitchSupported: true,
          reasoningEnabled: false
        },
        {
          reasoningSwitchSupported: true,
          reasoningEnabled: false
        }
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironmentValue("SECRET_ENCRYPTION_KEY", originalKey);
  }
});

test("非流式网关错误保留 detail 中的 Provider 错误信息", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = testEncryptionKey;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        detail: {
          errorCode: "Throttling.RateQuota",
          errorMessage: "AI Provider 请求超时",
          providerStatusCode: 429
        }
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  try {
    const service = aiServiceInternals();

    await assert.rejects(
      service.generateText(
        "input",
        "prompt",
        scenario(),
        "task-provider-error",
        activeModel("deepseek-v4-flash", ["TEXT"]),
        [],
        { reasoningEnabled: false }
      ),
      (error) =>
        error instanceof AiProviderGenerationError &&
        error.message === "AI Provider 请求超时" &&
        error.providerErrorCode === "Throttling.RateQuota" &&
        error.providerStatusCode === 429
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironmentValue("SECRET_ENCRYPTION_KEY", originalKey);
  }
});

test("只把超时、网络错误、限流和服务端错误标记为可重试", () => {
  assert.equal(
    isRetryableAiProviderGenerationError(
      new AiProviderGenerationError("AI Provider 请求超时", "PROVIDER_TIMEOUT")
    ),
    true
  );
  assert.equal(
    isRetryableAiProviderGenerationError(
      new AiProviderGenerationError("请求过于频繁", "PROVIDER_HTTP_429")
    ),
    true
  );
  assert.equal(
    isRetryableAiProviderGenerationError(
      new AiProviderGenerationError("API Key 无效", "PROVIDER_HTTP_401")
    ),
    false
  );
  assert.equal(
    isRetryableAiProviderGenerationError(
      new AiProviderGenerationError("供应商限流", "Throttling.RateQuota", 429)
    ),
    true
  );
  assert.equal(isRetryableAiProviderGenerationError(new Error("parse failed")), false);
});
