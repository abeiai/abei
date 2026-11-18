import { pictureBookPageContent, type PictureBookTranslatedPage } from "./picture-book-languages";
export type PictureBookTextBox = { id: string; text: string; x: number; y: number; width: number; height: number; fontSize: number; fontFamily: "sans" | "serif"; color: string; bold: boolean; align: "left" | "center" | "right" | "justify"; lineHeight: number; speak: boolean; zIndex?: number };
export type PictureBookTextVersion = { language: string; boxes: PictureBookTextBox[]; audioUrl: string | null; voiceKey?: string };
export type PictureBookTextLayout = { enabled: boolean; versions: PictureBookTextVersion[] };

export function fitPictureBookTextBox(box: PictureBookTextBox, textHeight: number, canvasHeight: number): PictureBookTextBox {
  const height = Math.max(.01, Math.min(1, textHeight / canvasHeight));
  return { ...box, y: Math.min(box.y, 1 - height), height };
}

export function snapPictureBookTextBox(x: number, y: number, box: Pick<PictureBookTextBox, "width" | "height">, canvasWidth: number, canvasHeight: number) {
  const centerX = (1 - box.width) / 2;
  const centerY = (1 - box.height) / 2;
  const vertical = centerX === 0 || Math.abs(x - centerX) * canvasWidth <= 8;
  const horizontal = centerY === 0 || Math.abs(y - centerY) * canvasHeight <= 8;
  return {
    x: vertical ? centerX : Math.max(0, Math.min(1 - box.width, x)),
    y: horizontal ? centerY : Math.max(0, Math.min(1 - box.height, y)),
    vertical, horizontal
  };
}

type LayoutLanguagePage = { translations?: Array<{ language: string }>; textLayout?: PictureBookTextLayout };
type LayoutCaptionPage = { position: number; caption?: string | null; translations?: Array<{ language: string; caption: string }> };

export function pictureBookLayoutCaption(book: { title: string; titleTranslations?: Array<{ language: string; title: string }> }, page: LayoutCaptionPage, language: string) {
  const original = page.caption?.trim() ?? "";
  if (language === "original") return original;
  const translated = page.translations?.find(item => item.language === language)?.caption.trim();
  if (translated) return translated;
  if (page.position === 0 && (!original || original === book.title.trim())) {
    return book.titleTranslations?.find(item => item.language === language)?.title.trim() ?? "";
  }
  return "";
}

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

export function placePictureBookCaption(boxes: PictureBookTextBox[], caption: string) {
  const populated = boxes.filter(box => box.text.trim());
  const targets = populated.length ? populated : boxes;
  const lines = caption.trim().split(/\r\n?|\n/);
  const textByBox = new Map(targets.map((box, index) => [box.id,
    index === targets.length - 1 ? lines.slice(index).join("\n") : lines[index] ?? ""
  ]));
  return boxes.map(box => ({ ...box, text: textByBox.get(box.id) ?? "" }));
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
