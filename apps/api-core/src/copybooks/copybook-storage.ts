import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";
import { mediaStoragePublicBaseUrl } from "../media/media-object-url.js";

interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  pathStyle: boolean;
  prefix: string;
}

export async function uploadCopybookPdfToR2(userId: string, pdf: Buffer) {
  const config = s3Config();
  const filename = createPdfFilename();
  const objectKey = `${config.prefix}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/${safeObjectPathSegment(userId)}/${filename}`;
  const url = s3ObjectUrl(config, objectKey);
  const parsedUrl = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update(pdf).digest("hex");
  const headers: Record<string, string> = {
    "content-disposition": 'inline; filename="zitie.pdf"',
    "content-type": "application/pdf",
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    method: "PUT",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash,
    amzDate
  });
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      authorization
    },
    body: pdf
  });

  if (!response.ok) {
    throw new AppException(50002, "字帖文件上传失败，请稍后再试", HttpStatus.BAD_GATEWAY);
  }

  return {
    filename,
    objectKey,
    size: pdf.length,
    url: publicS3ObjectUrl(config, objectKey)
  };
}

export async function deleteCopybookPdfFromR2(objectKey: string) {
  const config = s3Config();
  const url = s3ObjectUrl(config, objectKey);
  const parsedUrl = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update("").digest("hex");
  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    method: "DELETE",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash,
    amzDate
  });
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...headers,
      authorization
    }
  });

  if (!response.ok && response.status !== 404) {
    throw new AppException(50002, "字帖文件删除失败，请稍后再试", HttpStatus.BAD_GATEWAY);
  }
}

export async function downloadCopybookPdfFromR2(objectKey: string) {
  const config = s3Config();
  const url = s3ObjectUrl(config, objectKey);
  const parsedUrl = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update("").digest("hex");
  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    method: "GET",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash,
    amzDate
  });
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      ...headers,
      authorization
    }
  });

  if (!response.ok) {
    throw new AppException(40401, "字帖文件不存在", HttpStatus.NOT_FOUND);
  }

  return Buffer.from(await response.arrayBuffer());
}

const VOLCENGINE_STUDENT_PHOTO_HOSTS = new Set([
  "ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com",
  "ark-content-generation-cn-beijing.tos-cn-beijing.volces.com",
  "ark-acg-cn-beijing.tos-cn-beijing.volces.com"
]);

export function isTrustedStudentPhotoSourceUrl(value: string) {
  try {
    const source = new URL(value);
    return source.protocol === "https:" && !source.username && !source.password && !source.port && !source.hash &&
      (/^(?:[a-z0-9-]+\.)+aliyuncs\.com$/i.test(source.hostname) || VOLCENGINE_STUDENT_PHOTO_HOSTS.has(source.hostname) ||
        (source.hostname === "dmx04.sdts.net.cn" && source.pathname.startsWith("/dl/images/")));
  } catch { return false; }
}

export async function uploadPrivateStudentPhoto(taskId: string, index: number, sourceUrl: string) {
  if (!isTrustedStudentPhotoSourceUrl(sourceUrl)) {
    throw new AppException(50201, "证照图片地址无效", HttpStatus.BAD_GATEWAY);
  }
  const source = new URL(sourceUrl);
  let mimeType = "";
  let plaintext: Buffer | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const remote = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(30000) });
      mimeType = remote.headers.get("content-type")?.split(";")[0] ?? "";
      if (!remote.ok || !remote.body || !["image/png", "image/jpeg", "image/webp"].includes(mimeType) ||
          Number(remote.headers.get("content-length") ?? 0) > 20 * 1024 * 1024) {
        throw new AppException(50201, "证照图片读取失败，请稍后重试", HttpStatus.BAD_GATEWAY);
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of remote.body) {
        total += chunk.byteLength;
        if (total > 20 * 1024 * 1024) throw new AppException(50201, "证照图片过大", HttpStatus.BAD_GATEWAY);
        chunks.push(Buffer.from(chunk));
      }
      plaintext = Buffer.concat(chunks, total);
      break;
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (attempt === 1) {
        throw new AppException(50201, "证照图片读取失败，请稍后重试", HttpStatus.BAD_GATEWAY);
      }
    }
  }
  if (!plaintext) throw new AppException(50201, "证照图片读取失败，请稍后重试", HttpStatus.BAD_GATEWAY);
  const config = s3Config();
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const objectKey = `student-photos/${safeObjectPathSegment(taskId)}/${index}-${randomBytes(16).toString("hex")}.${extension}`;
  const url = s3ObjectUrl(config, objectKey);
  const parsed = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", studentPhotoEncryptionKey(), iv);
  const body = Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const headers = { host: parsed.host, "content-type": "application/octet-stream", "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const authorization = signS3Request({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey,
    region: config.region, method: "PUT", pathname: parsed.pathname, search: parsed.search, headers, payloadHash, amzDate });
  let saved: Response;
  try {
    saved = await fetch(url, { method: "PUT", headers: { ...headers, authorization }, body,
      signal: AbortSignal.timeout(60000) });
  } catch {
    throw new AppException(50201, "证照保存失败，请稍后重试", HttpStatus.BAD_GATEWAY);
  }
  if (!saved.ok) throw new AppException(50201, "证照保存失败，请稍后重试", HttpStatus.BAD_GATEWAY);
  return objectKey;
}

