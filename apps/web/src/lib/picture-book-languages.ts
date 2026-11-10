export type PictureBookTranslation = { language: string; caption: string; audioUrl: string | null; publicAudioUrl?: string };
export type PictureBookTranslatedPage = { caption: string; audioUrl: string | null; publicAudioUrl?: string; translations?: PictureBookTranslation[] };

export const pictureBookLanguageChoices = [
  { code: "zh-CN", name: "简体中文" },
  { code: "en", name: "英语" }, { code: "ja", name: "日语" }, { code: "ko", name: "韩语" },
  { code: "fr", name: "法语" }, { code: "de", name: "德语" }, { code: "es", name: "西班牙语" },
  { code: "pt", name: "葡萄牙语" }, { code: "ru", name: "俄语" }, { code: "ar", name: "阿拉伯语" },
  { code: "it", name: "意大利语" }, { code: "th", name: "泰语" }, { code: "vi", name: "越南语" }
] as const;

export function pictureBookLanguageName(code: string) {
  return pictureBookLanguageChoices.find(item => item.code === code)?.name ?? code;
}

export function pictureBookOriginalLabel(bookId: string, originalLanguage?: string) {
  if (/^abei-open-bible-stories-(?:0[1-9]|[1-4][0-9]|50)$/.test(bookId)) return "中文";
  return originalLanguage ? `${pictureBookLanguageName(originalLanguage)}（原文）` : "原文";
}

export function pictureBookAvailableLanguages(pages: PictureBookTranslatedPage[]) {
  return [...new Set(pages.flatMap(page => page.translations?.filter(item => item.caption.trim()).map(item => item.language) ?? []))];
}

export function pictureBookInitialLanguage(language: string | null, availableLanguages: string[]) {
  return language && availableLanguages.includes(language) ? language : "original";
}

export function pictureBookPageContent(page: PictureBookTranslatedPage, selectedLanguage: string) {
  const translation = page.translations?.find(item => item.language === selectedLanguage && item.caption.trim());
  const publicAudioUrl = translation ? translation.publicAudioUrl : page.publicAudioUrl;
  return { caption: translation?.caption ?? page.caption, originalCaption: page.caption, audioUrl: translation?.audioUrl ?? (translation ? null : page.audioUrl), language: translation?.language, ...(publicAudioUrl ? { publicAudioUrl } : {}) };
}

export function pictureBookTitleForLanguage(book: { title: string; titleTranslations?: Array<{ language: string; title: string }>; pages: Array<{ position: number; caption: string; translations?: PictureBookTranslation[] }> }, language: string) {
  if (language === "original") return book.title;
  const explicit = book.titleTranslations?.find(item => item.language === language && item.title.trim());
  if (explicit) return explicit.title;
  const cover = book.pages.find(page => page.position === 0);
  return (book.title.trim() && cover?.caption.trim() === book.title.trim() ? cover.translations?.find(item => item.language === language && item.caption.trim())?.caption : undefined) ?? book.title;
}
