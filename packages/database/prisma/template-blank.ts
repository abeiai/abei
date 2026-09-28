import { getPrismaClient } from "../src/index.js";
import { aiToolCategories, aiToolTemplates } from "./ai-tool-template-data.js";
import {
  starterKitDemoArticles,
  starterKitDemoArticleCategories,
  starterKitDemoPages,
  starterKitDemoPaymentOrderPrefix,
  starterKitLegacyDemoArticleSlugs,
  starterKitLegacyDemoCategorySlugs
} from "./starter-kit-demo-data.js";

async function main() {
  assertBlankTemplateAllowed();

  const prisma = getPrismaClient();
  const articleSlugs = unique([
    ...starterKitDemoArticles.map((article) => article.slug),
    ...starterKitLegacyDemoArticleSlugs
  ]);
  const articleCategorySlugs = unique([
    ...starterKitDemoArticleCategories.map((category) => category.slug),
    ...starterKitLegacyDemoCategorySlugs
  ]);
  const pageSlugs = starterKitDemoPages.map((page) => page.slug);
  const toolSlugs = aiToolTemplates.map((template) => template.slug);
  const toolCategorySlugs = aiToolCategories.map((category) => category.slug);

  console.log("开始清理 Starter Kit 示例内容。");
  console.log("保留：管理员账号、系统基础配置、Provider Preset、Model Preset 和模型别名。");

  const aiResult = await clearDemoAiTools(prisma, toolSlugs, toolCategorySlugs);
  const paymentResult = await clearDemoPayments(prisma);
  const cmsResult = await clearDemoCms(prisma, articleSlugs, articleCategorySlugs, pageSlugs);

  console.log(`示例 AI 任务：删除 ${aiResult.tasks} 条任务。`);
  console.log(`示例 AI 工具：删除 ${aiResult.scenarios} 个模板，删除 ${aiResult.categories} 个分类。`);
  console.log(`示例订单：删除 ${paymentResult.orders} 个订单，删除 ${paymentResult.notifyLogs} 条回调日志。`);
  console.log(`示例文章：删除 ${cmsResult.articles} 篇，删除 ${cmsResult.categories} 个分类。`);
  console.log(`示例单页：删除 ${cmsResult.pages} 个。`);
  console.log("空白模板清理完成。");
}

function assertBlankTemplateAllowed() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isProduction = process.env.NODE_ENV === "production";
  const explicitlyConfirmed = process.env.CONFIRM_TEMPLATE_BLANK === "YES";
  const looksLocal = /localhost|127\.0\.0\.1|\/xueleai(\?|$)|:3324\//.test(databaseUrl);

  if (isProduction && !explicitlyConfirmed) {
    throw new Error("生产环境禁止直接执行 template:blank。如确需清理，请先备份并设置 CONFIRM_TEMPLATE_BLANK=YES。");
  }

  if (!looksLocal && !explicitlyConfirmed) {
    throw new Error("当前 DATABASE_URL 不像本地开发库。请确认备份后设置 CONFIRM_TEMPLATE_BLANK=YES 再执行。");
  }

  console.warn("警告：template:blank 会删除 Starter Kit 示例内容。生产环境执行前必须先备份数据库。");
}

async function clearDemoAiTools(
  prisma: ReturnType<typeof getPrismaClient>,
  toolSlugs: string[],
  toolCategorySlugs: string[]
) {
  const toolNames = aiToolTemplates.map((template) => template.name);
  const usageStats = await prisma.aiUsageDailyStat.deleteMany({
    where: {
      OR: [
        {
          scenario: {
            slug: {
              in: toolSlugs
            }
          }
        },
        {
          toolName: {
            in: toolNames
          }
        }
      ]
    }
  });
  const tasks = await prisma.aiTask.deleteMany({
    where: {
      scenario: {
        slug: {
          in: toolSlugs
        }
      }
    }
  });
  const scenarios = await prisma.aiScenario.deleteMany({
    where: {
      slug: {
        in: toolSlugs
      }
    }
  });
  const categories = await prisma.aiToolCategory.deleteMany({
    where: {
      slug: {
        in: toolCategorySlugs
      },
      scenarios: {
        none: {}
      }
    }
  });

  return {
    usageStats: usageStats.count,
    tasks: tasks.count,
    scenarios: scenarios.count,
    categories: categories.count
  };
}

async function clearDemoPayments(prisma: ReturnType<typeof getPrismaClient>) {
  const notifyLogs = await prisma.paymentNotifyLog.deleteMany({
    where: {
      orderNo: {
        startsWith: starterKitDemoPaymentOrderPrefix
      }
    }
  });
  const orders = await prisma.paymentOrder.deleteMany({
    where: {
      orderNo: {
        startsWith: starterKitDemoPaymentOrderPrefix
      }
    }
  });

  return {
    notifyLogs: notifyLogs.count,
    orders: orders.count
  };
}

async function clearDemoCms(
  prisma: ReturnType<typeof getPrismaClient>,
  articleSlugs: string[],
  articleCategorySlugs: string[],
  pageSlugs: string[]
) {
  const articles = await prisma.article.deleteMany({
    where: {
      slug: {
        in: articleSlugs
      }
    }
  });
  const pages = await prisma.page.deleteMany({
    where: {
      slug: {
        in: pageSlugs
      }
    }
  });
  const categories = await prisma.articleCategory.deleteMany({
    where: {
      slug: {
        in: articleCategorySlugs
      },
      articles: {
        none: {}
      },
      articleLinks: {
        none: {}
      }
    }
  });

  return {
    articles: articles.count,
    pages: pages.count,
    categories: categories.count
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

void main().catch((error) => {
  console.error("空白模板清理失败。", error instanceof Error ? error.message : error);
  process.exit(1);
});
