import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import {
  pageCompositionTargetTypes,
  type PageCompositionTargetTypeValue,
  type UpsertPageCompositionDto
} from "./dto/page-composition.dto.js";

const compositionInclude = {
  page: true,
  items: {
    include: {
      module: {
        include: {
          items: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
          }
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  }
} satisfies Prisma.PageCompositionInclude;

@Injectable()
export class PageCompositionsService {
  private readonly prisma = getPrismaClient();

  async listCompositions() {
    return this.prisma.pageComposition.findMany({
      include: compositionInclude,
      orderBy: [{ targetType: "asc" }, { updatedAt: "desc" }]
    });
  }

  async getByTarget(targetTypeInput?: string, pageId?: string) {
    const targetType = this.normalizeTargetType(targetTypeInput);
    const target = await this.resolveTarget(targetType, pageId);
    const composition = await this.prisma.pageComposition.findUnique({
      where: {
        targetKey: target.targetKey
      },
      include: compositionInclude
    });

    return (
      composition ?? {
        id: "",
        targetKey: target.targetKey,
        targetType,
        pageId: target.pageId,
        title: target.title,
        isEnabled: false,
        showHeader: true,
        showFooter: true,
        createdAt: null,
        updatedAt: null,
        page: target.page,
        items: []
      }
    );
  }

  async upsertByTarget(dto: UpsertPageCompositionDto) {
    const target = await this.resolveTarget(dto.targetType, dto.pageId);
    const modules = await this.ensureModules(dto.modules?.map((item) => item.moduleId) ?? []);

    const composition = await this.prisma.pageComposition.upsert({
      where: {
        targetKey: target.targetKey
      },
      create: {
        targetKey: target.targetKey,
        targetType: dto.targetType,
        pageId: target.pageId,
        title: target.title,
        isEnabled: dto.isEnabled ?? false,
        showHeader: dto.showHeader ?? true,
        showFooter: dto.showFooter ?? true
      },
      update: {
        pageId: target.pageId,
        title: target.title,
        isEnabled: dto.isEnabled ?? false,
        showHeader: dto.showHeader ?? true,
        showFooter: dto.showFooter ?? true
      }
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.pageCompositionItem.deleteMany({
        where: {
          compositionId: composition.id
        }
      });

      if (modules.length > 0) {
        await tx.pageCompositionItem.createMany({
          data: modules.map((module, index) => ({
            compositionId: composition.id,
            moduleId: module.id,
            sortOrder: index
          }))
        });
      }
    });

    return this.prisma.pageComposition.findUniqueOrThrow({
      where: {
        id: composition.id
      },
      include: compositionInclude
    });
  }

  async getActiveHomeComposition() {
    const composition = await this.prisma.pageComposition.findFirst({
      where: {
        targetKey: "HOME",
        targetType: "HOME"
      },
      include: compositionInclude
    });

    return composition ? this.toPublicComposition(composition) : null;
  }

  async getActivePageComposition(slug: string) {
    const page = await this.prisma.page.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        OR: [
          {
            publishedAt: null
          },
          {
            publishedAt: {
              lte: new Date()
            }
          }
        ]
      },
      select: {
        id: true
      }
    });

    if (!page) {
      return null;
    }

    const composition = await this.prisma.pageComposition.findFirst({
      where: {
        targetKey: `PAGE:${page.id}`,
        targetType: "PAGE"
      },
      include: compositionInclude
    });

    return composition ? this.toPublicComposition(composition) : null;
  }

  private normalizeTargetType(value?: string) {
    const targetType = pageCompositionTargetTypes.find((item) => item === value);

    if (!targetType) {
      throw new AppException(40001, "编排对象类型不正确", HttpStatus.BAD_REQUEST);
    }

    return targetType;
  }

  private async resolveTarget(targetType: PageCompositionTargetTypeValue, pageId?: string) {
    if (targetType === "HOME") {
      return {
        targetKey: "HOME",
        pageId: null,
        title: "首页",
        page: null
      };
    }

    if (!pageId) {
      throw new AppException(40001, "请选择要编排的单页", HttpStatus.BAD_REQUEST);
    }

    const page = await this.prisma.page.findUnique({
      where: {
        id: pageId
      }
    });

    if (!page) {
      throw new AppException(40401, "单页不存在", HttpStatus.NOT_FOUND);
    }

    return {
      targetKey: `PAGE:${page.id}`,
      pageId: page.id,
      title: page.title,
      page
    };
  }

  private async ensureModules(moduleIds: string[]) {
    const uniqueIds = Array.from(new Set(moduleIds.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return [];
    }

    const modules = await this.prisma.contentModule.findMany({
      where: {
        id: {
          in: uniqueIds
        }
      }
    });

    if (modules.length !== uniqueIds.length) {
      throw new AppException(40004, "存在不可用的模块，请重新选择", HttpStatus.BAD_REQUEST);
    }

    return uniqueIds.map((id) => modules.find((module) => module.id === id)).filter(Boolean) as typeof modules;
  }

  private async toPublicComposition(
    composition: Prisma.PageCompositionGetPayload<{
      include: typeof compositionInclude;
    }>
  ) {
    const modules = composition.items
      .filter((item) => item.module.isEnabled)
      .map((item) => item.module);
    const publicModules = await this.resolveModuleLinks(modules);

    return {
      ...composition,
      items: composition.items
        .filter((item) => item.module.isEnabled)
        .map((item, index) => ({
          ...item,
          module: publicModules[index]
        }))
    };
  }

  private async resolveModuleLinks<TModule extends { items: Array<{ linkType: string | null; linkTarget: string | null }> }>(
    modules: TModule[]
  ) {
    const pageIds = new Set<string>();
    const articleIds = new Set<string>();
    const categoryIds = new Set<string>();

    for (const module of modules) {
      for (const item of module.items) {
        if (item.linkType === "PAGE" && item.linkTarget) {
          pageIds.add(item.linkTarget);
        }

        if (item.linkType === "ARTICLE" && item.linkTarget) {
          articleIds.add(item.linkTarget);
        }

        if (item.linkType === "CATEGORY" && item.linkTarget) {
          categoryIds.add(item.linkTarget);
        }
      }
    }

    const [pages, articles, categories] = await Promise.all([
      pageIds.size
        ? this.prisma.page.findMany({
            where: {
              id: {
                in: Array.from(pageIds)
              }
            },
            select: {
              id: true,
              slug: true
            }
          })
        : [],
      articleIds.size
        ? this.prisma.article.findMany({
            where: {
              id: {
                in: Array.from(articleIds)
              }
            },
            select: {
              id: true,
              slug: true
            }
          })
        : [],
      categoryIds.size
        ? this.prisma.articleCategory.findMany({
            where: {
              id: {
                in: Array.from(categoryIds)
              }
            },
            select: {
              id: true,
              slug: true
            }
          })
        : []
    ]);
    const pageById = new Map(pages.map((page) => [page.id, page.slug]));
    const articleById = new Map(articles.map((article) => [article.id, article.slug]));
    const categoryById = new Map(categories.map((category) => [category.id, category.slug]));

    return modules.map((module) => ({
      ...module,
      items: module.items.map((item) => ({
        ...item,
        resolvedHref: this.resolveHref(item.linkType, item.linkTarget, {
          pageById,
          articleById,
          categoryById
        })
      }))
    }));
  }

  private resolveHref(
    linkType: string | null,
    linkTarget: string | null,
    maps: {
      pageById: Map<string, string>;
      articleById: Map<string, string>;
      categoryById: Map<string, string>;
    }
  ) {
    if (!linkType || linkType === "NONE" || !linkTarget) {
      return "";
    }

    if (linkType === "EXTERNAL") {
      return /^https?:\/\//i.test(linkTarget) || linkTarget.startsWith("/") ? linkTarget : "";
    }

    if (linkType === "PAGE") {
      const slug = maps.pageById.get(linkTarget);

      return slug ? `/pages/${slug}` : "";
    }

    if (linkType === "ARTICLE") {
      const slug = maps.articleById.get(linkTarget);

      return slug ? `/articles/${slug}` : "";
    }

    if (linkType === "CATEGORY") {
      const slug = maps.categoryById.get(linkTarget);

      return slug ? `/articles?category=${encodeURIComponent(slug)}` : "";
    }

    return "";
  }
}
