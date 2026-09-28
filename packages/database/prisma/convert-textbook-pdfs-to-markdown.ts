import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { config as loadEnv } from "dotenv";
import { getPrismaClient, type Prisma } from "../src/index.js";
import {
  normalizeS3Config,
  uploadTextbookMarkdownToR2,
  type TextbookMarkdownR2Config
} from "./textbook-markdown-r2.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const projectRoot = resolve(currentDir, "../../..");

loadEnv({ path: resolve(projectRoot, ".env") });
loadEnv({ path: resolve(packageRoot, ".env") });

const execFileAsync = promisify(execFile);
const defaultLimit = 3;
const defaultPageImageWidth = 1024;
const defaultConversionTimeoutMs = 45 * 60 * 1000;
const defaultSubprocessTimeoutSeconds = 25 * 60;
const defaultNougatMaxPages = 2;

type TextbookRow = Prisma.LearningMaterialTextbookGetPayload<{
  select: {
    id: true;
    slug: true;
    title: true;
    educationType: true;
    subject: true;
    version: true;
    grade: true;
    volume: true;
    publisher: true;
    backupPdfPath: true;
    markdownContent: true;
    mdObjectKey: true;
  };
}>;

type TextbookPdfRow = TextbookRow & {
  backupPdfPath: string;
};

interface CandidateTextbook {
  fileSize: number;
  textbook: TextbookPdfRow;
}

interface PipelineResult {
  markdownPath: string;
  pageCount: number;
  convertedPageCount: number;
  markdownBytes: number;
  assetDir: string;
  engineVersion: string;
  mineruAssetCount: number;
  paddleFallbackPages: number[];
  nougatStatus: string;
  nougatReason?: string;
}

