import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { assertValidSlug } from "../cms/slug.js";
import {
  contentModuleTypes,
  type ContentModuleItemDto,
  type ContentModuleTypeValue,
  type CreateContentModuleDto,
  type UpdateContentModuleDto
} from "./dto/content-module.dto.js";

type JsonRecord = Record<string, unknown>;

const transitionTypes = ["FADE", "SLIDE", "SCALE"] as const;
const cardTextPositions = ["BELOW_IMAGE", "IMAGE_BOTTOM", "IMAGE_MIDDLE"] as const;
const splitLayouts = ["TEXT_LEFT_IMAGE_RIGHT", "IMAGE_LEFT_TEXT_RIGHT"] as const;
const imageRatios = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;
const splitTextModes = ["TITLE_TEXT", "ICON_LIST"] as const;

@Injectable()
export class ContentModulesService {
  private readonly prisma = getPrismaClient();

  async listModules(type?: string) {
    const moduleType = contentModuleTypes.find((item) => item === type);

    return this.prisma.contentModule.findMany({
      where: moduleType
        ? {
            type: moduleType
          }
        : undefined,
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        },
        _count: {
          select: {
            items: true
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
    });
  }

  async getModule(id: string) {
    return this.ensureModule(id);
  }

  async createModule(dto: CreateContentModuleDto) {
    const slug = dto.slug.trim();
    assertValidSlug(slug);
    await this.assertSlugAvailable(slug);

    const type = dto.type;
    const module = await this.prisma.contentModule.create({
      data: {
        name: dto.name.trim(),
        slug,
        type,
        description: this.optionalText(dto.description),
        settings: this.toInputJson(this.normalizeSettings(type, dto.settings)),
        isEnabled: dto.isEnabled ?? true,
        sortOrder: dto.sortOrder ?? 0,
        items: {
          create: this.normalizeItems(type, dto.items ?? []).map((item) => ({
            title: item.title,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
            linkType: item.linkType,
            linkTarget: item.linkTarget,
            config: item.config,
            sortOrder: item.sortOrder
          }))
        }
      },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    return module;
  }

  async updateModule(id: string, dto: UpdateContentModuleDto) {
    const existing = await this.ensureModule(id);
    const type = dto.type ?? existing.type;

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      assertValidSlug(slug);
      await this.assertSlugAvailable(slug, id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contentModule.update({
        where: {
          id
        },
        data: {
          name: dto.name?.trim(),
          slug: dto.slug?.trim(),
          type,
          description: dto.description !== undefined ? this.optionalText(dto.description) : undefined,
          settings:
            dto.settings !== undefined
              ? this.toInputJson(this.normalizeSettings(type, dto.settings))
              : undefined,
          isEnabled: dto.isEnabled,
          sortOrder: dto.sortOrder
        }
      });

      if (dto.items !== undefined) {
        await this.replaceItems(tx, id, type, dto.items);
      }
    });

    return this.ensureModule(id);
  }

  async deleteModule(id: string) {
    await this.ensureModule(id);
    await this.prisma.contentModule.delete({
      where: {
        id
      }
    });

    return {};
  }

  private async replaceItems(
    tx: Prisma.TransactionClient,
    moduleId: string,
    type: ContentModuleTypeValue,
    items: ContentModuleItemDto[]
  ) {
    const existingItems = await tx.contentModuleItem.findMany({
      where: {
        moduleId
      },
      select: {
        id: true
      }
    });
    const existingIds = new Set(existingItems.map((item) => item.id));
    const incomingIds = items
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id && existingIds.has(id)));

    await tx.contentModuleItem.deleteMany({
      where: {
        moduleId,
        id: {
          notIn: incomingIds
        }
      }
    });

    const normalizedItems = this.normalizeItems(type, items);

    for (const item of normalizedItems) {
      if (item.id && existingIds.has(item.id)) {
        await tx.contentModuleItem.update({
          where: {
            id: item.id
          },
          data: {
            title: item.title,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
            linkType: item.linkType,
            linkTarget: item.linkTarget,
            config: item.config,
            sortOrder: item.sortOrder
          }
        });
      } else {
        await tx.contentModuleItem.create({
          data: {
            moduleId,
            title: item.title,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
            linkType: item.linkType,
            linkTarget: item.linkTarget,
            config: item.config,
            sortOrder: item.sortOrder
          }
        });
      }
    }
  }

