import { pictureBookLanguageName } from "./picture-book-languages";

export type PictureBookEdition = { id: string; language: string; href: string; current: boolean };

export function pictureBookEditionOptions(editions: PictureBookEdition[]) {
  if (editions.length < 2 || !editions.some(item => item.current)) return [];
  return editions.map(item => ({ ...item, label: item.language === "zh-CN" || item.language === "zh" ? "简体中文" : pictureBookLanguageName(item.language) }));
}
