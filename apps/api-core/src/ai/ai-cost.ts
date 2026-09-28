import { estimateTokenCost, type AiModelPricingConfig, type AiModelPricingUnit } from "./model-pricing.js";

const creditsPerCny = 100;

export interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  inputCacheHitTokens?: number | null;
  inputCacheMissTokens?: number | null;
  inputCacheCreationTokens?: number | null;
  inputCacheMode?: "IMPLICIT" | "EXPLICIT" | null;
}

export interface UsageCostInput {
  usage?: TokenUsage | null;
  inputPrice: number;
  outputPrice: number;
  pricingUnit?: AiModelPricingUnit | string | null;
  pricingConfig?: AiModelPricingConfig;
  fallbackCredits: number;
  maxCredits: number;
  minCredits?: number;
}

export function calculateUsageCredits(input: UsageCostInput) {
  const minCredits = input.minCredits ?? 1;
  const usage = input.usage;

  if (usage && hasTokenUsage(usage)) {
    const rawCredits =
      estimateTokenCost({
        usage,
        pricingConfig: input.pricingConfig,
        inputPrice: input.inputPrice,
        outputPrice: input.outputPrice,
        pricingUnit: input.pricingUnit
      }) ?? 0;

    const usageCredits = input.pricingConfig?.currency === "CNY" ? rawCredits * creditsPerCny : rawCredits;

    return clampCredits(Math.ceil(usageCredits || minCredits), minCredits, input.maxCredits);
  }

  return clampCredits(Math.ceil(input.fallbackCredits), minCredits, input.maxCredits);
}

export function estimateMockUsageCredits(input: string, estimatedCredits: number) {
  return Math.min(estimatedCredits, Math.max(20, Math.ceil(input.length / 6) + 28));
}

function hasTokenUsage(usage: TokenUsage) {
  return (
    positiveNumber(usage.inputTokens) > 0 ||
    positiveNumber(usage.outputTokens) > 0 ||
    positiveNumber(usage.totalTokens) > 0
  );
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function clampCredits(value: number, minCredits: number, maxCredits: number) {
  return Math.max(minCredits, Math.min(maxCredits, value));
}