  private async ensureModule(id: string) {
    const module = await this.prisma.contentModule.findUnique({
      where: {
        id
      },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!module) {
      throw new AppException(40401, "模块不存在", HttpStatus.NOT_FOUND);
    }

    return module;
  }

  private async assertSlugAvailable(slug: string, ignoredId?: string) {
    const existing = await this.prisma.contentModule.findUnique({
      where: {
        slug
      },
      select: {
        id: true
      }
    });

    if (existing && existing.id !== ignoredId) {
      throw new AppException(40004, "模块 slug 已存在", HttpStatus.BAD_REQUEST);
    }
  }

  private normalizeItems(type: ContentModuleTypeValue, items: ContentModuleItemDto[]) {
    return items.map((item, index) => {
      const config = this.normalizeItemConfig(type, item.config);

      return {
        id: this.optionalText(item.id),
        title: this.optionalText(item.title),
        imageUrl: this.optionalText(item.imageUrl),
        imageAlt: this.optionalText(item.imageAlt),
        linkType: this.optionalText(item.linkType) ?? "NONE",
        linkTarget: this.optionalText(item.linkTarget),
        config: this.toInputJson(config),
        sortOrder: item.sortOrder ?? index
      };
    });
  }

  private normalizeSettings(type: ContentModuleTypeValue, input?: JsonRecord) {
    const settings = this.record(input);

    if (type === "SLIDESHOW") {
      return {
        transition: this.pick(settings.transition, transitionTypes, "FADE"),
        intervalSeconds: this.numberInRange(settings.intervalSeconds, 2, 30, 5),
        opacity: this.numberInRange(settings.opacity, 0, 100, 100)
      };
    }

    if (type === "IMAGE_CARD_LIST") {
      return {
        cardsPerRow: this.numberInRange(settings.cardsPerRow, 1, 6, 3),
        textPosition: this.pick(settings.textPosition, cardTextPositions, "BELOW_IMAGE"),
        fontSize: this.numberInRange(settings.fontSize, 12, 40, 18)
      };
    }

    return {
      layout: this.pick(settings.layout, splitLayouts, "TEXT_LEFT_IMAGE_RIGHT"),
      imageRatio: this.pick(settings.imageRatio, imageRatios, "16:9"),
      imageUrl: this.optionalText(String(settings.imageUrl ?? "")) ?? "",
      imageAlt: this.optionalText(String(settings.imageAlt ?? "")) ?? "",
      textMode: this.pick(settings.textMode, splitTextModes, "TITLE_TEXT"),
      introText: this.textStyle(settings.introText),
      titleText: this.textStyle(settings.titleText, "", 28),
      descriptionText: this.textStyle(settings.descriptionText),
      iconItems: this.iconItems(settings.iconItems)
    };
  }

  private normalizeItemConfig(type: ContentModuleTypeValue, input?: JsonRecord) {
    const config = this.record(input);

    if (type === "SLIDESHOW") {
      return {
        introText: this.textStyle(config.introText),
        titleText: this.textStyle(config.titleText, "", 32),
        descriptionText: this.textStyle(config.descriptionText),
        textPosition: this.pick(config.textPosition, ["LEFT", "RIGHT"] as const, "LEFT"),
        buttonText: this.optionalText(String(config.buttonText ?? "")) ?? "",
        buttonLink: this.optionalText(String(config.buttonLink ?? "")) ?? "",
        buttonBgColor: this.color(config.buttonBgColor, "#111111"),
        buttonTextColor: this.color(config.buttonTextColor, "#ffffff")
      };
    }

    if (type === "SPLIT_IMAGE_TEXT") {
      return {
        layout: this.pick(config.layout, splitLayouts, "TEXT_LEFT_IMAGE_RIGHT"),
        imageRatio: this.pick(config.imageRatio, imageRatios, "16:9"),
        textMode: this.pick(config.textMode, splitTextModes, "TITLE_TEXT"),
        introText: this.textStyle(config.introText),
        titleText: this.textStyle(config.titleText, "", 28),
        descriptionText: this.textStyle(config.descriptionText),
        buttonText: this.optionalText(String(config.buttonText ?? "")) ?? "",
        buttonLink: this.optionalText(String(config.buttonLink ?? "")) ?? "",
        buttonTextColor: this.color(config.buttonTextColor, "#ffffff"),
        buttonBgColor: this.color(config.buttonBgColor, "#111827"),
        iconItems: this.iconItems(config.iconItems)
      };
    }

    return {
      ...config
    };
  }

  private textStyle(value: unknown, fallbackText = "", fallbackSize = 18) {
    const record = this.record(value);

    return {
      text: this.optionalText(String(record.text ?? "")) ?? fallbackText,
      fontFamily: this.optionalText(String(record.fontFamily ?? "")) ?? "system",
      fontSize: this.numberInRange(record.fontSize, 10, 72, fallbackSize),
      color: this.color(record.color, "")
    };
  }

  private iconItems(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.slice(0, 20).map((item) => {
      const record = this.record(item);

      return {
        icon: this.optionalText(String(record.icon ?? "")) ?? "Sparkles",
        text: this.optionalText(String(record.text ?? "")) ?? ""
      };
    });
  }

  private pick<TValue extends readonly string[]>(
    value: unknown,
    options: TValue,
    fallback: TValue[number]
  ): TValue[number] {
    return typeof value === "string" && options.includes(value) ? value : fallback;
  }

  private numberInRange(value: unknown, min: number, max: number, fallback: number) {
    const next = Number(value);

    if (!Number.isFinite(next)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(next)));
  }

  private color(value: unknown, fallback: string) {
    const text = String(value ?? "").trim();

    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  private record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private optionalText(value?: string) {
    const text = value?.trim();

    return text ? text : undefined;
  }

  private toInputJson(value: JsonRecord) {
    return value as Prisma.InputJsonObject;
  }
}
