import { getPrismaClient } from "../src/index.js";
import { seedAiPresets } from "./seed-ai-presets.js";

async function main() {
  const prisma = getPrismaClient();
  try {
    const providerKeys = process.env.AI_PRESET_PROVIDER_KEYS?.split(",").map((key) => key.trim()).filter(Boolean);
    const result = await seedAiPresets(prisma, providerKeys?.length ? providerKeys : undefined);

    console.log(`AI Provider Preset 已写入：${result.providerCount} 个。`);
    console.log(`AI Model Preset 已写入：${result.modelCount} 个。`);
    console.log(`模型别名已写入：${result.aliasCount} 个。`);
    console.log(result.scenarioBinding ? "默认 AI 场景绑定已就绪。" : "未找到默认 AI 场景，已跳过场景绑定。");
    console.log("AI 预置初始化完成，可重复执行且不会覆盖已填写的 API Key。");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("AI 预置初始化失败。", error instanceof Error ? error.message : error);
  process.exit(1);
});
