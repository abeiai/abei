import { defaultOpenGraph } from "@/lib/share-metadata";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicArticles } from "@/lib/cms-api";
import { resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSystemConfigs().catch(() => []);
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const baseUrl = resolvePublicSiteUrl(configByKey.get("siteUrl"));
  const title = `文章列表 - ${configByKey.get("siteName") || "学乐 AI"}`;
  const description = "浏览 CMS 中已发布的学习方法、工具说明和 AI 学习材料实践文章。";

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/articles`
    },
    openGraph: {
      ...defaultOpenGraph,
      siteName: configByKey.get("siteName")?.trim() || defaultOpenGraph.siteName,
      title,
      description,
      url: `${baseUrl}/articles`,
      type: "website"
    }
  };
}

export default async function ArticlesPage() {
  const articles = await getPublicArticles().catch(() => []);

  return (
    <PublicShell>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:px-8 lg:px-10">
        <div className="flex w-full flex-col gap-4">
          <Badge>文章列表</Badge>
          <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal">
            学习方法与材料生成记录
          </h1>
        </div>
        <div className="grid gap-4">
          {articles.map((article) => (
            <Card className="xueleai-interactive-card overflow-hidden" key={article.slug}>
              <div className="grid md:grid-cols-[240px_1fr]">
                <div className="aspect-[16/9] bg-secondary md:aspect-auto">
                  {article.coverMedia?.url || article.coverImage ? (
                    <ResponsiveImage usage="card"
                      className="size-full object-cover"
                      src={article.coverMedia?.url ?? article.coverImage ?? ""}
                      alt={article.title}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                      暂无封面
                    </div>
                  )}
                </div>
                <div>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      {(article.categories && article.categories.length > 0 ? article.categories : article.category ? [article.category] : []).map(
                        (category) => (
                          <Badge variant="outline" key={category.id}>
                            {category.name}
                          </Badge>
                        )
                      )}
                      {!article.categories?.length && !article.category ? <Badge variant="outline">未分类</Badge> : null}
                      <Badge variant="secondary">已发布</Badge>
                      <span className="text-sm text-muted-foreground">
                        {article.publishedAt
                          ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
                          : "未设置发布时间"}
                      </span>
                    </div>
                    <CardTitle>{article.title}</CardTitle>
                    <CardDescription>{article.summary}</CardDescription>
                    {article.tags && article.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <Badge variant="muted" key={tag.id}>
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline">
                      <Link href={`/articles/${article.slug}`}>
                        阅读详情
                        <ArrowRight data-icon="inline-end" />
                      </Link>
                    </Button>
                  </CardContent>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
