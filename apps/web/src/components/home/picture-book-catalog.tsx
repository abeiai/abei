import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { PublicShell } from "@/components/shell/public-shell";
import { libraryCatalogHref } from "@/lib/picture-book-library";
import styles from "./picture-book-home.module.css";

export function PictureBookCatalog({ kind, title, search, page, pageSize, total, failed, children }: {
  kind: "albums" | "books"; title: string; search: string; page: number; pageSize: number; total: number; failed: boolean; children: ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (!failed && page > totalPages) redirect(libraryCatalogHref(kind, totalPages, search));
  const firstPage = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstPage + index);
  return <PublicShell><section className={`${styles.library} ${styles.container}`}>
    <Link className={styles.catalogBack} href="/library"><ArrowLeft size={16} />返回绘本馆</Link>
    <div className={styles.catalogHeader}><h1>{title}</h1><span>共 {total} {kind === "albums" ? "个专辑" : "本绘本"}</span></div>
    <form className={styles.catalogSearch} action={`/library/${kind}`} method="get" role="search">
      <label htmlFor={`library-${kind}-search`} className="sr-only">搜索{kind === "albums" ? "专辑" : "绘本"}</label>
      <Search size={19} aria-hidden="true" />
      <input id={`library-${kind}-search`} name="q" type="search" maxLength={100} defaultValue={search} placeholder={`搜索${kind === "albums" ? "专辑" : "绘本"}名称`} />
      <button type="submit">搜索</button>
    </form>
    {failed ? <p className={styles.catalogEmpty} role="alert">列表暂时无法加载，请稍后重试。</p> : total ? children : <p className={styles.catalogEmpty}>没有找到相关{kind === "albums" ? "专辑" : "绘本"}</p>}
    {!failed && totalPages > 1 ? <nav className={styles.catalogPagination} aria-label="列表分页">
      {page > 1 ? <Link href={libraryCatalogHref(kind, page - 1, search)}>上一页</Link> : <span aria-disabled="true">上一页</span>}
      {pageNumbers.map(number => <Link key={number} href={libraryCatalogHref(kind, number, search)} aria-current={number === page ? "page" : undefined}>{number}</Link>)}
      {page < totalPages ? <Link href={libraryCatalogHref(kind, page + 1, search)}>下一页</Link> : <span aria-disabled="true">下一页</span>}
    </nav> : null}
  </section></PublicShell>;
}
