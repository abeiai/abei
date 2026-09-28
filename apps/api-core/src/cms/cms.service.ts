import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { CreateArticleDto, UpdateArticleDto } from "./dto/article.dto.js";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto.js";
import { CreatePageDto, UpdatePageDto } from "./dto/page.dto.js";
import { CreateTagDto, UpdateTagDto } from "./dto/tag.dto.js";
import { assertValidSlug } from "./slug.js";

const articleInclude = {
  category: true,
  coverMedia: true,
  articleCategories: {
    include: {
      category: true
    },
    orderBy: {
      category: {
        sortOrder: "asc"
      }
    }
  },
  articleTags: {
    include: {
      tag: true
    },
    orderBy: {
      tag: {
        name: "asc"
      }
    }
  }
} satisfies Prisma.ArticleInclude;

@Injectable()
export class CmsService {
  private readonly prisma = getPrismaClient();

  async publishDueContent() {
    const now = new Date();
    const [articles, pages] = await this.prisma.$transaction([
      this.prisma.article.updateMany({
        where: {
          status: "DRAFT",
          scheduledAt: {
            lte: now
          }
        },
        data: {
          status: "PUBLISHED",
          publishedAt: now
        }
      }),
      this.prisma.page.updateMany({
        where: {
          status: "DRAFT",
          scheduledAt: {
            lte: now
          }
        },
        data: {
          status: "PUBLISHED",
          publishedAt: now
        }
      })
    ]);

    return {
      articles: articles.count,
      pages: pages.count
    };
  }

