import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getPrismaClient } from "../../packages/database/src/index.js";
import { platformDesignedVoiceCopy } from "./platform-designed-voice-copy.js";

const backupDir = resolve(process.cwd(), process.env.VOICE_COPY_BACKUP_DIR ?? "../../tmp/platform-designed-voice-copy-backups");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置");
  }

  const prisma = getPrismaClient();
  try {
    const rows = await prisma.voiceAsset.findMany({
      where: { type: "DESIGNED", isPlatform: true, deletedAt: null },
      select: { id: true, provider: true, providerVoiceId: true, name: true, description: true }
    });
    if (rows.length === 0) {
      throw new Error("没有找到平台设计音色，已取消更新");
    }

    for (const row of rows) {
      const voiceId = row.providerVoiceId;
      const expectedProvider = voiceId?.startsWith("ttv-") ? "minimax_audio" : "aliyun_dashscope_audio";
      if (!voiceId || !platformDesignedVoiceCopy[voiceId] || row.provider !== expectedProvider) {
        throw new Error(`发现未收录的平台设计音色 ${row.id}，已取消更新`);
      }
    }

    const changes = rows.filter((row) => {
      const copy = platformDesignedVoiceCopy[row.providerVoiceId!];
      return row.name !== copy.name || row.description !== copy.description;
    });
    console.log(`平台设计音色 ${rows.length} 条，待更新 ${changes.length} 条`);
    for (const row of changes) {
      console.log(`${row.providerVoiceId}: ${row.name} -> ${platformDesignedVoiceCopy[row.providerVoiceId!].name}`);
    }

    if (!process.argv.includes("--apply") || changes.length === 0) {
      return;
    }

    await mkdir(backupDir, { recursive: true });
    const backupPath = join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify(changes, null, 2), { flag: "wx" });
    console.log(`原名称和介绍已备份至 ${backupPath}`);

    await prisma.$transaction(async (tx) => {
      for (const row of changes) {
        const copy = platformDesignedVoiceCopy[row.providerVoiceId!];
        const result = await tx.voiceAsset.updateMany({
          where: {
            id: row.id,
            type: "DESIGNED",
            isPlatform: true,
            provider: row.provider,
            providerVoiceId: row.providerVoiceId,
            name: row.name,
            description: row.description,
            deletedAt: null
          },
          data: { name: copy.name, description: copy.description }
        });
        if (result.count !== 1) {
          throw new Error(`音色 ${row.id} 已发生变化，整个更新已回滚`);
        }
      }
    });
    console.log(`已更新 ${changes.length} 条平台设计音色`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
