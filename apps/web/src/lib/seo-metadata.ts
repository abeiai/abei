import type { MetadataRoute } from "next";

const PRODUCTION_SITE_URL = "https://abeiai.com";

interface PublicSiteUrlOptions {
  environmentUrl?: string;
  production?: boolean;
}

interface SitemapContentItem {
  slug: string;
  updatedAt: Date | string;
  noIndex?: boolean;
}

interface SitemapEntriesInput {
  siteUrl: string;
  now: Date;
  articles: SitemapContentItem[];
  pages: SitemapContentItem[];
  textbooks: SitemapContentItem[];
}

export function resolvePublicSiteUrl(configuredUrl?: string, options: PublicSiteUrlOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";

  const environmentUrl = options.environmentUrl ?? process.env.APP_BASE_URL;
  const candidates = [environmentUrl, configuredUrl];

  for (const candidate of candidates) {
    const origin = parseOrigin(candidate);

    if (origin && (!production || isProductionOrigin(origin))) {
      return origin;
    }
  }

  return production ? PRODUCTION_SITE_URL : "http://localhost:3600";
}

export function buildRobotsMetadata(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}

export function buildSitemapEntries({
  siteUrl,
  now,
  articles,
  pages,
  textbooks
}: SitemapEntriesInput): MetadataRoute.Sitemap {
  return [
    createEntry(siteUrl, now, "daily", 1),
    createEntry(`${siteUrl}/articles`, now, "daily", 0.8),
    createEntry(`${siteUrl}/textbook`, now, "daily", 0.9),
    ...articles
      .filter((article) => !article.noIndex)
      .map((article) => createEntry(`${siteUrl}/articles/${article.slug}`, article.updatedAt, "weekly", 0.7)),
    ...pages
      .filter((page) => !page.noIndex)
      .map((page) => createEntry(`${siteUrl}/pages/${page.slug}`, page.updatedAt, "monthly", 0.6)),
    ...textbooks.map((textbook) =>
      createEntry(`${siteUrl}/textbook/${textbook.slug}`, textbook.updatedAt, "monthly", 0.7)
    )
  ];
}

function createEntry(
  url: string,
  lastModified: Date | string,
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>,
  priority: number
): MetadataRoute.Sitemap[number] {
  return {
    url,
    lastModified: new Date(lastModified),
    changeFrequency,
    priority
  };
}

function parseOrigin(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isProductionOrigin(origin: string) {
  const url = new URL(origin);
  return url.protocol === "https:" && url.hostname !== "localhost" &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) && !url.hostname.includes(":");
}
