import type { TokenUsage } from "./ai-cost.js";

export type AiModelPricingMode =
  | "TOKENS"
  | "TOKEN_CACHE"
  | "TOKEN_TIERED"
  | "REQUEST"
  | "CHARACTERS"
  | "IMAGES"
  | "SECONDS"
  | "VIDEO_SECONDS";

export type AiModelPricingUnit =
  | "K_TOKENS"
  | "M_TOKENS"
  | "REQUEST"
  | "CHARACTER"
  | "K_CHARACTERS"
  | "TEN_K_CHARACTERS"
  | "IMAGE"
  | "SECOND";

export type AiTextPricingConfig =
  | {
      mode: "TOKENS";
      currency: "CNY";
      unit: "K_TOKENS" | "M_TOKENS";
      input: number;
      output: number;
      source?: string;
      note?: string;
    }
  | {
      mode: "TOKEN_CACHE";
      currency: "CNY";
      unit: "M_TOKENS";
      inputCacheHit: number;
      inputCacheMiss: number;
      output: number;
      discountWindows?: Array<{
        label: string;
        inputCacheHit: number;
        inputCacheMiss: number;
        output: number;
        timezone?: string;
        startTime?: string;
        endTime?: string;
      }>;
      source?: string;
      note?: string;
    }
  | {
      mode: "TOKEN_TIERED";
      currency: "CNY";
      unit: "M_TOKENS";
      tierBasis: "REQUEST_INPUT_TOKENS";
      tiers: AiTokenPricingTier[];
      source?: string;
      note?: string;
    };

export interface AiTokenPricingTier {
  label: string;
  minInputTokens: number;
  maxInputTokens: number | null;
  input: number;
  output: number;
  reasoningOutput?: number | null;
  inputCacheHit?: number | null;
  inputCacheHitExplicit?: number | null;
  inputCacheCreation?: number | null;
}

export type AiVideoPricingJobMode = "STANDARD" | "REALTIME" | "BATCH";

export type AiVideoPricingTaskType =
  | "TEXT_TO_VIDEO"
  | "IMAGE_TO_VIDEO"
  | "REFERENCE_TO_VIDEO"
  | "VIDEO_EDIT"
  | "OTHER";

export interface AiVideoPricingVariant {
  label: string;
  resolution: string;
  jobMode: AiVideoPricingJobMode;
  taskType: AiVideoPricingTaskType;
  withAudio: boolean;
  input: number;
  output: number;
  note?: string;
}

export interface AiVideoPricingConfig {
  mode: "VIDEO_SECONDS";
  currency: "CNY";
  unit: "SECOND";
  billingBasis: "OUTPUT_SECONDS" | "INPUT_OUTPUT_SECONDS";
  variants: AiVideoPricingVariant[];
  source?: string;
  note?: string;
}

export interface AiImagePricingConfig {
  mode: "IMAGES";
  currency: "CNY";
  unit: "IMAGE";
  input: number;
  output: number;
  freeInputImages?: number;
  outputTiers?: AiImagePricingTier[];
  source?: string;
  note?: string;
}

export interface AiImagePricingTier {
  label: string;
  maxPixels: number | null;
  output: number;
}

export type AiModelPricingConfig = AiTextPricingConfig | AiVideoPricingConfig | AiImagePricingConfig | null;

export interface PricingSummary {
  inputPrice: string;
  outputPrice: string;
  pricingMode: AiModelPricingMode;
  pricingUnit: AiModelPricingUnit;
}

