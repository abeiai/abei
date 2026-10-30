import { defaultOpenGraph } from "@/lib/share-metadata";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { PublicModuleRenderer } from "@/components/content-modules/public-module-renderer";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicPage } from "@/lib/cms-api";
import { getPublicPageComposition } from "@/lib/page-composition-api";
import { resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

function keywords(value: string | null) {
  return value
    ? value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;
}

async function siteInfo() {
  const settings = await getPublicSystemConfigs().catch(() => []);
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    rootUrl: resolvePublicSiteUrl(configByKey.get("siteUrl")),
    siteName: configByKey.get("siteName")?.trim() || defaultOpenGraph.siteName
  };
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPage(slug).catch(() => null);

  if (!page) {
    return {
      title: "页面不存在"
    };
  }

  const { rootUrl, siteName } = await siteInfo();
  const canonical = page.canonicalUrl || `${rootUrl}/pages/${page.slug}`;
  const title = page.seoTitle || page.title;
  const description = page.seoDescription || page.title;

  return {
    title,
    description,
    keywords: keywords(page.seoKeywords),
    alternates: {
      canonical
    },
    robots: {
      index: !page.noIndex,
      follow: !page.noIndex
    },
    openGraph: {
      ...defaultOpenGraph,
      siteName,
      title: page.ogTitle || title,
      description: page.ogDescription || description,
      url: canonical,
      type: "article",
      images: page.ogImage ? [page.ogImage] : defaultOpenGraph.images
    }
  };
}

export default async function PageDetail({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, composition] = await Promise.all([
    getPublicPage(slug).catch(() => null),
    getPublicPageComposition(slug).catch(() => null)
  ]);

  if (!page) {
    notFound();
  }

  if (composition) {
    return (
      <PublicShell showHeader={composition.showHeader} showFooter={composition.showFooter}>
        <PublicModuleRenderer modules={composition.items.map((item) => item.module)} />
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <article className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 sm:px-8 lg:px-10">
        <Button asChild variant="ghost" className="w-fit">
          <Link href="/">
            <ArrowLeft data-icon="inline-start" />
            返回首页
          </Link>
        </Button>
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>单页</Badge>
            <Badge variant="secondary">已发布</Badge>
            <span className="text-sm text-muted-foreground">
              更新于 {new Date(page.updatedAt).toLocaleDateString("zh-CN")}
            </span>
          </div>
          <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal">
            {page.title}
          </h1>
          <p className="text-lg leading-8 text-muted-foreground">
            {page.seoDescription ?? "这是一个已发布的站点单页。"}
          </p>
        </header>
        <MarkdownContent
          publicMedia
          className="border-t border-border pt-8 text-base leading-8 text-foreground"
          content={page.content}
        />
      </article>
    </PublicShell>
  );
}
