import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { PublicShell } from "@/components/shell/public-shell";
import { PictureBookShelves } from "@/components/home/picture-book-shelves";
import { getPictureBookLibrary } from "@/lib/picture-book-library-api";
import styles from "@/components/home/picture-book-home.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本馆 - 阿贝 AI" };
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const query = await searchParams;
  const parsedPage = Number(query.page || 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 100000 ? parsedPage : 1;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const library = await getPictureBookLibrary(page, search);
  const pageHref = (number: number) => {
    const params = new URLSearchParams({ page: String(number) });
    if (search) params.set("q", search);
    return `/library?${params}`;
  };
  return <PublicShell><section className={`${styles.library} ${styles.container}`}>
    <h1 className="sr-only">绘本馆</h1>
    <div className={styles.libraryToolbar}>
      <nav className={styles.libraryBreadcrumb} aria-label="面包屑导航"><Link href="/">首页</Link><ChevronRight size={15} aria-hidden="true" /><span aria-current="page">绘本馆</span></nav>
      <form className={`${styles.catalogSearch} ${styles.librarySearch}`} action="/library" method="get" role="search">
        <label htmlFor="library-search" className="sr-only">搜索专辑和绘本</label><Search size={19} aria-hidden="true" />
        <input id="library-search" name="q" type="search" maxLength={100} defaultValue={search} placeholder="搜索专辑和绘本" />
        <button type="submit">搜索</button>
      </form>
    </div>
    {library.failed ? <p className="py-4 text-sm text-destructive" role="alert">绘本馆暂时无法加载，请稍后刷新重试。</p> : null}
    <PictureBookShelves albums={library.albums} books={library.books.items} libraryPage search={search} />
    {library.books.total > 20 ? <nav aria-label="单本绘本分页" className="mt-8 flex items-center justify-center gap-6 text-sm">
      {page > 1 ? <Link href={pageHref(page - 1)}>上一页</Link> : null}<span>第 {page} 页 · 共 {library.books.total} 本</span>{page * 20 < library.books.total ? <Link href={pageHref(page + 1)}>下一页</Link> : null}
    </nav> : null}
  </section></PublicShell>;
}
