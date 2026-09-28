import { defaultOpenGraph } from "@/lib/share-metadata";
import type { Metadata } from "next";

import { TextbookSearchFilterPanel } from "@/components/textbook/textbook-search-filter-panel";
import {
  TextbookBreadcrumbs,
  TextbookCards,
  TextbookDirectoryLinks,
  TextbookPagination
} from "@/components/textbook/textbook-page-sections";
import { PublicShell } from "@/components/shell/public-shell";
import { resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { getPublicTextbooks } from "@/lib/textbook-public-api";
import { type TextbookRouteFilters } from "@/lib/textbook-seo";

export const dynamic = "force-dynamic";

function configMap(settings: Awaited<ReturnType<typeof getPublicSystemConfigs>>) {
  return new Map(settings.map((setting) => [setting.key, setting.value]));
}

function siteUrl(configByKey: Map<string, string>) {
  return resolvePublicSiteUrl(configByKey.get("siteUrl"));
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSystemConfigs().catch(() => []);
  const configByKey = configMap(settings);
  const siteName = configByKey.get("siteName") || "学乐 AI";
  const baseUrl = siteUrl(configByKey);
  const title = `电子教材下载_PDF教材与Markdown正文 - ${siteName}`;
  const description =
    "提供小学、初中、高中、五四学制和特殊教育电子教材查询下载，支持按类型、年级、学科、版本筛选，查看教材封面、出版社、册数、PDF下载和Markdown正文。";

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/textbook`
    },
    openGraph: {
      ...defaultOpenGraph,
      title,
      description,
      url: `${baseUrl}/textbook`,
      type: "website"
    }
  };
}

export default async function TextbookHomePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const currentFilters = searchParamsToFilters(params);
  const [result, settings] = await Promise.all([
    getPublicTextbooks({ ...toPublicTextbookQuery(currentFilters), pageSize: "12" }),
    getPublicSystemConfigs().catch(() => [])
  ]);
  const configByKey = configMap(settings);
  const baseUrl = siteUrl(configByKey);

  return (
    <PublicShell>
      <section className="textbook-library-page">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 sm:px-8 lg:px-10">
          <TextbookBreadcrumbs
            items={[
              { href: "/", label: "首页" },
              { href: "/textbook", label: "电子教材" }
            ]}
          />

          <div className="textbook-search-console textbook-search-console-flat">
            <TextbookSearchFilterPanel
              current={currentFilters}
              filters={result.filters}
              total={result.pagination.total}
            />
          </div>

          <section className="textbook-shelf">
            <TextbookCards textbooks={result.items} />
            <TextbookPagination filters={{}} pagination={result.pagination} />
          </section>

          <TextbookDirectoryLinks filters={result.filters} />
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "电子教材下载",
            inLanguage: "zh-CN",
            url: `${baseUrl}/textbook`
          })
        }}
      />
    </PublicShell>
  );
}

function searchParamsToFilters(params: Record<string, string | string[] | undefined>): TextbookRouteFilters {
  return {
    educationType: singleParam(params.educationType),
    grade: singleParam(params.grade),
    q: singleParam(params.q)?.slice(0, 80),
    subject: singleParam(params.subject),
    version: singleParam(params.version),
    volume: singleParam(params.volume)
  };
}

function toPublicTextbookQuery(filters: TextbookRouteFilters) {
  return {
    educationType: filters.educationType,
    grade: filters.grade,
    q: filters.q,
    subject: filters.subject,
    version: filters.version,
    volume: filters.volume
  };
}

function singleParam(value: string | string[] | undefined) {
  const text = Array.isArray(value) ? value[0] : value;
  const trimmed = text?.trim();

  return trimmed || undefined;
}
