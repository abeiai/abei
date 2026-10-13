import Link from "next/link";
import { ArrowUpRight, AudioLines, BookOpen } from "lucide-react";
import type { LibraryAlbum, LibraryBook } from "@/lib/picture-book-library";
import { PictureBookImage } from "@/components/picture-books/picture-book-image";
import styles from "./picture-book-home.module.css";

export function PictureBookAlbumGrid({ albums }: { albums: LibraryAlbum[] }) {
  return albums.length ? <div className={styles.albumGrid}>{albums.map(album => <Link className={styles.bookCard} href={album.href} key={album.id}>
      <div className={styles.albumCover}><img src={album.coverUrl} alt={`${album.title}专辑封面`} width={400} height={225} loading="lazy" /></div>
      <h4 className={styles.bookTitle}>{album.title}</h4><span className={styles.bookMeta}>{album.bookCount} 本绘本</span>
    </Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">暂无推荐专辑</p>;
}

export function PictureBookBookGrid({ books }: { books: LibraryBook[] }) {
  return books.length ? <div className={styles.bookGrid}>{books.map(book => <Link className={styles.singleBookCard} href={book.href} key={book.id} aria-label={`阅读《${book.title}》`}>
      <div className={styles.singleBookCover}><PictureBookImage src={book.coverUrl} fallbackSrc={`/api/public/picture-books/${encodeURIComponent(book.id)}/cover`} alt={`${book.title}绘本封面`} compact /></div>
      <h4 className={styles.singleBookTitle}>{book.title}</h4><span className={styles.singleBookMeta}>{book.hasAudio ? <AudioLines size={14} /> : <BookOpen size={14} />}{book.pageCount} 页{book.hasAudio ? " · 有声绘本" : ""}</span>
    </Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">暂无已审核的单本绘本</p>;
}

export function PictureBookShelves({ albums, books }: { albums: LibraryAlbum[]; books: LibraryBook[] }) {
  return <>
    <div className={styles.shelfHeading}><h3>推荐专辑</h3><span>{albums.length} 个专辑</span><Link className={styles.shelfMore} href="/library/albums">更多专辑<ArrowUpRight size={16} /></Link></div>
    <PictureBookAlbumGrid albums={albums} />
    <div className={styles.shelfHeading}><h3>单本绘本</h3><span className={styles.shelfActions}><Link href="/storybook">投稿绘本</Link><Link className={styles.shelfMore} href="/library/books">更多绘本<ArrowUpRight size={16} /></Link></span></div>
    <PictureBookBookGrid books={books} />
  </>;
}
