import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decryptSecret, getPrismaClient } from "../../packages/database/src/index.js";
import dotenv from "dotenv";

import { cosyVoiceSystemVoices } from "../../apps/api-core/src/audio/cosyvoice-system-voices.js";
import { minimaxSystemVoices } from "../../apps/api-core/src/audio/minimax-system-voices.js";
import {
  classifyVoice,
  previewTextForVoice,
  type VoiceClassification,
  type VoiceClassificationInput
} from "./voice-library-classification.js";
import {
  normalizeGeneratedVoiceAvatarJpeg,
  voiceAvatarVersion
} from "./voice-avatar-renderer.js";

type JsonObject = Record<string, unknown>;

interface MutableSystemVoice extends VoiceClassificationInput {
  id: string;
  providerVoiceId: string;
  type: "SYSTEM";
  targetModel: string;
  supportedModels: readonly string[];
  sourceModels: readonly string[];
  status: "READY";
  visibility: "PUBLIC";
  language: string;
  languages: readonly string[];
  description: string;
  trait: string;
  scene: string;
  age: string;
  ageCategory: "儿童" | "青年" | "中年" | "老年" | null;
  avatarUrl: string | null;
  ssmlSupported: boolean;
  instructSupported: boolean;
  timestampSupported: boolean;
  previewAudioUrl: string;
}

interface SiteVoice {
  uniq_id?: string;
  voice_name?: string;
  sample_audio?: string;
  tag_list?: string[];
  description?: string;
}

interface ProviderConfig {
  providerKey: string;
  baseUrl: string;
  apiKey: string;
}

interface R2Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  pathStyle: boolean;
  prefix: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../..");
const applyChanges = process.argv.includes("--apply");
const overwriteAvatars = process.argv.includes("--overwrite-avatars");
const skipAvatars = process.argv.includes("--skip-avatars");
const skipPreviews = process.argv.includes("--skip-previews");
const minimaxSiteBaseUrl = "https://www.minimaxi.com";
const reportPath = join(workspaceRoot, "tmp/voice-library-enrichment-report.json");
const avatarManifestPath = join(workspaceRoot, "tmp/voice-avatar-build", voiceAvatarVersion, "manifest.json");
let avatarManifestPromise: Promise<Map<string, { filename: string }>> | undefined;

dotenv.config({ path: join(workspaceRoot, ".env"), quiet: true });

