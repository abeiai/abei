import type { MetadataRoute } from "next";

import { getPublicArticles, getPublicPages } from "@/lib/cms-api";
import { buildSitemapEntries, resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { getPublicTextbookSitemapEntries } from "@/lib/textbook-public-api";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, pages, settings, textbooks] = await Promise.all([
    getPublicArticles(),
    getPublicPages(),
    getPublicSystemConfigs(),
    getPublicTextbookSitemapEntries()
  ]);
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const siteUrl = resolvePublicSiteUrl(configByKey.get("siteUrl"));

  return buildSitemapEntries({
    siteUrl,
    now: new Date(),
    articles,
    pages,
    textbooks
  });
}
