export interface LibraryAlbum { id: string; title: string; coverUrl: string; href: string; bookCount: number }
export interface LibraryBook { id: string; title: string; coverUrl: string; href: string; pageCount: number; hasAudio: boolean }
export interface LibraryPage { items: LibraryBook[]; total: number; page: number; pageSize: number }
export interface LibraryAlbumPage { items: LibraryAlbum[]; total: number; page: number; pageSize: number }
export function homepageLibrary(albums: LibraryAlbum[], books: LibraryBook[]) { return { albums: albums.slice(0, 8), books: books.slice(0, 20) }; }
export function libraryCatalogHref(kind: "albums" | "books", page: number, search = "") {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (page > 1) params.set("page", String(page));
  return `/library/${kind}${params.size ? `?${params}` : ""}`;
}
