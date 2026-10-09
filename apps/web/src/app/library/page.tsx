import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/shell/public-shell";
import { PictureBookShelves } from "@/components/home/picture-book-shelves";
import { getPictureBookLibrary } from "@/lib/picture-book-library-api";
import styles from "@/components/home/picture-book-home.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本馆 - 阿贝 AI" };
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const parsedPage = Number(query.page || 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 100000 ? parsedPage : 1;
  const library = await getPictureBookLibrary(page);
  return <PublicShell><section className={`${styles.library} ${styles.container}`}>
    <div className={styles.sectionHeading}><h1 className="text-2xl font-semibold">绘本馆</h1><Link href="/storybook" className={styles.textLink}>创作绘本</Link></div>
    {library.failed ? <p className="py-4 text-sm text-destructive" role="alert">绘本馆暂时无法加载，请稍后刷新重试。</p> : null}
    <PictureBookShelves albums={library.albums} books={library.books.items} />
    {library.books.total > 20 ? <nav aria-label="单本绘本分页" className="mt-8 flex items-center justify-center gap-6 text-sm">
      {page > 1 ? <Link href={`/library?page=${page - 1}`}>上一页</Link> : null}<span>第 {page} 页 · 共 {library.books.total} 本</span>{page * 20 < library.books.total ? <Link href={`/library?page=${page + 1}`}>下一页</Link> : null}
    </nav> : null}
  </section></PublicShell>;
}