async function main() {
  const prisma = getPrismaClient();
  const limit = positiveInteger(process.env.TEXTBOOK_MARKDOWN_LIMIT, defaultLimit);
  const overwrite = process.env.TEXTBOOK_MARKDOWN_OVERWRITE === "1";
  const assetDir = textbookMarkdownAssetRoot();
  const pageImageWidth = positiveInteger(process.env.TEXTBOOK_MARKDOWN_PAGE_IMAGE_WIDTH, defaultPageImageWidth);
  const maxPages = positiveInteger(process.env.TEXTBOOK_MARKDOWN_MAX_PAGES, 0);
  const requestedIds = parseIdList(process.env.TEXTBOOK_MARKDOWN_IDS);
  const nougatMaxPages = nonNegativeInteger(process.env.TEXTBOOK_MARKDOWN_NOUGAT_MAX_PAGES, defaultNougatMaxPages);
  const concurrency = positiveInteger(process.env.TEXTBOOK_MARKDOWN_CONCURRENCY, 1);
  const mineruApiUrl = process.env.TEXTBOOK_MARKDOWN_MINERU_API_URL?.trim();
  const mineruFormulaMode = process.env.TEXTBOOK_MARKDOWN_MINERU_FORMULA?.trim() || "true";
  const uploadR2 = process.env.TEXTBOOK_MARKDOWN_UPLOAD_R2 !== "0";

  await mkdir(assetDir, { recursive: true });

  try {
    const targets = await selectTargets(prisma, requestedIds, overwrite, limit);

    console.log(
      [
        `准备转换教材 Markdown 正文：${targets.length} 本`,
        `图片宽度 ${pageImageWidth}px`,
        `资源目录 ${assetDir}`,
        `Nougat增强前 ${nougatMaxPages} 页`,
        `并发 ${concurrency}`,
        `公式识别 ${mineruFormulaMode}`,
        `MinerU API ${mineruApiUrl || "临时本地服务"}`,
        `R2上传 ${uploadR2 ? "开启" : "关闭"}`
      ].join("，")
    );

    let completed = 0;
    let failed = 0;
    let nextIndex = 0;

    const runWorker = async (workerIndex: number) => {
      while (nextIndex < targets.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const target = targets[currentIndex];

        if (!target) {
          continue;
        }

        try {
          console.log(`[${currentIndex + 1}/${targets.length}] Worker ${workerIndex} 转换：${target.title}`);
          const result = await convertOneTextbook(prisma, target, assetDir, pageImageWidth, maxPages, nougatMaxPages, uploadR2);
          completed += 1;
          console.log(
            [
              `  Worker ${workerIndex} 已完成 ${result.convertedPageCount}/${result.pageCount} 页`,
              `Markdown ${formatBytes(result.markdownBytes)}`,
              `MinerU图片 ${result.mineruAssetCount} 张`,
              `PaddleOCR兜底 ${result.paddleFallbackPages.length} 页`,
              `Nougat ${result.nougatStatus}`,
              `累计成功 ${completed} 本`
            ].join("，")
          );
        } catch (error) {
          failed += 1;
          console.error(`[失败] Worker ${workerIndex} ${target.title}：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    const workerCount = Math.min(concurrency, Math.max(targets.length, 1));
    await Promise.all(Array.from({ length: workerCount }, (_, index) => runWorker(index + 1)));

    console.log(`教材 Markdown 样本转换完成：成功 ${completed} 本，失败 ${failed} 本。`);

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
  const rows = await prisma.learningMaterialTextbook.findMany({
    where: {
      backupPdfPath: {
        not: null
      },
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
              markdownContent: null
            })
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      educationType: true,
      subject: true,
      version: true,
      grade: true,
      volume: true,
      publisher: true,
      backupPdfPath: true,
      markdownContent: true,
      mdObjectKey: true
    }
  });
  const candidates: CandidateTextbook[] = [];

  for (const row of rows) {
    if (!row.backupPdfPath) {
      continue;
    }

    const file = await stat(row.backupPdfPath).catch(() => null);

    if (!file?.isFile() || file.size <= 0) {
      continue;
    }

    candidates.push({
      fileSize: file.size,
      textbook: row as TextbookPdfRow
    });
  }

  candidates.sort((a, b) => a.fileSize - b.fileSize);

  return candidates.slice(0, requestedIds.length > 0 ? candidates.length : limit).map((candidate) => candidate.textbook);
}

async function convertOneTextbook(
  prisma: ReturnType<typeof getPrismaClient>,
  textbook: TextbookPdfRow,
  assetRoot: string,
  pageImageWidth: number,
  maxPages: number,
  nougatMaxPages: number,
  uploadR2: boolean
) {
  const pdfPath = resolve(textbook.backupPdfPath);
  const assetDir = join(assetRoot, safeName(textbook.id));
  const assetBaseUrl = textbookMarkdownAssetBaseUrl(textbook.id);

  await mkdir(assetDir, { recursive: true });
  await prisma.learningMaterialTextbook.update({
    where: {
      id: textbook.id
    },
    data: {
      markdownConversionError: null,
      markdownConversionStatus: "PROCESSING"
    }
  });

  try {
    const result = await runPipeline(textbook, pdfPath, assetDir, assetBaseUrl, pageImageWidth, maxPages, nougatMaxPages);
    let markdownContent = await readFile(result.markdownPath, "utf8");
    let r2Upload: Awaited<ReturnType<typeof uploadTextbookMarkdownToR2>> | null = null;
    let r2Config: TextbookMarkdownR2Config | null = null;

    if (uploadR2) {
      r2Config = textbookMarkdownR2Config();
      r2Upload = await uploadTextbookMarkdownToR2({
        assetBaseUrl,
        assetDir: result.assetDir,
        config: r2Config,
        markdownContent,
        slug: textbook.slug,
        textbookId: textbook.id
      });
      markdownContent = r2Upload.markdownContent;
    }

    await prisma.learningMaterialTextbook.update({
      where: {
        id: textbook.id
      },
      data: {
        markdownAssetBaseUrl: r2Upload?.assetBaseUrl ?? assetBaseUrl,
        markdownAssetsPath: result.assetDir,
        markdownContent,
        markdownConversionError: null,
        markdownConversionStatus: "READY",
        markdownConvertedAt: new Date(),
        markdownPageCount: result.pageCount,
        ...(r2Upload
          ? {
              mdObjectKey: r2Upload.markdownObjectKey,
              mdUrl: null
            }
          : {})
      }
    });

    if (r2Upload) {
      console.log(`  R2 已上传 Markdown 1 个、图片资源 ${r2Upload.uploadedAssetCount} 个 -> ${r2Upload.markdownObjectKey}`);
    }

    return result;
  } catch (error) {
    await prisma.learningMaterialTextbook.update({
      where: {
        id: textbook.id
      },
      data: {
        markdownConversionError: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
        markdownConversionStatus: "FAILED"
      }
    });
    throw error;
  }
}

async function runPipeline(
  textbook: TextbookPdfRow,
  pdfPath: string,
  assetDir: string,
  assetBaseUrl: string,
  pageImageWidth: number,
  maxPages: number,
  nougatMaxPages: number
) {
  const pythonBin = resolve(process.env.TEXTBOOK_MARKDOWN_PYTHON_BIN ?? resolve(projectRoot, ".venv-textbook-md/bin/python"));
  const pipelineScript = resolve(currentDir, "textbook_pdf_to_markdown_pipeline.py");
  const workDir = await mkdtemp(join(tmpdir(), `xueleai-textbook-md-${safeName(textbook.id)}-`));
  const requestPath = join(workDir, "request.json");
  const outputMarkdownPath = join(workDir, "textbook.md");
  const modelCacheDir = resolve(process.env.TEXTBOOK_MARKDOWN_MODEL_CACHE_DIR ?? resolve(projectRoot, ".model-cache"));
  const subprocessTimeout = positiveInteger(
    process.env.TEXTBOOK_MARKDOWN_SUBPROCESS_TIMEOUT_SECONDS,
    defaultSubprocessTimeoutSeconds
  );

  await writeFile(
    requestPath,
    JSON.stringify(
      {
        assetBaseUrl,
        assetDir,
        educationType: textbook.educationType,
        grade: textbook.grade,
        maxPages,
        mineruMethod: process.env.TEXTBOOK_MARKDOWN_MINERU_METHOD ?? "ocr",
        modelCacheDir,
        nougatMaxPages,
        outputMarkdownPath,
        pageImageWidth,
        pdfPath,
        publisher: textbook.publisher,
        slug: textbook.slug,
        subject: textbook.subject,
        subprocessTimeout,
        textbookId: textbook.id,
        title: textbook.title,
        version: textbook.version,
        volume: textbook.volume
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout, stderr } = await execFileAsync(pythonBin, [pipelineScript, requestPath], {
    env: {
      ...process.env,
      HF_HOME: join(modelCacheDir, "huggingface"),
      HOME: modelCacheDir,
      NLTK_DATA: join(modelCacheDir, "nltk_data"),
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
      XDG_CACHE_HOME: modelCacheDir
    },
    maxBuffer: 64 * 1024 * 1024,
    timeout: positiveInteger(process.env.TEXTBOOK_MARKDOWN_CONVERSION_TIMEOUT_MS, defaultConversionTimeoutMs)
  });

  if (stderr.trim() && process.env.TEXTBOOK_MARKDOWN_VERBOSE === "1") {
    console.error(stderr.trim().split("\n").slice(-30).join("\n"));
  }

  const line = stdout
    .trim()
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);

  if (!line) {
    throw new Error("Markdown 转换器未返回结果");
  }

  return JSON.parse(line) as PipelineResult;
}

function textbookMarkdownAssetRoot() {
  return resolve(process.env.TEXTBOOK_MARKDOWN_ASSET_DIR ?? resolve(projectRoot, "textbook-markdown-assets"));
}

function textbookMarkdownAssetBaseUrl(textbookId: string) {
  const basePath = (process.env.TEXTBOOK_MARKDOWN_ASSET_PUBLIC_BASE_PATH ?? "/api/public/textbooks").replace(/\/+$/, "");

  return `${basePath}/${encodeURIComponent(textbookId)}/markdown-assets`;
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

function textbookCdnBaseUrl() {
  return process.env.TEXTBOOK_CDN_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "https://cdn.xueleai.com";
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
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

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value}B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`对象存储配置缺失：${name}`);
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