export function normalizeModelPricingConfig(value: unknown): AiModelPricingConfig {
  if (!isRecord(value)) {
    return null;
  }

  const mode = normalizePricingMode(value.mode);

  if (mode === "TOKEN_CACHE") {
    const inputCacheHit = nonNegativeNumber(value.inputCacheHit);
    const inputCacheMiss = nonNegativeNumber(value.inputCacheMiss);
    const output = nonNegativeNumber(value.output);

    if (inputCacheHit === null || inputCacheMiss === null || output === null) {
      return null;
    }

    return {
      mode,
      currency: "CNY",
      unit: "M_TOKENS",
      inputCacheHit,
      inputCacheMiss,
      output,
      discountWindows: normalizeDiscountWindows(value.discountWindows),
      source: stringValue(value.source),
      note: stringValue(value.note)
    };
  }

  if (mode === "TOKEN_TIERED") {
    const tiers = Array.isArray(value.tiers)
      ? value.tiers.map(normalizeTokenTier).filter((tier): tier is AiTokenPricingTier => Boolean(tier))
      : [];

    if (tiers.length === 0) {
      return null;
    }

    return {
      mode,
      currency: "CNY",
      unit: "M_TOKENS",
      tierBasis: "REQUEST_INPUT_TOKENS",
      tiers: tiers.sort((left, right) => left.minInputTokens - right.minInputTokens).slice(0, 12),
      source: stringValue(value.source),
      note: stringValue(value.note)
    };
  }

  if (mode === "TOKENS") {
    const input = nonNegativeNumber(value.input);
    const output = nonNegativeNumber(value.output);

    if (input === null || output === null) {
      return null;
    }

    return {
      mode,
      currency: "CNY",
      unit: normalizeTokenUnit(value.unit),
      input,
      output,
      source: stringValue(value.source),
      note: stringValue(value.note)
    };
  }

  if (mode === "IMAGES") {
    const input = nonNegativeNumber(value.input);
    const output = nonNegativeNumber(value.output);
    const freeInputImages = nullableNonNegativeInteger(value.freeInputImages);
    const outputTiers = Array.isArray(value.outputTiers)
      ? value.outputTiers.map(normalizeImagePricingTier).filter((tier): tier is AiImagePricingTier => Boolean(tier))
      : [];

    if (input === null || output === null) {
      return null;
    }

    return {
      mode,
      currency: "CNY",
      unit: "IMAGE",
      input,
      output,
      ...(freeInputImages === null ? {} : { freeInputImages }),
      ...(outputTiers.length > 0 ? { outputTiers: outputTiers.slice(0, 12) } : {}),
      source: stringValue(value.source),
      note: stringValue(value.note)
    };
  }

  if (mode === "VIDEO_SECONDS") {
    const variants = Array.isArray(value.variants)
      ? value.variants.map(normalizeVideoPricingVariant).filter((variant): variant is AiVideoPricingVariant => Boolean(variant))
      : [];

    if (variants.length === 0) {
      return null;
    }

    return {
      mode,
      currency: "CNY",
      unit: "SECOND",
      billingBasis: normalizeVideoBillingBasis(value.billingBasis),
      variants: variants.slice(0, 24),
      source: stringValue(value.source),
      note: stringValue(value.note)
    };
  }

  return null;
}

export function pricingSummaryFromConfig(
  config: AiModelPricingConfig,
  fallback: Partial<PricingSummary> = {}
): PricingSummary {
  if (config?.mode === "TOKEN_CACHE") {
    return {
      inputPrice: numberText(config.inputCacheMiss),
      outputPrice: numberText(config.output),
      pricingMode: "TOKEN_CACHE",
      pricingUnit: "M_TOKENS"
    };
  }

  if (config?.mode === "TOKEN_TIERED") {
    const firstTier = config.tiers[0];

    return {
      inputPrice: numberText(firstTier?.input ?? 0),
      outputPrice: numberText(firstTier?.output ?? 0),
      pricingMode: "TOKEN_TIERED",
      pricingUnit: "M_TOKENS"
    };
  }

  if (config?.mode === "TOKENS") {
    return {
      inputPrice: numberText(config.input),
      outputPrice: numberText(config.output),
      pricingMode: "TOKENS",
      pricingUnit: config.unit
    };
  }

  if (config?.mode === "VIDEO_SECONDS") {
    const firstVariant = config.variants[0];

    return {
      inputPrice: numberText(firstVariant?.input ?? 0),
      outputPrice: numberText(firstVariant?.output ?? 0),
      pricingMode: "VIDEO_SECONDS",
      pricingUnit: "SECOND"
    };
  }

  if (config?.mode === "IMAGES") {
    return {
      inputPrice: numberText(config.input),
      outputPrice: numberText(config.outputTiers?.[0]?.output ?? config.output),
      pricingMode: "IMAGES",
      pricingUnit: "IMAGE"
    };
  }

  return {
    inputPrice: fallback.inputPrice ?? "0",
    outputPrice: fallback.outputPrice ?? "0",
    pricingMode: fallback.pricingMode ?? "TOKENS",
    pricingUnit: fallback.pricingUnit ?? "K_TOKENS"
  };
}

