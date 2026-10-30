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

/** The creator playback API supplies this field only for a currently public revision. */
export function creatorPublicPictureBookMediaUrl(source: string | null | undefined) {
  if (!source) return null;
  const result = publicR2CdnUrl(source);
  return result === source ? null : result;
}

export function creatorPictureBookMediaSources(publicUrl: string | null | undefined, proxyUrl: string) {
  const cdnUrl = creatorPublicPictureBookMediaUrl(publicUrl);
  return { src: cdnUrl ?? proxyUrl, fallback: cdnUrl ? proxyUrl : undefined };
}

export function creatorPictureBookImageSources(publicUrl: string | null | undefined, proxyUrl: string) {
  const sources = creatorPictureBookMediaSources(publicUrl, proxyUrl);
  return { src: sources.src, fallback: sources.fallback ? `${sources.fallback}${sources.fallback.includes("?") ? "&" : "?"}w=1920` : undefined };
}
