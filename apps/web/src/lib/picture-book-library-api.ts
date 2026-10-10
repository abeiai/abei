"use server";
import { cookies } from "next/headers";
import type { LibraryAlbum, LibraryPage } from "./picture-book-library";

async function api<T>(path: string, authenticated = false): Promise<T> {
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3602/api"}${path}`, { cache: "no-store", headers: authenticated ? { Cookie: (await cookies()).toString() } : undefined });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw new Error("绘本馆加载失败，请稍后重试");
  return result.data as T;
}
export async function getPictureBookLibrary(page = 1) {
  const [albums, books] = await Promise.allSettled([api<LibraryAlbum[]>("/public/picture-books/albums"), api<LibraryPage>(`/public/picture-books?page=${page}&pageSize=20`)]);
  return { albums: albums.status === "fulfilled" ? albums.value : [], books: books.status === "fulfilled" ? books.value : { items: [], total: 0, page, pageSize: 20 }, failed: albums.status === "rejected" || books.status === "rejected" };
}
export async function getPictureBookReviews(status = "PENDING") {
  return api<Array<{ id: string; title: string; author: string; status: string; submittedAt: string; updatedAt: string; coverUrl: string | null; reviewNote: string | null }>>(`/admin/picture-book-submissions?status=${encodeURIComponent(status)}`, true);
}
