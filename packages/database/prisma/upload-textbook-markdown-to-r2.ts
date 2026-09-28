import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient, type Prisma } from "../src/index.js";
import {
  normalizeS3Config,
  uploadTextbookMarkdownToR2,
  type TextbookMarkdownR2Config
} from "./textbook-markdown-r2.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const projectRoot = resolve(currentDir, "../../..");
const defaultLimit = 20;

loadEnv({ path: resolve(projectRoot, ".env") });
loadEnv({ path: resolve(packageRoot, ".env") });

type TextbookMarkdownRow = Prisma.LearningMaterialTextbookGetPayload<{
  select: {
    id: true;
    slug: true;
    title: true;
    markdownAssetBaseUrl: true;
    markdownAssetsPath: true;
    markdownContent: true;
    markdownConversionStatus: true;
    mdObjectKey: true;
  };
}>;

async function main() {
  const prisma = getPrismaClient();
  const limit = positiveInteger(process.env.TEXTBOOK_MARKDOWN_R2_LIMIT, defaultLimit);
  const overwrite = process.env.TEXTBOOK_MARKDOWN_R2_OVERWRITE === "1";
  const requestedIds = parseIdList(process.env.TEXTBOOK_MARKDOWN_R2_IDS);
  const concurrency = positiveInteger(process.env.TEXTBOOK_MARKDOWN_R2_CONCURRENCY, 1);
  const assetConcurrency = positiveInteger(process.env.TEXTBOOK_MARKDOWN_R2_ASSET_CONCURRENCY, 8);
  const config = textbookMarkdownR2Config();

  try {
    const targets = await selectTargets(prisma, requestedIds, overwrite, limit);

    console.log(
      `准备上传既有 Markdown 到 R2：${targets.length} 本，覆盖 ${overwrite ? "是" : "否"}，并发 ${concurrency}，图片并发 ${assetConcurrency}，前缀 ${config.prefix}`
    );

    let completed = 0;
    let failed = 0;

    await runPool(targets, concurrency, async (textbook, index) => {
      try {
        console.log(`[${index + 1}/${targets.length}] 上传：${textbook.title}`);
        const assetBaseUrl = markdownAssetBaseUrlForUpload(textbook.id, textbook.markdownAssetBaseUrl, config);
        const markdownContent = replaceAssetBaseUrl(textbook.markdownContent ?? "", textbook.markdownAssetBaseUrl, assetBaseUrl);

        const upload = await uploadTextbookMarkdownToR2({
          assetUploadConcurrency: assetConcurrency,
          assetBaseUrl,
          assetDir: textbook.markdownAssetsPath,
          config,
          markdownContent,
          slug: textbook.slug,
          textbookId: textbook.id
        });

        await prisma.learningMaterialTextbook.update({
          where: {
            id: textbook.id
          },
          data: {
            markdownAssetBaseUrl: upload.assetBaseUrl,
            markdownContent: upload.markdownContent,
            mdObjectKey: upload.markdownObjectKey,
            mdUrl: null
          }
        });

        completed += 1;
        console.log(`  已上传 Markdown 1 个、图片资源 ${upload.uploadedAssetCount} 个 -> ${upload.markdownObjectKey}`);
      } catch (error) {
        failed += 1;
        console.error(`[失败] ${textbook.title}：${error instanceof Error ? error.message : String(error)}`);
      }
    });

    console.log(`既有 Markdown 上传 R2 完成：成功 ${completed} 本，失败 ${failed} 本。`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function selectTargets(
  prisma: ReturnType<typeof getPrismaClient>,
  requestedIds: string[],
  overwrite: boolean,
  limit: number
) {
  return await prisma.learningMaterialTextbook.findMany({
    where: {
      markdownContent: {
        not: null
      },
      markdownConversionStatus: "READY",
      ...(requestedIds.length > 0
        ? {
            OR: requestedIds.flatMap((value) => [
              {
                id: value
              },
              {
                slug: value
              }
            ])
          }
        : overwrite
          ? {}
          : {
              mdObjectKey: null
            })
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      markdownAssetBaseUrl: true,
      markdownAssetsPath: true,
      markdownContent: true,
      markdownConversionStatus: true,
      mdObjectKey: true
    },
    ...(requestedIds.length > 0 ? {} : { take: limit })
  }) as Promise<TextbookMarkdownRow[]>;
}

function textbookMarkdownR2Config(): TextbookMarkdownR2Config {
  return normalizeS3Config({
    endpoint: requiredEnv("S3_ENDPOINT"),
    bucket: requiredEnv("S3_BUCKET"),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    region: process.env.S3_REGION || "auto",
    publicBaseUrl: textbookCdnBaseUrl(),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: process.env.TEXTBOOK_S3_KEY_PREFIX ?? "learning-materials/textbooks/"
  });
}

function parseIdList(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function markdownAssetBaseUrlForUpload(
  textbookId: string,
  currentBaseUrl: null | string,
  config: TextbookMarkdownR2Config
) {
  if (config.publicBaseUrl && currentBaseUrl) {
    return currentBaseUrl;
  }

  if (currentBaseUrl && !isPrivateR2Url(currentBaseUrl) && !isLocalUrl(currentBaseUrl)) {
    return currentBaseUrl;
  }

  return textbookMarkdownAssetBaseUrl(textbookId);
}

function textbookMarkdownAssetBaseUrl(textbookId: string) {
  const basePath = (process.env.TEXTBOOK_MARKDOWN_ASSET_PUBLIC_BASE_PATH ?? "/api/public/textbooks").replace(/\/+$/, "");

  return `${basePath}/${encodeURIComponent(textbookId)}/markdown-assets`;
}

function replaceAssetBaseUrl(content: string, fromBaseUrl: null | string, toBaseUrl: string) {
  const from = fromBaseUrl?.replace(/\/+$/, "");

  if (!from || from === toBaseUrl) {
    return content;
  }

  return content.split(from).join(toBaseUrl);
}

function isPrivateR2Url(value: string) {
  try {
    const { hostname } = new URL(value);

    return hostname.endsWith(".r2.cloudflarestorage.com") || hostname === "r2.cloudflarestorage.com";
  } catch {
    return false;
  }
}

function isLocalUrl(value: string) {
  try {
    const { hostname } = new URL(value);

    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      const item = items[index];
      cursor += 1;
      await worker(item, index);
    }
  });

  await Promise.all(workers);
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`对象存储配置缺失：${name}`);
  }

  return value;
}

function textbookCdnBaseUrl() {
  return process.env.TEXTBOOK_CDN_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "https://cdn.xueleai.com";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
