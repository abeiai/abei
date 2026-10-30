import { hasSignedUrlParameters, publicR2CdnUrl } from "./public-r2-cdn";

export type ImageUsage = "avatar" | "thumbnail" | "card" | "detail" | "reading";
const presets = {
  avatar: { widths: [64, 128], sizes: "64px" },
  thumbnail: { widths: [160, 320], sizes: "160px" },
  card: { widths: [160, 320, 640], sizes: "(max-width: 700px) 45vw, (max-width: 1100px) 30vw, 280px" },
  detail: { widths: [320, 640, 960, 1280], sizes: "(max-width: 700px) 100vw, 800px" },
  reading: { widths: [320, 640, 960, 1280, 1920], sizes: "100vw" }
} satisfies Record<ImageUsage, { widths: number[]; sizes: string }>;

export function imageSources(src: string, usage: ImageUsage) {
  if (hasSignedUrlParameters(src)) return { src, srcSet: undefined, sizes: undefined };
  const preset = presets[usage];
  const endpoint = /^\/api\/(?:media\/files\/[^/?]+|(?:public\/)?picture-books\/[^/?]+\/(?:cover|pages\/\d+\/image|style-references\/[^/?]+\/image))(?=\?|$)/.test(src)
    || /^\/api\/picture-books\/style-references\/[^/?]+\/image(?=\?|$)/.test(src);
  const animatedOrVector = /\.(?:gif|svg|ico)(?:\?|$)/i.test(src);
  const publicLocal = /^\/(?!api\/|\/|_next\/)[^?]+\.(?:png|jpe?g|webp)(?:\?|$)/i.test(src);
  const bases = [...(process.env.NEXT_PUBLIC_IMAGE_REMOTE_BASE_URLS || "https://r.abeiai.com").split(","), "https://cdn.abeiai.com", "https://cc.abeiai.com"].map(base => base.trim().replace(/\/+$/, "")).filter(Boolean);
  const publicRemote = bases.some(base => src.startsWith(`${base}/`)) && /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(src);
  if (animatedOrVector || (!endpoint && !publicLocal && !publicRemote)) return { src: publicR2CdnUrl(src), srcSet: undefined, sizes: undefined };
  const quality = usage === "detail" || usage === "reading" ? 90 : 82;
  const deliveryBase = (process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE_URL || "").replace(/\/+$/, "");
  let publicSource = publicR2CdnUrl(src);
  if (publicLocal && /^\/(?:home-assets|picture-book-demos|images\/voice-avatars)\//.test(src) && process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION) {
    const [pathname, query = ""] = src.split("?");
    const params = new URLSearchParams(query);
    params.set("v", process.env.NEXT_PUBLIC_IMAGE_RELEASE_VERSION);
    publicSource = `${pathname}?${params}`;
  }
  const url = (width: number) => {
    if (endpoint) {
      const [pathname, query = ""] = src.split("?");
      const params = new URLSearchParams(query);
      params.set("w", String(width));
      return `${src.startsWith("/api/media/files/") ? deliveryBase : ""}${pathname}?${params}`;
    }
    return `${deliveryBase}/_next/image?url=${encodeURIComponent(publicSource)}&w=${width}&q=${quality}`;
  };
  return { src: url(preset.widths.at(-1)!), srcSet: preset.widths.map(width => `${url(width)} ${width}w`).join(", "), sizes: preset.sizes };
}
