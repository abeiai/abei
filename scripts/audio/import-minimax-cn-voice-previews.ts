import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

type MinimaxSystemVoice = {
  id: string;
  providerVoiceId: string;
  name: string;
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
  ageCategory: null;
  avatarUrl: string | null;
  ssmlSupported: boolean;
  instructSupported: boolean;
  timestampSupported: boolean;
  previewAudioUrl: string;
};

type SiteVoice = {
  voice_id: string;
  voice_name?: string;
  uniq_id?: string;
  sample_audio?: string;
  tag_list?: string[];
  description?: string;
};

type S3Config = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  pathStyle: boolean;
  prefix: string;
};

const siteBaseUrl = "https://www.minimaxi.com";
const pageSize = 100;
const concurrency = Number(process.env.MINIMAX_VOICE_PREVIEW_IMPORT_CONCURRENCY ?? "8");
const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../..");
const targetFile = join(workspaceRoot, "apps/api-core/src/audio/minimax-system-voices.ts");
const additionalCnSystemVoiceUniqIds = [
  "Chinese_casual_instructor_nv1",
  "Chinese_patitent_teacher"
] as const;

dotenv.config({ path: join(workspaceRoot, ".env"), quiet: true });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skipUpload = process.argv.includes("--skip-upload");
  const config = s3Config();
  const voicesModule = await import(pathToFileURL(targetFile).href);
  const voices = voicesModule.minimaxSystemVoices as readonly MinimaxSystemVoice[];
  const siteVoices = await fetchAllSiteVoices();
  const byUniqId = new Map(
    siteVoices.filter((voice) => voice.uniq_id && voice.sample_audio).map((voice) => [voice.uniq_id!, voice])
  );
  const existingProviderVoiceIds = new Set(voices.map((voice) => voice.providerVoiceId));
  const additionalVoices = additionalCnSystemVoiceUniqIds
    .filter((providerVoiceId) => !existingProviderVoiceIds.has(providerVoiceId))
    .map((providerVoiceId) => byUniqId.get(providerVoiceId))
    .filter((voice): voice is SiteVoice & { uniq_id: string; voice_name: string } => Boolean(voice?.uniq_id && voice.voice_name))
    .map(siteVoiceToSystemVoice);
  const targetVoices = [...voices, ...additionalVoices];
  const matchedVoices = targetVoices.filter((voice) => byUniqId.has(voice.providerVoiceId));

  if (!dryRun && !skipUpload) {
    await mkdir(join(workspaceRoot, "tmp"), { recursive: true });
  }

  const client = skipUpload || dryRun ? null : new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: config.pathStyle
  });

  const resolvedPreviewUrls = new Map<string, string>();
  let completedUploads = 0;
  await runLimited(matchedVoices, Math.max(1, concurrency), async (voice) => {
    const siteVoice = byUniqId.get(voice.providerVoiceId);

    if (!siteVoice?.sample_audio) {
      return;
    }

    if (isExistingR2Preview(voice.previewAudioUrl, config)) {
      resolvedPreviewUrls.set(voice.providerVoiceId, voice.previewAudioUrl);
      return;
    }

    const extension = extensionFromUrl(siteVoice.sample_audio);
    const key = `${config.prefix}audio/voices/minimax-system/${safeObjectName(voice.providerVoiceId)}.${extension}`;
    const publicUrl = `${config.publicBaseUrl}/${key}`;
    resolvedPreviewUrls.set(voice.providerVoiceId, publicUrl);

    if (dryRun || skipUpload || !client) {
      return;
    }

    const audio = await downloadAudio(siteVoice.sample_audio);
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: audio.buffer,
      ContentType: audio.contentType,
      CacheControl: "public, max-age=31536000, immutable"
    }));

    completedUploads += 1;

    if (completedUploads % 25 === 0 || completedUploads === matchedVoices.length) {
      console.log(`uploaded ${completedUploads}/${matchedVoices.length}`);
    }
  });

  const updatedVoices = targetVoices.map((voice) => {
    const siteVoice = byUniqId.get(voice.providerVoiceId);
    const previewAudioUrl = resolvedPreviewUrls.get(voice.providerVoiceId);

    if (!siteVoice?.voice_name || !previewAudioUrl) {
      return voice;
    }

    const { displayName, trait } = parseVoiceName(siteVoice.voice_name);

    return {
      ...voice,
      name: displayName,
      description: `${voice.language} · ${displayName}`,
      trait: trait || voice.trait,
      previewAudioUrl
    };
  });

  if (!dryRun) {
    await writeMinimaxVoiceFile(updatedVoices);
  }

  console.log(JSON.stringify({
    siteTotal: siteVoices.length,
    originalLocalTotal: voices.length,
    localTotal: targetVoices.length,
    added: additionalVoices.length,
    matched: matchedVoices.length,
    uploaded: skipUpload || dryRun ? 0 : completedUploads,
    updated: dryRun ? 0 : resolvedPreviewUrls.size,
    skippedLocal: targetVoices.length - matchedVoices.length,
    publicBaseUrl: config.publicBaseUrl,
    prefix: config.prefix
  }, null, 2));
}

async function fetchAllSiteVoices() {
  const first = await fetchSiteVoicePage(1);
  const voices = [...first.voice_list];
  const pages = Math.ceil(first.total / pageSize);

  for (let page = 2; page <= pages; page += 1) {
    voices.push(...(await fetchSiteVoicePage(page)).voice_list);
  }

  return voices;
}