async function main() {
  const prisma = getPrismaClient();
  const r2 = readR2Config();
  const r2Client = new S3Client({
    endpoint: r2.endpoint,
    region: r2.region,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey
    },
    forcePathStyle: r2.pathStyle
  });
  const failures: Array<{ id: string; stage: string; message: string }> = [];

  try {
    const [siteVoices, databaseVoices, providers] = await Promise.all([
      fetchAllMinimaxSiteVoices(),
      prisma.voiceAsset.findMany({ orderBy: { createdAt: "asc" } }),
      loadAudioProviders()
    ]);
    const siteById = new Map(
      siteVoices.filter((voice) => voice.uniq_id).map((voice) => [voice.uniq_id as string, voice])
    );
    const elevenProvider = providers.get("elevenlabs_audio");
    const minimaxProvider = providers.get("minimax_audio");
    const elevenMetadata = elevenProvider
      ? await fetchElevenLabsMetadata(elevenProvider, databaseVoices, failures)
      : new Map<string, JsonObject>();

    const cosyVoices = cosyVoiceSystemVoices.map((voice) => ({ ...voice })) as MutableSystemVoice[];
    const minimaxVoices = minimaxSystemVoices.map((voice) => ({ ...voice })) as MutableSystemVoice[];

    const enrichedCosy = cosyVoices.map((voice) => enrichSystemVoice(voice));
    const enrichedMinimax = minimaxVoices.map((voice) => {
      const metadata = siteById.get(voice.providerVoiceId);
      return enrichSystemVoice(voice, metadata);
    });

    if (!skipPreviews && applyChanges && minimaxProvider) {
      await runLimited(enrichedMinimax.filter((voice) => !voice.previewAudioUrl), 1, async (voice) => {
        try {
          const audio = await synthesizeMiniMaxPreviewWithRetry(minimaxProvider, voice);
          const key = objectKey(r2, `audio/voices/minimax-system/${safeName(voice.providerVoiceId)}-generated.mp3`);
          await uploadObject(r2Client, r2, key, audio, "audio/mpeg", applyChanges);
          voice.previewAudioUrl = publicObjectUrl(r2, key);
        } catch (error) {
          failures.push({ id: voice.providerVoiceId, stage: "preview", message: errorMessage(error) });
        } finally {
          await sleep(2_200);
        }
      });
    }

    const allAvatarTargets = [
      ...enrichedCosy.map((voice) => ({ id: `cosy-${voice.providerVoiceId}`, voice })),
      ...enrichedMinimax.map((voice) => ({ id: `minimax-${voice.providerVoiceId}`, voice }))
    ];
    if (!skipAvatars) {
      await runLimited(allAvatarTargets, 6, async ({ id, voice }) => {
        if (!overwriteAvatars && isCurrentManagedAvatarUrl(voice.avatarUrl, r2)) return;
        try {
          voice.avatarUrl = await createAndUploadAvatar(r2Client, r2, id, applyChanges);
        } catch (error) {
          failures.push({ id, stage: "avatar", message: errorMessage(error) });
        }
      });
    }

    const databaseUpdates: Array<{
      id: string;
      classification: VoiceClassification;
      avatarUrl: string | null;
      previewAudioUrl: string | null;
    }> = [];
    await runLimited(databaseVoices, 6, async (voice) => {
      const providerLabels = voice.providerVoiceId
        ? objectStrings(elevenMetadata.get(voice.providerVoiceId)?.labels)
        : undefined;
      const classification = classifyVoice({
        ...voice,
        providerLabels
      });
      let avatarUrl = voice.avatarUrl ?? null;
      let previewAudioUrl = voice.previewAudioUrl;

      if (!skipAvatars && (overwriteAvatars || !isCurrentManagedAvatarUrl(avatarUrl, r2))) {
        try {
          avatarUrl = await createAndUploadAvatar(
            r2Client,
            r2,
            `asset-${voice.id}`,
            applyChanges
          );
        } catch (error) {
          failures.push({ id: voice.id, stage: "avatar", message: errorMessage(error) });
        }
      }

      if (!skipPreviews && previewAudioUrl && isLocalPreviewUrl(previewAudioUrl)) {
        try {
          previewAudioUrl = await uploadLocalPreview(r2Client, r2, voice.id, previewAudioUrl, applyChanges);
        } catch (error) {
          failures.push({ id: voice.id, stage: "local-preview", message: errorMessage(error) });
        }
      }

      databaseUpdates.push({ id: voice.id, classification, avatarUrl, previewAudioUrl });
    });

    if (applyChanges) {
      await Promise.all([
        writeSystemVoiceFile(
          join(workspaceRoot, "apps/api-core/src/audio/cosyvoice-system-voices.ts"),
          "cosyVoiceSystemVoices",
          "CosyVoiceSystemVoice",
          enrichedCosy
        ),
        writeSystemVoiceFile(
          join(workspaceRoot, "apps/api-core/src/audio/minimax-system-voices.ts"),
          "minimaxSystemVoices",
          "MinimaxSystemVoice",
          enrichedMinimax
        )
      ]);

      for (const update of databaseUpdates) {
        await prisma.voiceAsset.update({
          where: { id: update.id },
          data: {
            language: update.classification.language,
            accent: update.classification.accent,
            gender: update.classification.gender,
            ageCategory: update.classification.ageCategory,
            avatarUrl: update.avatarUrl,
            previewAudioUrl: update.previewAudioUrl
          }
        });
      }
    }

    const report = {
      mode: applyChanges ? "apply" : "dry-run",
      generatedAt: new Date().toISOString(),
      sources: {
        cosyVoice: enrichedCosy.length,
        minimax: enrichedMinimax.length,
        minimaxSite: siteVoices.length,
        minimaxMatched: enrichedMinimax.filter((voice) => siteById.has(voice.providerVoiceId)).length,
        database: databaseUpdates.length,
        elevenLabsMetadata: elevenMetadata.size
      },
      coverage: {
        systemClassified: [...enrichedCosy, ...enrichedMinimax].filter(hasCompleteClassification).length,
        systemPreview: [...enrichedCosy, ...enrichedMinimax].filter((voice) => Boolean(voice.previewAudioUrl)).length,
        systemAvatar: [...enrichedCosy, ...enrichedMinimax].filter((voice) => Boolean(voice.avatarUrl)).length,
        databaseClassified: databaseUpdates.filter((item) => hasCompleteClassification(item.classification)).length,
        databasePreview: databaseUpdates.filter((item) => Boolean(item.previewAudioUrl)).length,
        databaseAvatar: databaseUpdates.filter((item) => Boolean(item.avatarUrl)).length
      },
      failures
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));

    if (failures.length > 0 && applyChanges) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function enrichSystemVoice(voice: MutableSystemVoice, metadata?: SiteVoice): MutableSystemVoice {
  const metadataTags = metadata?.tag_list ?? [];
  const classification = classifyVoice({ ...voice, metadataTags });
  const parsedName = parseVoiceName(metadata?.voice_name);

  return {
    ...voice,
    name: metadata?.voice_name?.trim() || voice.name,
    language: classification.language,
    accent: classification.accent,
    gender: classification.gender,
    age: metadataTags[3] || voice.age,
    ageCategory: classification.ageCategory,
    description: metadata?.description?.trim() || voice.description,
    trait: parsedName.trait || voice.trait,
    scene: metadataTags.slice(4).join("、") || voice.scene,
    previewAudioUrl: metadata?.sample_audio && !voice.previewAudioUrl ? metadata.sample_audio : voice.previewAudioUrl
  };
}

