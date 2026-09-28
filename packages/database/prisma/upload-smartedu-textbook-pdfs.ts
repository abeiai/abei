import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config as loadEnv } from "dotenv";
import { getPrismaClient, type Prisma } from "../src/index.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const smartEduBaseUrl = "https://bdcs-file-2.ykt.cbern.com.cn/zxx_secondary";
const detailBaseUrl = `${smartEduBaseUrl}/ndrv2/resources/tch_material/details`;
const smartEduSlugPrefix = "smartedu-";
const defaultDownloadTimeoutMs = 30 * 60 * 1000;

type TextbookRow = Prisma.LearningMaterialTextbookGetPayload<{
  select: {
    id: true;
    slug: true;
    title: true;
    pdfObjectKey: true;
  };
}>;

interface SmartEduTiItem {
  ti_file_flag?: string;
  ti_format?: string;
  ti_size?: number;
  ti_storage?: string;
  ti_storages?: string[];
}

interface SmartEduDetail {
  id: string;
  ti_items?: SmartEduTiItem[];
}

interface DownloadedPdf {
  filePath: string;
  sha256: string;
  size: number;
}

interface S3Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  pathStyle: boolean;
  prefix: string;
  publicBaseUrl?: string;
  region: string;
  secretAccessKey: string;
}

