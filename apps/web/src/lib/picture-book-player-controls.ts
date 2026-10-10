import type { PublicCourseItem } from "./course-types";

export type PictureBookLoopMode = "none" | "book" | "album";
export interface PictureBookAlbumEntry { bookId: string; revisionItemId: string; href: string }

export function pictureBookAlbumLaunchHref(href: string, courseId: string) {
  if (!/^\/picture-books\/[^/?#]+\/play(?:[?#]|$)/.test(href)) return href;
  const url = new URL(href, "https://reader.invalid");
  url.searchParams.set("album", courseId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pictureBookAlbumEntries(courseId: string, items: PublicCourseItem[]): PictureBookAlbumEntry[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder).flatMap(item => {
    const match = item.launchHref?.match(/^\/picture-books\/([^/?#]+)\/play(?:[?#]|$)/);
    if (item.materialType !== "PICTURE_BOOK" || item.reviewState !== "READY" || !match) return [];
    const query = new URLSearchParams({ courseId, courseRevisionItemId: item.id, album: courseId });
    return [{ bookId: decodeURIComponent(match[1]!), revisionItemId: item.id, href: `${item.launchHref!.split(/[?#]/)[0]}?${query}` }];
  });
}

export function pictureBookAfterPage(input: { autoTurn: boolean; mode: PictureBookLoopMode; pageIndex: number; pageCount: number; albumIndex: number; albumCount: number }): { page: number } | { album: number } | null {
  if (!input.autoTurn || input.pageCount < 1) return null;
  if (input.pageIndex + 1 < input.pageCount) return { page: input.pageIndex + 1 };
  if (input.mode === "book") return { page: 0 };
  if (input.mode === "album" && input.albumIndex >= 0 && input.albumIndex < input.albumCount) return { album: (input.albumIndex + 1) % input.albumCount };
  return null;
}

export function pictureBookFullscreenZones(x: number, y: number, width: number, height: number) {
  const controls = y >= height - 120;
  const close = x >= width - 120 && y <= 96;
  return { controls, close, previous: !controls && !close && x <= width / 4, next: !controls && !close && x >= width * 3 / 4 };
}

export function pictureBookSilentPageDuration(caption: string) {
  return Math.min(12000, Math.max(5000, Array.from(caption).length * 250));
}