async function loadAudioProviders() {
  const prisma = getPrismaClient();
  const providers = await prisma.aiProviderInstance.findMany({
    where: {
      status: "ENABLED",
      providerPreset: {
        modality: "AUDIO"
      }
    },
    include: {
      providerPreset: true,
      credential: true
    }
  });
  const result = new Map<string, ProviderConfig>();

  for (const provider of providers) {
    const encrypted = provider.credential?.apiKeyEncrypted;
    const environmentKey = process.env[provider.providerPreset.apiKeyEnvName]?.trim();
    const apiKey = encrypted ? decryptSecret(encrypted) : environmentKey;
    if (!apiKey) continue;
    result.set(provider.providerPreset.providerKey, {
      providerKey: provider.providerPreset.providerKey,
      baseUrl: provider.baseUrl.replace(/\/+$/, ""),
      apiKey
    });
  }
  return result;
}

async function fetchElevenLabsMetadata(
  provider: ProviderConfig,
  voices: Array<{ provider: string; providerVoiceId: string | null; id: string }>,
  failures: Array<{ id: string; stage: string; message: string }>
) {
  const targets = voices.filter((voice) => voice.provider === "elevenlabs_audio" && voice.providerVoiceId);
  const result = new Map<string, JsonObject>();

  await runLimited(targets, 4, async (voice) => {
    try {
      const response = await fetch(`${provider.baseUrl}/v1/voices/${encodeURIComponent(voice.providerVoiceId as string)}`, {
        headers: { "xi-api-key": provider.apiKey },
        signal: AbortSignal.timeout(45_000)
      });
      if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}`);
      result.set(voice.providerVoiceId as string, await response.json() as JsonObject);
    } catch (error) {
      failures.push({ id: voice.id, stage: "elevenlabs-metadata", message: errorMessage(error) });
    }
  });
  return result;
}

async function fetchAllMinimaxSiteVoices() {
  const first = await fetchMinimaxPage(1);
  const voices = [...first.voices];
  const pages = Math.ceil(first.total / 100);
  for (let page = 2; page <= pages; page += 1) {
    voices.push(...(await fetchMinimaxPage(page)).voices);
  }
  return voices;
}

async function fetchMinimaxPage(page: number) {
  const response = await fetch(`${minimaxSiteBaseUrl}/v1/api/audio/voice/list`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page, page_size: 100 }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) throw new Error(`MiniMax voice metadata HTTP ${response.status}`);
  const payload = await response.json() as {
    data?: { total?: number; voice_list?: SiteVoice[] };
    statusInfo?: { code?: number; message?: string };
  };
  if (payload.statusInfo?.code !== 0 || !payload.data?.voice_list) {
    throw new Error(`MiniMax voice metadata failed: ${payload.statusInfo?.message ?? "unknown error"}`);
  }
  return { total: payload.data.total ?? payload.data.voice_list.length, voices: payload.data.voice_list };
}

async function synthesizeMiniMaxPreview(provider: ProviderConfig, voice: MutableSystemVoice) {
  const classification = classifyVoice(voice);
  const text = previewTextForVoice(voice, classification);
  const response = await fetch(`${provider.baseUrl}/v1/t2a_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "speech-2.8-turbo",
      text,
      stream: false,
      voice_setting: { voice_id: voice.providerVoiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
      output_format: "hex"
    }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) throw new Error(`MiniMax TTS HTTP ${response.status}`);
  const payload = await response.json() as JsonObject;
  const baseResponse = objectValue(payload.base_resp) ?? objectValue(payload.base_response);
  const statusCode = numberValue(baseResponse?.status_code) ?? numberValue(baseResponse?.statusCode) ?? 0;
  if (statusCode !== 0) throw new Error(`MiniMax TTS ${stringValue(baseResponse?.status_msg) ?? statusCode}`);
  const data = objectValue(payload.data);
  const audioHex = stringValue(data?.audio) ?? stringValue(data?.audio_hex);
  if (!audioHex) throw new Error("MiniMax TTS 未返回试听音频");
  return Buffer.from(audioHex, "hex");
}

async function synthesizeMiniMaxPreviewWithRetry(provider: ProviderConfig, voice: MutableSystemVoice) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await synthesizeMiniMaxPreview(provider, voice);
    } catch (error) {
      lastError = error;
      if (!/rate limit|rpm/i.test(errorMessage(error)) || attempt === 2) throw error;
      await sleep(62_000);
    }
  }
  throw lastError;
}

