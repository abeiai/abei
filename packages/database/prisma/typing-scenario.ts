import type { Prisma, PrismaClient } from "../generated/client/index.js";

export const typingScenarioData = {
  name: "打字记词",
  slug: "typing",
  description: "通过听音、看中文和图片输入英文，并按记忆阶段复习错词。",
  promptTemplate: "",
  promptVariables: [] as Prisma.InputJsonValue,
  inputSchema: { fields: [] } as Prisma.InputJsonValue,
  requiredCapabilities: [] as Prisma.InputJsonValue,
  costCredits: 0,
  isEnabled: true,
  sortOrder: 36,
  isBuiltIn: true,
  templateVersion: "2026.08.27-v1"
} as const;

type TypingScenarioClient = Pick<PrismaClient, "aiScenario">;

export async function syncTypingScenario(prisma: TypingScenarioClient) {
  const existing = await prisma.aiScenario.findUnique({
    where: { slug: typingScenarioData.slug }
  });

  if (existing && !existing.isBuiltIn) {
    throw new Error("场景 slug ‘typing’ 已被非内置场景占用，请先处理冲突。");
  }

  if (existing) {
    return prisma.aiScenario.update({
      where: { id: existing.id },
      data: typingScenarioData
    });
  }

  return prisma.aiScenario.create({ data: typingScenarioData });
}
