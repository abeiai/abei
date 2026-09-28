import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { getPrismaClient, type Prisma } from "../src/index.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const defaultS3TimeoutMs = 30 * 60 * 1000;

type TextbookRow = Prisma.LearningMaterialTextbookGetPayload<{
  select: {
    id: true;
    title: true;
    pdfObjectKey: true;
    backupPdfPath: true;
    backupPdfUrl: true;
  };
}>;

type TextbookPdfRow = TextbookRow & {
  pdfObjectKey: string;
};

interface S3Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  pathStyle: boolean;
  region: string;
  secretAccessKey: string;
}

async function main() {
  const prisma = getPrismaClient();
  const config = s3Config();
  const client = s3Client(config);
  const backupDir = textbookBackupDir();
  const limit = positiveInteger(process.env.TEXTBOOK_BACKUP_LIMIT, 0);
  const concurrency = positiveInteger(process.env.TEXTBOOK_BACKUP_CONCURRENCY, 3);
  const overwrite = process.env.TEXTBOOK_BACKUP_OVERWRITE === "1";

  await mkdir(backupDir, { recursive: true });

  try {
    const rows = await prisma.learningMaterialTextbook.findMany({
      where: {
        pdfObjectKey: {
          not: null
        }
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        pdfObjectKey: true,
        backupPdfPath: true,
        backupPdfUrl: true
      },
      ...(limit > 0 ? { take: limit } : {})
    });
    const targets = rows.filter((row): row is TextbookPdfRow => Boolean(row.pdfObjectKey));

    console.log(
      `准备备份教材 PDF：${targets.length} 本，目录 ${backupDir}，并发 ${concurrency}，覆盖现有文件 ${overwrite ? "是" : "否"}`
    );

    let completed = 0;
    let failed = 0;
    let downloaded = 0;
    let reused = 0;

    await runPool(targets, concurrency, async (row) => {
      const current = completed + failed + 1;

      try {
        console.log(`[${current}/${targets.length}] 备份 PDF：${row.title}`);
        const result = await backupOneTextbookPdf(prisma, client, config, row, backupDir, overwrite);

        completed += 1;

        if (result.downloaded) {
          downloaded += 1;
        } else {
          reused += 1;
        }

        console.log(`  ${result.downloaded ? "已下载" : "已复用"} ${formatBytes(result.fileSize)} -> ${result.filePath}`);
      } catch (error) {
        failed += 1;
        console.error(
          `[失败] ${row.title}：${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    console.log(`教材 PDF 本地备份完成：成功 ${completed} 本，下载 ${downloaded} 本，复用 ${reused} 本，失败 ${failed} 本。`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }
}

async function backupOneTextbookPdf(
  prisma: ReturnType<typeof getPrismaClient>,
  client: S3Client,
  config: S3Config,
  row: TextbookPdfRow,
  backupDir: string,
  overwrite: boolean
) {
  const filePath = textbookBackupPdfPath(backupDir, row.id);
  const backupPdfUrl = textbookBackupPdfUrl(row.id);
  let downloaded = false;

  if (overwrite || !(await isUsableFile(filePath))) {
    await downloadS3ObjectToFile(client, config, row.pdfObjectKey, filePath);
    downloaded = true;
  }

  const fileSize = (await stat(filePath)).size;

  await prisma.learningMaterialTextbook.update({
    where: {
      id: row.id
    },
    data: {
      backupPdfPath: filePath,
      backupPdfUrl
    }
  });

  return {
    downloaded,
    filePath,
    fileSize
  };
}

async function downloadS3ObjectToFile(
  client: S3Client,
  config: S3Config,
  objectKey: string,
  filePath: string
) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(dirname(filePath), { recursive: true });

  try {
    const response = await withTimeout(
      client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey
        })
      ),
      s3TimeoutMs(),
      `R2 PDF 下载请求超时：${objectKey}`
    );

    if (!response.Body) {
      throw new Error(`R2 对象为空：${objectKey}`);
    }

    await saveBodyToFile(response.Body, tempPath, objectKey);

    const fileSize = (await stat(tempPath)).size;

    if (fileSize <= 0) {
      throw new Error(`R2 PDF 下载为空：${objectKey}`);
    }

    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function saveBodyToFile(body: unknown, filePath: string, objectKey: string) {
  if (body instanceof Readable) {
    await withTimeout(
      pipeline(body, createWriteStream(filePath)),
      s3TimeoutMs(),
      `R2 PDF 下载流超时：${objectKey}`
    );
    return;
  }

  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };

  if (typeof transformable.transformToByteArray === "function") {
    const bytes = await withTimeout(
      transformable.transformToByteArray(),
      s3TimeoutMs(),
      `R2 PDF 数据转换超时：${objectKey}`
    );

    await writeFile(filePath, bytes);
    return;
  }

  if (body instanceof ReadableStream) {
    const readable = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);

    await withTimeout(
      pipeline(readable, createWriteStream(filePath)),
      s3TimeoutMs(),
      `R2 PDF 下载流超时：${objectKey}`
    );
    return;
  }

  throw new Error("无法读取 R2 对象数据流");
}

async function isUsableFile(filePath: string) {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
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

function textbookBackupDir() {
  return resolve(process.env.TEXTBOOK_BACKUP_DIR ?? resolve(process.cwd(), "../../textbook"));
}

function textbookBackupPdfPath(backupDir: string, textbookId: string) {
  return resolve(backupDir, `${textbookId.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`);
}

function textbookBackupPdfUrl(textbookId: string) {
  const basePath = (process.env.TEXTBOOK_BACKUP_PUBLIC_BASE_PATH ?? "/api/textbooks").replace(/\/+$/, "");

  return `${basePath}/${encodeURIComponent(textbookId)}/backup-pdf`;
}

function s3Client(config: S3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: config.pathStyle,
    maxAttempts: 5
  });
}

function s3Config(): S3Config {
  return {
    endpoint: requiredEnv("S3_ENDPOINT"),
    bucket: requiredEnv("S3_BUCKET"),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    region: process.env.S3_REGION || "auto",
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0"
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`对象存储配置缺失：${name}`);
  }

  return value;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function s3TimeoutMs() {
  return positiveInteger(process.env.TEXTBOOK_BACKUP_S3_TIMEOUT_MS, defaultS3TimeoutMs);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
