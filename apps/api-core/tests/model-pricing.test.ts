import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateImageCost,
  estimateTokenCost,
  normalizeModelPricingConfig,
  pricingSummaryFromConfig
} from "../src/ai/model-pricing.js";

const qwen37PlusPricing = normalizeModelPricingConfig({
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
      output: 8
    },
    {
      label: "256K < 输入 <= 1M",
      minInputTokens: 256001,
      maxInputTokens: 1000000,
      input: 6,
      inputCacheHit: 1.2,
      inputCacheHitExplicit: 0.6,
      inputCacheCreation: 7.5,
      output: 24
    }
  ]
});

test("阶梯价格配置保留每档缓存价格", () => {
  assert.equal(qwen37PlusPricing?.mode, "TOKEN_TIERED");

  if (qwen37PlusPricing?.mode !== "TOKEN_TIERED") {
    return;
  }

  assert.deepEqual(qwen37PlusPricing.tiers[0], {
    label: "输入 <= 256K",
    minInputTokens: 0,
    maxInputTokens: 256000,
    input: 2,
    inputCacheHit: 0.4,
    inputCacheHitExplicit: 0.2,
    inputCacheCreation: 2.5,
    output: 8,
    reasoningOutput: null
  });
});

test("Qwen3.7 Plus 按总输入长度选择阶梯并计算隐式缓存命中", () => {
  assert.ok(qwen37PlusPricing);

  assert.equal(
    estimateTokenCost({
      usage: {
        inputTokens: 300000,
        outputTokens: 20000,
        totalTokens: 320000,
        inputCacheHitTokens: 100000,
        inputCacheMode: "IMPLICIT"
      },
      pricingConfig: qwen37PlusPricing,
      inputPrice: 0,
      outputPrice: 0
    }),
    1.8
  );
});

test("Qwen3.7 Plus 显式缓存分别计算命中、创建和普通输入", () => {
  assert.ok(qwen37PlusPricing);

  assert.equal(
    estimateTokenCost({
      usage: {
        inputTokens: 100000,
        outputTokens: 0,
        totalTokens: 100000,
        inputCacheHitTokens: 50000,
        inputCacheCreationTokens: 20000,
        inputCacheMode: "EXPLICIT"
      },
      pricingConfig: qwen37PlusPricing,
      inputPrice: 0,
      outputPrice: 0
    }),
    0.12
  );
});

test("图片计费配置保留输入图与输出图单价", () => {
  const pricing = normalizeModelPricingConfig({
    mode: "IMAGES",
    currency: "CNY",
    unit: "IMAGE",
    input: 0.02,
    output: 0.18
  });

  assert.deepEqual(pricing, {
    mode: "IMAGES",
    currency: "CNY",
    unit: "IMAGE",
    input: 0.02,
    output: 0.18,
    source: undefined,
    note: undefined
  });
  assert.deepEqual(pricingSummaryFromConfig(pricing), {
    inputPrice: "0.02",
    outputPrice: "0.18",
    pricingMode: "IMAGES",
    pricingUnit: "IMAGE"
  });
});

test("Seedream Pro 图片计费支持首张参考图免费和输出像素分档", () => {
  const pricing = normalizeModelPricingConfig({
    mode: "IMAGES",
    currency: "CNY",
    unit: "IMAGE",
    input: 0.02,
    output: 0.3,
    freeInputImages: 1,
    outputTiers: [
      { label: "输出图 <= 261 万像素", maxPixels: 2_610_000, output: 0.3 },
      { label: "输出图 > 261 万像素", maxPixels: null, output: 0.6 }
    ]
  });

  assert.equal(pricing?.mode, "IMAGES");
  if (pricing?.mode !== "IMAGES") {
    return;
  }

  assert.equal(estimateImageCost({ pricingConfig: pricing, imageCount: 1, referenceImageCount: 1, width: 1920, height: 1080 }), 0.3);
  assert.ok(Math.abs(estimateImageCost({
    pricingConfig: pricing,
    imageCount: 1,
    referenceImageCount: 3,
    width: 1920,
    height: 1080
  }) - 0.34) < 1e-9);
  assert.equal(estimateImageCost({ pricingConfig: pricing, imageCount: 1, referenceImageCount: 1, width: 2048, height: 2048 }), 0.6);
  assert.deepEqual(pricingSummaryFromConfig(pricing), {
    inputPrice: "0.02",
    outputPrice: "0.3",
    pricingMode: "IMAGES",
    pricingUnit: "IMAGE"
  });
});
