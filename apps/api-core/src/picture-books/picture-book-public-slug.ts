const yiweiBookId = "abei-yiwei-lingjiang";
const yiweiPublicSlug = "damo-yiwei-dujiang";

export function publicPictureBookHref(bookId: string) {
  return `/library/${encodeURIComponent(bookId === yiweiBookId ? yiweiPublicSlug : bookId)}`;
}

export function resolvePublicPictureBookId(slug: string) {
  return slug === yiweiPublicSlug ? yiweiBookId : slug;
}
