export interface LibraryAlbum { id: string; title: string; coverUrl: string; href: string; bookCount: number }
export interface LibraryBook { id: string; title: string; coverUrl: string; href: string; pageCount: number; hasAudio: boolean }
export interface LibraryPage { items: LibraryBook[]; total: number; page: number; pageSize: number }
export function homepageLibrary(albums: LibraryAlbum[], books: LibraryBook[]) { return { albums: albums.slice(0, 8), books: books.slice(0, 20) }; }
