import type { PrismaClient } from "../generated/client/index.js";
import { aiToolCategories, aiToolTemplates, aiToolTemplateVersion } from "./ai-tool-template-data.js";
import { registerAiToolTemplates } from "./ai-tool-template-registry.js";

type PrismaClientLike = PrismaClient;

export async function seedAiToolTemplates(prisma: PrismaClientLike) {
  return registerAiToolTemplates(prisma, {
    categories: aiToolCategories,
    templates: aiToolTemplates,
    builtIn: true,
    templateVersion: aiToolTemplateVersion,
    overwrite: false
  });
}
