import { publicR2CdnUrl } from "./public-r2-cdn";

export function publicPictureBookMediaUrl(sourceUrl: string, publicBaseUrl?: string) {
  const base = publicBaseUrl?.trim().replace(/\/+$/, "");
  if (!base || !/^https:\/\//.test(base)) return null;
  const prefix = `${base}/`;
  if (!sourceUrl.startsWith(prefix)) return null;
  const key = sourceUrl.slice(prefix.length).split(/[?#]/, 1)[0]!;
  if (!/^[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|mp3|wav|ogg|aac|m4a|webm)$/.test(key)) return null;
  const cdnUrl = publicR2CdnUrl(sourceUrl);
  if (sourceUrl.includes("?") && cdnUrl === sourceUrl) return null;
  return cdnUrl;
}
