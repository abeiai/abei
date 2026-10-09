import Link from "next/link";
import { ArrowUpRight, AudioLines, BookOpen } from "lucide-react";
import type { LibraryAlbum, LibraryBook } from "@/lib/picture-book-library";
import styles from "./picture-book-home.module.css";

export function PictureBookShelves({ albums, books }: { albums: LibraryAlbum[]; books: LibraryBook[] }) {
  return <>
    <div className={styles.shelfHeading}><h3>推荐专辑</h3><span>{albums.length} 个专辑</span></div>
    {albums.length ? <div className={styles.albumGrid}>{albums.map(album => <Link className={styles.bookCard} href={album.href} key={album.id}>
      <div className={styles.bookCover}><img src={album.coverUrl} alt={`${album.title}专辑封面`} width={400} height={300} loading="lazy" /><span className={styles.readOverlay}><BookOpen size={19} />查看专辑</span></div>
      <div className={styles.bookTitle}><h4>{album.title}</h4><ArrowUpRight size={17} aria-hidden="true" /></div><span className={styles.bookMeta}>{album.bookCount} 本绘本</span>
    </Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">暂无推荐专辑</p>}
    <div className={styles.shelfHeading}><h3>单本绘本</h3><Link href="/storybook">投稿绘本<ArrowUpRight size={16} /></Link></div>
    {books.length ? <div className={styles.bookGrid}>{books.map(book => <Link className={styles.bookCard} href={book.href} key={book.id} aria-label={`阅读《${book.title}》`}>
      <div className={styles.bookCover}><img src={book.coverUrl} alt={`${book.title}绘本封面`} width={400} height={300} loading="lazy" /><span className={styles.readOverlay}><BookOpen size={19} />开始阅读</span></div>
      <div className={styles.bookTitle}><h4>{book.title}</h4><ArrowUpRight size={17} aria-hidden="true" /></div><span className={styles.bookMeta}>{book.hasAudio ? <AudioLines size={13} /> : <BookOpen size={13} />}{book.pageCount} 页{book.hasAudio ? " · 有声绘本" : ""}</span>
    </Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">暂无已审核的单本绘本</p>}
  </>;
}
