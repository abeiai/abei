import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface TextbookMarkdownR2Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  pathStyle: boolean;
  prefix: string;
  publicBaseUrl?: string;
  region: string;
  secretAccessKey: string;
}

export interface BuildTextbookMarkdownR2PlanInput {
  assetBaseUrl: null | string;
  config: TextbookMarkdownR2Config;
  markdownContent: string;
  slug: string;
  textbookId: string;
}

export interface TextbookMarkdownR2Plan {
  assetBaseUrl: string;
  assetPrefix: string;
  markdownContent: string;
  markdownObjectKey: string;
  markdownUrl: string;
}

export interface UploadTextbookMarkdownToR2Input extends BuildTextbookMarkdownR2PlanInput {
  assetUploadConcurrency?: number;
  assetDir: null | string;
}

export interface UploadTextbookMarkdownToR2Result extends TextbookMarkdownR2Plan {
  uploadedAssetCount: number;
}

export function normalizeS3Config(config: TextbookMarkdownR2Config): TextbookMarkdownR2Config {
  const prefix = config.prefix.replace(/^\/+/, "");

  return {
    ...config,
    endpoint: config.endpoint.replace(/\/+$/, ""),
    prefix: prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
    publicBaseUrl: config.publicBaseUrl?.replace(/\/+$/, "") || undefined
  };
}

export function buildTextbookMarkdownR2Plan(input: BuildTextbookMarkdownR2PlanInput): TextbookMarkdownR2Plan {
  const config = normalizeS3Config(input.config);
  const textbookId = safeObjectPathSegment(input.textbookId);
  const markdownObjectKey = `${config.prefix}markdown/${textbookId}/textbook.md`;
  const assetPrefix = `${config.prefix}markdown-assets/${textbookId}/`;
  const assetBaseUrl = publicS3ObjectUrl(config, assetPrefix).replace(/\/+$/, "");
  const markdownContent = input.assetBaseUrl
    ? replaceAssetBaseUrl(input.markdownContent, input.assetBaseUrl, assetBaseUrl)
    : input.markdownContent;

  return {
    assetBaseUrl,
    assetPrefix,
    markdownContent,
    markdownObjectKey,
    markdownUrl: publicS3ObjectUrl(config, markdownObjectKey)
  };
}

export async function uploadTextbookMarkdownToR2(
  input: UploadTextbookMarkdownToR2Input
): Promise<UploadTextbookMarkdownToR2Result> {
  const config = normalizeS3Config(input.config);
  const assetFiles = input.assetDir ? await listFiles(input.assetDir) : [];
  const shouldUploadAssets = assetFiles.length > 0;
  const shouldRewriteAssets = shouldUploadAssets && Boolean(config.publicBaseUrl);
  const plan = buildTextbookMarkdownR2Plan({
    assetBaseUrl: shouldRewriteAssets ? input.assetBaseUrl : null,
    config,
    markdownContent: input.markdownContent,
    slug: input.slug,
    textbookId: input.textbookId
  });
  const assetBaseUrl = shouldRewriteAssets ? plan.assetBaseUrl : (input.assetBaseUrl ?? plan.assetBaseUrl);
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
    await putObject(client, config.bucket, plan.markdownObjectKey, Buffer.from(plan.markdownContent), "text/markdown; charset=utf-8");

    await runPool(assetFiles, positiveInteger(input.assetUploadConcurrency, 8), async (filePath) => {
      const relativePath = safeRelativeObjectPath(input.assetDir!, filePath);
      const objectKey = `${plan.assetPrefix}${relativePath}`;
      const body = await readFile(filePath);

      await putObject(client, config.bucket, objectKey, body, contentTypeForMarkdownAsset(filePath));
    });

    return {
      ...plan,
      assetBaseUrl,
      uploadedAssetCount: assetFiles.length
    };
  } finally {
    client.destroy();
  }
}

export function contentTypeForMarkdownAsset(filename: string) {
  switch (extname(filename).toLowerCase()) {
    case ".avif":
      return "image/avif";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function publicS3ObjectUrl(config: TextbookMarkdownR2Config, objectKey: string) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${objectKey}`;
  }

  return s3ObjectUrl(config, objectKey);
}

function s3ObjectUrl(config: TextbookMarkdownR2Config, objectKey: string) {
  return config.pathStyle
    ? `${config.endpoint}/${config.bucket}/${objectKey}`
    : `${config.endpoint.replace("://", `://${config.bucket}.`)}/${objectKey}`;
}

function replaceAssetBaseUrl(content: string, fromBaseUrl: string, toBaseUrl: string) {
  const from = fromBaseUrl.replace(/\/+$/, "");

  if (!from) {
    return content;
  }

  return content.split(from).join(toBaseUrl);
}

async function putObject(client: S3Client, bucket: string, key: string, body: Uint8Array, contentType: string) {
  await client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentLength: body.byteLength,
      ContentType: contentType,
      Key: key
    })
  );
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

async function listFiles(root: string) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath)));
    } else if (entry.isFile()) {
      const fileStat = await stat(filePath).catch(() => null);

      if (fileStat?.size) {
        files.push(filePath);
      }
    }
  }

  return files;
}

function safeRelativeObjectPath(root: string, filePath: string) {
  const value = relative(root, filePath).split(sep).join("/");

  if (!value || value.startsWith("../") || value.includes("/../")) {
    throw new Error(`Markdown 资源路径不安全：${filePath}`);
  }

  return value
    .split("/")
    .map((segment) => safeObjectPathSegment(segment))
    .join("/");
}

function safeObjectPathSegment(value: string) {
  const safe = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");

  return safe || "asset";
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
