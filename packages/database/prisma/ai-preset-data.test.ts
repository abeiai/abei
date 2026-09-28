import assert from "node:assert/strict";
import test from "node:test";

import { aiPresetVersion, providerPresets } from "./ai-preset-data.js";

test("AI 预设版本包含阿贝智能模型", () => {
  assert.equal(aiPresetVersion, "2026.09.25.4");
});

test("阿贝智能预置七个模型并按接口类型分组", () => {
  const providers = providerPresets.filter((provider) => provider.providerKey.startsWith("abeiai"));
  assert.deepEqual(providers.map((provider) => provider.providerKey), ["abeiai", "abeiai_audio", "abeiai_video"]);
  assert.ok(providers.every((provider) => provider.apiKeyEnvName === "ABEIAI_API_KEY"));
  assert.deepEqual(providers.flatMap((provider) => provider.models.map((model) => model.providerModelName)), [
    "Qwen3.5-122B-A10B-FP8", "Qwen2-Audio-7B-Instruct", "Qwen3-VL-8B-Instruct",
    "Qwen-Image-2.1", "Laya", "IndexTTS-2.5", "MiniMax-H3"
  ]);
  assert.equal(providers[0]?.defaultBaseUrl, "https://dmx04.sdts.net.cn/v1");
  assert.equal(providers[2]?.adapterType, "MINIMAX_VIDEO");
});

test("DashScope 预设包含 Qwen Image 3.0 图片生成与编辑模型", () => {
  const dashscope = providerPresets.find((provider) => provider.providerKey === "dashscope");
  const model = dashscope?.models.find((item) => item.modelKey === "qwen-image-3.0");

  assert.ok(model);
  assert.equal(model.displayName, "Qwen Image 3.0");
  assert.equal(model.providerModelName, "qwen-image-3.0");
  assert.equal(model.supportsImageGeneration, true);
  assert.equal(model.supportsVision, true);
  assert.equal(model.recommendedAlias, "image-generation");
  assert.deepEqual(model.capabilityTags, [
    "IMAGE_GENERATION",
    "IMAGE_EDIT",
    "IMAGE_INPUT",
    "REFERENCE_IMAGE",
    "BATCH_IMAGE",
    "LOW_COST",
    "CHINA_FRIENDLY"
  ]);
  assert.deepEqual(model.pricingConfig, {
    mode: "IMAGES",
    currency: "CNY",
    unit: "IMAGE",
    input: 0.02,
    output: 0.18,
    source: "https://help.aliyun.com/zh/model-studio/model-pricing",
    note: "阿里云百炼华北 2（北京）长期原价：输入图片 0.02 元/张，成功生成图片 0.18 元/张。"
  });
});

test("火山引擎方舟预设包含三款 Seedream 5.0 图片模型", () => {
  const provider = providerPresets.find((item) => item.providerKey === "volcengine_ark_image");

  assert.ok(provider);
  assert.equal(provider.displayName, "火山引擎方舟图片");
  assert.equal(provider.adapterType, "OPENAI_COMPATIBLE");
  assert.equal(provider.modality, "MULTIMODAL");
  assert.equal(provider.defaultBaseUrl, "https://ark.cn-beijing.volces.com/api/v3");
  assert.equal(provider.apiKeyEnvName, "ARK_API_KEY");
  assert.deepEqual(
    provider.models.map((model) => model.providerModelName),
    [
      "doubao-seedream-5-0-pro-260628",
      "doubao-seedream-5-0-flash-260915",
      "doubao-seedream-5-0-260128"
    ]
  );

  for (const model of provider.models) {
    assert.equal(model.supportsImageGeneration, true);
    assert.equal(model.supportsVision, true);
    assert.equal(model.recommendedAlias, "image-generation");
  }

  assert.equal(provider.models[2]?.isDeprecated, true);
  assert.equal(provider.models[2]?.replacementModelKey, "doubao-seedream-5-0-pro-260628");
  assert.equal(provider.models[2]?.capabilityTags.includes("DEPRECATED"), true);
  assert.deepEqual(provider.models[0]?.pricingConfig, {
    mode: "IMAGES",
    currency: "CNY",
    unit: "IMAGE",
    input: 0.02,
    output: 0.3,
    freeInputImages: 1,
    outputTiers: [
      { label: "输出图 <= 261 万像素", maxPixels: 2_610_000, output: 0.3 },
      { label: "输出图 > 261 万像素", maxPixels: null, output: 0.6 }
    ],
    source: "https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-5-0-pro",
    note: "火山方舟官方按量价：输入参考图首张免费，超出部分 0.02 元/张；图片生成输出图不超过 261 万像素 0.30 元/张，超过 261 万像素 0.60 元/张。"
  });
  assert.equal(provider.models[1]?.pricingConfig?.output, 0.12);
  assert.equal(provider.models[2]?.pricingConfig?.output, 0.22);
});

