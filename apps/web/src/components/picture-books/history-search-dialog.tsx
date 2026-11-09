"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type HistoryListing<T> = { items: T[]; total: number; page: number; pageSize: number };

export function HistorySearchDialog<T extends { id: string }>({ title, load, renderItem, onSelect, onClose }: {
  title: string;
  load: (query: string, page: number) => Promise<HistoryListing<T>>;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<HistoryListing<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); searchInput.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setListing(null);
    const timer = window.setTimeout(() => {
      void load(query.trim(), page).then(value => { if (active) setListing(value); })
        .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "历史记录加载失败"); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load, query, page, retry]);

  return <dialog ref={dialog} onClose={onClose} aria-label={title} className="w-[min(640px,calc(100vw-32px))] max-h-[85vh] rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
    <div className="flex max-h-[85vh] flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2><Button type="button" size="sm" variant="ghost" className="size-9 px-0" aria-label="关闭历史记录" onClick={() => dialog.current?.close()}><X className="size-4" /></Button></div>
      <label className="mb-4 flex items-center gap-2 rounded-xl border border-border px-3 focus-within:border-primary"><Search className="size-4 text-muted-foreground" /><input ref={searchInput} type="search" maxLength={100} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索作品名称" aria-label="搜索历史记录" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-busy={loading}>
        {error ? <div className="flex items-center justify-between gap-3 p-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>重试</Button></div> : loading ? <p role="status" className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在检索…</p> : listing?.items.length ? listing.items.map(item => <button key={item.id} type="button" onClick={() => { dialog.current?.close(); onSelect(item); }} className="block w-full rounded-xl border border-border p-3 text-left hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">{renderItem(item)}</button>) : <p className="p-3 text-sm text-muted-foreground">{query ? "没有匹配的作品" : "暂无历史记录"}</p>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground"><span>{listing ? `${listing.total} 本` : "…"}</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} aria-label="上一页"><ChevronLeft className="size-4" /></Button><span>{page} / {listing ? Math.max(1, Math.ceil(listing.total / listing.pageSize)) : "…"}</span><Button type="button" size="sm" variant="outline" disabled={loading || !listing || page * listing.pageSize >= listing.total} onClick={() => setPage(value => value + 1)} aria-label="下一页"><ChevronRight className="size-4" /></Button></div></div>
    </div>
  </dialog>;
}