async function fetchSiteVoicePage(page: number) {
  const response = await fetch(`${siteBaseUrl}/v1/api/audio/voice/list`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      page,
      page_size: pageSize
    })
  });

  if (!response.ok) {
    throw new Error(`MiniMax voice list request failed: HTTP ${response.status}`);
  }

  const payload = await response.json() as {
    data?: {
      total?: number;
      voice_list?: SiteVoice[];
    };
    statusInfo?: {
      code?: number;
      message?: string;
    };
  };

  if (payload.statusInfo?.code !== 0 || !payload.data?.voice_list) {
    throw new Error(`MiniMax voice list response failed: ${payload.statusInfo?.message ?? "unknown error"}`);
  }

  return {
    total: payload.data.total ?? payload.data.voice_list.length,
    voice_list: payload.data.voice_list
  };
}

async function downloadAudio(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Audio download failed: HTTP ${response.status} ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    throw new Error(`Audio download was empty: ${url}`);
  }

  return {
    buffer,
    contentType
  };
}

async function writeMinimaxVoiceFile(voices: readonly MinimaxSystemVoice[]) {
  const current = await import("node:fs/promises").then((fs) => fs.readFile(targetFile, "utf8"));
  const exportMarker = "export const minimaxSystemVoices = ";
  const start = current.indexOf(exportMarker);
  const enrichmentComment = "// Enriched from https://www.minimaxi.com/audio/voices by matching uniq_id to providerVoiceId.\n";

  if (start < 0) {
    throw new Error("Could not find minimaxSystemVoices export");
  }

  const prefix = current.slice(0, start).replaceAll(enrichmentComment, "");
  const next = `${prefix}${enrichmentComment}${exportMarker}${JSON.stringify(voices, null, 2)} as const satisfies readonly MinimaxSystemVoice[];\n`;
  await writeFile(targetFile, next);
}

function parseVoiceName(value: string) {
  const normalized = value.trim();
  const [title, ...rest] = normalized.split(/\s+-\s+/);
  const trait = rest.join(" - ").trim();

  return {
    displayName: normalized,
    trait: trait || title.trim()
  };
}

function siteVoiceToSystemVoice(siteVoice: SiteVoice & { uniq_id: string; voice_name: string }): MinimaxSystemVoice {
  const { displayName, trait } = parseVoiceName(siteVoice.voice_name);
  const language = siteLanguage(siteVoice);

  return {
    id: `sys-minimax-${siteVoice.uniq_id}`,
    providerVoiceId: siteVoice.uniq_id,
    name: displayName,
    type: "SYSTEM",
    targetModel: "speech-2.8-turbo",
    supportedModels: ["speech-2.8-turbo", "speech-2.8-hd"],
    sourceModels: ["speech-2.8-turbo", "speech-2.8-hd"],
    status: "READY",
    visibility: "PUBLIC",
    language,
    languages: [siteLanguageTag(siteVoice)],
    description: siteVoice.description?.trim() || `${language} · ${displayName}`,
    trait,
    scene: siteScene(siteVoice),
    age: siteAge(siteVoice),
    ageCategory: null,
    avatarUrl: null,
    ssmlSupported: false,
    instructSupported: false,
    timestampSupported: false,
    previewAudioUrl: ""
  };
}

function siteLanguage(siteVoice: SiteVoice) {
  const tag = siteVoice.tag_list?.[0] ?? "";

  if (tag.includes("粤语")) {
    return "中文 (粤语)";
  }

  if (tag.includes("中文")) {
    return "中文 (普通话)";
  }

  return tag || "中文 (普通话)";
}

function siteLanguageTag(siteVoice: SiteVoice) {
  const tag = siteVoice.tag_list?.[0] ?? "";

  if (tag.includes("粤语")) {
    return "粤语";
  }

  return "普通话";
}

function siteScene(siteVoice: SiteVoice) {
  return siteVoice.tag_list?.slice(4).join("、") || "MiniMax 中文站系统音色";
}

function siteAge(siteVoice: SiteVoice) {
  return siteVoice.tag_list?.[3] || "未标注";
}

function isExistingR2Preview(previewAudioUrl: string, config: S3Config) {
  const expectedPrefix = `${config.publicBaseUrl}/${config.prefix}audio/voices/minimax-system/`;

  return previewAudioUrl.startsWith(expectedPrefix);
}

function extensionFromUrl(url: string) {
  const extension = new URL(url).pathname.split(".").pop()?.toLowerCase();

  return extension === "wav" ? "wav" : "mp3";
}

function safeObjectName(providerVoiceId: string) {
  const slug = providerVoiceId
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96) || "voice";
  const digest = createHash("sha1").update(providerVoiceId).digest("hex").slice(0, 10);

  return `${slug}-${digest}`;
}

async function runLimited<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    })
  );
}

function s3Config(): S3Config {
  const prefix = (process.env.S3_KEY_PREFIX ?? "uploads/").replace(/^\/+/, "");
  const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL || process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL || "").trim();

  return {
    endpoint: requiredEnv("S3_ENDPOINT"),
    bucket: requiredEnv("S3_BUCKET"),
    region: process.env.S3_REGION || "auto",
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: requiredValue(publicBaseUrl, "S3_PUBLIC_BASE_URL or VIDEO_GUIDE_R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix
  };
}

function requiredEnv(name: string) {
  return requiredValue(process.env[name], name);
}

function requiredValue(value: string | undefined, name: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return normalized;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
