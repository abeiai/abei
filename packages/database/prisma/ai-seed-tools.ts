import { getPrismaClient } from "../src/index.js";
import { seedAiToolTemplates } from "./seed-ai-tool-templates.js";

async function main() {
  const prisma = getPrismaClient();
  const result = await seedAiToolTemplates(prisma);

  console.log(
    `AI 工具模板已就绪：${result.categoryCount} 个分类，${result.templateCount} 个模板，新增 ${result.createdCount} 个，保留 ${result.preservedCount} 个。`
  );
}

void main().catch((error) => {
  console.error("AI 工具模板 seed 执行失败。", error);
  process.exit(1);
});
