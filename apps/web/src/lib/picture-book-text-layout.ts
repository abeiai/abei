import { pictureBookPageContent, type PictureBookTranslatedPage } from "./picture-book-languages";
export type PictureBookTextBox = { id: string; text: string; x: number; y: number; width: number; height: number; fontSize: number; fontFamily: "sans" | "serif"; color: string; bold: boolean; align: "left" | "center" | "right" | "justify"; lineHeight: number; speak: boolean; zIndex?: number };
export type PictureBookTextVersion = { language: string; boxes: PictureBookTextBox[]; audioUrl: string | null; voiceKey?: string };
export type PictureBookTextLayout = { enabled: boolean; versions: PictureBookTextVersion[] };

type LayoutLanguagePage = { translations?: Array<{ language: string }>; textLayout?: PictureBookTextLayout };

export function pictureBookLayoutLanguages(book: { id: string; edition?: { language: string } | null; titleTranslations?: Array<{ language: string }>; pages: LayoutLanguagePage[] }) {
  const originalLanguage = book.edition?.language ?? (/^storyweaver-\d+(?:-i-love-to-read)?$/.test(book.id) ? "en" : undefined);
  const layoutLanguages = book.pages.flatMap(page => page.textLayout?.versions.map(version => version.language) ?? []);
  const translations = [...(book.titleTranslations ?? []), ...book.pages.flatMap(page => page.translations ?? [])];
  const languages = new Set(["original", ...layoutLanguages, ...translations.map(item => item.language).filter(code => code !== originalLanguage)]);
  return { originalLanguage, languages: [...languages] };
}

export function pictureBookInitialLayoutLanguage(requested: string | undefined, languages: string[], layout?: PictureBookTextLayout, originalLanguage?: string) {
  if (requested && languages.includes(requested)) return requested;
  if (requested && requested === originalLanguage) return "original";
  const populated = layout?.versions.filter(version => version.boxes.length > 0) ?? [];
  return populated.find(version => version.language === "original")?.language ?? populated[0]?.language ?? "original";
}
export function layoutPageContent(page: { textLayout?: PictureBookTextLayout }, language: string) {
  const version = page.textLayout?.versions.find(item => item.language === language);
  return { caption: version?.boxes.map(box => box.text).filter(Boolean).join("\n") ?? "", audioUrl: version?.audioUrl ?? null, language: language === "original" ? undefined : language };
}
export function layoutNarration(boxes: PictureBookTextBox[]) { return boxes.filter(box => box.speak && box.text.trim()).map(box => box.text.trim()).join("\n"); }

export function readerPageContent(page: PictureBookTranslatedPage & { textLayout?: PictureBookTextLayout }, language: string, strict: boolean): { caption: string; originalCaption: string; audioUrl: string | null; language: string | undefined; publicAudioUrl?: string } {
  if (page.textLayout?.enabled) return { ...layoutPageContent(page, language), originalCaption: "" };
  if (strict && language !== "original" && !page.translations?.some(item => item.language === language && item.caption.trim())) return { caption: "", originalCaption: page.caption, audioUrl: null, language };
  return pictureBookPageContent(page, language);
}

export function withLayoutVoice(version: PictureBookTextVersion, value: string): PictureBookTextVersion {
  const next = { ...version };
  if (value) next.voiceKey = value;
  else delete next.voiceKey;
  return next;
}
