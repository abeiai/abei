import { createHash, createHmac, randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { HttpStatus, Injectable } from "@nestjs/common";
import {
  getPrismaClient,
  type Prisma,
  type TextbookEducationType,
  type TextbookVolume
} from "@xueleai/database";
import { assertValidSlug } from "../cms/slug.js";
import { AppException } from "../common/app-exception.js";
import {
  publicTextbookObjectUrl,
  publicTextbookObjectUrlFromStoredUrl,
  textbookCdnBaseUrl
} from "./textbook-object-url.js";

const educationTypeOptions: Array<{ value: TextbookEducationType; label: string }> = [
  { value: "PRIMARY", label: "小学" },
  { value: "JUNIOR", label: "初中" },
  { value: "PRIMARY_FIVE_FOUR", label: "小学五四学制" },
  { value: "JUNIOR_FIVE_FOUR", label: "初中五四学制" },
  { value: "SENIOR", label: "高中" },
  { value: "SPECIAL_EDUCATION", label: "特殊教育" }
];

const volumeOptions: Array<{ value: TextbookVolume; label: string }> = [
  { value: "FIRST_VOLUME", label: "上册" },
  { value: "SECOND_VOLUME", label: "下册" },
  { value: "FULL_VOLUME", label: "全一册" }
];

const textbookPageSize = 50;

const defaultSubjects = [
  "道德与法治",
  "语文",
  "数学",
  "英语",
  "艺术·音乐",
  "艺术·美术",
  "艺术",
  "科学",
  "语文·书法练习指导",
  "体育与健康",
  "信息科技"
];

const defaultVersions = [
  "北京版",
  "北师大版",
  "重庆大学版",
  "闽教版",
  "粤教粤人版",
  "冀教版（一年级起点）",
  "冀教版",
  "湘少版",
  "教科版（EEC学院）",
  "教科版（主编：龚亚夫&鲁宗干）",
  "科普版",
  "辽宁师大版",
  "清华大学版",
  "人教版（一年级起点）（主编：吴欣）",
  "人教版（PEP）（主编：吴欣）",
  "鲁教湘教版",
  "陕旅版",
  "沪教版",
  "川教版",
  "外研社版（一年级起点）（主编：陈琳）",
  "外研社版（主编：陈琳）",
  "译林版",
  "人教大同版",
  "粤教沪外教版",
  "接力社版",
  "人教A版",
  "特殊教育版"
];

const defaultGrades = [
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
  "高一",
  "高二",
  "高三"
];

interface TextbookFilters {
  educationType?: string;
  page?: string;
  pageSize?: string;
  q?: string;
  subject?: string;
  version?: string;
  grade?: string;
  volume?: string;
}

interface TextbookMutationInput {
  slug?: string;
  title?: string;
  educationType?: string;
  subject?: string;
  version?: string;
  grade?: string;
  volume?: string;
  curriculumStandardYear?: string;
  editionYear?: string;
  publisher?: string;
  coverUrl?: string;
  pdfUrl?: string;
  mdUrl?: string;
  sortOrder?: string;
  removePdf?: string;
  removeMd?: string;
}

interface UploadedTextbookFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

type UploadedTextbookFiles = Record<string, UploadedTextbookFileLike[] | undefined>;
type TextbookFileFormat = "pdf" | "md";

type TextbookDownloadResult =
  | {
      redirectUrl: string;
    }
  | {
      filename: string;
      contentType: string;
      content: string | Buffer;
    };

type TextbookCoverResult =
  | {
      redirectUrl: string;
    }
  | {
      filename: string;
      contentType: string;
      content: Buffer;
    };

type TextbookBackupPdfDownloadResult = {
  filename: string;
  contentType: string;
  filePath: string;
};

type TextbookMarkdownAssetResult = {
  filename: string;
  contentType: string;
} & (
  | {
      content: Buffer;
    }
  | {
      filePath: string;
    }
);

@Injectable()
export class LearningMaterialsService {
  private readonly prisma = getPrismaClient();

  async listTextbooks(filters: TextbookFilters = {}) {
    return this.listTextbookRows(filters, textbookPageSize);
  }

  async listPublicTextbooks(filters: TextbookFilters = {}) {
    const requestedPageSize = positiveInteger(filters.pageSize, 24);
    const pageSize = Math.min(requestedPageSize, 60);

    return this.listTextbookRows(filters, pageSize);
  }

  async listPublicTextbookSitemapEntries() {
    return this.prisma.learningMaterialTextbook.findMany({
      select: {
        slug: true,
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }]
    });
  }

  async getPublicTextbook(value: string) {
    const textbook = await this.prisma.learningMaterialTextbook.findFirst({
      where: {
        OR: [
          {
            id: value
          },
          {
            slug: value
          }
        ]
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    return this.toTextbook(textbook);
  }

  async getPublicTextbookDownload(id: string, format: string) {
    return this.getTextbookDownload(id, format);
  }

  async getPublicTextbookCover(id: string): Promise<TextbookCoverResult> {
    const textbook = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        coverUrl: true
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    if (!textbook.coverUrl) {
      throw new AppException(40403, "该教材尚未配置封面图", HttpStatus.NOT_FOUND);
    }

    const objectKey = textbookCoverObjectKeyFromUrl(textbook.coverUrl);

    if (!objectKey) {
      return {
        redirectUrl: textbook.coverUrl
      };
    }

    return {
      filename: `${textbook.id}.${extensionFromObjectKey(objectKey)}`,
      contentType: imageContentTypeFromObjectKey(objectKey),
      content: await downloadS3Object(objectKey)
    };
  }

  async getPublicTextbookBackupDownload(id: string): Promise<TextbookBackupPdfDownloadResult> {
    const textbook = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        slug: true,
        backupPdfPath: true
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    if (!textbook.backupPdfPath) {
      throw new AppException(40404, "该教材尚未生成 PDF 备份", HttpStatus.NOT_FOUND);
    }

    const filePath = assertSafeBackupPdfPath(textbook.backupPdfPath);
    const fileStat = await stat(filePath).catch(() => null);

    if (!fileStat?.isFile() || fileStat.size <= 0) {
      throw new AppException(40404, "该教材 PDF 备份文件不存在", HttpStatus.NOT_FOUND);
    }

    return {
      filename: `${textbook.slug}.backup.pdf`,
      contentType: "application/pdf",
      filePath
    };
  }

  async getPublicTextbookMarkdown(value: string) {
    const textbook = await this.prisma.learningMaterialTextbook.findFirst({
      where: {
        OR: [
          {
            id: value
          },
          {
            slug: value
          }
        ]
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    if ((!textbook.markdownContent && !textbook.mdObjectKey) || textbook.markdownConversionStatus !== "READY") {
      throw new AppException(40405, "该教材尚未生成 Markdown 正文", HttpStatus.NOT_FOUND);
    }

    const rawMarkdownContent = textbook.markdownContent ?? (await downloadS3Object(textbook.mdObjectKey!)).toString("utf8");
    const markdownAssetBaseUrl = textbook.mdObjectKey
      ? textbookMarkdownAssetBaseUrl(textbook.id)
      : (publicTextbookObjectUrlFromStoredUrl(textbook.markdownAssetBaseUrl) ?? textbook.markdownAssetBaseUrl);
    const markdownContent = normalizeMarkdownAssetUrls(rawMarkdownContent, textbook.id, textbook.markdownAssetBaseUrl, markdownAssetBaseUrl);

    return {
      textbook: this.toTextbook(textbook),
      markdownContent,
      markdownAssetBaseUrl,
      markdownConvertedAt: textbook.markdownConvertedAt,
      markdownPageCount: textbook.markdownPageCount,
      markdownConversionStatus: textbook.markdownConversionStatus
    };
  }

  async getPublicTextbookMarkdownAsset(id: string, filename: string): Promise<TextbookMarkdownAssetResult> {
    const textbook = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        markdownAssetsPath: true,
        mdObjectKey: true
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    const safeFilename = assertSafeMarkdownAssetFilename(filename);

    if (textbook.markdownAssetsPath) {
      const filePath = assertSafeMarkdownAssetPath(textbook.markdownAssetsPath, safeFilename);
      const fileStat = await stat(filePath).catch(() => null);

      if (fileStat?.isFile() && fileStat.size > 0) {
        return {
          contentType: imageContentTypeFromObjectKey(safeFilename),
          filename: safeFilename,
          filePath
        };
      }
    }

    if (textbook.mdObjectKey) {
      return {
        content: await downloadS3Object(textbookMarkdownAssetObjectKey(textbook.id, safeFilename)),
        contentType: imageContentTypeFromObjectKey(safeFilename),
        filename: safeFilename
      };
    }

    throw new AppException(40406, "Markdown 图片资源不存在", HttpStatus.NOT_FOUND);
  }

  private async listTextbookRows(filters: TextbookFilters, pageSize: number) {
    const where: Prisma.LearningMaterialTextbookWhereInput = {};
    const educationType = parseEducationType(filters.educationType);
    const subject = optionalText(filters.subject);
    const version = optionalText(filters.version);
    const grade = optionalText(filters.grade);
    const volume = parseVolume(filters.volume);
    const keyword = optionalText(filters.q)?.slice(0, 80);

    if (educationType) {
      where.educationType = educationType;
    }

    if (subject) {
      where.subject = subject;
    }

    if (version) {
      where.version = version;
    }

    if (grade) {
      where.grade = grade;
    }

    if (volume) {
      where.volume = volume;
    }

    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { subject: { contains: keyword } },
        { version: { contains: keyword } },
        { grade: { contains: keyword } },
        { curriculumStandardYear: { contains: keyword } },
        { editionYear: { contains: keyword } },
        { publisher: { contains: keyword } }
      ];
    }

    const requestedPage = positiveInteger(filters.page, 1);
    const [total, optionRows] = await Promise.all([
      this.prisma.learningMaterialTextbook.count({
        where
      }),
      this.prisma.learningMaterialTextbook.findMany({
        select: {
          subject: true,
          version: true,
          grade: true
        },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
      })
    ]);
    const publicTotalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, publicTotalPages);
    const textbooks = await this.prisma.learningMaterialTextbook.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      filters: {
        educationTypes: educationTypeOptions,
        subjects: mergeOptions(defaultSubjects, optionRows.map((row) => row.subject)),
        versions: mergeOptions(defaultVersions, optionRows.map((row) => row.version)),
        versionsBySubject: buildTextbookVersionsBySubjectOptions(optionRows),
        grades: mergeOptions(defaultGrades, optionRows.map((row) => row.grade)),
        volumes: volumeOptions
      },
      items: textbooks.map((textbook) => this.toTextbook(textbook)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: publicTotalPages
      }
    };
  }

  async createTextbook(input: TextbookMutationInput, files: UploadedTextbookFiles = {}) {
    const data = this.createPayload(input);
    await this.assertTextbookSlugAvailable(data.slug);
    const uploads = await this.uploadTextbookFiles(data.slug, files);
    const textbook = await this.prisma.learningMaterialTextbook.create({
      data: {
        ...data,
        ...uploads
      }
    });

    return this.toTextbook(textbook);
  }

  async updateTextbook(id: string, input: TextbookMutationInput, files: UploadedTextbookFiles = {}) {
    const existing = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        id
      }
    });

    if (!existing) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    const data = this.updatePayload(input);
    const nextPdfUrl = parseOptionalUrl(input.pdfUrl, "PDF 地址");
    const nextMdUrl = parseOptionalUrl(input.mdUrl, "MD 地址");

    if (typeof data.slug === "string" && data.slug !== existing.slug) {
      await this.assertTextbookSlugAvailable(data.slug, id);
    }

    if (input.pdfUrl !== undefined) {
      data.pdfUrl = nextPdfUrl ?? null;
    }

    if (input.mdUrl !== undefined) {
      data.mdUrl = nextMdUrl ?? null;
    }

    const nextSlug = typeof data.slug === "string" ? data.slug : existing.slug;
    const uploads = await this.uploadTextbookFiles(nextSlug, files);
    const removePdf = booleanValue(input.removePdf);
    const removeMd = booleanValue(input.removeMd);
    const pdfUrlChanged = input.pdfUrl !== undefined && nextPdfUrl !== existing.pdfUrl;
    const mdUrlChanged = input.mdUrl !== undefined && nextMdUrl !== existing.mdUrl;
    const shouldDeleteOldPdf =
      Boolean(uploads.pdfObjectKey) || removePdf || (pdfUrlChanged && Boolean(existing.pdfObjectKey));
    const shouldDeleteOldMd =
      Boolean(uploads.mdObjectKey) || removeMd || (mdUrlChanged && Boolean(existing.mdObjectKey));

    const textbook = await this.prisma.learningMaterialTextbook.update({
      where: {
        id
      },
      data: {
        ...data,
        ...uploads,
        ...(pdfUrlChanged && existing.pdfObjectKey && !uploads.pdfObjectKey
          ? {
              pdfObjectKey: null
            }
          : {}),
        ...(mdUrlChanged && existing.mdObjectKey && !uploads.mdObjectKey
          ? {
              mdObjectKey: null
            }
          : {}),
        ...(removePdf && !uploads.pdfUrl
          ? {
              pdfObjectKey: null,
              pdfUrl: null
            }
          : {}),
        ...(removeMd && !uploads.mdUrl
          ? {
              mdObjectKey: null,
              mdUrl: null
            }
          : {})
      }
    });

    await deleteTextbookObjectKeys([
      shouldDeleteOldPdf ? existing.pdfObjectKey : null,
      shouldDeleteOldMd ? existing.mdObjectKey : null
    ]);

    return this.toTextbook(textbook);
  }

  async deleteTextbook(id: string) {
    const textbook = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        id
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    await this.prisma.learningMaterialTextbook.delete({
      where: {
        id
      }
    });
    await deleteTextbookObjectKeys([textbook.pdfObjectKey, textbook.mdObjectKey]);

    return this.toTextbook(textbook);
  }

  async getTextbookDownload(id: string, format: string): Promise<TextbookDownloadResult> {
    const textbook = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        id
      }
    });

    if (!textbook) {
      throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
    }

    if (format === "pdf") {
      if (textbook.pdfObjectKey) {
        return {
          redirectUrl: publicTextbookObjectUrl(textbook.pdfObjectKey)
        };
      }

      if (!textbook.pdfUrl) {
        throw new AppException(40402, "该教材尚未配置 PDF 下载地址", HttpStatus.NOT_FOUND);
      }

      return {
        redirectUrl: publicTextbookObjectUrlFromStoredUrl(textbook.pdfUrl) ?? textbook.pdfUrl
      };
    }

    if (format === "md") {
      throw new AppException(40407, "暂不提供 Markdown 下载，请在线查看教材正文", HttpStatus.NOT_FOUND);
    }

    throw new AppException(40001, "不支持的下载格式", HttpStatus.BAD_REQUEST);
  }

  private createPayload(input: TextbookMutationInput): Prisma.LearningMaterialTextbookCreateInput {
    const slug = requiredText(input.slug, "slug", 100);
    assertValidSlug(slug);

    return {
      slug,
      title: requiredText(input.title, "教材名称", 200),
      educationType: requiredEducationType(input.educationType),
      subject: requiredText(input.subject, "学科", 40),
      version: requiredText(input.version, "版本", 80),
      grade: requiredText(input.grade, "年级", 40),
      volume: requiredVolume(input.volume),
      curriculumStandardYear: optionalYearText(input.curriculumStandardYear, "课程标准") ?? null,
      editionYear: optionalLimitedText(input.editionYear, "版本时间", 40) ?? null,
      publisher: optionalText(input.publisher) ?? null,
      coverUrl: parseOptionalUrl(input.coverUrl, "封面地址") ?? null,
      pdfUrl: parseOptionalUrl(input.pdfUrl, "PDF 地址") ?? null,
      mdUrl: parseOptionalUrl(input.mdUrl, "MD 地址") ?? null,
      sortOrder: numberValue(input.sortOrder, 100)
    };
  }

  private updatePayload(input: TextbookMutationInput): Prisma.LearningMaterialTextbookUpdateInput {
    const data: Prisma.LearningMaterialTextbookUpdateInput = {};

    if (input.slug !== undefined) {
      const slug = requiredText(input.slug, "slug", 100);
      assertValidSlug(slug);
      data.slug = slug;
    }

    if (input.title !== undefined) {
      data.title = requiredText(input.title, "教材名称", 200);
    }

    if (input.educationType !== undefined) {
      data.educationType = requiredEducationType(input.educationType);
    }

    if (input.subject !== undefined) {
      data.subject = requiredText(input.subject, "学科", 40);
    }

    if (input.version !== undefined) {
      data.version = requiredText(input.version, "版本", 80);
    }

    if (input.grade !== undefined) {
      data.grade = requiredText(input.grade, "年级", 40);
    }

    if (input.volume !== undefined) {
      data.volume = requiredVolume(input.volume);
    }

    if (input.curriculumStandardYear !== undefined) {
      data.curriculumStandardYear = optionalYearText(input.curriculumStandardYear, "课程标准") ?? null;
    }

    if (input.editionYear !== undefined) {
      data.editionYear = optionalLimitedText(input.editionYear, "版本时间", 40) ?? null;
    }

    if (input.publisher !== undefined) {
      data.publisher = optionalText(input.publisher) ?? null;
    }

    if (input.coverUrl !== undefined) {
      data.coverUrl = parseOptionalUrl(input.coverUrl, "封面地址") ?? null;
    }

    if (input.sortOrder !== undefined) {
      data.sortOrder = numberValue(input.sortOrder, 100);
    }

    return data;
  }

  private async assertTextbookSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.learningMaterialTextbook.findUnique({
      where: {
        slug
      }
    });

    if (existing && existing.id !== excludeId) {
      throw new AppException(40002, "教材 slug 已存在", HttpStatus.BAD_REQUEST);
    }
  }

  private async uploadTextbookFiles(slug: string, files: UploadedTextbookFiles) {
    const data: {
      pdfObjectKey?: string;
      pdfUrl?: string;
      mdObjectKey?: string;
      mdUrl?: string;
    } = {};
    const pdfFile = files.pdfFile?.[0];
    const mdFile = files.mdFile?.[0];

    if (pdfFile) {
      const uploaded = await uploadTextbookFile("pdf", slug, pdfFile);
      data.pdfObjectKey = uploaded.objectKey;
      data.pdfUrl = uploaded.url;
    }

    if (mdFile) {
      const uploaded = await uploadTextbookFile("md", slug, mdFile);
      data.mdObjectKey = uploaded.objectKey;
      data.mdUrl = uploaded.url;
    }

    return data;
  }

  private toTextbook(textbook: {
    id: string;
    slug: string;
    title: string;
    educationType: TextbookEducationType;
    subject: string;
    version: string;
    grade: string;
    volume: TextbookVolume;
    curriculumStandardYear: string | null;
    editionYear: string | null;
    publisher: string | null;
    coverUrl: string | null;
    sourceUrl: string | null;
    pdfUrl: string | null;
    pdfObjectKey?: string | null;
    backupPdfUrl?: string | null;
    backupPdfPath?: string | null;
    markdownContent?: string | null;
    markdownConversionStatus?: string | null;
    markdownConvertedAt?: Date | null;
    markdownPageCount?: number | null;
    mdUrl: string | null;
    mdObjectKey?: string | null;
    sortOrder: number;
    updatedAt: Date;
  }) {
    return {
      id: textbook.id,
      slug: textbook.slug,
      title: textbook.title,
      educationType: textbook.educationType,
      educationTypeName: educationTypeLabel(textbook.educationType),
      subject: textbook.subject,
      version: textbook.version,
      grade: textbook.grade,
      volume: textbook.volume,
      volumeName: volumeLabel(textbook.volume),
      curriculumStandardYear: textbook.curriculumStandardYear,
      editionYear: textbook.editionYear,
      publisher: textbook.publisher,
      coverUrl: textbook.coverUrl,
      sourceUrl: textbook.sourceUrl,
      pdfUrl: textbook.pdfObjectKey
        ? publicTextbookObjectUrl(textbook.pdfObjectKey)
        : publicTextbookObjectUrlFromStoredUrl(textbook.pdfUrl),
      backupPdfUrl: textbook.backupPdfUrl ?? null,
      mdUrl: null,
      sortOrder: textbook.sortOrder,
      hasPdf: Boolean(textbook.pdfUrl || textbook.pdfObjectKey),
      hasUploadedPdf: Boolean(textbook.pdfObjectKey),
      hasExternalPdf: Boolean(textbook.pdfUrl && !textbook.pdfObjectKey),
      hasBackupPdf: Boolean(textbook.backupPdfPath && textbook.backupPdfUrl),
      hasMarkdownContent: Boolean((textbook.markdownContent || textbook.mdObjectKey) && textbook.markdownConversionStatus === "READY"),
      markdownConversionStatus: textbook.markdownConversionStatus ?? "PENDING",
      markdownConvertedAt: textbook.markdownConvertedAt ?? null,
      markdownPageCount: textbook.markdownPageCount ?? null,
      hasMd: true,
      hasUploadedMd: Boolean(textbook.mdObjectKey),
      hasExternalMd: false,
      updatedAt: textbook.updatedAt
    };
  }

  private toMarkdown(textbook: {
    title: string;
    educationType: TextbookEducationType;
    subject: string;
    version: string;
    grade: string;
    volume: TextbookVolume;
    curriculumStandardYear: string | null;
    editionYear: string | null;
    publisher: string | null;
  }) {
    return [
      `# ${textbook.title}`,
      "",
      `- 类型：${educationTypeLabel(textbook.educationType)}`,
      `- 学科：${textbook.subject}`,
      `- 版本：${textbook.version}`,
      `- 年级：${textbook.grade}`,
      `- 册数：${volumeLabel(textbook.volume)}`,
      `- 课程标准：${textbook.curriculumStandardYear ? `${textbook.curriculumStandardYear}年版` : "未填写"}`,
      `- 版本时间：${textbook.editionYear ?? "未填写"}`,
      `- 出版社：${textbook.publisher ?? "未填写"}`,
      "",
      "> 该 Markdown 由教材管理后台根据元数据生成。配置正式 MD 下载地址后，将优先下载正式文件。",
      ""
    ].join("\n");
  }
}

