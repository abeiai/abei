import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { getPrismaClient, type CopybookRecord, type Prisma, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { RenderEngineService } from "../render-engine/render-engine.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { calculateCopybookPricing } from "./copybook-pricing.js";
import { copybookSourceConfigVersion, normalizeCopybookSourceConfig } from "./copybook-source-config.js";
import { deleteCopybookPdfFromR2, downloadCopybookPdfFromR2, uploadCopybookPdfToR2 } from "./copybook-storage.js";
import type { GenerateCopybookDto } from "./dto/copybook.dto.js";

const templateNames: Record<string, string> = {
  calligraphy: "书法练习",
  english: "英文抄写",
  essay: "作文纸",
  huizi: "回字格",
  line: "横线格",
  number: "数字书写",
  "name-label": "姓名贴",
  pinyin: "拼音练习",
  "pinyin-tian": "拼音田格",
  shengzi: "生字练习"
};

const publicCopybookRecordSelect = {
  id: true,
  templateId: true,
  templateName: true,
  contentPreview: true,
  pdfUrl: true,
  pdfFilename: true,
  pdfSize: true,
  credits: true,
  pageCount: true,
  sourceConfigVersion: true,
  createdAt: true
} satisfies Prisma.CopybookRecordSelect;

type PublicCopybookRecord = Prisma.CopybookRecordGetPayload<{ select: typeof publicCopybookRecordSelect }>;

@Injectable()
export class CopybooksService {
  private readonly prisma: PrismaClient = getPrismaClient();

  constructor(
    @Inject(RenderEngineService) private readonly renderEngineService: RenderEngineService,
    @Inject(WalletService) private readonly walletService: WalletService,
    @Inject(LearnerActivityService) private readonly learnerActivityService?: LearnerActivityService
  ) {}

  async generate(subject: ProfileSubject, input: GenerateCopybookDto) {
    const { userId } = subject;
    const requestId = safeRequestId(input.requestId);
    const existingRecord = requestId ? await this.findByRequestId(userId, requestId) : null;

    if (existingRecord) {
      const wallet = await this.walletService.getWallet(userId);

      return {
        credits: existingRecord.credits,
        alreadyGenerated: true,
        wallet,
        record: this.toPublicRecord(existingRecord)
      };
    }

    const layout = normalizeLayout(input.layout);
    const sourceConfig = normalizeCopybookSourceConfig(input.sourceConfig, input.templateId);
    const pricing = calculateCopybookPricing(layout, input.templateId);

    if (pricing.credits > 0) {
      await this.assertWalletCanCover(userId, pricing.credits);
    }
    const promotionalWallet = pricing.credits === 0
      ? await this.walletService.getWallet(userId)
      : null;

    const pdf = await this.renderEngineService.renderPdf(layout);
    const uploaded = await uploadCopybookPdfToR2(userId, pdf);

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const createdRecord = await transaction.copybookRecord.create({
          data: {
            userId,
            learnerId: null,
            requestId,
            templateId: normalizeTemplateId(input.templateId),
            templateName: normalizeTemplateName(input.templateName, input.templateId),
            contentPreview: contentPreview(input.content, layout),
            pdfFilename: uploaded.filename,
            pdfObjectKey: uploaded.objectKey,
            pdfUrl: uploaded.url,
            pdfSize: uploaded.size,
            credits: pricing.credits,
            pageCount: pricing.pageCount,
            ...(sourceConfig
              ? {
                  sourceConfig,
                  sourceConfigVersion: copybookSourceConfigVersion
                }
              : {})
          }
        });
        const walletResult = pricing.credits > 0
          ? await this.walletService.consumeCopybookGenerateCreditsInTransaction(
            transaction,
            userId,
            createdRecord.id,
            pricing.credits
          )
          : null;
        if (this.learnerActivityService) {
          await this.learnerActivityService.record({
            subject: { userId, mode: "ACCOUNT", learnerId: null },
            eventType: "CREATE_COMPLETED",
            resourceType: "COPYBOOK",
            resourceId: createdRecord.id,
            idempotencyKey: `copybook:${createdRecord.id}:create-completed`,
            metrics: { pageCount: pricing.pageCount }
          }, transaction);
        }

        return {
          createdRecord,
          walletResult
        };
      });
      const wallet = result.walletResult?.wallet ?? promotionalWallet;

      if (!wallet) {
        throw new AppException(50001, "钱包信息读取失败", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        credits: pricing.credits,
        alreadyGenerated: false,
        wallet,
        record: this.toPublicRecord(result.createdRecord)
      };
    } catch (error) {
      await deleteCopybookPdfFromR2(uploaded.objectKey).catch(() => undefined);

      if (isUniqueConstraintError(error) && requestId) {
        const record = await this.findByRequestId(userId, requestId);

        if (record) {
          return {
            credits: record.credits,
            alreadyGenerated: true,
            wallet: await this.walletService.getWallet(userId),
            record: this.toPublicRecord(record)
          };
        }
      }

      throw error;
    }
  }

  async list(subject: ProfileSubject) {
    const { userId } = subject;
    const records = await this.prisma.copybookRecord.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      select: publicCopybookRecordSelect,
      take: 80
    });

    return records.map((record) => this.toPublicRecord(record));
  }

  async source(subject: ProfileSubject, id: string) {
    const { userId } = subject;
    const record = await this.prisma.copybookRecord.findFirst({
      where: {
        id,
        userId
      },
      select: {
        sourceConfig: true,
        sourceConfigVersion: true,
        templateId: true
      }
    });

    if (!record) {
      throw new AppException(40401, "字帖记录不存在", HttpStatus.NOT_FOUND);
    }

    if (
      record.templateId !== "name-label" ||
      record.sourceConfigVersion !== copybookSourceConfigVersion ||
      !record.sourceConfig
    ) {
      throw new AppException(40402, "该字帖记录未保存可恢复的姓名贴设置", HttpStatus.NOT_FOUND);
    }

    return {
      sourceConfig: record.sourceConfig
    };
  }

  async delete(subject: ProfileSubject, id: string) {
    const { userId } = subject;
    const record = await this.prisma.copybookRecord.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!record) {
      throw new AppException(40401, "字帖记录不存在", HttpStatus.NOT_FOUND);
    }

    await deleteCopybookPdfFromR2(record.pdfObjectKey);
    await this.prisma.copybookRecord.delete({
      where: {
        id: record.id
      }
    });

    return {};
  }

  async pdf(subject: ProfileSubject, id: string) {
    const { userId } = subject;
    const record = await this.prisma.copybookRecord.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!record) {
      throw new AppException(40401, "字帖记录不存在", HttpStatus.NOT_FOUND);
    }

    return {
      filename: record.pdfFilename,
      size: record.pdfSize,
      buffer: await downloadCopybookPdfFromR2(record.pdfObjectKey)
    };
  }

  private async findByRequestId(userId: string, requestId: string) {
    return this.prisma.copybookRecord.findUnique({
      where: {
        userId_requestId: {
          userId,
          requestId
        }
      }
    });
  }

  private async assertWalletCanCover(userId: string, credits: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        userId
      },
      select: {
        availableCredits: true
      }
    });

    if (!wallet || wallet.availableCredits < credits) {
      throw new AppException(40004, "点数余额不足，请先充值", HttpStatus.BAD_REQUEST);
    }
  }

  private toPublicRecord(record: CopybookRecord | PublicCopybookRecord) {
    return {
      id: record.id,
      templateId: record.templateId,
      templateName: record.templateName,
      contentPreview: record.contentPreview,
      pdfUrl: record.pdfUrl,
      pdfFilename: record.pdfFilename,
      pdfSize: record.pdfSize,
      credits: record.credits,
      pageCount: record.pageCount,
      hasSourceConfig: record.sourceConfigVersion === copybookSourceConfigVersion,
      createdAt: record.createdAt
    };
  }
}

