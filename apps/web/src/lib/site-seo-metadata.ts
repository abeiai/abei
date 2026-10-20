import type { Metadata } from "next";

import { resolvePublicSiteUrl } from "./seo-metadata";

interface ConfigValue { key: string; value: string }
interface SiteUrlOptions { environmentUrl?: string; production?: boolean }

export function resolveSiteSeo(configs: ConfigValue[], options: SiteUrlOptions = {}) {
  const values = new Map(configs.map(({ key, value }) => [key, value.trim()]));
  const siteName = values.get("siteName") || "阿贝智能";
  const siteUrl = resolvePublicSiteUrl(values.get("siteUrl"), options);

  return {
    siteName,
    siteUrl,
    title: values.get("seoTitle") || `${siteName} - AI 绘本创作`,
    description: values.get("seoDescription") || values.get("siteDescription") || "创作、阅读和聆听儿童绘本。",
    shareImage: new URL("/picture-book-demos/series-cover.webp", siteUrl).toString()
  };
}

type SiteSeo = ReturnType<typeof resolveSiteSeo>;

export function rootSiteMetadata(seo: SiteSeo): Metadata {
  return {
    metadataBase: new URL(seo.siteUrl),
    title: seo.title,
    description: seo.description,
    openGraph: {
      siteName: seo.siteName,
      locale: "zh_CN",
      type: "website",
      images: [{ url: seo.shareImage, width: 1600, height: 900, alt: seo.siteName }]
    },
    twitter: { card: "summary_large_image", images: [seo.shareImage] },
    icons: { icon: "/favicon.ico", shortcut: "/favicon.ico" }
  };
}

export function homeSiteMetadata(seo: SiteSeo): Metadata {
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.siteUrl },
    openGraph: {
      title: seo.title,
      description: seo.description,
      siteName: seo.siteName,
      locale: "zh_CN",
      type: "website",
      url: seo.siteUrl,
      images: [{ url: seo.shareImage, width: 1600, height: 900, alt: seo.siteName }]
    },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.description, images: [seo.shareImage] }
  };
}