export async function downloadPrivateStudentPhoto(objectKey: string) {
  if (!/^student-photos\/[a-zA-Z0-9_-]+\/[1-2]-[a-f0-9]{32}\.(png|jpg|webp)$/.test(objectKey)) {
    throw new AppException(40401, "证照图片不存在", HttpStatus.NOT_FOUND);
  }
  const config = s3Config();
  const url = s3ObjectUrl(config, objectKey);
  const parsed = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update("").digest("hex");
  const headers = { host: parsed.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const authorization = signS3Request({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey,
    region: config.region, method: "GET", pathname: parsed.pathname, search: parsed.search, headers, payloadHash, amzDate });
  const response = await fetch(url, { headers: { ...headers, authorization }, cache: "no-store" });
  if (!response.ok) throw new AppException(40401, "证照图片不存在", HttpStatus.NOT_FOUND);
  const encrypted = Buffer.from(await response.arrayBuffer());
  if (encrypted.length < 29 || encrypted.length > 20 * 1024 * 1024 + 28) {
    throw new AppException(50201, "证照图片数据无效", HttpStatus.BAD_GATEWAY);
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", studentPhotoEncryptionKey(), encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(-16));
    const body = Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]);
    const mimeType = objectKey.endsWith(".png") ? "image/png" : objectKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return { body, mimeType };
  } catch { throw new AppException(50201, "证照图片读取失败", HttpStatus.BAD_GATEWAY); }
}

export async function deletePrivateStudentPhoto(objectKey: string) {
  if (!/^student-photos\/[a-zA-Z0-9_-]+\/[1-2]-[a-f0-9]{32}\.(png|jpg|webp)$/.test(objectKey)) {
    throw new AppException(40001, "证照图片地址无效", HttpStatus.BAD_REQUEST);
  }
  await deleteCopybookPdfFromR2(objectKey);
}

function studentPhotoEncryptionKey() {
  const secret = process.env.STUDENT_PHOTO_STORAGE_SECRET?.trim() || requiredEnv("JWT_ACCESS_SECRET");
  return createHash("sha256").update("xueleai:student-photo:v1:").update(secret).digest();
}

function s3Config(): S3Config {
  const prefixInput = (process.env.COPYBOOK_S3_KEY_PREFIX ?? "copybooks/").replace(/^\/+/, "");
  const prefix = prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput;

  return {
    endpoint: requiredEnv("S3_ENDPOINT").replace(/\/+$/, ""),
    bucket: requiredEnv("S3_BUCKET"),
    region: process.env.S3_REGION || "auto",
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: mediaStoragePublicBaseUrl(),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix
  };
}

function publicS3ObjectUrl(config: S3Config, objectKey: string) {
  return config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}` : s3ObjectUrl(config, objectKey);
}

function s3ObjectUrl(config: S3Config, objectKey: string) {
  return config.pathStyle
    ? `${config.endpoint}/${config.bucket}/${objectKey}`
    : `${config.endpoint.replace("://", `://${config.bucket}.`)}/${objectKey}`;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AppException(50001, `对象存储配置缺失：${name}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return value;
}

function createPdfFilename() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hash = randomBytes(8).toString("hex");

  return `${date}-${hash}.pdf`;
}

function safeObjectPathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signS3Request(input: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  method: string;
  pathname: string;
  search: string;
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
}) {
  const date = input.amzDate.slice(0, 8);
  const signedHeaders = Object.keys(input.headers).sort().join(";");
  const canonicalHeaders = Object.keys(input.headers)
    .sort()
    .map((key) => `${key}:${input.headers[key]}`)
    .join("\n");
  const canonicalRequest = [
    input.method,
    encodeURI(input.pathname),
    input.search.replace(/^\?/, ""),
    `${canonicalHeaders}\n`,
    signedHeaders,
    input.payloadHash
  ].join("\n");
  const credentialScope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}