function parseEducationType(value: string | undefined): TextbookEducationType | undefined {
  const normalized = optionalText(value);

  return educationTypeOptions.some((option) => option.value === normalized)
    ? (normalized as TextbookEducationType)
    : undefined;
}

function educationTypeLabel(value: TextbookEducationType) {
  return educationTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function volumeLabel(value: TextbookVolume) {
  return volumeOptions.find((option) => option.value === value)?.label ?? value;
}

function parseVolume(value: string | undefined): TextbookVolume | undefined {
  const normalized = optionalText(value);

  return volumeOptions.some((option) => option.value === normalized) ? (normalized as TextbookVolume) : undefined;
}

function optionalText(value: string | undefined) {
  const trimmed = String(value ?? "").trim();

  return trimmed || undefined;
}

function requiredText(value: string | undefined, label: string, maxLength: number) {
  const text = optionalText(value);

  if (!text) {
    throw new AppException(40001, `${label}不允许为空`, HttpStatus.BAD_REQUEST);
  }

  if (text.length > maxLength) {
    throw new AppException(40001, `${label}不能超过 ${maxLength} 个字符`, HttpStatus.BAD_REQUEST);
  }

  return text;
}

function optionalLimitedText(value: string | undefined, label: string, maxLength: number) {
  const text = optionalText(value);

  if (!text) {
    return undefined;
  }

  if (text.length > maxLength) {
    throw new AppException(40001, `${label}不能超过 ${maxLength} 个字符`, HttpStatus.BAD_REQUEST);
  }

  return text;
}

function optionalYearText(value: string | undefined, label: string) {
  const text = optionalText(value);

  if (!text) {
    return undefined;
  }

  if (!/^\d{4}$/.test(text)) {
    throw new AppException(40001, `${label}必须是 4 位年份`, HttpStatus.BAD_REQUEST);
  }

  return text;
}

function parseOptionalUrl(value: string | undefined, label: string) {
  const text = optionalText(value);

  if (!text) {
    return undefined;
  }

  if (text.length > 1000) {
    throw new AppException(40001, `${label}不能超过 1000 个字符`, HttpStatus.BAD_REQUEST);
  }

  let url: URL;

  try {
    url = new URL(text);
  } catch {
    throw new AppException(40001, `${label}格式不正确`, HttpStatus.BAD_REQUEST);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppException(40001, `${label}必须使用 http 或 https 地址`, HttpStatus.BAD_REQUEST);
  }

  return url.toString();
}

function requiredEducationType(value: string | undefined) {
  const educationType = parseEducationType(value);

  if (!educationType) {
    throw new AppException(40001, "请选择有效的教材类型", HttpStatus.BAD_REQUEST);
  }

  return educationType;
}

function requiredVolume(value: string | undefined) {
  const normalized = optionalText(value);

  if (volumeOptions.some((option) => option.value === normalized)) {
    return normalized as TextbookVolume;
  }

  throw new AppException(40001, "请选择有效的册数", HttpStatus.BAD_REQUEST);
}

function numberValue(value: string | undefined, fallback: number) {
  const number = Number(optionalText(value));

  return Number.isInteger(number) && number >= 0 && number <= 9999 ? number : fallback;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(optionalText(value));

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function booleanValue(value: string | undefined) {
  return value === "1" || value === "true" || value === "on";
}

function mergeOptions(defaultValues: string[], values: string[]) {
  return [...new Set([...defaultValues, ...values.map((value) => value.trim()).filter(Boolean)])].map((value) => ({
    value,
    label: value
  }));
}

export function buildTextbookVersionsBySubjectOptions(rows: Array<{ subject: string; version: string }>) {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const subject = row.subject.trim();
    const version = row.version.trim();

    if (!subject || !version) {
      continue;
    }

    grouped.set(subject, [...(grouped.get(subject) ?? []), version]);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([subject, versions]) => [subject, mergeOptions([], versions)])
  );
}

