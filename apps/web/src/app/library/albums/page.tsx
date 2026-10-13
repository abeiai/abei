import type { Metadata } from "next";
import { PictureBookAlbumGrid } from "@/components/home/picture-book-shelves";
import { PictureBookCatalog } from "@/components/home/picture-book-catalog";
import { getPictureBookCatalog } from "@/lib/picture-book-library-api";
import type { LibraryAlbumPage } from "@/lib/picture-book-library";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "全部专辑 - 阿贝 AI" };
export default async function LibraryAlbumsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const result = await getPictureBookCatalog("albums", page, search);
  const albums = result.data as LibraryAlbumPage;
  return <PictureBookCatalog kind="albums" title="全部专辑" search={search} page={page} pageSize={albums.pageSize} total={albums.total} failed={result.failed}>
    <PictureBookAlbumGrid albums={albums.items} />
  </PictureBookCatalog>;
}
