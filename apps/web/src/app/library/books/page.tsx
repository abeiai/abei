import type { Metadata } from "next";
import { PictureBookBookGrid } from "@/components/home/picture-book-shelves";
import { PictureBookCatalog } from "@/components/home/picture-book-catalog";
import { getPictureBookCatalog } from "@/lib/picture-book-library-api";
import type { LibraryPage } from "@/lib/picture-book-library";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "全部绘本 - 阿贝 AI" };
export default async function LibraryBooksPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const result = await getPictureBookCatalog("books", page, search);
  const books = result.data as LibraryPage;
  return <PictureBookCatalog kind="books" title="全部单本绘本" search={search} page={page} pageSize={books.pageSize} total={books.total} failed={result.failed}>
    <PictureBookBookGrid books={books.items} />
  </PictureBookCatalog>;
}
