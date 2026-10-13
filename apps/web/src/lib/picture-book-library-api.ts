"use server";
import { cookies } from "next/headers";
import type { LibraryAlbum, LibraryAlbumPage, LibraryPage } from "./picture-book-library";

async function api<T>(path: string, authenticated = false): Promise<T> {
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3602/api"}${path}`, { cache: "no-store", headers: authenticated ? { Cookie: (await cookies()).toString() } : undefined });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw new Error("绘本馆加载失败，请稍后重试");
  return result.data as T;
}
export async function getPictureBookLibrary(page = 1, q = "") {
  const search = q.trim();
  const bookParams = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (search) bookParams.set("q", search);
  const albumPath = search ? `/public/picture-books/albums/catalog?page=1&pageSize=6&q=${encodeURIComponent(search)}` : "/public/picture-books/albums";
  const [albums, books] = await Promise.allSettled([api<LibraryAlbum[] | LibraryAlbumPage>(albumPath), api<LibraryPage>(`/public/picture-books?${bookParams}`)]);
  const albumItems = albums.status === "fulfilled" ? Array.isArray(albums.value) ? albums.value : albums.value.items : [];
  return { albums: albumItems, books: books.status === "fulfilled" ? books.value : { items: [], total: 0, page, pageSize: 20 }, failed: albums.status === "rejected" || books.status === "rejected" };
}
export async function getPictureBookCatalog(kind: "albums" | "books", page = 1, q = "") {
  const path = kind === "albums" ? "/public/picture-books/albums/catalog" : "/public/picture-books";
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q.trim()) params.set("q", q.trim());
  try {
    return { data: await api<LibraryAlbumPage | LibraryPage>(`${path}?${params}`), failed: false };
  } catch {
    return { data: { items: [], total: 0, page, pageSize: 20 }, failed: true };
  }
}
export async function getPictureBookReviews(status = "PENDING") {
  return api<Array<{ id: string; title: string; author: string; status: string; submittedAt: string; updatedAt: string; coverUrl: string | null; reviewNote: string | null }>>(`/admin/picture-book-submissions?status=${encodeURIComponent(status)}`, true);
}
