import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { getPrismaClient } from "../src/index.js";

const configKey = "cosyVoiceSystemVoiceOverrides";
const fields = {
  provider: true,
  providerVoiceId: true,
  name: true,
  type: true,
  targetModel: true,
  status: true,
  visibility: true,
  language: true,
  accent: true,
  gender: true,
  ageCategory: true,
  avatarUrl: true,
  description: true,
  previewAudioUrl: true,
  disabledReason: true,
  deletedAt: true
} as const;

type Voice = {
  provider: string;
  providerVoiceId: string;
  name: string;
  type: "SYSTEM" | "DESIGNED";
  targetModel: string;
  status: "DRAFT" | "CREATING" | "PENDING_REVIEW" | "READY" | "FAILED" | "REJECTED" | "DISABLED" | "DELETED";
  visibility: "PRIVATE" | "PUBLIC" | "ADMIN_ONLY";
  language: string | null;
  accent: string | null;
  gender: string | null;
  ageCategory: string | null;
  avatarUrl: string | null;
  description: string | null;
  previewAudioUrl: string | null;
  disabledReason: string | null;
  deletedAt: string | null;
};

type Snapshot = {
  version: 1;
  voices: Voice[];
  systemVoiceOverrides: string | null;
};

function identity(voice: Pick<Voice, "provider" | "providerVoiceId">) {
  return `${voice.provider}\u0000${voice.providerVoiceId}`;
}

function validateVoice(value: unknown): asserts value is Voice {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("快照包含无效音色");
  const voice = value as Record<string, unknown>;
  const expectedKeys = Object.keys(fields).sort();
  if (JSON.stringify(Object.keys(voice).sort()) !== JSON.stringify(expectedKeys)) throw new Error("快照音色字段与白名单不一致");
  if (!["SYSTEM", "DESIGNED"].includes(String(voice.type))
    || !["DRAFT", "CREATING", "PENDING_REVIEW", "READY", "FAILED", "REJECTED", "DISABLED", "DELETED"].includes(String(voice.status))
    || !["PRIVATE", "PUBLIC", "ADMIN_ONLY"].includes(String(voice.visibility))) throw new Error("快照音色枚举值无效");
  for (const key of ["provider", "providerVoiceId", "name", "targetModel"]) {
    if (typeof voice[key] !== "string" || !voice[key]) throw new Error(`快照音色 ${key} 无效`);
  }
  for (const key of ["language", "accent", "gender", "ageCategory", "avatarUrl", "description", "previewAudioUrl", "disabledReason", "deletedAt"]) {
    if (voice[key] !== null && typeof voice[key] !== "string") throw new Error(`快照音色 ${key} 无效`);
  }
  if (voice.deletedAt && Number.isNaN(Date.parse(voice.deletedAt as string))) throw new Error("快照删除时间无效");
}

function voiceData(voice: Voice) {
  return {
    name: voice.name,
    type: voice.type,
    targetModel: voice.targetModel,
    status: voice.status,
    visibility: voice.visibility,
    language: voice.language,
    accent: voice.accent,
    gender: voice.gender,
    ageCategory: voice.ageCategory,
    avatarUrl: voice.avatarUrl,
    description: voice.description,
    previewAudioUrl: voice.previewAudioUrl,
    disabledReason: voice.disabledReason,
    deletedAt: voice.deletedAt ? new Date(voice.deletedAt) : null
  };
}

