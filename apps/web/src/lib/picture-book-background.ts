export function pictureBookGenerationKey(bookId: string, position: number, kind: "image" | "audio", language?: string) {
  return `${bookId}:${position}:${kind}${language ? `:${language}` : ""}`;
}

type TranslationBaseline = Array<{ language: string; caption: string; audioUrl: string | null }>;
export type PictureBookPageDraft = { caption: string; imagePrompt: string; narration: string; translations?: Array<{ language: string; caption: string }>; translationBaseline?: TranslationBaseline };

export function pictureBookPageChanges(page: { caption?: string | null; imagePrompt?: string | null; narration?: string | null }, draft: PictureBookPageDraft): Partial<Pick<PictureBookPageDraft, "caption" | "imagePrompt" | "narration">> {
  const changes: Partial<Pick<PictureBookPageDraft, "caption" | "imagePrompt" | "narration">> = {};
  for (const key of ["caption", "imagePrompt", "narration"] as const) {
    if (draft[key] !== (page[key] ?? "")) changes[key] = draft[key];
  }
  return changes;
}

export function pictureBookPageSavePlan(page: { caption?: string | null; imagePrompt?: string | null; narration?: string | null; translations?: Array<{ language: string; caption: string }> }, draft: PictureBookPageDraft) {
  const savedTranslations = page.translations?.map(({ language, caption }) => ({ language, caption })) ?? [];
  return {
    pageChanges: pictureBookPageChanges(page, draft),
    translationsDirty: JSON.stringify(draft.translations ?? []) !== JSON.stringify(savedTranslations)
  };
}

export function pictureBookTranslationBaseline(draft: Pick<PictureBookPageDraft, "translationBaseline"> | undefined, saved: TranslationBaseline): TranslationBaseline {
  return draft?.translationBaseline ?? saved.map(item => ({ language: item.language, caption: item.caption, audioUrl: item.audioUrl }));
}

export function acknowledgePictureBookDraft(drafts: Record<string, PictureBookPageDraft>, key: string, saved: PictureBookPageDraft) {
  const current = drafts[key];
  if (!current || current.caption !== saved.caption || current.imagePrompt !== saved.imagePrompt || current.narration !== saved.narration || JSON.stringify(current.translations ?? []) !== JSON.stringify(saved.translations ?? [])) return drafts;
  const next = { ...drafts };
  delete next[key];
  return next;
}

export function patchPictureBookPage<T extends { id: string; pages: Array<{ position: number }> }>(
  current: T | null, bookId: string, position: number, patch: Partial<T["pages"][number]>
): T | null {
  if (!current || current.id !== bookId) return current;
  return { ...current, pages: current.pages.map(page => page.position === position ? { ...page, ...patch } : page) };
}