test("内置预设包含 MiniMax H3s 自建视频模型", () => {
  const provider = providerPresets.find((item) => item.providerKey === "minimax_h3s_video");
  const model = provider?.models.find((item) => item.modelKey === "minimax-h3s");

  assert.ok(provider);
  assert.equal(provider.adapterType, "MINIMAX_VIDEO");
  assert.equal(provider.defaultBaseUrl, "https://dmx04.sdts.net.cn");
  assert.equal(provider.apiKeyEnvName, "MINIMAX_H3S_API_KEY");
  assert.ok(model);
  assert.equal(model.providerModelName, "MiniMax-H3");
  assert.equal(model.recommendedAlias, "video-generation");
  assert.deepEqual(model.pricingConfig?.variants.map((variant) => variant.resolution), ["480P", "768P"]);
  assert.deepEqual(model.capabilityTags, [
    "VIDEO_GENERATION",
    "TEXT_TO_VIDEO",
    "IMAGE_TO_VIDEO",
    "IMAGE_INPUT",
    "REFERENCE_IMAGE",
    "VIDEO_INPUT",
    "REFERENCE_VIDEO",
    "AUDIO",
    "REFERENCE_AUDIO",
    "PROMPT_REWRITE",
    "CHINA_FRIENDLY"
  ]);
});

test("ElevenLabs 预设只引入三个 TTS 模型且不抢占现有默认别名", () => {
  const provider = providerPresets.find((item) => item.providerKey === "elevenlabs_audio");

  assert.ok(provider);
  assert.equal(provider.adapterType, "ELEVENLABS_AUDIO");
  assert.equal(provider.modality, "AUDIO");
  assert.equal(provider.defaultBaseUrl, "https://api.elevenlabs.io");
  assert.equal(provider.apiKeyEnvName, "ELEVENLABS_API_KEY");
  assert.deepEqual(
    provider.models.map((model) => model.providerModelName),
    ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"]
  );

  for (const model of provider.models) {
    assert.deepEqual(model.capabilityTags, ["AUDIO", "TTS", "SYSTEM_VOICE", "MULTILINGUAL", "GLOBAL"]);
    assert.equal(model.supportsAudio, true);
    assert.equal(model.recommendedAlias, undefined);
  }
});

test("DashScope 预设包含 Qwen3.7 Plus 及当前阶梯缓存价格", () => {
  const dashscope = providerPresets.find((provider) => provider.providerKey === "dashscope");
  const model = dashscope?.models.find((item) => item.modelKey === "qwen3.7-plus");

  assert.ok(model);
  assert.equal(model.providerModelName, "qwen3.7-plus");
  assert.equal(model.contextWindow, 1000000);
  assert.equal(model.supportsVision, true);
  assert.equal(model.supportsStreaming, true);
  assert.equal(model.supportsTools, true);
  assert.deepEqual(model.capabilityTags, [
    "TEXT",
    "VISION",
    "REASONING",
    "TOOLS",
    "STREAMING",
    "LONG_CONTEXT",
    "CHINA_FRIENDLY"
  ]);
  assert.deepEqual(model.pricingConfig, {
    mode: "TOKEN_TIERED",
    currency: "CNY",
    unit: "M_TOKENS",
    tierBasis: "REQUEST_INPUT_TOKENS",
    tiers: [
      {
        label: "输入 <= 256K",
        minInputTokens: 0,
        maxInputTokens: 256000,
        input: 2,
        inputCacheHit: 0.4,
        inputCacheHitExplicit: 0.2,
        inputCacheCreation: 2.5,
        output: 8,
        reasoningOutput: 8
      },
      {
        label: "256K < 输入 <= 1M",
        minInputTokens: 256001,
        maxInputTokens: 1000000,
        input: 6,
        inputCacheHit: 1.2,
        inputCacheHitExplicit: 0.6,
        inputCacheCreation: 7.5,
        output: 24,
        reasoningOutput: 24
      }
    ],
    source: "https://help.aliyun.com/zh/model-studio/model-pricing",
    note:
      "阿里云百炼 Qwen3.7 Plus 按单次请求输入 Token 总量分档，使用官方长期原价。隐式缓存命中按输入价 20%，显式缓存命中按 10%，显式缓存创建按 125%；限时 8 折与 Batch 半价未计入实时调用基础价。"
  });
});