function preview(value: unknown) {
  const text = JSON.stringify(value);
  return text && text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

async function main() {
  const [mode, file, maybeApply, expectedDigest] = process.argv.slice(2);
  if (!file || !["--export", "--import"].includes(mode)
    || (mode === "--export" && (maybeApply || expectedDigest))
    || (mode === "--import" && maybeApply && (maybeApply !== "--apply" || !/^[0-9a-f]{64}$/.test(expectedDigest ?? "")))) {
    throw new Error("用法：sync-platform-voices.ts --export <文件> | --import <文件> [--apply <快照SHA-256>]");
  }
  const prisma = getPrismaClient();
  try {
    if (mode === "--export") {
      const rows = await prisma.voiceAsset.findMany({
        where: { isPlatform: true, type: { in: ["SYSTEM", "DESIGNED"] } },
        select: fields,
        orderBy: [{ provider: "asc" }, { providerVoiceId: "asc" }]
      });
      const config = await prisma.systemConfig.findUnique({ where: { key: configKey }, select: { value: true } });
      const snapshot: Snapshot = {
        version: 1,
        voices: rows.map(({ providerVoiceId, deletedAt, ...row }) => {
          if (!providerVoiceId) throw new Error("平台音色缺少供应商音色 ID");
          return { ...row, providerVoiceId, deletedAt: deletedAt?.toISOString() ?? null };
        }),
        systemVoiceOverrides: config?.value ?? null
      };
      if (snapshot.voices.length === 0) throw new Error("本地平台音色为空，拒绝导出");
      await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
      console.log(`已导出 ${snapshot.voices.length} 条平台音色及系统音色配置`);
      return;
    }

    const raw = await readFile(file, "utf8");
    const snapshot = JSON.parse(raw) as Snapshot;
    const digest = createHash("sha256").update(raw).digest("hex");
    if (snapshot.version !== 1 || !Array.isArray(snapshot.voices) || snapshot.voices.length < 1
      || !Object.hasOwn(snapshot, "systemVoiceOverrides")
      || JSON.stringify(Object.keys(snapshot).sort()) !== JSON.stringify(["systemVoiceOverrides", "version", "voices"])
      || (snapshot.systemVoiceOverrides !== null && typeof snapshot.systemVoiceOverrides !== "string")) {
      throw new Error("平台音色快照格式无效");
    }
    if (maybeApply === "--apply" && expectedDigest !== digest) throw new Error("快照 SHA-256 与已确认值不一致");
    const keys = new Set<string>();
    for (const voice of snapshot.voices) {
      validateVoice(voice);
      const key = identity(voice);
      if (keys.has(key)) throw new Error(`快照有重复的供应商音色 ID：${key}`);
      keys.add(key);
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(7319274519012)`;
      const target = await tx.voiceAsset.findMany({
        where: { isPlatform: true, type: { in: ["SYSTEM", "DESIGNED"] } },
        select: { id: true, userId: true, providerInstanceId: true, ...fields }
      });
      const targetKeys = target.map((voice) => identity({ provider: voice.provider, providerVoiceId: voice.providerVoiceId ?? "" }));
      if (new Set(targetKeys).size !== targetKeys.length) throw new Error("线上平台音色存在重复的供应商音色 ID，拒绝覆盖");
      const missingFromSource = targetKeys.filter((key) => !keys.has(key));
      if (missingFromSource.length) throw new Error(`线上有 ${missingFromSource.length} 条本地没有的平台音色，拒绝覆盖`);
      const foreignMatches = await tx.voiceAsset.count({
        where: {
          isPlatform: false,
          OR: snapshot.voices.map((voice) => ({ provider: voice.provider, providerVoiceId: voice.providerVoiceId }))
        }
      });
      if (foreignMatches) throw new Error(`${foreignMatches} 条用户音色与平台快照使用相同供应商 ID，拒绝覆盖`);
      const nonPlatformBefore = await tx.voiceAsset.count({ where: { isPlatform: false } });
      const byKey = new Map(target.map((voice) => [identity({ provider: voice.provider, providerVoiceId: voice.providerVoiceId ?? "" }), voice]));
      const changed = snapshot.voices.filter((voice) => byKey.has(identity(voice)));
      const created = snapshot.voices.filter((voice) => !byKey.has(identity(voice)));
      const currentConfig = await tx.systemConfig.findUnique({ where: { key: configKey }, select: { value: true } });
      if (snapshot.systemVoiceOverrides === null && currentConfig) throw new Error("本地缺少系统音色配置，拒绝覆盖线上配置");
      let changedCount = 0;
      for (const voice of changed) {
        const current = byKey.get(identity(voice))!;
        const differences = Object.keys(fields).filter((field) => {
          const oldValue = field === "deletedAt" ? current.deletedAt?.toISOString() ?? null : current[field as keyof typeof fields];
          return oldValue !== voice[field as keyof Voice];
        });
        if (!differences.length) continue;
        changedCount += 1;
        console.log(`${voice.provider}/${voice.providerVoiceId}: ${differences.map((field) => {
          const oldValue = field === "deletedAt" ? current.deletedAt?.toISOString() ?? null : current[field as keyof typeof fields];
          return `${field} ${preview(oldValue)} -> ${preview(voice[field as keyof Voice])}`;
        }).join("; ")}`);
        if (maybeApply === "--apply") await tx.voiceAsset.update({ where: { id: current.id }, data: voiceData(voice) });
      }
      for (const voice of created) {
        const owners = target.filter((row) => row.provider === voice.provider && row.targetModel === voice.targetModel && row.providerInstanceId);
        const providerIds = [...new Set(owners.map((row) => row.providerInstanceId!))];
        if (providerIds.length !== 1) throw new Error(`${voice.provider}/${voice.targetModel} 在线上没有唯一的平台供应商实例`);
        const model = await tx.aiModelInstance.findUnique({
          where: { providerInstanceId_providerModelName: { providerInstanceId: providerIds[0], providerModelName: voice.targetModel } },
          include: { providerInstance: { include: { providerPreset: true, credential: true } } }
        });
        if (!model?.isEnabled || model.providerInstance.status !== "ENABLED" || model.providerInstance.providerPreset.providerKey !== voice.provider
          || !(model.apiKeyEncrypted || model.providerInstance.credential?.apiKeyEncrypted)) {
          throw new Error(`${voice.provider}/${voice.targetModel} 的线上模型或凭证未启用`);
        }
        console.log(`新增 ${voice.provider}/${voice.providerVoiceId}: ${voice.name}`);
        if (maybeApply === "--apply") await tx.voiceAsset.create({ data: {
          ...voiceData(voice), provider: voice.provider, providerVoiceId: voice.providerVoiceId,
          userId: owners[0].userId, providerInstanceId: providerIds[0], isPlatform: true
        } });
      }
      if (currentConfig?.value !== snapshot.systemVoiceOverrides) {
        const beforeKeys = currentConfig?.value ? Object.keys(JSON.parse(currentConfig.value) as Record<string, unknown>) : [];
        const afterKeys = snapshot.systemVoiceOverrides ? Object.keys(JSON.parse(snapshot.systemVoiceOverrides) as Record<string, unknown>) : [];
        console.log(`系统音色配置：${beforeKeys.length} -> ${afterKeys.length} 项；新增 ${afterKeys.filter((key) => !beforeKeys.includes(key)).join(",") || "无"}；移除 ${beforeKeys.filter((key) => !afterKeys.includes(key)).join(",") || "无"}`);
      }
      console.log(`快照 SHA-256 ${digest}; 线上 ${target.length} 条; 更新 ${changedCount} 条; 新增 ${created.length} 条; 系统配置${currentConfig?.value === snapshot.systemVoiceOverrides ? "不变" : "更新"}`);
      if (maybeApply !== "--apply") return;
      if (snapshot.systemVoiceOverrides !== null) {
        await tx.systemConfig.upsert({
          where: { key: configKey },
          update: { value: snapshot.systemVoiceOverrides },
          create: { key: configKey, label: "系统音色资料", group: "audio", value: snapshot.systemVoiceOverrides }
        });
      }
      const after = await tx.voiceAsset.count({ where: { isPlatform: true, type: { in: ["SYSTEM", "DESIGNED"] } } });
      const nonPlatformAfter = await tx.voiceAsset.count({ where: { isPlatform: false } });
      if (after !== snapshot.voices.length || nonPlatformAfter !== nonPlatformBefore) {
        throw new Error(`同步后数量不一致：平台 ${after}/${snapshot.voices.length}，用户 ${nonPlatformAfter}/${nonPlatformBefore}`);
      }
    }, { isolationLevel: "Serializable", timeout: 120_000 });
    if (maybeApply === "--apply") console.log(`同步完成：${snapshot.voices.length} 条平台音色；非平台音色未修改`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
