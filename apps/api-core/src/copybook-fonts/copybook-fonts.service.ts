import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type Prisma, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

export interface UploadedFontFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const copybookFontTemplates = [
  "shengzi",
  "pinyin",
  "pinyin-tian",
  "english",
  "number",
  "essay",
  "calligraphy",
  "huizi",
  "line",
  "eight-line",
  "name-label"
] as const;

const allowedTemplateSet = new Set<string>(copybookFontTemplates);
const allowedExtensions = new Set([".ttf", ".otf", ".ttc", ".woff", ".woff2"]);
const allowedMimeTypes = new Set([
  "font/ttf",
  "font/otf",
  "font/collection",
  "font/woff",
  "font/woff2",
  "application/font-woff",
  "application/font-woff2",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/octet-stream"
]);
const copybookFontsClientToken = Symbol("COPYBOOK_FONTS_CLIENT");

export interface CopybookFontInput {
  name?: unknown;
  sortOrder?: unknown;
  suitableTemplates?: unknown;
}

@Injectable()
export class CopybookFontsService {
  constructor(
    @Optional()
    @Inject(copybookFontsClientToken)
    private readonly prisma: PrismaClient = getPrismaClient()
  ) {}

  async listFonts() {
    const fonts = await this.prisma.copybookFont.findMany({
      where: {
        createdByUserId: null
      },
      include: {
        createdByAdmin: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
    });

    return fonts.map((font) => this.toFont(font));
  }

  async listPublicFonts(userId?: string | null) {
    const fonts = await this.prisma.copybookFont.findMany({
      where: userId
        ? {
            OR: [{ createdByUserId: null }, { createdByUserId: userId }]
          }
        : {
            createdByUserId: null
          },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
    });

    return fonts.map((font) => ({
      id: font.id,
      name: font.name,
      filename: font.filename,
      originalName: normalizeOriginalName(font.originalName),
      mimeType: font.mimeType,
      size: font.size,
      url: font.url,
      suitableTemplates: font.suitableTemplates,
      sortOrder: font.sortOrder,
      ownerType: font.createdByUserId ? "USER" : "ADMIN",
      updatedAt: font.updatedAt
    }));
  }

  async createFont(adminUserId: string, input: CopybookFontInput, file?: UploadedFontFileLike) {
    const name = normalizeName(input.name);
    const sortOrder = normalizeSortOrder(input.sortOrder);
    const suitableTemplates = normalizeSuitableTemplates(input.suitableTemplates);

    if (!file) {
      throw new AppException(40001, "请选择字体文件", HttpStatus.BAD_REQUEST);
    }

    const uploaded = await this.saveFontFile(file);
    const font = await this.prisma.copybookFont.create({
      data: {
        name,
        ...uploaded,
        suitableTemplates,
        sortOrder,
        storageProvider: "LOCAL",
        createdByAdminId: adminUserId
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

    return this.toFont(font);
  }

  async createUserFont(userId: string, input: CopybookFontInput, file?: UploadedFontFileLike) {
    const name = normalizeName(input.name);
    const sortOrder = normalizeSortOrder(input.sortOrder);
    const suitableTemplates = normalizeSuitableTemplates(input.suitableTemplates);

    if (!file) {
      throw new AppException(40001, "请选择字体文件", HttpStatus.BAD_REQUEST);
    }

    const uploaded = await this.saveFontFile(file);
    const font = await this.prisma.copybookFont.create({
      data: {
        name,
        ...uploaded,
        suitableTemplates,
        sortOrder,
        storageProvider: "LOCAL",
        createdByUserId: userId
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

    return this.toFont(font);
  }

  async updateFont(id: string, input: CopybookFontInput, file?: UploadedFontFileLike) {
    const existing = await this.ensureFont(id);
    this.assertAdminFont(existing);
    const nextFile = file ? await this.saveFontFile(file) : null;
    const font = await this.prisma.copybookFont.update({
      where: {
        id
      },
      data: {
        name: input.name === undefined ? undefined : normalizeName(input.name),
        sortOrder: input.sortOrder === undefined ? undefined : normalizeSortOrder(input.sortOrder),
        suitableTemplates:
          input.suitableTemplates === undefined ? undefined : normalizeSuitableTemplates(input.suitableTemplates),
        ...(nextFile ?? {})
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

    if (nextFile) {
      await this.removeLocalFile(existing.filename);
    }

    return this.toFont(font);
  }

  async deleteFont(id: string) {
    const font = await this.ensureFont(id);

    this.assertAdminFont(font);

    await this.prisma.copybookFont.delete({
      where: {
        id
      }
    });
    await this.removeLocalFile(font.filename);

    return {};
  }

  async deleteUserFont(userId: string, id: string) {
    const font = await this.ensureFont(id);

    this.assertUserFontOwner(font, userId);

    await this.prisma.copybookFont.delete({
      where: {
        id
      }
    });
    await this.removeLocalFile(font.filename);

    return {};
  }

  async getLocalFontFile(filename: string, userId?: string | null) {
    const safeFilename = basename(filename);
    const font = await this.prisma.copybookFont.findUnique({
      where: {
        filename: safeFilename
      }
    });

    if (!font || font.storageProvider !== "LOCAL") {
      throw new AppException(40401, "字体文件不存在", HttpStatus.NOT_FOUND);
    }

    this.assertFontOwnerAccess(font, userId);

    const filepath = resolve(fontUploadDir(), safeFilename);

    if (!filepath.startsWith(fontUploadDir()) || !existsSync(filepath)) {
      throw new AppException(40401, "字体文件不存在", HttpStatus.NOT_FOUND);
    }

    return {
      filepath,
      mimeType: font.mimeType,
      size: font.size
    };
  }

  async assertLayoutFontAccess(layout: unknown, userId?: string | null) {
    const filenames = [...fontFilenamesFromLayout(layout)];

    if (filenames.length === 0) {
      return;
    }

    const fonts = await this.prisma.copybookFont.findMany({
      where: {
        filename: {
          in: filenames
        }
      },
      select: {
        filename: true,
        createdByUserId: true
      }
    });
    const fontByFilename = new Map(fonts.map((font) => [font.filename, font]));

    for (const filename of filenames) {
      const font = fontByFilename.get(filename);

      if (!font || (font.createdByUserId && font.createdByUserId !== userId)) {
        throw new AppException(40401, "字体文件不存在", HttpStatus.NOT_FOUND);
      }
    }
  }

  private async ensureFont(id: string) {
    const font = await this.prisma.copybookFont.findUnique({
      where: {
        id
      }
    });

    if (!font) {
      throw new AppException(40401, "字体不存在", HttpStatus.NOT_FOUND);
    }

    return font;
  }

  private assertAdminFont(font: { createdByUserId: string | null }) {
    if (font.createdByUserId) {
      throw new AppException(40401, "字体不存在", HttpStatus.NOT_FOUND);
    }
  }

  private assertUserFontOwner(font: { createdByUserId: string | null }, userId: string) {
    if (font.createdByUserId !== userId) {
      throw new AppException(40401, "字体不存在", HttpStatus.NOT_FOUND);
    }
  }

  private async saveFontFile(file: UploadedFontFileLike) {
    this.assertAllowedFontFile(file);
    const originalName = normalizeOriginalName(file.originalname);
    const filename = createFontFilename(originalName);
    const directory = fontUploadDir();

    mkdirSync(directory, {
      recursive: true
    });
    await writeFile(join(directory, filename), file.buffer);

    return {
      filename,
      originalName,
      mimeType: normalizedMimeType(file),
      size: file.size,
      url: `${publicApiBaseUrl()}/fonts/files/${filename}`
    };
  }

  private assertAllowedFontFile(file: UploadedFontFileLike) {
    const extension = extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(normalizedMimeType(file))) {
      throw new AppException(40001, "仅支持 ttf、otf、ttc、woff、woff2 字体文件", HttpStatus.BAD_REQUEST);
    }

    if (file.size <= 0 || file.size > fontUploadMaxBytes()) {
      throw new AppException(40001, "字体文件大小不能超过 60MB", HttpStatus.BAD_REQUEST);
    }
  }

  private async removeLocalFile(filename: string) {
    const filepath = resolve(fontUploadDir(), basename(filename));

    if (!filepath.startsWith(fontUploadDir())) {
      return;
    }

    await rm(filepath, {
      force: true
    });
  }

  private assertFontOwnerAccess(font: { createdByUserId: string | null }, userId?: string | null) {
    if (font.createdByUserId && font.createdByUserId !== userId) {
      throw new AppException(40401, "字体文件不存在", HttpStatus.NOT_FOUND);
    }
  }

  private toFont(
    font: Prisma.CopybookFontGetPayload<{
      include: {
        createdByAdmin: {
          select: {
            email: true;
            id: true;
            name: true;
          };
        };
      };
    }>
  ) {
    return {
      id: font.id,
      name: font.name,
      filename: font.filename,
      originalName: normalizeOriginalName(font.originalName),
      mimeType: font.mimeType,
      size: font.size,
      url: font.url,
      storageProvider: font.storageProvider,
      suitableTemplates: font.suitableTemplates,
      sortOrder: font.sortOrder,
      createdByAdminId: font.createdByAdminId,
      createdByUserId: font.createdByUserId,
      ownerType: font.createdByUserId ? "USER" : "ADMIN",
      createdByAdmin: font.createdByAdmin,
      createdAt: font.createdAt,
      updatedAt: font.updatedAt
    };
  }
}

export function localFontStream(filepath: string) {
  return createReadStream(filepath);
}

export function fontUploadMaxBytes() {
  const value = Number(process.env.FONT_UPLOAD_MAX_BYTES ?? 60 * 1024 * 1024);

  return Number.isFinite(value) && value > 0 ? value : 60 * 1024 * 1024;
}

function normalizeName(value: unknown) {
  const name = String(value ?? "").trim();

  if (name.length < 1 || name.length > 40) {
    throw new AppException(40001, "字体名称长度必须在 1 到 40 个字符之间", HttpStatus.BAD_REQUEST);
  }

  return name;
}

function normalizeSortOrder(value: unknown) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return 100;
  }

  const sortOrder = Number(rawValue);

  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999999) {
    throw new AppException(40001, "排序值必须是 0 到 999999 之间的整数", HttpStatus.BAD_REQUEST);
  }

  return sortOrder;
}

function normalizeSuitableTemplates(value: unknown) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  const templates = values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [...new Set(templates)];

  if (unique.some((item) => !allowedTemplateSet.has(item))) {
    throw new AppException(40001, "适合模板包含无效选项", HttpStatus.BAD_REQUEST);
  }

  return unique;
}

function normalizeOriginalName(value: string) {
  return basename(value || "font-file").slice(0, 180);
}

function normalizedMimeType(file: UploadedFontFileLike) {
  return file.mimetype || "application/octet-stream";
}

function createFontFilename(originalName: string) {
  const extension = extname(originalName).toLowerCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hash = randomBytes(8).toString("hex");

  return `font-${date}-${hash}${extension}`;
}

function fontUploadDir() {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"), "fonts");
}

function publicApiBaseUrl() {
  return (process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_BASE_URL ?? "http://localhost:3322/api").replace(/\/+$/, "");
}

function fontFilenamesFromLayout(value: unknown, filenames = new Set<string>()) {
  if (!value || typeof value !== "object") {
    return filenames;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => fontFilenamesFromLayout(item, filenames));
    return filenames;
  }

  const record = value as Record<string, unknown>;
  const fontUrls = [record.customFontUrl, record.customFontFallbackUrl];

  for (const fontUrl of fontUrls) {
    if (typeof fontUrl !== "string") {
      continue;
    }

    const filename = fontFilenameFromUrl(fontUrl);

    if (filename) {
      filenames.add(filename);
    }
  }

  Object.values(record).forEach((item) => fontFilenamesFromLayout(item, filenames));

  return filenames;
}

function fontFilenameFromUrl(fontUrl: string) {
  let pathname: string;

  try {
    pathname = new URL(fontUrl).pathname;
  } catch {
    pathname = fontUrl;
  }

  if (!pathname.includes("/fonts/files/")) {
    return null;
  }

  try {
    return decodeURIComponent(basename(pathname));
  } catch {
    return basename(pathname);
  }
}
