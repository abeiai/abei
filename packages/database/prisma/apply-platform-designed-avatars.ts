import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import voiceCopyModule from "../../../scripts/audio/platform-designed-voice-copy.js";
import { getPrismaClient } from "../src/index.js";
import { platformDesignedAvatarAtlases, platformDesignedAvatarSourceSha256 } from "./platform-designed-avatar-plan.js";

const { platformDesignedVoiceCopy } = voiceCopyModule;
const buildDir = resolve(process.cwd(), "../../tmp/platform-designed-avatar-build");
const applyChanges = process.argv.includes("--apply");
const suppliedPaths = process.argv.slice(2).filter((argument) => argument !== "--apply");
const atlasPaths = (suppliedPaths.length > 0 ? suppliedPaths : ["a", "b", "c", "d"].map((letter) =>
  `../../scripts/audio/assets/platform-designed-avatar-atlas-${letter}.png`
)).map((path) => resolve(path));

async function main() {
  if (atlasPaths.length !== platformDesignedAvatarAtlases.length) {
    throw new Error("请按 A、B、C、D 顺序提供 4 张头像拼图路径，或不传路径使用仓库内源图");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 未配置");

  const prisma = getPrismaClient();
  try {
    const rows = await prisma.voiceAsset.findMany({
      where: { type: "DESIGNED", isPlatform: true, deletedAt: null },
      select: { id: true, providerVoiceId: true, name: true, description: true, avatarUrl: true }
    });
    const expectedIds = platformDesignedAvatarAtlases.flat();
    if (rows.length !== expectedIds.length || new Set(expectedIds).size !== rows.length) {
      throw new Error("平台设计音色数量与头像清单不一致，已取消更新");
    }

    const byVoiceId = new Map(rows.map((row) => [row.providerVoiceId, row]));
    for (const providerVoiceId of expectedIds) {
      const row = byVoiceId.get(providerVoiceId);
      const copy = platformDesignedVoiceCopy[providerVoiceId];
      if (!row || !copy || row.name !== copy.name || row.description !== copy.description) {
        throw new Error(`音色 ${providerVoiceId} 与已审核的角色文案不一致，已取消更新`);
      }
    }

    const publicBase = requiredEnv("S3_PUBLIC_BASE_URL", process.env.S3_PUBLIC_BASE_URL || process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
    const rawPrefix = (process.env.S3_KEY_PREFIX ?? "uploads/").replace(/^\/+|\/+$/g, "");
    const prefix = rawPrefix ? `${rawPrefix}/` : "";
    const prepared: Array<{
      id: string;
      providerVoiceId: string;
      name: string;
      description: string | null;
      oldAvatarUrl: string | null;
      url: string;
      key: string;
      jpeg: Buffer;
    }> = [];

    await mkdir(buildDir, { recursive: true });
    for (const [atlasIndex, ids] of platformDesignedAvatarAtlases.entries()) {
      const source = await readFile(atlasPaths[atlasIndex]!);
      const sourceHash = createHash("sha256").update(source).digest("hex");
      if (sourceHash !== platformDesignedAvatarSourceSha256[atlasIndex]) {
        throw new Error(`第 ${atlasIndex + 1} 张拼图与审核源图不一致，已取消更新`);
      }
      const metadata = await sharp(source).metadata();
      if (metadata.width !== 1774 || metadata.height !== 887) {
        throw new Error(`第 ${atlasIndex + 1} 张拼图尺寸不是 1774×887，已取消更新`);
      }
      for (const [tileIndex, providerVoiceId] of ids.entries()) {
        const row = byVoiceId.get(providerVoiceId)!;
        const column = tileIndex % 4;
        const line = Math.floor(tileIndex / 4);
        const left = Math.round(column * metadata.width / 4) + 5;
        const top = Math.round(line * metadata.height / 2) + 5;
        const width = Math.round((column + 1) * metadata.width / 4) - left - 5;
        const height = Math.round((line + 1) * metadata.height / 2) - top - 5;
        const jpeg = await sharp(source)
          .extract({ left, top, width, height })
          .resize(512, 512, { fit: "cover", position: "centre" })
          .removeAlpha()
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toBuffer();
        const digest = createHash("sha256").update(jpeg).digest("hex").slice(0, 20);
        const key = `${prefix}audio/voices/avatars/asset-${row.id}-v6-${digest}.jpg`;
        const url = `${publicBase}/${key}`;
        await writeFile(join(buildDir, `${row.id}.jpg`), jpeg);
        prepared.push({
          id: row.id,
          providerVoiceId,
          name: row.name,
          description: row.description,
          oldAvatarUrl: row.avatarUrl,
          url,
          key,
          jpeg
        });
      }
    }

    await writeFile(join(buildDir, "manifest.json"), JSON.stringify(prepared.map(({ jpeg, ...entry }) => {
      void jpeg;
      return entry;
    }), null, 2));
    const changes = prepared.filter((entry) => entry.url !== entry.oldAvatarUrl);
    console.log(`头像已裁切 ${prepared.length} 张；待更新 ${changes.length} 条；本地目录 ${buildDir}`);
    if (!applyChanges || changes.length === 0) return;

    const backupPath = join(buildDir, `previous-avatar-urls-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify(changes.map(({ id, oldAvatarUrl, url }) => ({ id, oldAvatarUrl, url })), null, 2), { flag: "wx" });
    console.log(`原头像 URL 已备份至 ${backupPath}`);

    const client = new S3Client({
      endpoint: requiredEnv("S3_ENDPOINT"),
      region: process.env.S3_REGION?.trim() || "auto",
      credentials: {
        accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY")
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0"
    });
    try {
      for (const entry of changes) {
        await client.send(new PutObjectCommand({
          Bucket: requiredEnv("S3_BUCKET"),
          Key: entry.key,
          Body: entry.jpeg,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable"
        }));
      }
    } finally {
      client.destroy();
    }

    await prisma.$transaction(async (tx) => {
      for (const entry of changes) {
        const updated = await tx.voiceAsset.updateMany({
          where: {
            id: entry.id,
            type: "DESIGNED",
            isPlatform: true,
            providerVoiceId: entry.providerVoiceId,
            name: entry.name,
            description: entry.description,
            avatarUrl: entry.oldAvatarUrl,
            deletedAt: null
          },
          data: { avatarUrl: entry.url }
        });
        if (updated.count !== 1) throw new Error(`音色 ${entry.id} 已发生变化，数据库更新已回滚`);
      }
    }, { timeout: 30_000 });
    console.log(`已上传并更新 ${changes.length} 张平台设计音色头像`);
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnv(name: string, value = process.env[name]) {
  if (!value?.trim()) throw new Error(`${name} 未配置`);
  return value.trim();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
