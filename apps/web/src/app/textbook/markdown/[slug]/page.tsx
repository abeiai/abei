import { defaultOpenGraph } from "@/lib/share-metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { TextbookMarkdownReader } from "@/components/textbook/textbook-markdown-reader";
import { TextbookBreadcrumbs } from "@/components/textbook/textbook-page-sections";
import { Button } from "@/components/ui/button";
import { resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import {
  getPublicTextbookMarkdown,
  getPublicTextbookPdfDownloadUrl,
  type PublicTextbookMarkdownResult
} from "@/lib/textbook-public-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

function configMap(settings: Awaited<ReturnType<typeof getPublicSystemConfigs>>) {
  return new Map(settings.map((setting) => [setting.key, setting.value]));
}

function siteUrl(configByKey: Map<string, string>) {
  return resolvePublicSiteUrl(configByKey.get("siteUrl"));
}

function absoluteUrl(baseUrl: string, value: string) {
  return new URL(value, baseUrl).toString();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [settings, result] = await Promise.all([
    getPublicSystemConfigs().catch(() => []),
    getPublicTextbookMarkdown(slug).catch(() => null)
  ]);
  const configByKey = configMap(settings);
  const siteName = configByKey.get("siteName") || "学乐 AI";

  if (!result) {
    return {
      title: `电子教材不存在 - ${siteName}`
    };
  }

  const baseUrl = siteUrl(configByKey);
  const title = `${result.textbook.title}_${result.textbook.grade}${result.textbook.subject}${result.textbook.version}电子教材 - ${siteName}`;
  const description = `查看《${result.textbook.title}》电子教材，支持 Markdown、纯文字和原图阅读。`;

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/textbook/markdown/${result.textbook.slug}`
    },
    openGraph: {
      ...defaultOpenGraph,
      title,
      description,
      url: `${baseUrl}/textbook/markdown/${result.textbook.slug}`,
      type: "article",
      images: result.textbook.coverUrl ? [absoluteUrl(baseUrl, result.textbook.coverUrl)] : defaultOpenGraph.images
    }
  };
}

export default async function TextbookMarkdownPage({ params }: PageProps) {
  const { slug } = await params;
  const [settings, result] = await Promise.all([
    getPublicSystemConfigs().catch(() => []),
    getPublicTextbookMarkdown(slug).catch(() => null)
  ]);

  if (!result) {
    notFound();
  }

  const configByKey = configMap(settings);
  const baseUrl = siteUrl(configByKey);
  const textbook = result.textbook;
  const pdfUrl = getPublicTextbookPdfDownloadUrl(textbook);
  const breadcrumbs = [
    { href: "/", label: "首页" },
    { href: "/textbook", label: "电子教材" },
    { href: `/textbook/${textbook.slug}`, label: textbook.title },
    { href: `/textbook/markdown/${textbook.slug}`, label: "电子教材" }
  ];

  return (
    <PublicShell>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10">
        <TextbookBreadcrumbs items={breadcrumbs} />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-normal md:text-3xl">
              {textbook.title}
            </h1>
            <TextbookMarkdownMeta result={result} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={`/textbook/${textbook.slug}`}>
                <ArrowLeft data-icon="inline-start" />
                返回教材详情
              </Link>
            </Button>
            {pdfUrl ? (
              <Button asChild variant="outline">
                <a href={pdfUrl}>
                  <Download data-icon="inline-start" />
                  下载PDF教材
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <TextbookMarkdownReader content={result.markdownContent} />
      </section>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Book",
            about: textbook.subject,
            educationalLevel: textbook.grade,
            encoding: {
              "@type": "MediaObject",
              contentUrl: `${baseUrl}/textbook/markdown/${textbook.slug}`,
              encodingFormat: "text/markdown"
            },
            inLanguage: "zh-CN",
            isAccessibleForFree: true,
            name: textbook.title,
            publisher: textbook.publisher
              ? {
                  "@type": "Organization",
                  name: textbook.publisher
                }
              : undefined,
            url: `${baseUrl}/textbook/markdown/${textbook.slug}`
          })
        }}
        type="application/ld+json"
      />
    </PublicShell>
  );
}

function TextbookMarkdownMeta({ result }: { result: PublicTextbookMarkdownResult }) {
  const items = [
    result.textbook.subject,
    result.textbook.version,
    result.textbook.educationTypeName,
    result.textbook.grade,
    result.textbook.volumeName,
    result.markdownPageCount ? `${result.markdownPageCount}页` : null
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
