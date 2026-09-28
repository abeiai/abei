import { getPrismaClient } from "../src/index.js";
import { seedAiPresets } from "./seed-ai-presets.js";
import { seedAiToolTemplates } from "./seed-ai-tool-templates.js";
import {
  starterKitDemoArticleCategories,
  starterKitDemoArticles,
  starterKitDemoPages,
  starterKitDemoSystemConfigs
} from "./starter-kit-demo-data.js";

async function main() {
  const prisma = getPrismaClient();

  console.log("开始写入 Starter Kit Demo 数据。");

  const categoryResult = await seedArticleCategories(prisma);
  const articleResult = await seedArticles(prisma);
  const pageResult = await seedPages(prisma);
  const configResult = await seedSystemConfigs(prisma);
  const toolResult = await seedAiToolTemplates(prisma);
  const presetResult = await seedAiPresets(prisma);

  console.log(
    `示例分类：新增 ${categoryResult.created} 个，保留 ${categoryResult.skipped} 个。`
  );
  console.log(`示例文章：新增 ${articleResult.created} 篇，保留 ${articleResult.skipped} 篇。`);
  console.log(`示例单页：新增 ${pageResult.created} 个，保留 ${pageResult.skipped} 个。`);
  console.log(`示例系统设置：新增 ${configResult.created} 项，保留 ${configResult.skipped} 项。`);
  console.log(
    `示例 AI 工具：共 ${toolResult.templateCount} 个模板，新增 ${toolResult.createdCount} 个，保留 ${toolResult.preservedCount} 个。`
  );
  console.log(
    `示例模型预置：Provider ${presetResult.providerCount} 个，模型 ${presetResult.modelCount} 个，别名 ${presetResult.aliasCount} 个。`
  );
  console.log("示例充值套餐已由数据库迁移写入，可在后台产品管理中维护。");
  console.log("Starter Kit Demo 数据已就绪，可重复执行且不会覆盖同 slug 的已有内容。");
}

async function seedArticleCategories(prisma: ReturnType<typeof getPrismaClient>) {
  let created = 0;
  let skipped = 0;

  for (const category of starterKitDemoArticleCategories) {
    const existing = await prisma.articleCategory.findUnique({
      where: {
        slug: category.slug
      },
      select: {
        id: true
      }
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.articleCategory.create({
      data: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        isVisible: true
      }
    });
    created += 1;
  }

  return {
    created,
    skipped
  };
}

async function seedArticles(prisma: ReturnType<typeof getPrismaClient>) {
  let created = 0;
  let skipped = 0;

  for (const article of starterKitDemoArticles) {
    const existing = await prisma.article.findUnique({
      where: {
        slug: article.slug
      },
      select: {
        id: true
      }
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const category = await prisma.articleCategory.findUnique({
      where: {
        slug: article.categorySlug
      },
      select: {
        id: true
      }
    });

    if (!category) {
      throw new Error(`示例文章分类不存在：${article.categorySlug}`);
    }

    await prisma.article.create({
      data: {
        categoryId: category.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        content: article.content,
        status: "PUBLISHED",
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        publishedAt: new Date(),
        articleCategories: {
          create: {
            categoryId: category.id
          }
        }
      }
    });
    created += 1;
  }

  return {
    created,
    skipped
  };
}

async function seedPages(prisma: ReturnType<typeof getPrismaClient>) {
  let created = 0;
  let skipped = 0;

  for (const page of starterKitDemoPages) {
    const existing = await prisma.page.findUnique({
      where: {
        slug: page.slug
      },
      select: {
        id: true
      }
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.page.create({
      data: {
        title: page.title,
        slug: page.slug,
        content: page.content,
        status: "PUBLISHED",
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        publishedAt: new Date()
      }
    });
    created += 1;
  }

  return {
    created,
    skipped
  };
}

async function seedSystemConfigs(prisma: ReturnType<typeof getPrismaClient>) {
  let created = 0;
  let skipped = 0;

  for (const config of starterKitDemoSystemConfigs) {
    const existing = await prisma.systemConfig.findUnique({
      where: {
        key: config.key
      },
      select: {
        id: true
      }
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.systemConfig.create({
      data: {
        key: config.key,
        label: config.label,
        value: config.value,
        description: config.description,
        group: "site",
        isPublic: config.isPublic,
        sortOrder: config.sortOrder
      }
    });
    created += 1;
  }

  return {
    created,
    skipped
  };
}

void main().catch((error) => {
  console.error("Starter Kit Demo 数据写入失败。", error instanceof Error ? error.message : error);
  process.exit(1);
});
