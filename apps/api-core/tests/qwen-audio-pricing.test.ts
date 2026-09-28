import assert from "node:assert/strict";
import test from "node:test";
import { AudioService } from "../src/audio/audio.service.js";
import {
  confirmedQwenAudioCredits,
  estimateQwenAudioTokenUsage,
  extractQwenAudioTokenUsage,
  qwenAudioTokenCost
} from "../src/audio/qwen-audio-pricing.js";

test("Qwen audio estimate reserves input and output token cost", () => {
  const estimate = estimateQwenAudioTokenUsage(20);
  assert.deepEqual(estimate, { inputTokens: 40, outputTokens: 160 });
  assert.equal(qwenAudioTokenCost(estimate, 1.5, 12), 0.00198);
});

test("Qwen audio actual usage comes from the provider token response", () => {
  const usage = extractQwenAudioTokenUsage({
    usage: { inputCharacters: 20, providerUsage: { characters: 20, input_tokens: 27, output_tokens: 518 } }
  });
  assert.deepEqual(usage, { inputTokens: 27, outputTokens: 518 });
  assert.equal(qwenAudioTokenCost(usage!, 1.5, 12), 0.0062565);
  assert.equal(extractQwenAudioTokenUsage({ usage: { characters: 20 } }), null);
  assert.equal(confirmedQwenAudioCredits({ usage: { providerUsage: { input_tokens: 27, output_tokens: 518 } } }, 1.5, 12, 1000, 12), 7);
  assert.equal(confirmedQwenAudioCredits({ usage: { providerUsage: { input_tokens: 27, output_tokens: 2000 } } }, 1.5, 12, 1000, 12), 12);
  assert.equal(confirmedQwenAudioCredits({ usage: { characters: 20 } }, 1.5, 12, 1000, 12), 12);
});

test("Qwen audio quote uses token prices instead of generic character rules", async () => {
  process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
  const service = new AudioService() as unknown as {
    prisma: unknown;
    calculatePricingQuote: (operation: string, model: unknown, input: { characterCount: number }) => Promise<{
      pricingMode: string;
      pricingUnit: string;
      estimatedCost: number;
    }>;
  };
  service.prisma = {
    audioPricingRule: { findMany: () => { throw new Error("不应读取通用字符规则"); } },
    systemConfig: { findUnique: async () => ({ value: "100" }) }
  };
  const quote = await service.calculatePricingQuote("TTS", {
    modelInstanceId: "qwen-model",
    modelName: "qwen-audio-3.1-tts-flash",
    inputPrice: 1.5,
    outputPrice: 12,
    pricingMode: "TOKENS",
    pricingUnit: "M_TOKENS"
  }, { characterCount: 20 });
  assert.equal(quote.pricingMode, "TOKENS");
  assert.equal(quote.pricingUnit, "M_TOKENS");
  assert.equal(quote.estimatedCost, 0.00198);
});