async function createAndUploadAvatar(
  client: S3Client,
  r2: R2Config,
  id: string,
  apply: boolean
) {
  const manifestEntry = (await loadAvatarManifest()).get(id);
  if (!manifestEntry) throw new Error(`GPT-Image 2 头像清单缺少角色: ${id}`);
  const filename = manifestEntry.filename;
  const key = objectKey(r2, `audio/voices/avatars/${filename}.jpg`);
  if (!apply) return publicObjectUrl(r2, key);

  const buildDir = join(workspaceRoot, "tmp/voice-avatar-build", voiceAvatarVersion);
  const outputPath = join(buildDir, `${filename}.jpg`);
  const generated = await readGeneratedAvatar(buildDir, filename);
  const jpeg = await normalizeGeneratedVoiceAvatarJpeg(generated);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, jpeg);
  await uploadObject(client, r2, key, jpeg, "image/jpeg", true);
  return publicObjectUrl(r2, key);
}

async function loadAvatarManifest() {
  avatarManifestPromise ??= readFile(avatarManifestPath, "utf8").then((content) => {
    const entries = JSON.parse(content) as Array<{ id: string; filename: string }>;
    return new Map(entries.map((entry) => [entry.id, { filename: entry.filename }]));
  });
  return avatarManifestPromise;
}

