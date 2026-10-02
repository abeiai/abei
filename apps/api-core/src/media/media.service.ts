import { createHash, createHmac, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { inspectCourseCover } from "../courses/course-cover.js";
import { inspectUserAvatar } from "../auth/user-avatar.js";
import { assertPictureBookGeneratedImageUrl, inspectPictureBookImage } from "../picture-books/picture-book-image.js";
import { mediaStoragePublicBaseUrl } from "./media-object-url.js";
import { downloadTtsProviderAudio } from "../audio/video-guide-narration-storage.js";

const mediaAssetTypes = ["IMAGE", "AUDIO", "VIDEO"] as const;
const mediaAssetSources = ["SYSTEM", "USER_UPLOAD", "AI_GENERATED", "WEB_FETCHED"] as const;

type MediaAssetTypeValue = (typeof mediaAssetTypes)[number];
type MediaAssetSourceValue = (typeof mediaAssetSources)[number];

const defaultMaxUploadSizeMb: Record<MediaAssetTypeValue, number> = {
  IMAGE: 10,
  AUDIO: 20,
  VIDEO: 200
};

const maxUploadConfigKeys: Record<MediaAssetTypeValue, string> = {
  IMAGE: "mediaImageMaxSizeMb",
  AUDIO: "mediaAudioMaxSizeMb",
  VIDEO: "mediaVideoMaxSizeMb"
};

const allowedMimeTypes = new Map<string, MediaAssetTypeValue>([
  ["image/jpeg", "IMAGE"],
  ["image/png", "IMAGE"],
  ["image/webp", "IMAGE"],
  ["image/gif", "IMAGE"],
  ["image/x-icon", "IMAGE"],
  ["image/vnd.microsoft.icon", "IMAGE"],
  ["audio/mpeg", "AUDIO"],
  ["audio/mp3", "AUDIO"],
  ["audio/wav", "AUDIO"],
  ["audio/x-wav", "AUDIO"],
  ["audio/webm", "AUDIO"],
  ["audio/ogg", "AUDIO"],
  ["audio/aac", "AUDIO"],
  ["audio/mp4", "AUDIO"],
  ["video/mp4", "VIDEO"],
  ["video/webm", "VIDEO"],
  ["video/quicktime", "VIDEO"],
  ["video/x-matroska", "VIDEO"]
]);

interface MediaAssetFilters {
  mediaType?: string;
  sourceType?: string;
  q?: string;
}

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class MediaService {
  private readonly prisma = getPrismaClient();

  async listAssets(filters: MediaAssetFilters = {}) {
    const mediaType = parseMediaAssetType(filters.mediaType);
    const sourceType = parseMediaAssetSource(filters.sourceType);
    const q = optionalText(filters.q);
    const where: Prisma.MediaAssetWhereInput = {};

    if (mediaType) {
      where.mediaType = mediaType;
    }

    if (sourceType) {
      where.sourceType = sourceType;
    }

    if (q) {
      where.OR = [
        {
          originalName: {
            contains: q,
            mode: "insensitive"
          }
        },
        {
          filename: {
            contains: q,
            mode: "insensitive"
          }
        }
      ];
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where,
      include: {
        createdByAdmin: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 240
    });

    return assets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      originalName: normalizeOriginalName(asset.originalName),
      mimeType: asset.mimeType,
      size: asset.size,
      url: asset.url,
      mediaType: asset.mediaType,
      sourceType: asset.sourceType,
      storageProvider: asset.storageProvider,
      createdByAdminId: asset.createdByAdminId,
      createdByAdmin: asset.createdByAdmin,
      createdAt: asset.createdAt
    }));
  }

  async uploadFile(adminUserId: string, file: UploadedFileLike | undefined, sourceTypeInput?: string) {
    if (!file) {
      throw new AppException(40001, "请选择要上传的文件", HttpStatus.BAD_REQUEST);
    }

    const mediaType = await this.assertAllowedFile(file);
    const sourceType = parseMediaAssetSource(sourceTypeInput) ?? "USER_UPLOAD";

    return this.persistFile({
      createdByAdminId: adminUserId,
      file,
      mediaType,
      sourceType
    });
  }

  async uploadUserCourseCover(userId: string, file: UploadedFileLike | undefined) {
    if (!file) {
      throw new AppException(40001, "请选择课程封面", HttpStatus.BAD_REQUEST);
    }

    inspectCourseCover(file.buffer, file.mimetype);

    return this.persistFile({
      createdByUserId: userId,
      file,
      mediaType: "IMAGE",
      sourceType: "USER_UPLOAD",
      storageProvider: "S3"
    });
  }

  async uploadUserPictureBookImage(userId: string, file: UploadedFileLike) {
    return this.persistFile({ createdByUserId: userId, file, mediaType: "IMAGE", sourceType: "USER_UPLOAD" });
  }

  assertPictureBookR2Ready() {
    if (process.env.S3_BUCKET?.trim() !== "abeiai" ||
        !["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"]
          .every((name) => Boolean(process.env[name]?.trim()))) {
      throw new AppException(40001, "请先配置 abeiai R2 存储桶及公开访问地址", HttpStatus.BAD_REQUEST);
    }
    try {
      if (new URL(process.env.S3_ENDPOINT!).protocol !== "https:" ||
          new URL(process.env.S3_PUBLIC_BASE_URL!).protocol !== "https:") throw new Error();
    } catch {
      throw new AppException(40001, "abeiai R2 存储地址须为 HTTPS", HttpStatus.BAD_REQUEST);
    }
  }

  async archivePictureBookGeneratedImage(userId: string, sourceUrl: string) {
    this.assertPictureBookR2Ready();
    const publicBase = process.env.S3_PUBLIC_BASE_URL!.replace(/\/+$/, "");
    if (sourceUrl.startsWith(`${publicBase}/`)) {
      const asset = await this.prisma.mediaAsset.findFirst({ where: {
        url: sourceUrl, createdByUserId: userId, sourceType: "AI_GENERATED", storageProvider: "S3"
      } });
      if (!asset) throw new AppException(50201, "生成图片地址无效", HttpStatus.BAD_GATEWAY);
      return asset;
    }
    const safeUrl = assertPictureBookGeneratedImageUrl(sourceUrl);
    const file = await this.downloadPictureBookImage(safeUrl);
    return this.persistFile({ createdByUserId: userId, file, mediaType: "IMAGE", sourceType: "AI_GENERATED", storageProvider: "S3" });
  }

  async readPictureBookStoredImage(sourceUrl: string) {
    const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!publicBase || !sourceUrl.startsWith(`${publicBase}/`)) {
      return this.downloadPictureBookImage(assertPictureBookGeneratedImageUrl(sourceUrl));
    }
    const key = sourceUrl.slice(publicBase.length + 1);
    if (key.length > 2048 || !/^[a-zA-Z0-9/_-]+\.(png|jpe?g|webp)$/.test(key)) {
      throw new AppException(40001, "绘本图片地址无效", HttpStatus.BAD_REQUEST);
    }
    const request = this.pictureBookStoredRequest(key);
    return this.downloadPictureBookImage(request.url, request.headers);
  }

  async readPictureBookStoredAudio(sourceUrl: string) {
    const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!publicBase || !sourceUrl.startsWith(`${publicBase}/`)) {
      try { return { buffer: await downloadTtsProviderAudio(sourceUrl, 20 * 1024 * 1024), mimetype: "audio/mpeg" }; }
      catch { throw new AppException(50201, "绘本语音加载失败，请稍后重试", HttpStatus.BAD_GATEWAY); }
    }
    const key = sourceUrl.slice(publicBase.length + 1);
    if (key.length > 2048 || !/^[a-zA-Z0-9/_-]+\.(mp3|wav|ogg|aac|m4a|webm)$/.test(key)) {
      throw new AppException(40001, "绘本语音地址无效", HttpStatus.BAD_REQUEST);
    }
    const request = this.pictureBookStoredRequest(key);
    const response = await fetch(request.url, { headers: request.headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const mimetype = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!response.ok || !response.body || !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/webm"].includes(mimetype)) {
      throw new AppException(50201, "绘本语音加载失败", HttpStatus.BAD_GATEWAY);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 20 * 1024 * 1024) throw new AppException(50201, "绘本语音超过大小限制", HttpStatus.BAD_GATEWAY);
      chunks.push(Buffer.from(chunk));
    }
    if (!size) throw new AppException(50201, "绘本语音加载失败", HttpStatus.BAD_GATEWAY);
    return { buffer: Buffer.concat(chunks, size), mimetype };
  }

  private pictureBookStoredRequest(key: string) {
    const config = s3Config();
    const endpoint = config.endpoint.replace(/\/+$/, "");
    const url = new URL(config.pathStyle ? `${endpoint}/${config.bucket}/${key}` : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`);
    const amzDate = amzTimestamp(new Date());
    const payloadHash = createHash("sha256").update("").digest("hex");
    const headers = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    const authorization = signS3Request({
      accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: config.region,
      method: "GET", pathname: url.pathname, search: "", headers, payloadHash, amzDate
    });
    return { url: url.toString(), headers: { ...headers, authorization } };
  }

  private async downloadPictureBookImage(sourceUrl: string, headers?: Record<string, string>) {
    const response = await fetch(sourceUrl, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!response.ok || !response.body || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      throw new AppException(50201, "生成图片下载失败", HttpStatus.BAD_GATEWAY);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 10 * 1024 * 1024) throw new AppException(50201, "生成图片超过大小限制", HttpStatus.BAD_GATEWAY);
      chunks.push(Buffer.from(chunk));
    }
    const file = {
      originalname: mimeType === "image/png" ? "picture-book.png" : mimeType === "image/webp" ? "picture-book.webp" : "picture-book.jpg",
      mimetype: mimeType,
      size,
      buffer: Buffer.concat(chunks, size)
    };
    return inspectPictureBookImage(file);
  }

  async uploadUserAvatar(userId: string, file: UploadedFileLike | undefined) {
    if (!file) {
      throw new AppException(40001, "请选择头像图片", HttpStatus.BAD_REQUEST);
    }

    inspectUserAvatar(file.buffer, file.mimetype);

    return this.persistFile({
      createdByUserId: userId,
      file,
      mediaType: "IMAGE",
      sourceType: "USER_UPLOAD",
      storageProvider: "S3"
    });
  }

  async uploadLearnerAvatar(userId: string, file: UploadedFileLike | undefined) {
    if (!file) {
      throw new AppException(40001, "请选择头像图片", HttpStatus.BAD_REQUEST);
    }

    inspectUserAvatar(file.buffer, file.mimetype);

    return this.persistFile({
      createdByUserId: userId,
      file,
      mediaType: "IMAGE",
      sourceType: "USER_UPLOAD",
      storageProvider: "S3"
    });
  }

  async archiveAbeiaiGeneratedImage(userId: string, sourceUrl: string) {
    const source = new URL(sourceUrl);
    if (source.protocol !== "https:" || source.hostname !== "dmx04.sdts.net.cn" || source.port ||
        source.username || source.password || !source.pathname.startsWith("/dl/images/")) {
      throw new AppException(50201, "生成图片地址无效", HttpStatus.BAD_GATEWAY);
    }

    const response = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!response.ok || !response.body || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      throw new AppException(50201, "生成图片下载失败", HttpStatus.BAD_GATEWAY);
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 20 * 1024 * 1024) {
        throw new AppException(50201, "生成图片超过大小限制", HttpStatus.BAD_GATEWAY);
      }
      chunks.push(Buffer.from(chunk));
    }

    const file = {
      originalname: mimeType === "image/png" ? "abeiai.png" : mimeType === "image/webp" ? "abeiai.webp" : "abeiai.jpg",
      mimetype: mimeType,
      size,
      buffer: Buffer.concat(chunks, size)
    };
    return this.persistFile({ createdByUserId: userId, file, mediaType: "IMAGE", sourceType: "AI_GENERATED", storageProvider: "S3" });
  }

  assertAbeiaiImageStorageReady(requirePublicUrl = true) {
    if (!["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
      .every((name) => Boolean(process.env[name]?.trim())) || (requirePublicUrl && !mediaStoragePublicBaseUrl())) {
      throw new AppException(40001, "请先配置 R2 对象存储，再启用阿贝智能图片模型。", HttpStatus.BAD_REQUEST);
    }
  }

  async cleanupLearnerAvatar(userId: string, assetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        createdByUserId: userId,
        createdByAdminId: null,
        mediaType: "IMAGE",
        sourceType: "USER_UPLOAD"
      },
      select: {
        id: true,
        filename: true,
        url: true,
        storageProvider: true
      }
    });

    if (!asset) {
      return { deleted: false };
    }

    await this.deleteMediaObject(asset, "头像");
    const deleted = await this.prisma.mediaAsset.deleteMany({
      where: {
        id: asset.id,
        createdByUserId: userId,
        createdByAdminId: null,
        mediaType: "IMAGE",
        sourceType: "USER_UPLOAD",
        filename: asset.filename,
        storageProvider: asset.storageProvider
      }
    });

    if (deleted.count !== 1) {
      throw new AppException(50001, "头像资产清理失败", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { deleted: true };
  }

  async cleanupUnreferencedCourseCoverAssets(userId: string, assetIds: string[]) {
    const deletedAssetIds: string[] = [];

    for (const assetId of [...new Set(assetIds.filter(Boolean))]) {
      const asset = await this.prisma.mediaAsset.findFirst({
        where: {
          id: assetId,
          createdByUserId: userId,
          createdByAdminId: null,
          mediaType: "IMAGE",
          sourceType: "USER_UPLOAD"
        }
      });

      if (!asset) {
        continue;
      }

      const deleted = await this.prisma.mediaAsset.deleteMany({
        where: {
          id: asset.id,
          createdByUserId: userId,
          createdByAdminId: null,
          mediaType: "IMAGE",
          sourceType: "USER_UPLOAD",
          courseRevisionCovers: { none: {} },
          coverArticles: { none: {} }
        }
      });

      if (deleted.count !== 1) {
        continue;
      }

      try {
        await this.deleteMediaObject(asset, "课程封面");
      } catch (error) {
        await this.prisma.mediaAsset.create({
          data: {
            id: asset.id,
            filename: asset.filename,
            originalName: asset.originalName,
            mimeType: asset.mimeType,
            size: asset.size,
            url: asset.url,
            mediaType: asset.mediaType,
            sourceType: asset.sourceType,
            storageProvider: asset.storageProvider,
            createdByAdminId: asset.createdByAdminId,
            createdByUserId: asset.createdByUserId,
            createdAt: asset.createdAt
          }
        });
        throw error;
      }

      deletedAssetIds.push(asset.id);
    }

    return { deletedAssetIds };
  }

  async getLocalFile(filename: string) {
    const safeFilename = basename(filename);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        filename: safeFilename,
        storageProvider: "LOCAL"
      }
    });

    if (!asset) {
      throw new AppException(40401, "媒体文件不存在", HttpStatus.NOT_FOUND);
    }

    const filepath = resolve(uploadDir(), safeFilename);

    if (!filepath.startsWith(uploadDir()) || !existsSync(filepath)) {
      throw new AppException(40401, "媒体文件不存在", HttpStatus.NOT_FOUND);
    }

    return {
      filepath,
      mimeType: asset.mimeType,
      size: asset.size
    };
  }

  private async assertAllowedFile(file: UploadedFileLike) {
    const mediaType = allowedMimeTypes.get(file.mimetype);

    if (!mediaType) {
      throw new AppException(40001, "仅支持图片、音频、视频文件", HttpStatus.BAD_REQUEST);
    }

    const maxBytes = await this.maxUploadBytesFor(mediaType);
    const maxMb = Math.floor(maxBytes / 1024 / 1024);

    if (file.size <= 0 || file.size > maxBytes) {
      throw new AppException(
        40001,
        `${mediaTypeLabel(mediaType)}文件大小不能超过 ${maxMb}MB`,
        HttpStatus.BAD_REQUEST
      );
    }

    return mediaType;
  }

  private async maxUploadBytesFor(mediaType: MediaAssetTypeValue) {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key: maxUploadConfigKeys[mediaType]
      },
      select: {
        value: true
      }
    });
    const maxMb = normalizeUploadSizeMb(config?.value, defaultMaxUploadSizeMb[mediaType]);

    return maxMb * 1024 * 1024;
  }

  private async persistFile(input: {
    createdByAdminId?: string;
    createdByUserId?: string;
    file: UploadedFileLike;
    mediaType: MediaAssetTypeValue;
    sourceType: MediaAssetSourceValue;
    storageProvider?: "LOCAL" | "S3";
  }) {
    const originalName = normalizeOriginalName(input.file.originalname);
    const filename = this.createFilename(originalName, input.file.mimetype);
    const provider = input.storageProvider ?? (uploadDriver() === "s3" ? "S3" : "LOCAL");
    const url =
      provider === "S3"
        ? await this.uploadToS3(filename, input.file)
        : await this.uploadToLocal(filename, input.file);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        filename,
        originalName,
        mimeType: input.file.mimetype,
        size: input.file.size,
        url,
        mediaType: input.mediaType,
        sourceType: input.sourceType,
        storageProvider: provider,
        createdByAdminId: input.createdByAdminId,
        createdByUserId: input.createdByUserId
      },
      include: {
        createdByAdmin: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    return {
      id: asset.id,
      filename: asset.filename,
      originalName: normalizeOriginalName(asset.originalName),
      mimeType: asset.mimeType,
      size: asset.size,
      url: asset.url,
      mediaType: asset.mediaType,
      sourceType: asset.sourceType,
      storageProvider: asset.storageProvider,
      createdByAdminId: asset.createdByAdminId,
      createdByAdmin: asset.createdByAdmin,
      createdAt: asset.createdAt
    };
  }

  private createFilename(originalName: string, mimeType: string) {
    const extension = extensionFor(originalName, mimeType);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const hash = randomBytes(8).toString("hex");

    return `${date}-${hash}${extension}`;
  }

  private async uploadToLocal(filename: string, file: UploadedFileLike) {
    const directory = uploadDir();
    mkdirSync(directory, {
      recursive: true
    });
    await writeFile(join(directory, filename), file.buffer);

    return `${publicApiBaseUrl()}/media/files/${filename}`;
  }

  private async uploadToS3(filename: string, file: UploadedFileLike) {
    const config = s3Config();
    const key = `${config.prefix}${filename}`;
    const endpoint = config.endpoint.replace(/\/+$/, "");
    const url = config.pathStyle
      ? `${endpoint}/${config.bucket}/${key}`
      : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`;
    const parsedUrl = new URL(url);
    const amzDate = amzTimestamp(new Date());
    const payloadHash = createHash("sha256").update(file.buffer).digest("hex");
    const headers: Record<string, string> = {
      "content-type": file.mimetype,
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
      body: file.buffer
    });

    if (!response.ok) {
      throw new AppException(50002, "对象存储上传失败", HttpStatus.BAD_GATEWAY);
    }

    return config.publicBaseUrl
      ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}`
      : url;
  }

  private async deleteMediaObject(asset: {
    filename: string;
    url: string;
    storageProvider: string;
  }, assetLabel: "头像" | "课程封面") {
    if (asset.storageProvider === "LOCAL") {
      const directory = resolve(uploadDir());
      const filename = basename(asset.filename);
      const filepath = resolve(directory, filename);

      if (!filename || filename !== asset.filename || !filepath.startsWith(`${directory}/`)) {
        throw new AppException(50001, `${assetLabel}资产路径不正确`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      await rm(filepath, { force: true });
      return;
    }

    if (asset.storageProvider !== "S3") {
      throw new AppException(50001, `${assetLabel}资产存储类型不正确`, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const config = s3Config();
    const key = `${config.prefix}${asset.filename}`;
    const endpoint = config.endpoint.replace(/\/+$/, "");
    const url = config.pathStyle
      ? `${endpoint}/${config.bucket}/${key}`
      : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`;
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
      headers: { ...headers, authorization }
    });

    if (!response.ok && response.status !== 404) {
      throw new AppException(50002, `对象存储${assetLabel}删除失败`, HttpStatus.BAD_GATEWAY);
    }
  }
}