  async listCategories() {
    return this.prisma.articleCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      include: {
        _count: {
          select: {
            articles: true
          }
        }
      }
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const slug = dto.slug.trim();
    assertValidSlug(slug);
    await this.assertCategorySlugAvailable(slug);

    return this.prisma.articleCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: this.optionalText(dto.description),
        sortOrder: dto.sortOrder ?? 0,
        isVisible: dto.isVisible ?? true
      }
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.ensureCategory(id);

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      assertValidSlug(slug);
      await this.assertCategorySlugAvailable(slug, id);
    }

    return this.prisma.articleCategory.update({
      where: {
        id
      },
      data: {
        name: dto.name?.trim(),
        slug: dto.slug?.trim(),
        description: dto.description !== undefined ? this.optionalText(dto.description) : undefined,
        sortOrder: dto.sortOrder,
        isVisible: dto.isVisible
      }
    });
  }

  async deleteCategory(id: string) {
    const category = await this.ensureCategory(id);
    const articleCount = await this.prisma.article.count({
      where: {
        categoryId: category.id
      }
    });

    if (articleCount > 0) {
      throw new AppException(40004, "请先删除或移动该分类下的文章", HttpStatus.BAD_REQUEST);
    }

    await this.prisma.articleCategory.delete({
      where: {
        id
      }
    });

    return {};
  }

  async listArticles() {
    const articles = await this.prisma.article.findMany({
      orderBy: [{ updatedAt: "desc" }],
      include: articleInclude
    });

    return articles.map((article) => this.toArticle(article));
  }

  async createArticle(dto: CreateArticleDto) {
    const slug = dto.slug.trim();
    assertValidSlug(slug);
    await this.assertArticleSlugAvailable(slug);
    const categoryIds = this.normalizeCategoryIds(dto.categoryIds, dto.categoryId);
    await this.ensureCategories(categoryIds);

    const status = dto.status ?? "DRAFT";
    const scheduledAt = this.optionalDate(dto.scheduledAt);
    const publishedAt = this.optionalDate(dto.publishedAt);
    await this.ensureMedia(dto.coverMediaId);
    const tagSlugs = this.normalizeTagSlugs(dto.tagSlugs);
    await this.ensureTags(tagSlugs);

    const article = await this.prisma.article.create({
      data: {
        categoryId: categoryIds[0],
        coverMediaId: this.optionalText(dto.coverMediaId),
        title: dto.title.trim(),
        slug,
        summary: this.optionalText(dto.summary),
        coverImage: this.optionalText(dto.coverImage),
        content: dto.content.trim(),
        status,
        seoTitle: this.optionalText(dto.seoTitle),
        seoDescription: this.optionalText(dto.seoDescription),
        seoKeywords: this.optionalText(dto.seoKeywords),
        canonicalUrl: this.optionalText(dto.canonicalUrl),
        noIndex: dto.noIndex ?? false,
        ogTitle: this.optionalText(dto.ogTitle),
        ogDescription: this.optionalText(dto.ogDescription),
        ogImage: this.optionalText(dto.ogImage),
        scheduledAt,
        publishedAt: status === "PUBLISHED" ? publishedAt ?? new Date() : publishedAt,
        articleCategories: {
          create: categoryIds.map((categoryId) => ({
            category: {
              connect: {
                id: categoryId
              }
            }
          }))
        },
        articleTags: {
          create: tagSlugs.map((tagSlug) => ({
            tag: {
              connect: {
                slug: tagSlug
              }
            }
          }))
        }
      },
      include: articleInclude
    });

    return this.toArticle(article);
  }

  async updateArticle(id: string, dto: UpdateArticleDto) {
    const existing = await this.ensureArticle(id);

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      assertValidSlug(slug);
      await this.assertArticleSlugAvailable(slug, id);
    }

    const categoryIds =
      dto.categoryIds === undefined && dto.categoryId === undefined
        ? undefined
        : this.normalizeCategoryIds(dto.categoryIds, dto.categoryId);

    if (categoryIds !== undefined) {
      await this.ensureCategories(categoryIds);
    }

    if (dto.coverMediaId !== undefined) {
      await this.ensureMedia(dto.coverMediaId);
    }

    const tagSlugs = dto.tagSlugs === undefined ? undefined : this.normalizeTagSlugs(dto.tagSlugs);
    if (tagSlugs !== undefined) {
      await this.ensureTags(tagSlugs);
    }

    const publishNow =
      dto.status === "PUBLISHED" && existing.status !== "PUBLISHED" && dto.publishedAt === undefined;

    const article = await this.prisma.article.update({
      where: {
        id
      },
      data: {
        categoryId: categoryIds?.[0],
        coverMediaId:
          dto.coverMediaId !== undefined ? this.optionalText(dto.coverMediaId) : undefined,
        title: dto.title?.trim(),
        slug: dto.slug?.trim(),
        summary: dto.summary !== undefined ? this.optionalText(dto.summary) : undefined,
        coverImage: dto.coverImage !== undefined ? this.optionalText(dto.coverImage) : undefined,
        content: dto.content?.trim(),
        status: dto.status,
        seoTitle: dto.seoTitle !== undefined ? this.optionalText(dto.seoTitle) : undefined,
        seoDescription:
          dto.seoDescription !== undefined ? this.optionalText(dto.seoDescription) : undefined,
        seoKeywords: dto.seoKeywords !== undefined ? this.optionalText(dto.seoKeywords) : undefined,
        canonicalUrl: dto.canonicalUrl !== undefined ? this.optionalText(dto.canonicalUrl) : undefined,
        noIndex: dto.noIndex,
        ogTitle: dto.ogTitle !== undefined ? this.optionalText(dto.ogTitle) : undefined,
        ogDescription:
          dto.ogDescription !== undefined ? this.optionalText(dto.ogDescription) : undefined,
        ogImage: dto.ogImage !== undefined ? this.optionalText(dto.ogImage) : undefined,
        scheduledAt: dto.scheduledAt !== undefined ? this.optionalDate(dto.scheduledAt) : undefined,
        publishedAt:
          dto.publishedAt !== undefined
            ? this.optionalDate(dto.publishedAt)
            : publishNow
              ? new Date()
              : undefined,
        articleCategories:
          categoryIds === undefined
            ? undefined
            : {
                deleteMany: {},
                create: categoryIds.map((categoryId) => ({
                  category: {
                    connect: {
                      id: categoryId
                    }
                  }
                }))
              },
        articleTags:
          tagSlugs === undefined
            ? undefined
            : {
                deleteMany: {},
                create: tagSlugs.map((tagSlug) => ({
                  tag: {
                    connect: {
                      slug: tagSlug
                    }
                  }
                }))
              }
      },
      include: articleInclude
    });

    return this.toArticle(article);
  }

  async deleteArticle(id: string) {
    await this.ensureArticle(id);
    await this.prisma.article.delete({
      where: {
        id
      }
    });

    return {};
  }

  async publishArticle(id: string) {
    await this.ensureArticle(id);

    const article = await this.prisma.article.update({
      where: {
        id
      },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        scheduledAt: null
      },
      include: articleInclude
    });

    return this.toArticle(article);
  }

  async archiveArticle(id: string) {
    await this.ensureArticle(id);

    const article = await this.prisma.article.update({
      where: {
        id
      },
      data: {
        status: "ARCHIVED"
      },
      include: articleInclude
    });

    return this.toArticle(article);
  }

  async previewArticle(id: string) {
    const article = await this.prisma.article.findUnique({
      where: {
        id
      },
      include: articleInclude
    });

    if (!article) {
      throw new AppException(40401, "文章不存在", HttpStatus.NOT_FOUND);
    }

    return this.toArticle(article);
  }

  async listTags() {
    return this.prisma.tag.findMany({
      orderBy: {
        updatedAt: "desc"
      },
      include: {
        _count: {
          select: {
            articleTags: true
          }
        }
      }
    });
  }

  async createTag(dto: CreateTagDto) {
    const slug = dto.slug.trim();
    assertValidSlug(slug);
    await this.assertTagSlugAvailable(slug);

    return this.prisma.tag.create({
      data: {
        name: dto.name.trim(),
        slug
      }
    });
  }

  async updateTag(id: string, dto: UpdateTagDto) {
    await this.ensureTag(id);

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      assertValidSlug(slug);
      await this.assertTagSlugAvailable(slug, id);
    }

    return this.prisma.tag.update({
      where: {
        id
      },
      data: {
        name: dto.name?.trim(),
        slug: dto.slug?.trim()
      }
    });
  }

  async deleteTag(id: string) {
    const tag = await this.ensureTag(id);
    const articleCount = await this.prisma.articleTag.count({
      where: {
        tagId: tag.id
      }
    });

    if (articleCount > 0) {
      throw new AppException(40004, "请先移除使用该标签的文章", HttpStatus.BAD_REQUEST);
    }

    await this.prisma.tag.delete({
      where: {
        id
      }
    });

    return {};
  }

  async listPages() {
    return this.prisma.page.findMany({
      orderBy: [{ updatedAt: "desc" }]
    });
  }

  async createPage(dto: CreatePageDto) {
    const slug = dto.slug.trim();
    assertValidSlug(slug);
    await this.assertPageSlugAvailable(slug);
    const status = dto.status ?? "DRAFT";

    return this.prisma.page.create({
      data: {
        title: dto.title.trim(),
        slug,
        content: dto.content.trim(),
        status,
        seoTitle: this.optionalText(dto.seoTitle),
        seoDescription: this.optionalText(dto.seoDescription),
        seoKeywords: this.optionalText(dto.seoKeywords),
        canonicalUrl: this.optionalText(dto.canonicalUrl),
        noIndex: dto.noIndex ?? false,
        ogTitle: this.optionalText(dto.ogTitle),
        ogDescription: this.optionalText(dto.ogDescription),
        ogImage: this.optionalText(dto.ogImage),
        scheduledAt: this.optionalDate(dto.scheduledAt),
        publishedAt: status === "PUBLISHED" ? new Date() : null
      }
    });
  }

  async updatePage(id: string, dto: UpdatePageDto) {
    await this.ensurePage(id);

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      assertValidSlug(slug);
      await this.assertPageSlugAvailable(slug, id);
    }

    return this.prisma.page.update({
      where: {
        id
      },
      data: {
        title: dto.title?.trim(),
        slug: dto.slug?.trim(),
        content: dto.content?.trim(),
        status: dto.status,
        seoTitle: dto.seoTitle !== undefined ? this.optionalText(dto.seoTitle) : undefined,
        seoDescription:
          dto.seoDescription !== undefined ? this.optionalText(dto.seoDescription) : undefined,
        seoKeywords: dto.seoKeywords !== undefined ? this.optionalText(dto.seoKeywords) : undefined,
        canonicalUrl: dto.canonicalUrl !== undefined ? this.optionalText(dto.canonicalUrl) : undefined,
        noIndex: dto.noIndex,
        ogTitle: dto.ogTitle !== undefined ? this.optionalText(dto.ogTitle) : undefined,
        ogDescription:
          dto.ogDescription !== undefined ? this.optionalText(dto.ogDescription) : undefined,
        ogImage: dto.ogImage !== undefined ? this.optionalText(dto.ogImage) : undefined,
        scheduledAt: dto.scheduledAt !== undefined ? this.optionalDate(dto.scheduledAt) : undefined,
        publishedAt: dto.status === "PUBLISHED" ? new Date() : undefined
      }
    });
  }

  async deletePage(id: string) {
    await this.ensurePage(id);
    await this.prisma.page.delete({
      where: {
        id
      }
    });

    return {};
  }

  async publishPage(id: string) {
    await this.ensurePage(id);

    return this.prisma.page.update({
      where: {
        id
      },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        scheduledAt: null
      }
    });
  }

  async archivePage(id: string) {
    await this.ensurePage(id);

    return this.prisma.page.update({
      where: {
        id
      },
      data: {
        status: "ARCHIVED"
      }
    });
  }

  private async ensureCategory(id: string) {
    const category = await this.prisma.articleCategory.findUnique({
      where: {
        id
      }
    });

    if (!category) {
      throw new AppException(40401, "分类不存在", HttpStatus.NOT_FOUND);
    }

    return category;
  }

  private async ensureCategories(ids: string[]) {
    if (ids.length === 0) {
      throw new AppException(40001, "请至少选择一个文章分类", HttpStatus.BAD_REQUEST);
    }

    const count = await this.prisma.articleCategory.count({
      where: {
        id: {
          in: ids
        }
      }
    });

    if (count !== ids.length) {
      throw new AppException(40004, "文章分类不存在", HttpStatus.NOT_FOUND);
    }
  }

  private async ensureArticle(id: string) {
    const article = await this.prisma.article.findUnique({
      where: {
        id
      }
    });

    if (!article) {
      throw new AppException(40401, "文章不存在", HttpStatus.NOT_FOUND);
    }

    return article;
  }

  private async ensureMedia(id: string | null | undefined) {
    const mediaId = this.optionalText(id);

    if (!mediaId) {
      return null;
    }

    const media = await this.prisma.mediaAsset.findUnique({
      where: {
        id: mediaId
      }
    });

    if (!media) {
      throw new AppException(40401, "媒体资源不存在", HttpStatus.NOT_FOUND);
    }

    if (media.mediaType !== "IMAGE") {
      throw new AppException(40001, "文章封面只能选择图片素材", HttpStatus.BAD_REQUEST);
    }

    return media;
  }

  private async ensurePage(id: string) {
    const page = await this.prisma.page.findUnique({
      where: {
        id
      }
    });

    if (!page) {
      throw new AppException(40401, "单页不存在", HttpStatus.NOT_FOUND);
    }

    return page;
  }

  private async ensureTag(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: {
        id
      }
    });

    if (!tag) {
      throw new AppException(40401, "标签不存在", HttpStatus.NOT_FOUND);
    }

    return tag;
  }

  private async ensureTags(slugs: string[]) {
    if (slugs.length === 0) {
      return;
    }

    const count = await this.prisma.tag.count({
      where: {
        slug: {
          in: slugs
        }
      }
    });

    if (count !== slugs.length) {
      throw new AppException(40001, "文章标签不存在", HttpStatus.BAD_REQUEST);
    }
  }

  private async assertCategorySlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.articleCategory.findUnique({
      where: {
        slug
      }
    });

    if (existing && existing.id !== excludeId) {
      throw new AppException(40002, "分类 slug 已存在", HttpStatus.BAD_REQUEST);
    }
  }

  private async assertArticleSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.article.findUnique({
      where: {
        slug
      }
    });

    if (existing && existing.id !== excludeId) {
      throw new AppException(40002, "文章 slug 已存在", HttpStatus.BAD_REQUEST);
    }
  }

  private async assertPageSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.page.findUnique({
      where: {
        slug
      }
    });

    if (existing && existing.id !== excludeId) {
      throw new AppException(40002, "单页 slug 已存在", HttpStatus.BAD_REQUEST);
    }
  }

  private async assertTagSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.tag.findUnique({
      where: {
        slug
      }
    });

    if (existing && existing.id !== excludeId) {
      throw new AppException(40002, "标签 slug 已存在", HttpStatus.BAD_REQUEST);
    }
  }

  private optionalText(value: string | null | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  }

  private optionalDate(value: string | null | undefined) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    const date = new Date(trimmed);

    if (Number.isNaN(date.getTime())) {
      throw new AppException(40001, "定时发布时间格式错误", HttpStatus.BAD_REQUEST);
    }

    return date;
  }

  private normalizeTagSlugs(values: string[] | undefined) {
    return Array.from(
      new Set(
        (values ?? [])
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );
  }

  private normalizeCategoryIds(values: string[] | undefined, fallback?: string) {
    const ids = Array.from(
      new Set(
        [...(values ?? []), fallback ?? ""]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );

    if (ids.length === 0) {
      throw new AppException(40001, "请至少选择一个文章分类", HttpStatus.BAD_REQUEST);
    }

    return ids;
  }

  private toArticle(
    article: Prisma.ArticleGetPayload<{
      include: typeof articleInclude;
    }>
  ) {
    const { articleCategories, articleTags, ...rest } = article;

    return {
      ...rest,
      categories: articleCategories.map((item) => item.category),
      tags: articleTags.map((item) => item.tag)
    };
  }
}