async function readGeneratedAvatar(buildDir: string, filename: string) {
  const candidates = ["png", "webp", "jpeg", "jpg"].map((extension) => join(buildDir, "generated", `${filename}.${extension}`));
  for (const path of candidates) {
    try {
      return await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`缺少 GPT-Image 2 头像文件: ${candidates[0]}`);
}

async function uploadLocalPreview(
  client: S3Client,
  r2: R2Config,
  id: string,
  url: string,
  apply: boolean
) {
  const filename = basename(new URL(url).pathname);
  const sourcePath = join(workspaceRoot, "apps/api-core/uploads/audio", filename);
  const extension = extname(filename).toLowerCase() || ".mp3";
  const key = objectKey(r2, `audio/voices/custom-previews/${safeName(id)}${extension}`);
  const contentType = extension === ".wav" ? "audio/wav" : "audio/mpeg";
  await uploadObject(client, r2, key, await readFile(sourcePath), contentType, apply);
  return publicObjectUrl(r2, key);
}

async function uploadObject(
  client: S3Client,
  r2: R2Config,
  key: string,
  body: Uint8Array,
  contentType: string,
  apply: boolean
) {
  if (!apply) return;
  await client.send(new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable"
  }));
}

async function writeSystemVoiceFile(
  path: string,
  exportName: string,
  typeName: string,
  voices: readonly MutableSystemVoice[]
) {
  const current = await readFile(path, "utf8");
  const marker = `export const ${exportName} = `;
  const index = current.indexOf(marker);
  if (index < 0) throw new Error(`缺少 ${exportName} 导出`);
  const next = `${current.slice(0, index)}${marker}${JSON.stringify(voices, null, 2)} as const satisfies readonly ${typeName}[];\n`;
  await writeFile(path, next);
}

function readR2Config(): R2Config {
  const prefix = (process.env.S3_KEY_PREFIX ?? "uploads/").replace(/^\/+/, "");
  return {
    endpoint: requiredEnv("S3_ENDPOINT"),
    bucket: requiredEnv("S3_BUCKET"),
    region: process.env.S3_REGION?.trim() || "auto",
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: requiredValue(
      process.env.S3_PUBLIC_BASE_URL || process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL,
      "S3_PUBLIC_BASE_URL or VIDEO_GUIDE_R2_PUBLIC_BASE_URL"
    ).replace(/\/+$/, ""),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix
  };
}

function objectKey(config: R2Config, path: string) {
  return `${config.prefix}${path.replace(/^\/+/, "")}`;
}

function publicObjectUrl(config: R2Config, key: string) {
  return `${config.publicBaseUrl}/${key}`;
}

function isCurrentManagedAvatarUrl(value: string | null | undefined, config: R2Config) {
  return Boolean(
    value?.startsWith(`${config.publicBaseUrl}/${config.prefix}audio/voices/avatars/`) &&
    value.includes(`-${voiceAvatarVersion}-`)
  );
}

function isLocalPreviewUrl(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.includes("/audio/files/");
  } catch {
    return false;
  }
}

function parseVoiceName(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const [name, ...traitParts] = normalized.split(/\s+-\s+/);
  return { name: name.trim(), trait: traitParts.join(" - ").trim() };
}

function safeName(value: string) {
  const slug = value.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "voice";
  return `${slug}-${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;
}

function hasCompleteClassification(value: Partial<VoiceClassification>) {
  return Boolean(value.language && value.accent && value.gender && value.ageCategory);
}

function objectValue(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : null;
}

function objectStrings(value: unknown) {
  const object = objectValue(value);
  if (!object) return undefined;
  return Object.fromEntries(Object.entries(object).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requiredEnv(name: string) {
  return requiredValue(process.env[name], name);
}

function requiredValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required environment variable: ${name}`);
  return normalized;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function runLimited<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  }));
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
