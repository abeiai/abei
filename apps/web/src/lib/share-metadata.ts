import type { Metadata } from "next";

import { resolvePublicSiteUrl } from "./seo-metadata";

export const SHARE_SITE_URL = resolvePublicSiteUrl(undefined, { production: true });
export const DEFAULT_SHARE_IMAGE_URL = `${SHARE_SITE_URL}/images/share-default.jpg`;

// Next.js replaces nested Open Graph objects; each page keeps this fallback explicitly.
export const defaultOpenGraph = {
  siteName: "学乐 AI",
  locale: "zh_CN",
  type: "website",
  images: [{
    url: DEFAULT_SHARE_IMAGE_URL,
    width: 1200,
    height: 630,
    alt: "学乐 AI，发现学习乐趣"
  }]
} satisfies Metadata["openGraph"];
