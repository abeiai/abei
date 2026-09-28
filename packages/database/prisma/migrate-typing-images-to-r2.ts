import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPrismaClient } from "../src/index.js";
import {
  assertTypingImageUnitCounts,
  buildTypingImageR2Target,
  inspectTypingImageSource,
  migrateTypingImageRecord,
  normalizeTypingR2KeyPrefix,
  parseTypingImageMigrationArgs,
  typingImageCacheControl,
  typingImageRelativePathFromAsset
} from "./typing-image-r2-migration.js";
import {
  getTypingLibraryConfig,
  typingLibraryConfigList
} from "./typing-library-config.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const projectRoot = resolve(currentDir, "../../..");
const allowedImageRoot = resolve(projectRoot, "uploads/typing-content");
loadEnv({ path: resolve(projectRoot, ".env") });
loadEnv({ path: resolve(packageRoot, ".env") });

async function main() {
  const { apply, book: requestedBook } = parseTypingImageMigrationArgs(process.argv.slice(2));
  const libraryConfigs = requestedBook
    ? [getTypingLibraryConfig(requestedBook)]
    : typingLibraryConfigList;
  const librarySlugs = libraryConfigs.map((config) => config.librarySlug);
  const expectedUnitCounts = libraryConfigs.map((config) => ({
    expectedUnitCounts: config.expectedUnitCounts,
    librarySlug: config.librarySlug
  }));
  const prisma = getPrismaClient();
  const config = r2Config();
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    endpoint: config.endpoint,
    forcePathStyle: config.pathStyle,
    maxAttempts: 5,
    region: config.region
  });

  try {
    const rows = await prisma.englishContentMedia.findMany({
      where: {
        kind: "ILLUSTRATION",
        mediaAssetId: {
          not: null
        },
        status: "READY",
        item: {
          unit: {
            library: {
              slug: {
                in: librarySlugs
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        inputHash: true,
        item: {
          select: {
            text: true,
            unit: {
              select: {
                code: true,
                library: {
                  select: {
                    slug: true,
                    title: true
                  }
                }
              }
            }
          }
        },
        mediaAsset: {
          select: {
            filename: true,
            id: true,
            size: true,
            storageProvider: true,
            url: true
          }
        }
      }
    });

    assertTypingImageUnitCounts({
      expected: expectedUnitCounts,
      rows: rows.map((row) => ({
        librarySlug: row.item.unit.library.slug,
        unitCode: row.item.unit.code
      }))
    });

    const plans = [];
    for (const row of rows) {
      if (!row.mediaAsset) {
        throw new Error(`${row.item.text} 缺少媒体资产`);
      }

      const relativePath = typingImageRelativePathFromAsset(row.mediaAsset);
      const localPath = resolve(projectRoot, relativePath);
      if (!localPath.startsWith(`${allowedImageRoot}/`)) {
        throw new Error(`词汇图片路径超出允许目录：${relativePath}`);
      }

      const body = await readFile(localPath);
      const inspected = inspectTypingImageSource({
        body,
        expectedHash: row.inputHash ?? "",
        expectedSize: row.mediaAsset.size
      });

      plans.push({
        asset: row.mediaAsset,
        expectedHash: inspected.sha256,
        label: `${row.item.unit.library.title} ${row.item.unit.code} ${row.item.text}`,
        localPath,
        size: inspected.size,
        target: buildTypingImageR2Target({
          keyPrefix: config.keyPrefix,
          publicBaseUrl: config.publicBaseUrl,
          relativePath
        })
      });
    }

    console.log(
      `词汇插图 R2 迁移${apply ? "执行" : "预检"}：${plans.length} 张，教材 ${libraryConfigs.map((entry) => entry.assetKey).join(", ")}，并发 ${config.concurrency}`
    );

    if (!apply) {
      console.log(`预检通过；使用 --apply 后将写入 ${config.bucket}/${config.keyPrefix}typing-content/`);
      return;
    }

    const counters = {
      databaseUpdated: 0,
      failed: 0,
      processed: 0,
      reused: 0,
      unchanged: 0,
      uploaded: 0
    };
    const failures: string[] = [];

    await runPool(plans, config.concurrency, async (plan) => {
      try {
        const body = await readFile(plan.localPath);
        const inspected = inspectTypingImageSource({
          body,
          expectedHash: plan.expectedHash,
          expectedSize: plan.size
        });
        const result = await migrateTypingImageRecord({
          currentAsset: plan.asset,
          expectedCacheControl: typingImageCacheControl,
          expectedEtag: inspected.etag,
          expectedSize: inspected.size,
          headObject: (objectKey) => headObject(client, config.bucket, objectKey),
          target: plan.target,
          updateAsset: async (target) => {
            await prisma.mediaAsset.update({
              where: {
                id: plan.asset.id
              },
              data: {
                filename: target.filename,
                size: plan.size,
                storageProvider: "S3",
                url: target.publicUrl
              }
            });
          },
          uploadObject: async (objectKey) => {
            await client.send(new PutObjectCommand({
              Body: body,
              Bucket: config.bucket,
              CacheControl: typingImageCacheControl,
              ContentLength: body.byteLength,
              ContentType: "image/png",
              Key: objectKey
            }));
          }
        });

        counters.uploaded += result.uploaded ? 1 : 0;
        counters.reused += result.uploaded ? 0 : 1;
        counters.databaseUpdated += result.databaseUpdated ? 1 : 0;
        counters.unchanged += result.databaseUpdated ? 0 : 1;
      } catch (error) {
        counters.failed += 1;
        failures.push(`${plan.label}：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        counters.processed += 1;
        if (counters.processed % 50 === 0 || counters.processed === plans.length) {
          console.log(`进度 ${counters.processed}/${plans.length}，上传 ${counters.uploaded}，复用 ${counters.reused}，失败 ${counters.failed}`);
        }
      }
    });

    console.log(
      `迁移完成：处理 ${counters.processed}，上传 ${counters.uploaded}，复用 ${counters.reused}，数据库更新 ${counters.databaseUpdated}，无需更新 ${counters.unchanged}，失败 ${counters.failed}`
    );

    if (failures.length > 0) {
      console.error(failures.slice(0, 30).join("\n"));
      if (failures.length > 30) {
        console.error(`其余失败 ${failures.length - 30} 项未展开`);
      }
      process.exitCode = 1;
    }
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }
}

async function headObject(client: S3Client, bucket: string, objectKey: string) {
  try {
    const response = await client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey
    }));

    return typeof response.ContentLength === "number"
      && typeof response.ETag === "string"
      ? {
          cacheControl: response.CacheControl ?? "",
          etag: response.ETag,
          size: response.ContentLength
        }
      : null;
  } catch (error) {
    const statusCode = typeof error === "object" && error && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;

    if (statusCode === 404) {
      return null;
    }

    throw error;
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}

function r2Config() {
  return {
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    bucket: requiredEnv("S3_BUCKET"),
    concurrency: positiveInteger(process.env.TYPING_IMAGE_R2_CONCURRENCY, 8),
    endpoint: requiredEnv("S3_ENDPOINT").replace(/\/+$/, ""),
    keyPrefix: normalizeTypingR2KeyPrefix(process.env.S3_KEY_PREFIX ?? "uploads/"),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    publicBaseUrl: (
      process.env.S3_PUBLIC_BASE_URL
      || process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL
      || ""
    ).replace(/\/+$/, "") || requiredEnv("S3_PUBLIC_BASE_URL"),
    region: process.env.S3_REGION || "auto",
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY")
  };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`对象存储配置缺失：${name}`);
  }
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
