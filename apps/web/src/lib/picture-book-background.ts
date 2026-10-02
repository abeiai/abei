export function pictureBookGenerationKey(bookId: string, position: number, kind: "image" | "audio") {
  return `${bookId}:${position}:${kind}`;
}

export type PictureBookPageDraft = { caption: string; imagePrompt: string; narration: string };

export function acknowledgePictureBookDraft(drafts: Record<string, PictureBookPageDraft>, key: string, saved: PictureBookPageDraft) {
  const current = drafts[key];
  if (!current || current.caption !== saved.caption || current.imagePrompt !== saved.imagePrompt || current.narration !== saved.narration) return drafts;
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
