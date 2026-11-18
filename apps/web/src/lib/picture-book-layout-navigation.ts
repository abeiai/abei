export function pictureBookLayoutHref(bookId: string, position: number, language?: string) {
  return `/storybook/layout?${pictureBookEditorQuery(bookId, position, language)}`;
}

export function pictureBookStudioHref(bookId: string, position: number, language?: string) {
  return `/storybook?${pictureBookEditorQuery(bookId, position, language)}`;
}

function pictureBookEditorQuery(bookId: string, position: number, language?: string) {
  return new URLSearchParams({ book: bookId, page: String(position), ...(language ? { language } : {}) });
}

export function pictureBookPageNeighbors(pages: Array<{ position: number }>, position: number) {
  const positions = pages.map(page => page.position).sort((a, b) => a - b);
  const index = positions.indexOf(position);
  return { previous: index > 0 ? positions[index - 1]! : null, next: index >= 0 ? positions[index + 1] ?? null : null };
}