export function textbookUploadMaxBytes() {
  const defaultBytes = 80 * 1024 * 1024;
  const value = Number(process.env.TEXTBOOK_FILE_UPLOAD_MAX_BYTES ?? defaultBytes);

  return Number.isFinite(value) && value > 0 ? value : defaultBytes;
}

async function uploadTextbookFile(format: TextbookFileFormat, slug: string, file: UploadedTextbookFileLike) {
  assertTextbookFile(format, file);
  const config = s3Config();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const objectKey = `${config.prefix}${date}/${slug}-${randomBytes(8).toString("hex")}.${format}`;
  const url = await putS3Object(objectKey, file.buffer, contentTypeFor(format));

  return {
    objectKey,
    url
  };
}

function assertTextbookFile(format: TextbookFileFormat, file: UploadedTextbookFileLike) {
  const maxBytes = textbookUploadMaxBytes();
  const originalName = normalizeOriginalName(file.originalname);
  const extension = extname(originalName).toLowerCase();
  const expectedExtension = format === "pdf" ? ".pdf" : ".md";

  if (file.size <= 0 || file.size > maxBytes) {
    throw new AppException(
      40001,
      `教材文件大小不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`,
      HttpStatus.BAD_REQUEST
    );
  }

  if (extension !== expectedExtension) {
    throw new AppException(
      40001,
      format === "pdf" ? "PDF 文件必须使用 .pdf 后缀" : "Markdown 文件必须使用 .md 后缀",
      HttpStatus.BAD_REQUEST
    );
  }
}

