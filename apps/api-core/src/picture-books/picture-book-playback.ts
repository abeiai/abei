type PlaybackPage = {
  position: number;
  caption: string;
  narration: string;
  textInImage?: true;
  imageUrl: string | null;
  audioUrl: string | null;
  translations?: Array<{ language: string; caption: string; audioUrl: string | null }>;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function url(value: unknown) {
  return typeof value === "string" && (/^https?:\/\//.test(value) || /^\/(?!\/)[a-zA-Z0-9/_\-.]+$/.test(value))
    ? value
    : null;
}

export function playbackFromSnapshot(id: string, snapshot: unknown) {
  const source = object(snapshot);
  const pages: PlaybackPage[] = (Array.isArray(source.pages) ? source.pages : [])
    .map((value) => object(value))
    .filter((page) => Number.isInteger(page.position) && Number(page.position) >= 0)
    .map((page) => ({
      position: Number(page.position),
      caption: string(page.caption),
      narration: string(page.narration) || string(page.caption),
      ...(page.textInImage === true ? { textInImage: true as const } : {}),
      imageUrl: url(page.imageUrl),
      audioUrl: url(page.audioUrl),
      ...(Array.isArray(page.translations) ? { translations: page.translations.map(object).filter(item => /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/.test(string(item.language)) && string(item.language) !== "zh" && string(item.language) !== "zh-CN" && string(item.caption).trim()).slice(0, 20).map(item => ({ language: string(item.language), caption: string(item.caption), audioUrl: url(item.audioUrl) })) } : {})
    }))
    .sort((a, b) => a.position - b.position);
  return {
    id,
    title: string(source.title),
    style: string(source.style),
    aspectRatio: string(source.aspectRatio) || "1:1",
    isSpread: source.isSpread === true,
    pages
  };
}

/** Publication requires a complete reader, independently of the studio's save status. */
export function hasCompletePictureBookPlayback(value: unknown, options: { requireDirectoryCover?: boolean; directoryCoverUrl?: string | null } = {}) {
  const source = object(value);
  const book = playbackFromSnapshot("", source);
  return Number.isInteger(source.pageCount) && Number(source.pageCount) > 0
    && Boolean(book.title.trim())
    && Array.isArray(source.pages) && source.pages.length === Number(source.pageCount) + 1
    && book.pages.length === source.pages.length
    && book.pages.every((page, index) => page.position === index && Boolean(page.caption.trim()) && Boolean(page.imageUrl))
    && (!options.requireDirectoryCover || Boolean(url(options.directoryCoverUrl)));
}
