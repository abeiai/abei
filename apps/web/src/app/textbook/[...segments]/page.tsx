import { defaultOpenGraph } from "@/lib/share-metadata";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TextbookSearchFilterPanel } from "@/components/textbook/textbook-search-filter-panel";
import { TextbookSourceLink } from "@/components/textbook/textbook-source-link";
import {
  TextbookBreadcrumbs,
  TextbookCards,
  TextbookInfoTable,
  TextbookPagination
} from "@/components/textbook/textbook-page-sections";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/shell/public-shell";
import { resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { textbookSourceSameAs } from "@/lib/textbook-source";
import {
  getPublicTextbook,
  getPublicTextbookMarkdownViewUrl,
  getPublicTextbookPdfDownloadUrl,
  getPublicTextbooks,
  type PublicTextbookListItem,
  type PublicTextbookListResult
} from "@/lib/textbook-public-api";
import {
  labelFor,
  resolveTextbookRoute,
  textbookPath,
  textbookSubjectSegment,
  textbookVersionSegment,
  type TextbookRouteFilters
} from "@/lib/textbook-seo";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    segments: string[];
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

async function loadRouteOptions() {
  const result = await getPublicTextbooks({ pageSize: "1" });

  return result.filters;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { segments } = await params;
  const queryFilters = searchParamsToFilters((await searchParams) ?? {});
  const [settings, filters] = await Promise.all([
    getPublicSystemConfigs().catch(() => []),
    loadRouteOptions().catch(() => null)
  ]);
  const configByKey = configMap(settings);
  const siteName = configByKey.get("siteName") || "学乐 AI";
  const baseUrl = siteUrl(configByKey);

  if (!filters) {
    return {
      title: `电子教材下载 - ${siteName}`
    };
  }

  const routeFilters = resolveTextbookRoute(segments, filters);

  if (!routeFilters && segments.length === 1) {
    const textbook = await getPublicTextbook(segments[0]).catch(() => null);

    if (!textbook) {
      return {
        title: `教材不存在 - ${siteName}`
      };
    }

    const title = `《${textbook.title}》PDF下载与Markdown正文查看_${textbook.grade}${textbook.subject}${textbook.version}教材 - ${siteName}`;
    const description = `下载《${textbook.title}》PDF电子教材，查看出版社、年级、学科、版本、册次和Markdown正文。`;

    return {
      title,
      description,
      alternates: {
        canonical: `${baseUrl}/textbook/${textbook.slug}`
      },
      openGraph: {
        ...defaultOpenGraph,
        siteName,
        title,
        description,
        url: `${baseUrl}/textbook/${textbook.slug}`,
        type: "article",
        images: textbook.coverUrl ? [absoluteUrl(baseUrl, textbook.coverUrl)] : defaultOpenGraph.images
      }
    };
  }

  if (!routeFilters) {
    return {
      title: `教材页面不存在 - ${siteName}`
    };
  }

  const currentFilters = { ...routeFilters, ...queryFilters };
  const result = await getPublicTextbooks(toQuery(currentFilters)).catch(() => null);
  const pageMeta = listPageMeta(currentFilters, filters, siteName);
  const canonical = `${baseUrl}${textbookPath(currentFilters)}`;

  return {
    title: pageMeta.title,
    description: pageMeta.description,
    alternates: {
      canonical
    },
    robots: result?.pagination.total === 0 ? { index: false, follow: true } : undefined,
    openGraph: {
      ...defaultOpenGraph,
      siteName,
      title: pageMeta.title,
      description: pageMeta.description,
      url: canonical,
      type: "website"
    }
  };
}

export default async function TextbookDynamicPage({ params, searchParams }: PageProps) {
  const { segments } = await params;
  const queryFilters = searchParamsToFilters((await searchParams) ?? {});
  const [filters, settings] = await Promise.all([
    loadRouteOptions().catch(() => null),
    getPublicSystemConfigs().catch(() => [])
  ]);

  if (!filters) {
    notFound();
  }

  const routeFilters = resolveTextbookRoute(segments, filters);

  if (!routeFilters && segments.length === 1) {
    return <TextbookDetailPage slug={segments[0]} settings={settings} />;
  }

  if (!routeFilters) {
    notFound();
  }

  const canonicalPath = textbookPath(routeFilters);
  const currentPath = `/textbook/${segments.join("/")}`;

  if (currentPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const currentFilters = { ...routeFilters, ...queryFilters };
  const result = await getPublicTextbooks(toQuery(currentFilters)).catch(() => null);

  if (!result) {
    notFound();
  }

  if (routeFilters.page && routeFilters.page !== result.pagination.page) {
    redirect(textbookPath({ ...currentFilters, page: result.pagination.page }));
  }

  const configByKey = configMap(settings);
  const baseUrl = siteUrl(configByKey);
  const pageMeta = listPageMeta(currentFilters, result.filters, configByKey.get("siteName") || "学乐 AI");
  const breadcrumbs = breadcrumbItems(routeFilters, result.filters);

  return (
    <PublicShell>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10">
        <TextbookBreadcrumbs items={breadcrumbs} />

        <div className="flex flex-col gap-4">
          <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal">
            {pageMeta.h1}
          </h1>
          <p className="max-w-4xl text-base leading-7 text-muted-foreground">
            {pageMeta.intro}
          </p>
        </div>

        <div className="textbook-search-console textbook-search-console-flat">
          <TextbookSearchFilterPanel
            current={currentFilters}
            filters={result.filters}
            total={result.pagination.total}
          />
        </div>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">{pageMeta.listTitle}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              共 {result.pagination.total} 本教材
            </p>
          </div>
          <TextbookCards textbooks={result.items} />
          <TextbookPagination filters={currentFilters} pagination={result.pagination} />
        </section>

        <SeoContentBlock meta={pageMeta} />
      </section>
      <JsonLd
        data={[
          breadcrumbJsonLd(baseUrl, breadcrumbs),
          itemListJsonLd(baseUrl, result.items, textbookPath(currentFilters))
        ]}
      />
    </PublicShell>
  );
}

async function TextbookDetailPage({
  settings,
  slug
}: {
  settings: Awaited<ReturnType<typeof getPublicSystemConfigs>>;
  slug: string;
}) {
  const textbook = await getPublicTextbook(slug).catch(() => null);

  if (!textbook) {
    notFound();
  }

  const [related, versionRelated] = await Promise.all([
    getPublicTextbooks({
      educationType: textbook.educationType,
      grade: textbook.grade,
      pageSize: "6",
      subject: textbook.subject
    }).catch(() => null),
    getPublicTextbooks({
      grade: textbook.grade,
      pageSize: "6",
      subject: textbook.subject,
      version: textbook.version
    }).catch(() => null)
  ]);
  const configByKey = configMap(settings);
  const baseUrl = siteUrl(configByKey);
  const pdfUrl = getPublicTextbookPdfDownloadUrl(textbook);
  const markdownViewUrl = textbook.hasMarkdownContent ? getPublicTextbookMarkdownViewUrl(textbook.slug) : null;
  const breadcrumbs = [
    { href: "/", label: "首页" },
    { href: "/textbook", label: "电子教材" },
    { href: textbookPath({ educationType: textbook.educationType }), label: textbook.educationTypeName },
    { href: textbookPath({ grade: textbook.grade }), label: textbook.grade },
    { href: `/textbook/${textbookSubjectSegment(textbook.subject)}`, label: textbook.subject },
    { href: `/textbook/${textbookVersionSegment(textbook.version)}`, label: textbook.version },
    { href: `/textbook/${textbook.slug}`, label: textbook.volumeName }
  ];
  const relatedItems = uniqueTextbooks([
    ...(related?.items ?? []),
    ...(versionRelated?.items ?? [])
  ]).filter((item) => item.id !== textbook.id).slice(0, 6);

  return (
    <PublicShell>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10">
        <TextbookBreadcrumbs items={breadcrumbs} />

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <div className="overflow-hidden rounded-md border border-border bg-card">
            {textbook.coverUrl ? (
              <img
                alt={`${textbook.title}封面`}
                className="aspect-[3/4] h-full w-full object-cover"
                src={textbook.coverUrl}
              />
            ) : (
              <div className="flex aspect-[3/4] w-full items-center justify-center bg-secondary text-muted-foreground">
                暂无封面
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center gap-6">
            <div className="flex flex-col gap-4">
              <h1 className="font-display text-4xl font-semibold leading-tight tracking-normal md:text-5xl">
                {textbook.title}
              </h1>
              <div className="flex flex-col gap-2">
                {textbook.curriculumStandardYear ? (
                  <p className="text-base font-medium leading-7 text-muted-foreground">
                    本教材根据{textbook.curriculumStandardYear}年版课程标准修订
                  </p>
                ) : null}
                <p className="max-w-3xl leading-7 text-muted-foreground">
                  {textbook.educationTypeName}{textbook.grade}{textbook.subject}教材《{textbook.title}》电子教材PDF下载和电子教材在线查看。
                </p>
                <TextbookInfoTable textbook={textbook} />
              </div>
            </div>
            <TextbookSourceLink sourceUrl={textbook.sourceUrl} />
          </div>
        </div>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted-foreground">相关教材</p>
            <h2 className="text-2xl font-semibold">{textbook.grade}{textbook.subject}相关教材</h2>
          </div>
          <TextbookCards textbooks={relatedItems} />
        </section>
      </section>
      <JsonLd
        data={[
          breadcrumbJsonLd(baseUrl, breadcrumbs),
          {
            "@context": "https://schema.org",
            "@type": "Book",
            name: textbook.title,
            inLanguage: "zh-CN",
            educationalLevel: textbook.grade,
            about: textbook.subject,
            isAccessibleForFree: true,
            url: `${baseUrl}/textbook/${textbook.slug}`,
            ...textbookSourceSameAs(textbook.sourceUrl),
            publisher: textbook.publisher
              ? {
                  "@type": "Organization",
                  name: textbook.publisher
                }
              : undefined,
            encoding: [
              pdfUrl
                ? {
                    "@type": "MediaObject",
                    encodingFormat: "application/pdf",
                    contentUrl: pdfUrl
                  }
                : null,
              textbook.hasMarkdownContent && markdownViewUrl
                ? {
                    "@type": "MediaObject",
                    encodingFormat: "text/markdown",
                    contentUrl: `${baseUrl}${markdownViewUrl}`
                  }
                : null
            ].filter(Boolean)
          }
        ]}
      />
    </PublicShell>
  );
}

function toQuery(filters: TextbookRouteFilters) {
  return {
    educationType: filters.educationType,
    grade: filters.grade,
    page: String(filters.page ?? 1),
    pageSize: "24",
    q: filters.q,
    subject: filters.subject,
    version: filters.version,
    volume: filters.volume
  };
}

function searchParamsToFilters(params: Record<string, string | string[] | undefined>): TextbookRouteFilters {
  return {
    q: singleParam(params.q)?.slice(0, 80),
    volume: singleParam(params.volume)
  };
}

function singleParam(value: string | string[] | undefined) {
  const text = Array.isArray(value) ? value[0] : value;
  const trimmed = text?.trim();

  return trimmed || undefined;
}

function listPageMeta(
  filters: TextbookRouteFilters,
  options: PublicTextbookListResult["filters"],
  siteName: string
) {
  const type = labelFor(options.educationTypes, filters.educationType);
  const grade = labelFor(options.grades, filters.grade);
  const subject = labelFor(options.subjects, filters.subject);
  const version = labelFor(options.versions, filters.version);
  const volume = labelFor(options.volumes, filters.volume);
  const keyword = filters.q?.trim();
  const prefix = [grade, subject, version, volume].filter(Boolean).join("");
  const typePrefix = type && !prefix ? type : "";
  const displayName = keyword || prefix || typePrefix || subject || version || grade || volume || "电子";
  const h1 = keyword
    ? `「${keyword}」教材搜索`
    : `${displayName}课本教材`;
  const title = `${h1}_PDF下载与Markdown正文 - ${siteName}`;
  const description = prefix
    ? `本页整理${type ? `${type}` : ""}${prefix}电子教材资源，提供教材封面、出版社、册数、更新时间、PDF下载和Markdown正文查看入口。`
    : `整理${keyword || type || subject || version || grade || volume || "中小学"}电子教材资源，支持按关键词、类型、年级、学科、版本和册数查找，提供PDF下载和Markdown正文查看。`;

  return {
    description,
    h1,
    intro:
      keyword
        ? `「${keyword}」相关电子教材，可按学科、版本、年级等筛选搜索电子教材。`
        : `${displayName}课本教材电子版下载，可按学科、版本、年级等筛选搜索电子教材。`,
    listTitle: `${h1}列表`,
    title
  };
}

function breadcrumbItems(
  filters: TextbookRouteFilters,
  options: PublicTextbookListResult["filters"]
) {
  const items = [
    { href: "/", label: "首页" },
    { href: "/textbook", label: "电子教材" }
  ];
  const next: TextbookRouteFilters = {};

  if (filters.educationType) {
    next.educationType = filters.educationType;
    items.push({ href: textbookPath(next), label: labelFor(options.educationTypes, filters.educationType) });
  }

  if (filters.grade) {
    next.grade = filters.grade;
    items.push({ href: textbookPath(next), label: labelFor(options.grades, filters.grade) });
  }

  if (filters.subject) {
    next.subject = filters.subject;
    items.push({ href: textbookPath(next), label: labelFor(options.subjects, filters.subject) });
  }

  if (filters.version) {
    next.version = filters.version;
    items.push({ href: textbookPath(next), label: labelFor(options.versions, filters.version) });
  }

  return items;
}

function SeoContentBlock({ meta }: { meta: ReturnType<typeof listPageMeta> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{meta.h1}说明</CardTitle>
        <CardDescription>教材资源会随后台管理数据更新。</CardDescription>
      </CardHeader>
      <CardContent className="leading-7 text-muted-foreground">
        {meta.intro}
      </CardContent>
    </Card>
  );
}

function uniqueTextbooks(items: PublicTextbookListItem[]) {
  const map = new Map<string, PublicTextbookListItem>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return [...map.values()];
}

function breadcrumbJsonLd(baseUrl: string, items: Array<{ href: string; label: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: `${baseUrl}${item.href}`
    }))
  };
}

function itemListJsonLd(baseUrl: string, items: PublicTextbookListItem[], path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: `${baseUrl}${path}`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${baseUrl}/textbook/${item.slug}`,
      name: item.title
    }))
  };
}

function JsonLd({ data }: { data: unknown[] }) {
  return (
    <>
      {data.map((item, index) => (
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item)
          }}
          key={index}
          type="application/ld+json"
        />
      ))}
    </>
  );
}