async function putS3Object(objectKey: string, body: Buffer, contentType: string) {
  const config = s3Config();
  const url = s3ObjectUrl(config, objectKey);
  const parsedUrl = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const headers: Record<string, string> = {
    "content-type": contentType,
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
    body
  });

  if (!response.ok) {
    throw new AppException(50002, "对象存储上传失败", HttpStatus.BAD_GATEWAY);
  }

  return publicTextbookObjectUrl(objectKey);
}

async function downloadS3Object(objectKey: string) {
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
    headers: {
      ...headers,
      authorization
    }
  });

  if (!response.ok) {
    throw new AppException(50201, "对象存储文件读取失败", HttpStatus.BAD_GATEWAY);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function deleteTextbookObjectKeys(keys: Array<string | null | undefined>) {
  const uniqueKeys = [...new Set(keys.filter((key): key is string => Boolean(key)))];

  await Promise.all(
    uniqueKeys.map((key) =>
      deleteS3Object(key).catch(() => {
        return undefined;
      })
    )
  );
}

async function deleteS3Object(objectKey: string) {
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
    headers: {
      ...headers,
      authorization
    },
    method: "DELETE"
  });

  if (!response.ok && response.status !== 404) {
    throw new AppException(50202, "对象存储文件删除失败", HttpStatus.BAD_GATEWAY);
  }
}

