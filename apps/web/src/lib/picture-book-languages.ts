export type PictureBookTranslation = { language: string; caption: string; audioUrl: string | null };
export type PictureBookTranslatedPage = { caption: string; audioUrl: string | null; translations?: PictureBookTranslation[] };

export const pictureBookLanguageChoices = [
  { code: "en", name: "英语" }, { code: "ja", name: "日语" }, { code: "ko", name: "韩语" },
  { code: "fr", name: "法语" }, { code: "de", name: "德语" }, { code: "es", name: "西班牙语" },
  { code: "pt", name: "葡萄牙语" }, { code: "ru", name: "俄语" }, { code: "ar", name: "阿拉伯语" },
  { code: "it", name: "意大利语" }, { code: "th", name: "泰语" }, { code: "vi", name: "越南语" }
] as const;

export function pictureBookLanguageName(code: string) {
  return pictureBookLanguageChoices.find(item => item.code === code)?.name ?? code;
}

export function pictureBookAvailableLanguages(pages: PictureBookTranslatedPage[]) {
  return [...new Set(pages.flatMap(page => page.translations?.filter(item => item.caption.trim() && item.audioUrl).map(item => item.language) ?? []))];
}

export function pictureBookPageContent(page: PictureBookTranslatedPage, selectedLanguage: string) {
  const translation = page.translations?.find(item => item.language === selectedLanguage && item.caption.trim());
  return { caption: translation?.caption ?? page.caption, originalCaption: page.caption, audioUrl: translation?.audioUrl ?? (translation ? null : page.audioUrl), language: translation?.language };
}
