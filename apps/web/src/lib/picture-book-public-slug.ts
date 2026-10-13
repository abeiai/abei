export const yiweiLegacyBookId = "abei-yiwei-lingjiang";

export function publicPictureBookHref(bookId: string) {
  return `/library/${encodeURIComponent(bookId === yiweiLegacyBookId ? "damo-yiwei-dujiang" : bookId)}`;
}
