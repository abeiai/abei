import { getPrismaClient } from "@xueleai/database";
import { AiService } from "./ai.service.js";

async function main() {
  const service = new AiService({} as never, {} as never);
  const scenarios = await service.syncBuiltInScenarios();

  for (const scenario of scenarios) {
    console.log(`${scenario.slug}\t${scenario.templateVersion ?? "unversioned"}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "AI 场景同步失败");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrismaClient().$disconnect();
  });
