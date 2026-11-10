import { parseTextLayout, type PictureBookTextLayout } from "./picture-book-text-layout.js";
type PlaybackPage = {
  position: number;
  caption: string;
  narration: string;
  textInImage?: true;
  playbackLayout?: "hidden";
  textLayout?: PictureBookTextLayout;
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
  const storyweaver = /^storyweaver-\d+(?:-i-love-to-read)?$/.test(id);
  const displayText = (value: unknown) => {
    const text = string(value);
    return storyweaver ? text.split(/\r\n|\r|\n/).filter(line => line.replace(/[\u200b\u200c\u200d\u2060]/g, "").trim()).join("\n") : text;
  };
  const displayLayout = (value: unknown) => {
    const layout = parseTextLayout(value);
    return storyweaver ? { ...layout, versions: layout.versions.map(version => ({
      ...version, boxes: version.boxes.map(box => ({ ...box, text: displayText(box.text) }))
    })) } : layout;
  };
  const pages: PlaybackPage[] = (Array.isArray(source.pages) ? source.pages : [])
    .map((value) => object(value))
    .filter((page) => Number.isInteger(page.position) && Number(page.position) >= 0)
    .map((page) => ({
      position: Number(page.position),
      caption: displayText(page.caption),
      narration: displayText(string(page.narration) || string(page.caption)),
      ...(page.textInImage === true ? { textInImage: true as const } : {}),
      ...(page.playbackLayout === "hidden" ? { playbackLayout: "hidden" as const } : {}),
      ...(page.textLayout ? { textLayout: displayLayout(page.textLayout) } : {}),
      imageUrl: url(page.imageUrl),
      audioUrl: url(page.audioUrl),
      ...(Array.isArray(page.translations) ? { translations: page.translations.map(object).filter(item => /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/.test(string(item.language)) && string(item.language) !== "zh" && string(item.caption).trim()).slice(0, 20).map(item => ({ language: string(item.language), caption: displayText(item.caption), audioUrl: url(item.audioUrl) })) } : {})
    }))
    .sort((a, b) => a.position - b.position);
  return {
    id,
    title: displayText(source.title),
    ...(Array.isArray(source.titleTranslations) && source.titleTranslations.length ? { titleTranslations: source.titleTranslations
      .map(object).filter(item => /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/.test(string(item.language)) && string(item.title).trim())
      .slice(0, 20).map(item => ({ language: string(item.language), title: displayText(item.title) })) } : {}),
    ...(Number.isInteger(source.englishLevel) && Number(source.englishLevel) >= 1 && Number(source.englishLevel) <= 5 ? { englishLevel: Number(source.englishLevel) } : {}),
    style: string(source.style),
    aspectRatio: string(source.aspectRatio) || "1:1",
    isSpread: source.isSpread === true,
    pages
  };
}

export function pictureBookSnapshotLanguages(snapshot: unknown) {
  const book = playbackFromSnapshot("", snapshot);
  const languages = new Set<string>();
  for (const page of book.pages) {
    for (const item of page.translations ?? []) languages.add(item.language);
    if (page.textLayout?.enabled) for (const version of page.textLayout.versions) {
      if (version.boxes.some(box => box.text.trim()) && /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/.test(version.language)) languages.add(version.language);
    }
  }
  return [...languages].slice(0, 20);
}

export function pictureBookSnapshotTitleTranslations(snapshot: unknown) {
  const book = playbackFromSnapshot("", snapshot);
  const titles = new Map<string, string>();
  for (const item of book.titleTranslations ?? []) if (item.title.trim().length <= 120) titles.set(item.language, item.title.trim());
  const cover = book.pages.find(page => page.position === 0);
  if (book.title.trim() && cover?.caption.trim() === book.title.trim()) {
    for (const item of cover.translations ?? []) {
      const title = item.caption.trim();
      if (title && title.length <= 120 && !titles.has(item.language)) titles.set(item.language, title);
    }
  }
  return [...titles].slice(0, 20).map(([language, title]) => ({ language, title }));
}

/** Publication requires a complete reader, independently of the studio's save status. */
export function hasCompletePictureBookPlayback(value: unknown, options: { requireDirectoryCover?: boolean; directoryCoverUrl?: string | null } = {}) {
  const source = object(value);
  const book = playbackFromSnapshot("", source);
  return Number.isInteger(source.pageCount) && Number(source.pageCount) > 0
    && Boolean(book.title.trim())
    && Array.isArray(source.pages) && source.pages.length === Number(source.pageCount) + 1
    && book.pages.length === source.pages.length
    && book.pages.every((page, index) => page.position === index && Boolean(page.caption.trim() || (page.textLayout?.enabled && page.textLayout.versions.some(version => version.boxes.some(box => box.text.trim())))) && Boolean(page.imageUrl))
    && (!options.requireDirectoryCover || Boolean(url(options.directoryCoverUrl)));
}
