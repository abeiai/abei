type CatalogItem = { displayName: string; languages?: string[]; titleTranslations?: Array<{ language: string; title: string }> };
export function courseCatalogLanguages(items: CatalogItem[]) {
  return [...new Set(items.flatMap(item => [...(item.languages ?? []), ...(item.titleTranslations?.filter(translation => translation.title.trim()).map(translation => translation.language) ?? [])]))];
}
export function courseCatalogTitle(item: CatalogItem, language: string) {
  return item.titleTranslations?.find(translation => translation.language === language && translation.title.trim())?.title ?? item.displayName;
}
