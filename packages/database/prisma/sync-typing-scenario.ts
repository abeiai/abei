import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../src/index.js";
import { syncTypingScenario } from "./typing-scenario.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const prisma = getPrismaClient();
  const scenario = await syncTypingScenario(prisma);

  console.log(`打字记词场景已就绪：${scenario.slug}`);
}

void main().catch((error) => {
  console.error("打字记词场景同步失败。", error);
  process.exit(1);
});
