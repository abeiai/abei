"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenText, ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guideRequest, type GuideBookChoice, type GuideBookListing } from "@/lib/picture-book-guide";

export function GuideBookPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (book: GuideBookChoice) => void }) {
  const [scope, setScope] = useState<GuideBookChoice["scope"]>("PUBLIC");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<GuideBookListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    searchRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ scope, search, page: String(page) });
      void guideRequest<GuideBookListing>(`/books?${query}`).then(value => { if (active) setListing(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "绘本列表加载失败"); }).finally(() => { if (active) setLoading(false); });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [scope, search, page]);

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-5">
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="guide-library-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-background p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="guide-library-title" className="text-base font-semibold">选择本站绘本</h2><Button size="sm" variant="ghost" aria-label="关闭绘本选择" onClick={onClose}><X className="size-4" /></Button></div>
      <div className="mb-4 flex gap-2">
        <Button variant={scope === "PUBLIC" ? "default" : "outline"} aria-pressed={scope === "PUBLIC"} onClick={() => { setScope("PUBLIC"); setPage(1); }}>资源中心</Button>
        <Button variant={scope === "MINE" ? "default" : "outline"} aria-pressed={scope === "MINE"} onClick={() => { setScope("MINE"); setPage(1); }}>我的绘本</Button>
      </div>
      <div className="relative mb-4"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input ref={searchRef} aria-label="搜索绘本" placeholder="搜索绘本名称" maxLength={80} className="pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
      <div className="min-h-40 space-y-2 overflow-y-auto" aria-live="polite">
        {loading ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在加载绘本…</p> : error ? <p role="alert" className="py-8 text-sm text-destructive">{error}</p> : listing?.items.length ? listing.items.map(book => <button key={book.bookId} type="button" disabled={!book.pageCount || book.pageCount > 80} onClick={() => onSelect(book)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-primary/40 hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-50">
          <BookOpenText className="size-7 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{book.title}</span><span className="mt-1 block text-xs text-muted-foreground">{book.pageCount} 页 · {scope === "PUBLIC" ? "已审核" : book.completed ? "已完成" : "制作中"}{!book.pageCount ? " · 尚无页面" : book.pageCount > 80 ? " · 超过 80 页" : ""}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>) : <p className="py-12 text-center text-sm text-muted-foreground">{search ? "没有找到匹配的绘本" : scope === "PUBLIC" ? "暂无已审核的绘本" : "暂无个人绘本"}</p>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">共 {loading ? "…" : listing?.total ?? 0} 本</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" aria-label="上一页绘本" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><span className="text-xs text-muted-foreground">{page} / {Math.max(1, Math.ceil((listing?.total ?? 0) / 20))}</span><Button size="sm" variant="outline" aria-label="下一页绘本" disabled={loading || !listing || page * listing.pageSize >= listing.total} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </div>
  </div>;
}