export function localMediaStream(filepath: string) {
  return createReadStream(filepath);
}

function uploadDriver() {
  const driver = (process.env.UPLOAD_DRIVER ?? "local").trim().toLowerCase();

  return driver === "s3" || driver === "s3-compatible" ? "s3" : "local";
}

function uploadDir() {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"));
}

function publicApiBaseUrl() {
  const configured = process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_BASE_URL;
  const baseUrl = configured?.trim() || "/api";

  if (process.env.NODE_ENV === "production" && isLoopbackPublicApiBaseUrl(baseUrl)) {
    return "/api";
  }

  return baseUrl.replace(/\/+$/, "") || "/api";
}

function isLoopbackPublicApiBaseUrl(value: string) {
  try {
    const url = new URL(value);

    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function mediaUploadMaxBytes() {
  const defaultBytes = defaultMaxUploadSizeMb.VIDEO * 1024 * 1024;
  const value = Number(process.env.MEDIA_UPLOAD_MAX_BYTES ?? defaultBytes);

  return Number.isFinite(value) && value > defaultBytes ? value : defaultBytes;
}

export function avatarUploadMaxBytes() {
  return 5 * 1024 * 1024;
}

function extensionFor(originalName: string, mimeType: string) {
  const extension = extname(originalName).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".ico", ".mp3", ".wav", ".webm", ".ogg", ".aac", ".m4a", ".mp4", ".mov", ".mkv"].includes(extension)) {
    return extension === ".jpeg" ? ".jpg" : extension;
  }

  const byMimeType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv"
  };

  return byMimeType[mimeType] ?? ".bin";
}

