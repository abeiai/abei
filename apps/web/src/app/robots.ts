import type { MetadataRoute } from "next";

import { buildRobotsMetadata, resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getPublicSystemConfigs().catch(() => []);
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const siteUrl = resolvePublicSiteUrl(configByKey.get("siteUrl"));

  return buildRobotsMetadata(siteUrl);
}
