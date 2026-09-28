import { decryptSecret, encryptSecret, getPrismaClient } from "../src/index.js";

const providerKeys = ["abeiai", "abeiai_audio", "abeiai_video"] as const;

async function main() {
  const apiKey = process.env.ABEIAI_API_KEY?.trim();
  if (!apiKey) throw new Error("ABEIAI_API_KEY 未配置");

  const prisma = getPrismaClient();
  try {
    const providers = await prisma.aiProviderInstance.findMany({
      where: { providerPreset: { providerKey: { in: [...providerKeys] } } },
      select: {
        id: true,
        credential: { select: { apiKeyEncrypted: true } },
        providerPreset: { select: { providerKey: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const defaultProviders = providerKeys.map((key) => providers.find((provider) => provider.providerPreset.providerKey === key));
    if (defaultProviders.some((provider) => !provider)) {
      throw new Error("阿贝智能 Provider 尚未全部入库，请先执行定向预置同步");
    }

    await prisma.$transaction(async (transaction) => {
      for (const provider of defaultProviders) {
        if (!provider) throw new Error("阿贝智能 Provider 实例缺失");
        if (provider.credential && decryptSecret(provider.credential.apiKeyEncrypted) === apiKey) continue;

        const encrypted = encryptSecret(apiKey);
        await transaction.aiProviderCredential.upsert({
          where: { providerInstanceId: provider.id },
          update: { apiKeyEncrypted: encrypted },
          create: { providerInstanceId: provider.id, apiKeyEncrypted: encrypted }
        });
        await transaction.aiProviderInstance.update({
          where: { id: provider.id },
          data: {
            status: "DISABLED",
            lastTestedAt: null,
            lastTestResult: { success: false, message: "API Key 已更新，请重新测试连接" }
          }
        });
      }
    });
    console.log(`阿贝智能 ${defaultProviders.length} 个 Provider 密钥已加密保存。`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "阿贝智能密钥配置失败");
  process.exitCode = 1;
});