export function estimateTokenCost(input: {
  usage?: TokenUsage | null;
  pricingConfig?: AiModelPricingConfig;
  inputPrice: number;
  outputPrice: number;
  pricingUnit?: AiModelPricingUnit | string | null;
}) {
  const usage = normalizedUsage(input.usage);

  if (!usage) {
    return null;
  }

  if (input.pricingConfig?.mode === "TOKEN_CACHE") {
    const cacheHitTokens = Math.min(usage.inputTokens, positiveInteger(input.usage?.inputCacheHitTokens));
    const explicitCacheMissTokens = positiveInteger(input.usage?.inputCacheMissTokens);
    const cacheMissTokens = explicitCacheMissTokens || Math.max(0, usage.inputTokens - cacheHitTokens);

    return (
      (cacheHitTokens * input.pricingConfig.inputCacheHit) / 1_000_000 +
      (cacheMissTokens * input.pricingConfig.inputCacheMiss) / 1_000_000 +
      (usage.outputTokens * input.pricingConfig.output) / 1_000_000
    );
  }

  if (input.pricingConfig?.mode === "TOKEN_TIERED") {
    const tier = selectPricingTier(input.pricingConfig.tiers, usage.inputTokens);
    const cacheHitTokens = Math.min(usage.inputTokens, positiveInteger(input.usage?.inputCacheHitTokens));
    const cacheCreationTokens = Math.min(
      Math.max(0, usage.inputTokens - cacheHitTokens),
      positiveInteger(input.usage?.inputCacheCreationTokens)
    );
    const standardInputTokens = Math.max(0, usage.inputTokens - cacheHitTokens - cacheCreationTokens);
    const cacheHitPrice =
      input.usage?.inputCacheMode === "EXPLICIT"
        ? tier.inputCacheHitExplicit ?? tier.inputCacheHit ?? tier.input
        : tier.inputCacheHit ?? tier.input;
    const cacheCreationPrice = tier.inputCacheCreation ?? tier.input;

    return (
      standardInputTokens * tier.input +
      cacheHitTokens * cacheHitPrice +
      cacheCreationTokens * cacheCreationPrice +
      usage.outputTokens * tier.output
    ) / 1_000_000;
  }

  if (input.pricingConfig?.mode === "TOKENS") {
    const divisor = tokenUnitDivisor(input.pricingConfig.unit);

    return ((usage.inputTokens * input.pricingConfig.input) + (usage.outputTokens * input.pricingConfig.output)) / divisor;
  }

  const divisor = tokenUnitDivisor(input.pricingUnit);

  return ((usage.inputTokens * Math.max(0, input.inputPrice)) + (usage.outputTokens * Math.max(0, input.outputPrice))) / divisor;
}

export function estimateImageCost(input: {
  pricingConfig: AiImagePricingConfig;
  imageCount: number;
  referenceImageCount?: number;
  width?: number;
  height?: number;
}) {
  const imageCount = Math.max(1, Math.ceil(input.imageCount || 1));
  const referenceImageCount = Math.max(0, Math.ceil(input.referenceImageCount || 0));
  const billableInputImages = Math.max(0, referenceImageCount - (input.pricingConfig.freeInputImages ?? 0));
  const pixels = Math.max(0, Math.ceil(input.width || 0)) * Math.max(0, Math.ceil(input.height || 0));
  const outputTier = input.pricingConfig.outputTiers?.find(
    (tier) => tier.maxPixels === null || pixels <= tier.maxPixels
  );
  const outputPrice = outputTier?.output ?? input.pricingConfig.output;

  return billableInputImages * input.pricingConfig.input + imageCount * outputPrice;
}