function normalizeLayout(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppException(40001, "字帖内容不能为空", HttpStatus.BAD_REQUEST);
  }

  return value as Record<string, unknown>;
}

function safeRequestId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const requestId = value.trim();

  return /^[a-zA-Z0-9_-]{8,80}$/.test(requestId) ? requestId : null;
}

function normalizeTemplateId(value: unknown) {
  if (typeof value !== "string") {
    return "custom";
  }

  const templateId = value.trim();

  return templateId ? templateId.slice(0, 40) : "custom";
}

function normalizeTemplateName(value: unknown, templateId: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 40);
  }

  return typeof templateId === "string" && templateNames[templateId] ? templateNames[templateId] : "字帖";
}

function contentPreview(content: unknown, layout: Record<string, unknown>) {
  const source = typeof content === "string" && content.trim() ? content : textFromLayout(layout);
  const preview = Array.from(source.replace(/\s+/g, " ").trim()).slice(0, 20).join("");

  return preview || "未命名字帖";
}

function textFromLayout(layout: Record<string, unknown>) {
  const firstPage = Array.isArray(layout.pages) ? layout.pages[0] : layout;
  const content = firstPage && typeof firstPage === "object" && "content" in firstPage ? firstPage.content : null;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => (item && typeof item === "object" && "text" in item && typeof item.text === "string" ? item.text : ""))
    .join("");
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