function parseMediaAssetType(value?: string) {
  return mediaAssetTypes.find((item) => item === value) ?? undefined;
}

function parseMediaAssetSource(value?: string) {
  return mediaAssetSources.find((item) => item === value) ?? undefined;
}

function optionalText(value?: string) {
  const text = value?.trim();

  return text ? text : undefined;
}

function normalizeUploadSizeMb(value: string | null | undefined, fallback: number) {
  const sizeMb = Number(String(value ?? "").trim());

  return Number.isInteger(sizeMb) && sizeMb >= 1 && sizeMb <= 200 ? sizeMb : fallback;
}

function mediaTypeLabel(value: MediaAssetTypeValue) {
  if (value === "AUDIO") {
    return "音频";
  }

  if (value === "VIDEO") {
    return "视频";
  }

  return "图片";
}

function normalizeOriginalName(value: string) {
  const safeName = basename(value).normalize("NFC");
  const decoded = Buffer.from(safeName, "latin1").toString("utf8").normalize("NFC");

  if (!decoded.includes("�") && countCjk(decoded) > countCjk(safeName)) {
    return basename(decoded);
  }

  return safeName;
}

function countCjk(value: string) {
  return Array.from(value).filter((char) => /[\u3400-\u9fff]/.test(char)).length;
}

function s3Config() {
  const endpoint = requiredEnv("S3_ENDPOINT");
  const bucket = requiredEnv("S3_BUCKET");
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const prefix = (process.env.S3_KEY_PREFIX ?? "uploads/").replace(/^\/+/, "");

  return {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: mediaStoragePublicBaseUrl(),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new AppException(50001, `对象存储配置缺失：${name}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return value;
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
