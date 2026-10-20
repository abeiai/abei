import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { libraryCatalogHref, type LibraryAlbum, type LibraryBook } from "@/lib/picture-book-library";
import { yiweiLegacyBookId } from "@/lib/picture-book-public-slug";
import { PictureBookImage } from "@/components/picture-books/picture-book-image";
import styles from "./picture-book-home.module.css";
import { ResponsiveImage } from "../ui/responsive-image";

export function PictureBookAlbumGrid({ albums, libraryPage = false, emptyText = "暂无推荐专辑" }: { albums: LibraryAlbum[]; libraryPage?: boolean; emptyText?: string }) {
  return albums.length ? <div className={`${styles.albumGrid} ${libraryPage ? styles.libraryAlbumGrid : ""}`}>{albums.map(album => <Link className={styles.bookCard} href={album.href} key={album.id}>
      <div className={styles.albumCover}><ResponsiveImage src={album.coverUrl} alt={`${album.title}专辑封面`} width={400} height={225} loading="lazy" /><span className={styles.albumCount} aria-label={`${album.bookCount}本绘本`}>{album.bookCount}<BookOpen size={14} aria-hidden="true" /></span></div>
      <h4 className={styles.bookTitle}>{album.title}</h4>
    </Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
}

export function PictureBookBookGrid({ books, emptyText = "暂无已审核的单本绘本" }: { books: LibraryBook[]; emptyText?: string }) {
  return books.length ? <div className={styles.bookGrid}>{books.map(book => <Link className={styles.singleBookCard} href={book.href} key={book.id} aria-label={`阅读《${book.title}》`}>
      <div className={`${styles.singleBookCover} ${bookCoverCropClass(book.id)}`}><PictureBookImage src={book.coverUrl} fallbackSrc={`/api/public/picture-books/${encodeURIComponent(book.id)}/cover`} alt={`${book.title}绘本封面`} compact usage="card" /></div>
      <h4 className={styles.singleBookTitle}>{book.title}</h4>
    </Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
}

function bookCoverCropClass(id: string) {
  if (id === yiweiLegacyBookId || id.startsWith("abei-tutu-")) return styles.bookCoverFourFive;
  if (id.startsWith("abei-dental-") || id === "abei-archi-rainy-plan") return styles.bookCoverEightNine;
  if (id.startsWith("abei-archi-") || id.startsWith("abei-seasons-")) return styles.bookCoverSquare;
  return "";
}

export function PictureBookShelves({ albums, books, libraryPage = false, search = "" }: { albums: LibraryAlbum[]; books: LibraryBook[]; libraryPage?: boolean; search?: string }) {
  return <>
    <div className={styles.shelfHeading}><h3>推荐专辑</h3>{!libraryPage ? <span>{albums.length} 个专辑</span> : null}<Link className={styles.shelfMore} href={libraryCatalogHref("albums", 1, search)}>更多专辑<ArrowUpRight size={16} /></Link></div>
    <PictureBookAlbumGrid albums={libraryPage ? albums.slice(0, 6) : albums} libraryPage={libraryPage} emptyText={search ? "没有找到相关专辑" : undefined} />
    <div className={styles.shelfHeading}><h3>单本绘本</h3>{libraryPage ? <Link className={styles.shelfMore} href={libraryCatalogHref("books", 1, search)}>更多绘本<ArrowUpRight size={16} /></Link> : <span className={styles.shelfActions}><Link href="/storybook">公开分享绘本</Link><Link className={styles.shelfMore} href="/library/books">更多绘本<ArrowUpRight size={16} /></Link></span>}</div>
    <PictureBookBookGrid books={books} emptyText={search ? "没有找到相关绘本" : undefined} />
  </>;
}
