import type { Metadata } from "next";

export const DEFAULT_SHARE_IMAGE_URL = "/picture-book-demos/series-cover.webp";

// Next.js replaces nested Open Graph objects; each page keeps this fallback explicitly.
export const defaultOpenGraph = {
  siteName: "阿贝智能",
  locale: "zh_CN",
  type: "website",
  images: [{
    url: DEFAULT_SHARE_IMAGE_URL,
    width: 1600,
    height: 900,
    alt: "有声绘本"
  }]
} satisfies Metadata["openGraph"];
