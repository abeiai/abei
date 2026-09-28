import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { getPrismaClient, type Prisma } from "../src/index.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const execFileAsync = promisify(execFile);
const defaultCoverWidth = 1024;
const defaultRenderTimeoutMs = 120 * 1000;
const defaultS3TimeoutMs = 10 * 60 * 1000;

type Renderer = "pdftoppm" | "mutool" | "quicklook";

type TextbookRow = Prisma.LearningMaterialTextbookGetPayload<{
  select: {
    id: true;
    slug: true;
    title: true;
    coverUrl: true;
    pdfObjectKey: true;
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
  prefix: string;
  publicBaseUrl?: string;
  region: string;
  secretAccessKey: string;
}

interface RenderedCover {
  contentType: string;
  extension: string;
  filePath: string;
}

async function main() {
  const prisma = getPrismaClient();
  const tempDir = await mkdtemp(join(tmpdir(), "xueleai-textbook-covers-"));
  const config = s3Config();
  const client = s3Client(config);
  const renderer = await detectRenderer();
  const limit = positiveInteger(process.env.TEXTBOOK_COVER_IMPORT_LIMIT, 0);
  const concurrency = positiveInteger(process.env.TEXTBOOK_COVER_IMPORT_CONCURRENCY, 1);
  const coverWidth = positiveInteger(process.env.TEXTBOOK_COVER_WIDTH, defaultCoverWidth);
  const overwrite = process.env.TEXTBOOK_COVER_OVERWRITE !== "0";
  const skipGenerated = process.env.TEXTBOOK_COVER_SKIP_GENERATED === "1";

  try {
    const rows = await prisma.learningMaterialTextbook.findMany({
      where: {
        pdfObjectKey: {
          not: null
        },
        ...(overwrite
          ? {}
          : {
              coverUrl: null
            })
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        coverUrl: true,
        pdfObjectKey: true
      },
      ...(limit > 0 ? { take: limit } : {})
    });

    const targets = rows
      .filter((row): row is TextbookPdfRow => Boolean(row.pdfObjectKey))
      .filter((row) => !skipGenerated || !isGeneratedCoverUrl(config, row.coverUrl));
    const skipped = rows.length - targets.length;

    console.log(
      `准备生成教材封面：${targets.length} 本，宽度 ${coverWidth}px，并发 ${concurrency}，渲染器 ${renderer}，覆盖现有封面 ${overwrite ? "是" : "否"}，跳过已生成 ${skipGenerated ? `${skipped} 本` : "否"}`
    );
    console.log(`临时目录：${tempDir}`);

    let completed = 0;
    let failed = 0;

    await runPool(targets, concurrency, async (row) => {
      const current = completed + failed + 1;

      try {
        console.log(`[${current}/${targets.length}] 生成封面：${row.title}`);
        await generateOneTextbookCover(prisma, client, config, row, tempDir, renderer, coverWidth);
        completed += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[失败] ${row.title}：${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    console.log(`教材封面生成完成：成功 ${completed} 本，失败 ${failed} 本。`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.destroy();
    await prisma.$disconnect();
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function generateOneTextbookCover(
  prisma: ReturnType<typeof getPrismaClient>,
  client: S3Client,
  config: S3Config,
  row: TextbookPdfRow,
  tempDir: string,
  renderer: Renderer,
  coverWidth: number
) {
  const baseName = row.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const pdfPath = join(tempDir, `${baseName}.pdf`);
  const coverBase = join(tempDir, `${baseName}-cover`);
  let renderedCover: RenderedCover | null = null;

  try {
    await downloadS3ObjectToFile(client, config, row.pdfObjectKey, pdfPath);
    renderedCover = await renderPdfFirstPage(pdfPath, coverBase, renderer, coverWidth);

    const objectKey = textbookCoverObjectKey(row.id, renderedCover.extension);
    const coverUrl = await putS3ObjectFromFile(
      client,
      config,
      objectKey,
      renderedCover.filePath,
      renderedCover.contentType
    );

    await prisma.learningMaterialTextbook.update({
      where: {
        id: row.id
      },
      data: {
        coverUrl
      }
    });

    const fileSize = (await stat(renderedCover.filePath)).size;
    console.log(`  已上传 ${formatBytes(fileSize)} -> ${objectKey}`);
  } finally {
    await unlink(pdfPath).catch(() => undefined);

    if (renderedCover) {
      await unlink(renderedCover.filePath).catch(() => undefined);
    }
  }
}

async function downloadS3ObjectToFile(
  client: S3Client,
  config: S3Config,
  objectKey: string,
  filePath: string
) {
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

  await saveBodyToFile(response.Body, filePath, objectKey);

  const fileSize = (await stat(filePath)).size;

  if (fileSize <= 0) {
    throw new Error(`R2 PDF 下载为空：${objectKey}`);
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

async function renderPdfFirstPage(
  pdfPath: string,
  outputBase: string,
  renderer: Renderer,
  coverWidth: number
): Promise<RenderedCover> {
  if (renderer === "pdftoppm") {
    const filePath = `${outputBase}.jpg`;

    await execFileAsync(
      "pdftoppm",
      [
        "-jpeg",
        "-singlefile",
        "-f",
        "1",
        "-l",
        "1",
        "-scale-to-x",
        String(coverWidth),
        "-scale-to-y",
        "-1",
        pdfPath,
        outputBase
      ],
      { timeout: renderTimeoutMs() }
    );
    await ensureImageFile(filePath, coverWidth);

    return {
      contentType: "image/jpeg",
      extension: "jpg",
      filePath
    };
  }

  if (renderer === "mutool") {
    const filePath = `${outputBase}.png`;

    await execFileAsync(
      "mutool",
      ["draw", "-F", "png", "-o", filePath, "-w", String(coverWidth), pdfPath, "1"],
      { timeout: renderTimeoutMs() }
    );
    await ensureImageFile(filePath, coverWidth);

    return {
      contentType: "image/png",
      extension: "png",
      filePath
    };
  }

  return await renderWithQuickLook(pdfPath, outputBase, coverWidth);
}

async function renderWithQuickLook(
  pdfPath: string,
  outputBase: string,
  coverWidth: number
): Promise<RenderedCover> {
  const quickLookDir = `${outputBase}-quicklook`;
  const outputPath = `${outputBase}.jpg`;

  await mkdir(quickLookDir, { recursive: true });
  await execFileAsync(
    "qlmanage",
    ["-t", "-s", String(coverWidth * 2), "-o", quickLookDir, pdfPath],
    { timeout: renderTimeoutMs() }
  );

  const thumbnailPath = await findQuickLookThumbnail(quickLookDir, pdfPath);

  await execFileAsync(
    "sips",
    ["-s", "format", "jpeg", "--resampleWidth", String(coverWidth), thumbnailPath, "--out", outputPath],
    { timeout: renderTimeoutMs() }
  );
  await ensureImageFile(outputPath, coverWidth);
  await rm(quickLookDir, { force: true, recursive: true });

  return {
    contentType: "image/jpeg",
    extension: "jpg",
    filePath: outputPath
  };
}

async function findQuickLookThumbnail(directory: string, pdfPath: string) {
  const files = await readdir(directory);
  const pdfBaseName = basename(pdfPath);
  const preferred = files.find((file) => file.startsWith(pdfBaseName));
  const imageFile =
    preferred ?? files.find((file) => /\.(jpe?g|png|tiff?)$/i.test(file));

  if (!imageFile) {
    throw new Error("Quick Look 未生成封面图片");
  }

  return join(directory, imageFile);
}

async function ensureImageFile(filePath: string, expectedWidth: number) {
  const fileSize = (await stat(filePath)).size;

  if (fileSize <= 0) {
    throw new Error("生成的封面图片为空");
  }

  if (await commandExists("sips")) {
    const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", filePath]);
    const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
    const width = widthMatch ? Number(widthMatch[1]) : 0;

    if (width !== expectedWidth) {
      throw new Error(`封面图片宽度不正确：期望 ${expectedWidth}px，实际 ${width || "未知"}px`);
    }
  }
}

async function putS3ObjectFromFile(
  client: S3Client,
  config: S3Config,
  objectKey: string,
  filePath: string,
  contentType: string
) {
  const fileBuffer = await readFile(filePath);

  await withTimeout(
    client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: fileBuffer,
        ContentLength: fileBuffer.byteLength,
        ContentType: contentType
      })
    ),
    s3TimeoutMs(),
    `R2 封面上传超时：${objectKey}`
  );

  return config.publicBaseUrl
    ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`
    : s3ObjectUrl(config, objectKey);
}

async function detectRenderer(): Promise<Renderer> {
  const preferredRenderer = process.env.TEXTBOOK_COVER_RENDERER as Renderer | undefined;

  if (preferredRenderer) {
    if (!["pdftoppm", "mutool", "quicklook"].includes(preferredRenderer)) {
      throw new Error("TEXTBOOK_COVER_RENDERER 只能设置为 pdftoppm、mutool 或 quicklook");
    }

    if (preferredRenderer === "quicklook") {
      if ((await commandExists("qlmanage")) && (await commandExists("sips"))) {
        return preferredRenderer;
      }

      throw new Error("指定 quicklook 渲染器失败：缺少 qlmanage 或 sips");
    }

    if (await commandExists(preferredRenderer)) {
      return preferredRenderer;
    }

    throw new Error(`指定 ${preferredRenderer} 渲染器失败：命令不存在`);
  }

  if (await commandExists("pdftoppm")) {
    return "pdftoppm";
  }

  if (await commandExists("mutool")) {
    return "mutool";
  }

  if ((await commandExists("qlmanage")) && (await commandExists("sips"))) {
    return "quicklook";
  }

  throw new Error("缺少 PDF 首页渲染工具，请安装 poppler（pdftoppm）或 MuPDF（mutool）。");
}

async function commandExists(command: string) {
  try {
    await execFileAsync("which", [command]);
    return true;
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

function textbookCoverObjectKey(textbookId: string, extension: string) {
  const config = s3Config();

  return `${config.prefix}covers/${textbookId}.${extension}`;
}

function isGeneratedCoverUrl(config: S3Config, coverUrl: string | null) {
  return Boolean(coverUrl?.includes(`${config.prefix}covers/`));
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
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput
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

function renderTimeoutMs() {
  return positiveInteger(process.env.TEXTBOOK_COVER_RENDER_TIMEOUT_MS, defaultRenderTimeoutMs);
}

function s3TimeoutMs() {
  return positiveInteger(process.env.TEXTBOOK_COVER_S3_TIMEOUT_MS, defaultS3TimeoutMs);
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
