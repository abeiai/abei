export function pictureBookGenerationKey(bookId: string, position: number, kind: "image" | "audio") {
  return `${bookId}:${position}:${kind}`;
}

export function patchPictureBookPage<T extends { id: string; pages: Array<{ position: number }> }>(
  current: T | null, bookId: string, position: number, patch: Partial<T["pages"][number]>
): T | null {
  if (!current || current.id !== bookId) return current;
  return { ...current, pages: current.pages.map(page => page.position === position ? { ...page, ...patch } : page) };
}