async function main() {
  const prisma = getPrismaClient();
  const tempDir = await mkdtemp(join(tmpdir(), "xueleai-smartedu-pdfs-"));
  const limit = positiveInteger(process.env.TEXTBOOK_PDF_IMPORT_LIMIT, 0);
  const concurrency = positiveInteger(process.env.TEXTBOOK_PDF_IMPORT_CONCURRENCY, 1);
  const reupload = process.env.TEXTBOOK_PDF_IMPORT_REUPLOAD === "1";

  try {
    const rows = await prisma.learningMaterialTextbook.findMany({
      where: {
        slug: {
          startsWith: smartEduSlugPrefix
        },
        ...(reupload
          ? {}
          : {
              pdfObjectKey: null
            })
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        pdfObjectKey: true
      },
      ...(limit > 0 ? { take: limit } : {})
    });

    const targets = rows
      .map((row) => ({
        resourceId: smartEduResourceId(row.slug),
        row
      }))
      .filter((item): item is { resourceId: string; row: TextbookRow } => Boolean(item.resourceId));

    console.log(
      `准备上传 SmartEdu 教材 PDF：${targets.length} 本，并发 ${concurrency}，临时目录 ${tempDir}`
    );

    let completed = 0;
    let failed = 0;

    await runPool(targets, concurrency, async ({ resourceId, row }) => {
      const current = completed + failed + 1;

      try {
        console.log(`[${current}/${targets.length}] 下载并上传：${row.title}`);
        await uploadOneTextbookPdf(prisma, row, resourceId, tempDir);
        completed += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[失败] ${row.title}：${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    console.log(`SmartEdu PDF 上传完成：成功 ${completed} 本，失败 ${failed} 本。`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function uploadOneTextbookPdf(
  prisma: ReturnType<typeof getPrismaClient>,
  row: TextbookRow,
  resourceId: string,
  tempDir: string
) {
  const detail = await fetchJson<SmartEduDetail>(`${detailBaseUrl}/${resourceId}.json`);
  const pdfItem = findPdfItem(detail);

  if (!pdfItem) {
    throw new Error("SmartEdu 详情中没有 PDF 文件");
  }

  const pdfUrls = pdfItem.ti_storages?.filter(Boolean) ?? [];

  if (!pdfUrls.length) {
    throw new Error("SmartEdu 详情中没有 PDF 存储地址");
  }

  const download = await downloadFirstAvailablePdf(pdfUrls, pdfItem.ti_size, tempDir, resourceId);
  const objectKey = textbookPdfObjectKey(resourceId);

  try {
    const pdfUrl = await putS3ObjectFromFile(objectKey, download);

    await prisma.learningMaterialTextbook.update({
      where: {
        id: row.id
      },
      data: {
        pdfObjectKey: objectKey,
        pdfUrl
      }
    });

    console.log(`  已上传 ${formatBytes(download.size)} -> ${objectKey}`);
  } finally {
    await unlink(download.filePath).catch(() => undefined);
  }
}

function findPdfItem(detail: SmartEduDetail) {
  return detail.ti_items?.find((item) => item.ti_format === "pdf") ??
    detail.ti_items?.find((item) => item.ti_file_flag === "source" && item.ti_format === "pdf");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "xueleai-smartedu-pdf-import/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`读取 SmartEdu 详情失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function downloadFirstAvailablePdf(
  urls: string[],
  expectedSize: number | undefined,
  tempDir: string,
  resourceId: string
) {
  let lastError: unknown;

  for (const url of urls) {
    try {
      return await downloadPdfWithRetry(url, expectedSize, tempDir, resourceId);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("PDF 下载失败");
}

async function downloadPdfWithRetry(
  url: string,
  expectedSize: number | undefined,
  tempDir: string,
  resourceId: string
) {
  const maxAttempts = positiveInteger(process.env.TEXTBOOK_PDF_DOWNLOAD_RETRIES, 3);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await downloadPdf(url, expectedSize, tempDir, resourceId);
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetryDownloadError(error)) {
        throw error;
      }

      console.warn(
        `  PDF 下载重试 ${attempt}/${maxAttempts - 1}：${error instanceof Error ? error.message : String(error)}`
      );
      await wait(attempt * 2000 + Math.floor(Math.random() * 1000));
    }
  }

  throw new Error("PDF 下载失败");
}

async function downloadPdf(
  url: string,
  expectedSize: number | undefined,
  tempDir: string,
  resourceId: string
): Promise<DownloadedPdf> {
  const filePath = join(tempDir, `${resourceId}.pdf`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), downloadTimeoutMs());

  try {
    const response = await fetch(smartEduPdfUrl(url), {
      headers: {
        accept: "application/pdf",
        ...smartEduPdfAuthHeaders(),
        "user-agent": "xueleai-smartedu-pdf-import/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`PDF 下载失败：${response.status} ${response.statusText}`);
    }

    const hash = createHash("sha256");
    let size = 0;
    const checksum = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      }
    });

    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      checksum,
      createWriteStream(filePath)
    );

    if (expectedSize && size !== expectedSize) {
      throw new Error(`PDF 大小不一致：期望 ${expectedSize} 字节，实际 ${size} 字节`);
    }

    return {
      filePath,
      sha256: hash.digest("hex"),
      size
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function putS3ObjectFromFile(objectKey: string, file: DownloadedPdf) {
  const config = s3Config();
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: config.pathStyle,
    maxAttempts: 5
  });

  const fileBuffer = await readFileBuffer(file.filePath);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: "application/pdf",
        ContentLength: file.size
      })
    );

    return config.publicBaseUrl
      ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`
      : s3ObjectUrl(config, objectKey);
  } finally {
    client.destroy();
  }
}

async function readFileBuffer(filePath: string): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  return await readFile(filePath);
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

function textbookPdfObjectKey(resourceId: string) {
  const config = s3Config();

  return `${config.prefix}smartedu-pdfs/${resourceId}.pdf`;
}

function s3ObjectUrl(config: S3Config, objectKey: string) {
  const endpoint = config.endpoint.replace(/\/+$/, "");

  return config.pathStyle
    ? `${endpoint}/${config.bucket}/${objectKey}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${objectKey}`;
}

function s3Config(): S3Config {
  const prefixInput = (process.env.TEXTBOOK_S3_KEY_PREFIX ?? "learning-materials/textbooks/").replace(/^\/+/, "");

  return {
    endpoint: requiredEnv("S3_ENDPOINT"),
    bucket: requiredEnv("S3_BUCKET"),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    region: process.env.S3_REGION || "auto",
    publicBaseUrl: textbookCdnBaseUrl(),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput
  };
}

function textbookCdnBaseUrl() {
  return process.env.TEXTBOOK_CDN_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "https://cdn.xueleai.com";
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`对象存储配置缺失：${name}`);
  }

  return value;
}

function smartEduResourceId(slug: string) {
  return slug.startsWith(smartEduSlugPrefix) ? slug.slice(smartEduSlugPrefix.length) : "";
}

function normalizeUrl(value: string) {
  return new URL(value).href;
}

function smartEduPdfUrl(value: string) {
  const url = new URL(normalizeUrl(value));
  const accessToken = process.env.SMARTEDU_ACCESS_TOKEN?.trim();

  if (accessToken && !url.searchParams.has("accessToken")) {
    url.searchParams.set("accessToken", accessToken);
  }

  return url.href;
}

function smartEduPdfAuthHeaders() {
  const accessToken = process.env.SMARTEDU_ACCESS_TOKEN?.trim();

  return accessToken ? { "X-ND-AUTH": accessToken } : {};
}

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function downloadTimeoutMs() {
  return positiveInteger(process.env.TEXTBOOK_PDF_IMPORT_DOWNLOAD_TIMEOUT_MS, defaultDownloadTimeoutMs);
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function shouldRetryDownloadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|5\d\d/i.test(error.message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
