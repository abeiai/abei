export function pictureBookLayoutHref(bookId: string, position: number) {
  return `/storybook/layout?${new URLSearchParams({ book: bookId, page: String(position) })}`;
}

export function pictureBookStudioHref(bookId: string, position: number) {
  return `/storybook?${new URLSearchParams({ book: bookId, page: String(position) })}`;
}

export function pictureBookPageNeighbors(pages: Array<{ position: number }>, position: number) {
  const positions = pages.map(page => page.position).sort((a, b) => a - b);
  const index = positions.indexOf(position);
  return { previous: index > 0 ? positions[index - 1]! : null, next: index >= 0 ? positions[index + 1] ?? null : null };
}