test("DashScope 预设包含 Qwen3.7 Max 及当前缓存价格", () => {
  const dashscope = providerPresets.find((provider) => provider.providerKey === "dashscope");
  const model = dashscope?.models.find((item) => item.modelKey === "qwen3.7-max");

  assert.ok(model);
  assert.equal(model.providerModelName, "qwen3.7-max");
  assert.equal(model.contextWindow, 1000000);
  assert.equal(model.supportsVision, undefined);
  assert.equal(model.supportsStreaming, true);
  assert.equal(model.supportsTools, true);
  assert.equal(model.recommendedAlias, "reasoning");
  assert.deepEqual(model.capabilityTags, [
    "TEXT",
    "REASONING",
    "TOOLS",
    "STREAMING",
    "LONG_CONTEXT",
    "CHINA_FRIENDLY"
  ]);
  assert.deepEqual(model.pricingConfig, {
    mode: "TOKEN_TIERED",
    currency: "CNY",
    unit: "M_TOKENS",
    tierBasis: "REQUEST_INPUT_TOKENS",
    tiers: [
      {
        label: "输入 <= 1M",
        minInputTokens: 0,
        maxInputTokens: 1000000,
        input: 12,
        inputCacheHit: 2.4,
        inputCacheHitExplicit: 1.2,
        inputCacheCreation: 15,
        output: 36,
        reasoningOutput: 36
      }
    ],
    source: "https://help.aliyun.com/zh/model-studio/model-pricing",
    note:
      "阿里云百炼 Qwen3.7 Max 使用北京区域官方长期原价。隐式缓存命中为 2.4 元、显式缓存命中为 1.2 元、显式缓存创建为 15 元，每百万 Token；限时优惠与 Batch 价格未计入实时调用基础价。"
  });
});

test("DashScope 预设包含 Qwen3.7 Flash 及三档缓存价格", () => {
  const dashscope = providerPresets.find((provider) => provider.providerKey === "dashscope");
  const model = dashscope?.models.find((item) => item.modelKey === "qwen3.7-flash");

  assert.ok(model);
  assert.equal(model.providerModelName, "qwen3.7-flash");
  assert.equal(model.contextWindow, 1000000);
  assert.equal(model.supportsVision, true);
  assert.equal(model.supportsStreaming, true);
  assert.equal(model.supportsTools, true);
  assert.equal(model.recommendedAlias, "fast-chat");
  assert.deepEqual(model.capabilityTags, [
    "TEXT",
    "VISION",
    "REASONING",
    "TOOLS",
    "STREAMING",
    "LONG_CONTEXT",
    "LOW_COST",
    "CHINA_FRIENDLY"
  ]);
  assert.deepEqual(model.pricingConfig, {
    mode: "TOKEN_TIERED",
    currency: "CNY",
    unit: "M_TOKENS",
    tierBasis: "REQUEST_INPUT_TOKENS",
    tiers: [
      {
        label: "输入 <= 32K",
        minInputTokens: 0,
        maxInputTokens: 32000,
        input: 0.2,
        inputCacheHit: 0.04,
        inputCacheHitExplicit: 0.02,
        inputCacheCreation: 0.25,
        output: 0.8,
        reasoningOutput: 0.8
      },
      {
        label: "32K < 输入 <= 256K",
        minInputTokens: 32001,
        maxInputTokens: 256000,
        input: 0.6,
        inputCacheHit: 0.12,
        inputCacheHitExplicit: 0.06,
        inputCacheCreation: 0.75,
        output: 2.4,
        reasoningOutput: 2.4
      },
      {
        label: "256K < 输入 <= 1M",
        minInputTokens: 256001,
        maxInputTokens: 1000000,
        input: 1.2,
        inputCacheHit: 0.24,
        inputCacheHitExplicit: 0.12,
        inputCacheCreation: 1.5,
        output: 4.8,
        reasoningOutput: 4.8
      }
    ],
    source: "https://help.aliyun.com/zh/model-studio/model-pricing",
    note:
      "阿里云百炼 Qwen3.7 Flash 按单次请求输入 Token 总量分档，使用北京区域官方长期原价。每档分别记录隐式缓存命中、显式缓存命中和显式缓存创建价格；Batch 价格未计入实时调用基础价。"
  });
});