export function normalizePricingMode(value: unknown): AiModelPricingMode {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  const modes: AiModelPricingMode[] = [
    "TOKENS",
    "TOKEN_CACHE",
    "TOKEN_TIERED",
    "REQUEST",
    "CHARACTERS",
    "IMAGES",
    "SECONDS",
    "VIDEO_SECONDS"
  ];

  return modes.includes(normalized as AiModelPricingMode) ? (normalized as AiModelPricingMode) : "TOKENS";
}

export function normalizePricingUnit(value: unknown, pricingMode: unknown): AiModelPricingUnit {
  const normalizedMode = normalizePricingMode(pricingMode);
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (normalizedMode === "TOKENS" || normalizedMode === "TOKEN_CACHE" || normalizedMode === "TOKEN_TIERED") {
    return normalized === "M_TOKENS" ? "M_TOKENS" : "K_TOKENS";
  }

  if (normalizedMode === "CHARACTERS") {
    if (normalized === "CHARACTER") {
      return "CHARACTER";
    }

    return normalized === "TEN_K_CHARACTERS" ? "TEN_K_CHARACTERS" : "K_CHARACTERS";
  }

  const defaults: Record<string, AiModelPricingUnit> = {
    REQUEST: "REQUEST",
    IMAGES: "IMAGE",
    SECONDS: "SECOND",
    VIDEO_SECONDS: "SECOND"
  };

  return defaults[normalizedMode] ?? "K_TOKENS";
}

export function pricingConfigToJson(config: AiModelPricingConfig) {
  return config ? JSON.parse(JSON.stringify(config)) : null;
}

function normalizedUsage(usage?: TokenUsage | null) {
  const inputTokens = positiveInteger(usage?.inputTokens);
  const outputTokens = positiveInteger(usage?.outputTokens);
  const totalTokens = positiveInteger(usage?.totalTokens);
  const effectiveInputTokens = inputTokens || Math.max(0, totalTokens - outputTokens);

  if (effectiveInputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) {
    return null;
  }

  return {
    inputTokens: effectiveInputTokens,
    outputTokens,
    totalTokens: totalTokens || effectiveInputTokens + outputTokens
  };
}

function selectPricingTier(tiers: AiTokenPricingTier[], inputTokens: number) {
  return (
    tiers.find((tier) => inputTokens >= tier.minInputTokens && (tier.maxInputTokens === null || inputTokens <= tier.maxInputTokens)) ??
    tiers[tiers.length - 1] ??
    {
      label: "默认",
      minInputTokens: 0,
      maxInputTokens: null,
      input: 0,
      output: 0
    }
  );
}

function normalizeTokenTier(value: unknown): AiTokenPricingTier | null {
  if (!isRecord(value)) {
    return null;
  }

  const minInputTokens = nonNegativeInteger(value.minInputTokens);
  const input = nonNegativeNumber(value.input);
  const output = nonNegativeNumber(value.output);

  if (minInputTokens === null || input === null || output === null) {
    return null;
  }

  return {
    label: stringValue(value.label) || "默认阶梯",
    minInputTokens,
    maxInputTokens: nullableNonNegativeInteger(value.maxInputTokens),
    input,
    output,
    reasoningOutput: nullableNonNegativeNumber(value.reasoningOutput),
    inputCacheHit: nullableNonNegativeNumber(value.inputCacheHit),
    inputCacheHitExplicit: nullableNonNegativeNumber(value.inputCacheHitExplicit),
    inputCacheCreation: nullableNonNegativeNumber(value.inputCacheCreation)
  };
}

function normalizeImagePricingTier(value: unknown): AiImagePricingTier | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = stringValue(value.label);
  const maxPixels = value.maxPixels === null ? null : positiveInteger(value.maxPixels);
  const output = nonNegativeNumber(value.output);

  if (!label || maxPixels === 0 || output === null) {
    return null;
  }

  return {
    label,
    maxPixels,
    output
  };
}

