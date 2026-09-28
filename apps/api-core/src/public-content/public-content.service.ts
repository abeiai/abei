import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

const publicArticleInclude = {
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
export class PublicContentService {
  private readonly prisma = getPrismaClient();

  async listArticles() {
    await this.publishDueContent();

    const articles = await this.prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        AND: [
          {
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
          {
            OR: [
              {
                category: {
                  isVisible: true
                }
              },
              {
                articleCategories: {
                  some: {
                    category: {
                      isVisible: true
                    }
                  }
                }
              }
            ]
          }
        ]
      },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      include: publicArticleInclude
    });

    return articles.map((article) => this.toArticle(article));
  }

  async getArticle(slug: string) {
    await this.publishDueContent();

    const article = await this.prisma.article.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        AND: [
          {
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
          {
            OR: [
              {
                category: {
                  isVisible: true
                }
              },
              {
                articleCategories: {
                  some: {
                    category: {
                      isVisible: true
                    }
                  }
                }
              }
            ]
          }
        ]
      },
      include: publicArticleInclude
    });

    if (!article) {
      throw new AppException(40401, "文章不存在或尚未发布", HttpStatus.NOT_FOUND);
    }

    return this.toArticle(article);
  }

  async listPages() {
    await this.publishDueContent();

    return this.prisma.page.findMany({
      where: {
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
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }]
    });
  }

  async getPage(slug: string) {
    await this.publishDueContent();

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
      }
    });

    if (!page) {
      throw new AppException(40401, "页面不存在或尚未发布", HttpStatus.NOT_FOUND);
    }

    return page;
  }

  async listModules() {
    return this.prisma.contentModule.findMany({
      where: {
        isEnabled: true
      },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
    });
  }

  async getModule(slug: string) {
    const module = await this.prisma.contentModule.findFirst({
      where: {
        slug,
        isEnabled: true
      },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!module) {
      throw new AppException(40401, "模块不存在或未启用", HttpStatus.NOT_FOUND);
    }

    return module;
  }

  private async publishDueContent() {
    const now = new Date();
    await this.prisma.$transaction([
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
  }

  private toArticle(
    article: Prisma.ArticleGetPayload<{
      include: typeof publicArticleInclude;
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
