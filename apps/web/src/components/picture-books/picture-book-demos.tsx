"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { pictureBookDemos, type PictureBookDemo } from "@/lib/picture-book-demos";
import { PictureBookImage } from "./picture-book-image";
import { PictureBookPlayer } from "./picture-book-player";

export function PictureBookDemos({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState<PictureBookDemo | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!selected || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [selected]);

  return <section aria-label="示范绘本" className={compact ? "mb-6 border-b border-border pb-5" : "mx-auto w-full max-w-5xl"}>
    <h2 className="text-base font-semibold">示范绘本</h2>
    <p className="mt-1 text-xs text-muted-foreground">熊猫乐乐的森林朋友 · 4–7岁</p>
    <div className={compact ? "mt-3 space-y-2" : "mt-4 grid gap-5 sm:grid-cols-3"}>
      {pictureBookDemos.map(book => <button key={book.id} type="button" onClick={() => setSelected(book)} aria-label={`阅读《${book.title}》，12页`} className={`group w-full overflow-hidden rounded-xl border border-border bg-background text-left transition hover:border-foreground/30 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${compact ? "flex items-center gap-3 p-2" : ""}`}>
        <PictureBookImage src={book.coverUrl} alt={`熊猫乐乐和${book.companion}`} compact className={compact ? "size-14 shrink-0 rounded-lg object-cover" : "aspect-square w-full object-cover"} />
        <span className={compact ? "min-w-0" : "block p-4"}>
          <span className="block text-sm font-semibold">{book.title}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{book.theme} · 12页</span>
          {!compact ? <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium"><BookOpen className="size-4" />开始阅读</span> : null}
        </span>
      </button>)}
    </div>
    {selected ? <dialog ref={dialogRef} aria-label={`示范绘本：${selected.title}`} onClose={() => setSelected(null)} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-[#f6f6f5] p-0 backdrop:bg-black/50">
      <PictureBookPlayer key={selected.id} bookId={selected.id} initialBook={{ ...selected, pages: [
        { position: 0, caption: "", narration: "", imageUrl: selected.coverUrl, audioUrl: null }, ...selected.pages
      ] }} learnerMode={false} onClose={() => setSelected(null)} />
    </dialog> : null}
  </section>;
}
