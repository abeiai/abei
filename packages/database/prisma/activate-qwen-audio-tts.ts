import { getPrismaClient } from "../src/index.js";
import { providerPresets } from "./ai-preset-data.js";

const apply = process.argv.includes("--apply");
const providerKey = "aliyun_dashscope_audio";
const modelName = "qwen-audio-3.1-tts-flash";

async function main() {
  const prisma = getPrismaClient();
  try {
    const source = providerPresets.find((provider) => provider.providerKey === providerKey)?.models
      .find((model) => model.providerModelName === modelName);
    if (!source) throw new Error("千问 3.1 TTS 模型预设不存在");
    if (!("pricingConfig" in source) || source.pricingConfig?.mode !== "TOKENS") {
      throw new Error("千问 3.1 TTS 缺少官方 Token 价格");
    }
    const pricing = source.pricingConfig;

    const provider = await prisma.aiProviderPreset.findUnique({ where: { providerKey } });
    if (!provider) throw new Error("阿里云语音 Provider 尚未初始化");
    const instance = await prisma.aiProviderInstance.findFirst({
      where: { providerPresetId: provider.id, status: "ENABLED", region: "cn-beijing" },
      include: { credential: true }
    });
    if (!instance?.credential?.apiKeyEncrypted) throw new Error("北京地域阿里云语音 Provider 未启用或未配置密钥");

    const existing = await prisma.aiModelInstance.findUnique({
      where: { providerInstanceId_providerModelName: { providerInstanceId: instance.id, providerModelName: modelName } }
    });
    const migrateInitialPricing = existing?.pricingMode === "CHARACTERS"
      && existing.inputPrice.toString() === "1"
      && existing.outputPrice.toString() === "0";
    console.log(existing
      ? `${modelName} 已存在；${migrateInitialPricing ? "迁移初始字符价为官方 Token 价" : "保留现有价格"}及启用状态`
      : `${modelName} 将新增到已启用的北京地域 Provider`);
    if (!apply) return;

    const model = await prisma.$transaction(async (tx) => {
      const preset = await tx.aiModelPreset.upsert({
        where: { providerPresetId_modelKey: { providerPresetId: provider.id, modelKey: source.modelKey } },
        update: {
          displayName: source.displayName,
          providerModelName: modelName,
          capabilityTags: [...source.capabilityTags],
          supportsStreaming: true,
          supportsAudio: true,
          pricingConfig: pricing
        },
        create: {
          providerPresetId: provider.id,
          modelKey: source.modelKey,
          displayName: source.displayName,
          providerModelName: modelName,
          capabilityTags: [...source.capabilityTags],
          supportsStreaming: true,
          supportsAudio: true,
          pricingConfig: pricing
        }
      });
      return tx.aiModelInstance.upsert({
        where: { providerInstanceId_providerModelName: { providerInstanceId: instance.id, providerModelName: modelName } },
        update: {
          modelPresetId: preset.id,
          displayName: source.displayName,
          capabilityTags: [...source.capabilityTags],
          ...(migrateInitialPricing ? {
            inputPrice: String(pricing.input),
            outputPrice: String(pricing.output),
            pricingMode: "TOKENS",
            pricingUnit: "M_TOKENS",
            pricingConfig: pricing
          } : {})
        },
        create: {
          providerInstanceId: instance.id,
          modelPresetId: preset.id,
          displayName: source.displayName,
          providerModelName: modelName,
          baseUrl: instance.baseUrl,
          webSocketUrl: instance.webSocketUrl,
          region: instance.region,
          capabilityTags: [...source.capabilityTags],
          inputPrice: String(pricing.input),
          outputPrice: String(pricing.output),
          pricingMode: "TOKENS",
          pricingUnit: "M_TOKENS",
          pricingConfig: pricing,
          isEnabled: true
        }
      });
    });
    console.log(`${model.providerModelName} 已登记，状态：${model.isEnabled ? "启用" : "停用"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
