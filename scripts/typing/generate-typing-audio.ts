import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mediaInputHash,
  typingMediaRelativePath
} from "./typing-media-manifest.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface TypingAudioRequest {
  apiKey: string;
  baseUrl: string;
  gatewayUrl: string;
  model: string;
  region: string | null;
  text: string;
  voice: string;
  webSocketUrl: string | null;
}

export async function requestTypingAudio(input: TypingAudioRequest) {
  const endpoint = `${input.gatewayUrl.replace(/\/+$/u, "")}/audio/tts`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      adapterType: "DASHSCOPE_AUDIO",
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      format: "mp3",
      model: input.model,
      providerKey: "aliyun_dashscope_audio",
      region: input.region,
      sampleRate: 24000,
      speed: 1,
      text: input.text,
      timeoutMs: 45000,
      voice: input.voice,
      webSocketUrl: input.webSocketUrl
    }),
    signal: AbortSignal.timeout(60_000)
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;

  if (!response.ok) {
    const detail = recordValue(payload?.detail);
    const message = stringValue(detail?.errorMessage)
      ?? stringValue(payload?.message)
      ?? `HTTP ${response.status}`;
    throw new Error(`英式发音生成失败：${message}`);
  }

  const encoded = stringValue(payload?.audioBase64);
  if (encoded) {
    const base64 = encoded.includes(",") ? encoded.slice(encoded.indexOf(",") + 1) : encoded;
    const audio = Buffer.from(base64, "base64");

    if (audio.length === 0) {
      throw new Error("英式发音生成失败：服务返回空音频");
    }

    return audio;
  }

  const audioUrl = stringValue(payload?.audioUrl);
  if (!audioUrl) {
    throw new Error("英式发音生成失败：服务未返回音频数据");
  }

  const audioResponse = await fetch(audioUrl, {
    signal: AbortSignal.timeout(60_000)
  });

  if (!audioResponse.ok) {
    throw new Error(`英式发音下载失败：HTTP ${audioResponse.status}`);
  }

  const audio = Buffer.from(await audioResponse.arrayBuffer());
  if (audio.length === 0) {
    throw new Error("英式发音下载失败：音频文件为空");
  }

  return audio;
}

async function generateTypingAudio() {
  const args = process.argv.slice(2);
  const unitNumber = integerArg(args, "--unit") ?? 1;
  const bookKey = stringArg(args, "--book") ?? "7a";
  const force = args.includes("--force");
  const modelName = "cosyvoice-v3-flash";
  const voice = "loongemily_v3";
  const gatewayUrl = process.env.AI_GATEWAY_URL?.trim() || "http://127.0.0.1:3323";
  const { decryptSecret, getPrismaClient } = await import("../../packages/database/src/index.js");
  const { getYilinTypingLibraryConfig } = await import("../../packages/database/prisma/yilin-typing-library-config.js");
  const libraryConfig = getYilinTypingLibraryConfig(bookKey);
  const prisma = getPrismaClient();

  try {
    const model = await prisma.aiModelInstance.findFirst({
      where: {
        providerModelName: modelName,
        isEnabled: true,
        providerInstance: {
          status: "ENABLED",
          providerPreset: {
            adapterType: "DASHSCOPE_AUDIO",
            modality: "AUDIO"
          }
        }
      },
      include: {
        providerInstance: {
          include: {
            credential: true,
            providerPreset: true
          }
        }
      }
    });

    if (!model) {
      throw new Error("未找到已启用的 cosyvoice-v3-flash 语音模型");
    }

    const encryptedApiKey = model.apiKeyEncrypted ?? model.providerInstance.credential?.apiKeyEncrypted;
    const environmentApiKey = process.env[model.providerInstance.providerPreset.apiKeyEnvName]?.trim();
    const apiKey = encryptedApiKey ? decryptSecret(encryptedApiKey) : environmentApiKey;

    if (!apiKey) {
      throw new Error("阿里云百炼语音凭据未配置");
    }

    const unit = await prisma.englishContentUnit.findFirst({
      where: {
        code: `unit-${String(unitNumber).padStart(2, "0")}`,
        library: {
          slug: libraryConfig.librarySlug
        }
      },
      include: {
        items: {
          orderBy: {
            sourceOrder: "asc"
          },
          include: {
            media: true
          }
        }
      }
    });

    if (!unit) {
      throw new Error(`未找到 Unit ${unitNumber} 内容`);
    }

    let generated = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const item of unit.items) {
      const slot = item.media.find((entry) => entry.kind === "BRITISH_PRONUNCIATION");
      if (!slot) {
        throw new Error(`${item.text} 缺少英式发音媒体槽位`);
      }

      const relativePath = typingMediaRelativePath(
        item,
        unitNumber,
        "BRITISH_PRONUNCIATION",
        libraryConfig.assetKey
      );
      const absolutePath = resolve(projectRoot, relativePath);

      if (!force && await fileExists(absolutePath)) {
        skipped += 1;
        continue;
      }

      try {
        await prisma.englishContentMedia.update({
          where: {
            id: slot.id
          },
          data: {
            status: "PROCESSING",
            errorMessage: null
          }
        });
        const audio = await requestTypingAudio({
          apiKey,
          baseUrl: model.baseUrl || model.providerInstance.baseUrl,
          gatewayUrl,
          model: modelName,
          region: model.region ?? model.providerInstance.region,
          text: item.text,
          voice,
          webSocketUrl: model.webSocketUrl ?? model.providerInstance.webSocketUrl
        });
        await mkdir(dirname(absolutePath), { recursive: true });
        const partialPath = `${absolutePath}.part`;
        await writeFile(partialPath, audio);
        await rename(partialPath, absolutePath);
        await prisma.englishContentMedia.update({
          where: {
            id: slot.id
          },
          data: {
            status: "PENDING",
            generatorProvider: "aliyun-dashscope",
            generatorModel: modelName,
            voice,
            inputHash: mediaInputHash(`${item.text}\n${modelName}\n${voice}`),
            errorMessage: null
          }
        });
        generated += 1;
        console.log(`${item.sourceOrder}/${unit.items.length} ${item.text}：已生成`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "英式发音生成失败";
        failures.push(`${item.sourceOrder}. ${item.text}：${message}`);
        await prisma.englishContentMedia.update({
          where: {
            id: slot.id
          },
          data: {
            status: "FAILED",
            errorMessage: message
          }
        });
      }
    }

    console.log(`Unit ${unitNumber} 英式发音生成结束：新增 ${generated}，跳过 ${skipped}，失败 ${failures.length}`);
    if (failures.length > 0) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function integerArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? Number.parseInt(argv[index + 1] ?? "", 10) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function stringArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1]?.trim().toLocaleLowerCase("en-GB") : "";
  return value || null;
}

if (process.argv[1]?.endsWith("generate-typing-audio.ts")) {
  generateTypingAudio().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "英式发音生成失败");
    process.exitCode = 1;
  });
}