function contentTypeFor(format: TextbookFileFormat) {
  return format === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8";
}

function assertSafeBackupPdfPath(value: string) {
  const backupDir = textbookBackupDir();
  const filePath = resolve(value);
  const normalizedBackupDir = backupDir.endsWith("/") ? backupDir : `${backupDir}/`;

  if (!filePath.startsWith(normalizedBackupDir)) {
    throw new AppException(50003, "PDF 备份路径不在允许目录内", HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return filePath;
}

function textbookBackupDir() {
  return resolve(process.env.TEXTBOOK_BACKUP_DIR ?? resolve(process.cwd(), "../../textbook"));
}

function normalizeMarkdownAssetUrls(
  content: string,
  textbookId: string,
  storedAssetBaseUrl: null | string,
  publicAssetBaseUrl: null | string
) {
  if (!publicAssetBaseUrl) {
    return content;
  }

  const privateAssetBaseUrls = [
    storedAssetBaseUrl,
    `/api/textbooks/${textbookId}/markdown-assets`,
    `/api/textbooks/${encodeURIComponent(textbookId)}/markdown-assets`,
    `/api/public/textbooks/${textbookId}/markdown-assets`,
    `/api/public/textbooks/${encodeURIComponent(textbookId)}/markdown-assets`
  ].filter((value): value is string => Boolean(value) && value !== publicAssetBaseUrl);

  return Array.from(new Set(privateAssetBaseUrls)).reduce(
    (currentContent, privateAssetBaseUrl) =>
      currentContent.split(privateAssetBaseUrl.replace(/\/+$/, "")).join(publicAssetBaseUrl.replace(/\/+$/, "")),
    content
  );
}

function assertSafeMarkdownAssetFilename(filename: string) {
  if (!/^[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp)$/i.test(filename)) {
    throw new AppException(40001, "Markdown 图片资源名称不正确", HttpStatus.BAD_REQUEST);
  }

  return filename;
}

function assertSafeMarkdownAssetPath(assetDir: string, filename: string) {
  const safeFilename = assertSafeMarkdownAssetFilename(filename);
  const baseDir = resolve(assetDir);
  const filePath = resolve(baseDir, safeFilename);
  const normalizedBaseDir = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;

  if (!filePath.startsWith(normalizedBaseDir)) {
    throw new AppException(50004, "Markdown 图片资源路径不在允许目录内", HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return filePath;
}

function textbookMarkdownAssetObjectKey(textbookId: string, filename: string) {
  return `${textbookS3KeyPrefix()}markdown-assets/${safeObjectPathSegment(textbookId)}/${safeObjectPathSegment(filename)}`;
}

function textbookMarkdownAssetBaseUrl(textbookId: string) {
  return publicTextbookObjectUrl(
    `${textbookS3KeyPrefix()}markdown-assets/${safeObjectPathSegment(textbookId)}/`,
    textbookCdnBaseUrl()
  ).replace(/\/+$/, "");
}

function textbookS3KeyPrefix() {
  const prefixInput = (process.env.TEXTBOOK_S3_KEY_PREFIX ?? "learning-materials/textbooks/").replace(/^\/+/, "");

  return prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput;
}

function imageContentTypeFromObjectKey(objectKey: string) {
  const extension = extensionFromObjectKey(objectKey);

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function extensionFromObjectKey(objectKey: string) {
  const extension = objectKey.split(".").pop()?.toLowerCase();

  return extension && /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
}

function safeObjectPathSegment(value: string) {
  const safe = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");

  return safe || "asset";
}

function textbookCoverObjectKeyFromUrl(coverUrl: string) {
  const config = s3Config();
  const marker = `${config.prefix}covers/`;

  if (!coverUrl.includes(marker)) {
    return null;
  }

  try {
    const pathname = decodeURIComponent(new URL(coverUrl).pathname).replace(/^\/+/, "");
    const markerIndex = pathname.indexOf(marker);

    if (markerIndex >= 0) {
      return pathname.slice(markerIndex);
    }
  } catch {
    const markerIndex = coverUrl.indexOf(marker);

    if (markerIndex >= 0) {
      return coverUrl.slice(markerIndex);
    }
  }

  return null;
}

function normalizeOriginalName(value: string) {
  const safeName = value.split(/[\\/]/).pop()?.normalize("NFC") ?? "textbook";
  const decoded = Buffer.from(safeName, "latin1").toString("utf8").normalize("NFC");

  return decoded.includes("�") ? safeName : decoded;
}

function s3ObjectUrl(config: ReturnType<typeof s3Config>, objectKey: string) {
  const endpoint = config.endpoint.replace(/\/+$/, "");

  return config.pathStyle
    ? `${endpoint}/${config.bucket}/${objectKey}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${objectKey}`;
}

function s3Config() {
  const endpoint = requiredEnv("S3_ENDPOINT");
  const bucket = requiredEnv("S3_BUCKET");
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const prefixInput = (process.env.TEXTBOOK_S3_KEY_PREFIX ?? "learning-materials/textbooks/").replace(/^\/+/, "");

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION || "auto",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix: prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput
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