function normalizeVideoPricingVariant(value: unknown): AiVideoPricingVariant | null {
  if (!isRecord(value)) {
    return null;
  }

  const output = nonNegativeNumber(value.output);
  if (output === null) {
    return null;
  }

  const resolution = stringValue(value.resolution) ?? "720P";
  const jobMode = normalizeVideoJobMode(value.jobMode);
  const taskType = normalizeVideoTaskType(value.taskType);
  const input = nullableNonNegativeNumber(value.input) ?? 0;

  return {
    label: stringValue(value.label) ?? videoVariantLabel(resolution, jobMode, taskType, Boolean(value.withAudio)),
    resolution,
    jobMode,
    taskType,
    withAudio: Boolean(value.withAudio),
    input,
    output,
    note: stringValue(value.note)
  };
}

function normalizeVideoBillingBasis(value: unknown): "OUTPUT_SECONDS" | "INPUT_OUTPUT_SECONDS" {
  return typeof value === "string" && value.trim().toUpperCase() === "INPUT_OUTPUT_SECONDS"
    ? "INPUT_OUTPUT_SECONDS"
    : "OUTPUT_SECONDS";
}

function normalizeVideoJobMode(value: unknown): AiVideoPricingJobMode {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  const modes: AiVideoPricingJobMode[] = ["STANDARD", "REALTIME", "BATCH"];

  return modes.includes(normalized as AiVideoPricingJobMode) ? (normalized as AiVideoPricingJobMode) : "STANDARD";
}

function normalizeVideoTaskType(value: unknown): AiVideoPricingTaskType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  const taskTypes: AiVideoPricingTaskType[] = [
    "TEXT_TO_VIDEO",
    "IMAGE_TO_VIDEO",
    "REFERENCE_TO_VIDEO",
    "VIDEO_EDIT",
    "OTHER"
  ];

  return taskTypes.includes(normalized as AiVideoPricingTaskType) ? (normalized as AiVideoPricingTaskType) : "TEXT_TO_VIDEO";
}

function videoVariantLabel(
  resolution: string,
  jobMode: AiVideoPricingJobMode,
  taskType: AiVideoPricingTaskType,
  withAudio: boolean
) {
  const jobModeNames: Record<AiVideoPricingJobMode, string> = {
    STANDARD: "标准",
    REALTIME: "实时",
    BATCH: "批量"
  };
  const taskTypeNames: Record<AiVideoPricingTaskType, string> = {
    TEXT_TO_VIDEO: "文生视频",
    IMAGE_TO_VIDEO: "图生视频",
    REFERENCE_TO_VIDEO: "参考生视频",
    VIDEO_EDIT: "视频编辑",
    OTHER: "其他"
  };

  return `${resolution} ${jobModeNames[jobMode]} ${taskTypeNames[taskType]}${withAudio ? " 有声" : ""}`;
}

function normalizeDiscountWindows(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const windows = value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const inputCacheHit = nonNegativeNumber(item.inputCacheHit);
      const inputCacheMiss = nonNegativeNumber(item.inputCacheMiss);
      const output = nonNegativeNumber(item.output);

      if (inputCacheHit === null || inputCacheMiss === null || output === null) {
        return null;
      }

      return {
        label: stringValue(item.label) || "优惠时段",
        inputCacheHit,
        inputCacheMiss,
        output,
        timezone: stringValue(item.timezone),
        startTime: stringValue(item.startTime),
        endTime: stringValue(item.endTime)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return windows.length > 0 ? windows : undefined;
}

function normalizeTokenUnit(value: unknown): "K_TOKENS" | "M_TOKENS" {
  return typeof value === "string" && value.trim().toUpperCase() === "K_TOKENS" ? "K_TOKENS" : "M_TOKENS";
}

function tokenUnitDivisor(unit: unknown) {
  return typeof unit === "string" && unit.trim().toUpperCase() === "M_TOKENS" ? 1_000_000 : 1_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nullableNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return nonNegativeNumber(value);
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function nullableNonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return nonNegativeInteger(value);
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberText(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}
