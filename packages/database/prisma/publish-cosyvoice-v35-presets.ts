import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { cosyVoiceV35Presets } from "../../../apps/web/src/lib/cosyvoice-v35-presets.js";
import { decryptSecret, getPrismaClient } from "../src/index.js";

const apply = process.argv.includes("--apply");
const workspace = resolve(import.meta.dirname, "../../..");
const stateDirectory = resolve(workspace, "tmp/cosyvoice-v35-preset-publish");
const publicBase = (process.env.S3_PUBLIC_BASE_URL?.trim() || required("VIDEO_GUIDE_R2_PUBLIC_BASE_URL")).replace(/\/+$/, "");
const keyPrefix = (process.env.S3_KEY_PREFIX ?? "uploads/").replace(/^\/+|\/+$/g, "");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 未配置`);
  return value;
}

function objectKey(id: string, kind: "avatar" | "preview", digest: string) {
  const prefix = keyPrefix ? `${keyPrefix}/` : "";
  return `${prefix}audio/voices/cosyvoice-v35/${id}-${kind}-${digest}.${kind === "avatar" ? "jpg" : "wav"}`;
}

type DesignResult = { voiceId: string; audioBase64: string };

async function designVoice(preset: (typeof cosyVoiceV35Presets)[number], model: string, apiKey: string): Promise<DesignResult> {
  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "voice-enrollment",
      input: {
        action: "create_voice",
        target_model: model,
        voice_prompt: preset.prompt,
        prefix: `v35${preset.id}`.slice(0, 10),
        preview_text: preset.previewText
      },
      parameters: { sample_rate: 24000, response_format: "wav" }
    }),
    signal: AbortSignal.timeout(120_000)
  });
  const payload = await response.json() as {
    code?: string;
    message?: string;
    output?: { voice_id?: string; preview_audio?: { data?: string; url?: string } };
  };
  if (!response.ok || payload.code || !payload.output?.voice_id) {
    throw new Error(`${preset.id} 音色设计失败: ${payload.message ?? payload.code ?? response.status}`);
  }
  let audioBase64 = payload.output.preview_audio?.data;
  if (!audioBase64 && payload.output.preview_audio?.url) {
    const audioResponse = await fetch(payload.output.preview_audio.url, { signal: AbortSignal.timeout(30_000) });
    if (!audioResponse.ok) throw new Error(`${preset.id} 试听音频下载失败: HTTP ${audioResponse.status}`);
    audioBase64 = Buffer.from(await audioResponse.arrayBuffer()).toString("base64");
  }
  if (!audioBase64) throw new Error(`${preset.id} 设计接口未返回试听音频`);
  return { voiceId: payload.output.voice_id, audioBase64 };
}

async function main() {
  const prisma = getPrismaClient();
  try {
    const alias = await prisma.aiModelAlias.findUnique({
      where: { aliasKey: "voice-design-default" },
      include: { modelInstance: { include: { providerInstance: { include: { credential: true } } } } }
    });
    const model = alias?.modelInstance;
    if (!model?.isEnabled || model.providerModelName !== "cosyvoice-v3.5-plus") {
      throw new Error("voice-design-default 未指向可用的 CosyVoice v3.5 Plus");
    }
    const owner = await prisma.voiceAsset.findFirst({
      where: { isPlatform: true, type: "DESIGNED", providerInstanceId: model.providerInstanceId },
      select: { userId: true, provider: true }
    });
    if (!owner) throw new Error("缺少现有平台音色，无法确定平台音色所有者");
    const existing = await prisma.voiceAsset.findMany({
      where: { isPlatform: true, type: "DESIGNED", name: { in: cosyVoiceV35Presets.map((voice) => voice.name) } },
      select: { name: true, status: true, targetModel: true, providerVoiceId: true, avatarUrl: true, previewAudioUrl: true }
    });
    for (const preset of cosyVoiceV35Presets) {
      const row = existing.find((voice) => voice.name === preset.name);
      if (row && (row.status !== "READY" || row.targetModel !== model.providerModelName || !row.providerVoiceId || !row.avatarUrl || !row.previewAudioUrl)) {
        throw new Error(`${preset.name} 已存在但资料不完整，请人工核对后再运行`);
      }
      console.log(`${preset.id}: ${preset.name} ${row ? "已发布" : "待生成"}`);
    }
    if (!apply) return;

    const encryptedKey = model.apiKeyEncrypted ?? model.providerInstance.credential?.apiKeyEncrypted;
    const apiKey = encryptedKey ? decryptSecret(encryptedKey) : process.env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) throw new Error("CosyVoice 模型未配置 API Key");

    await mkdir(stateDirectory, { recursive: true });
    const s3 = new S3Client({
      endpoint: required("S3_ENDPOINT"),
      region: process.env.S3_REGION?.trim() || "auto",
      credentials: { accessKeyId: required("S3_ACCESS_KEY_ID"), secretAccessKey: required("S3_SECRET_ACCESS_KEY") },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0"
    });
    try {
      for (const preset of cosyVoiceV35Presets) {
        if (existing.some((voice) => voice.name === preset.name)) continue;
        const statePath = resolve(stateDirectory, `${preset.id}.json`);
        let result: DesignResult;
        try {
          result = JSON.parse(await readFile(statePath, "utf8")) as DesignResult;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          result = await designVoice(preset, model.providerModelName, apiKey);
          await writeFile(statePath, JSON.stringify(result), { flag: "wx", mode: 0o600 });
        }
        const wav = Buffer.from(result.audioBase64, "base64");
        if (wav.subarray(0, 4).toString("ascii") !== "RIFF" || wav.subarray(8, 12).toString("ascii") !== "WAVE") {
          throw new Error(`${preset.id} 的试听文件不是 WAV`);
        }
        const avatarSource = await readFile(resolve(workspace, `scripts/audio/assets/cosyvoice-v35-presets/${preset.id}.jpg`));
        const avatar = await sharp(avatarSource).resize(512, 512).jpeg({ quality: 90 }).toBuffer();
        const avatarKey = objectKey(preset.id, "avatar", createHash("sha256").update(avatar).digest("hex").slice(0, 16));
        const previewKey = objectKey(preset.id, "preview", createHash("sha256").update(wav).digest("hex").slice(0, 16));
        await s3.send(new PutObjectCommand({ Bucket: required("S3_BUCKET"), Key: avatarKey, Body: avatar, ContentType: "image/jpeg" }));
        await s3.send(new PutObjectCommand({ Bucket: required("S3_BUCKET"), Key: previewKey, Body: wav, ContentType: "audio/wav" }));
        const created = await prisma.voiceAsset.create({
          data: {
            userId: owner.userId,
            providerInstanceId: model.providerInstanceId,
            provider: owner.provider,
            providerVoiceId: result.voiceId,
            name: preset.name,
            type: "DESIGNED",
            targetModel: model.providerModelName,
            status: "READY",
            visibility: "PUBLIC",
            language: "zh-CN",
            gender: ["business", "story"].includes(preset.id) ? "男声" : "女声",
            description: preset.description,
            avatarUrl: `${publicBase}/${avatarKey}`,
            previewAudioUrl: `${publicBase}/${previewKey}`,
            isPlatform: true
          }
        });
        console.log(`${preset.name}: ${created.id} 已发布`);
      }
    } finally {
      s3.destroy();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
