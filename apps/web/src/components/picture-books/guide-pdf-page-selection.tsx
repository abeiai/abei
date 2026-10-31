"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { GuidePage } from "@/lib/picture-book-guide";

export function GuidePdfPageSelection({ pages, disabled, onConfirm }: { pages: GuidePage[]; disabled: boolean; onConfirm: (pages: number[]) => void }) {
  const [selected, setSelected] = useState(() => pages.filter(page => page.pdfAnalysis?.kind !== "ADVERTISEMENT").map(page => page.pageNumber));
  const [cover, setCover] = useState(() => pages.find(page => page.pdfAnalysis?.kind === "COVER")?.pageNumber ?? pages.find(page => page.pdfAnalysis?.kind !== "ADVERTISEMENT")?.pageNumber ?? 0);
  const coverSelected = selected.includes(cover);
  function toggle(number: number, checked: boolean) {
    setSelected(current => checked ? [...current, number].sort((a, b) => a - b) : current.filter(item => item !== number));
    if (!checked && cover === number) setCover(0);
  }
  return <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">确认绘本页面</h2><Button disabled={disabled || !coverSelected || !selected.length} onClick={() => onConfirm([cover, ...selected.filter(number => number !== cover)])}>确认页面并理解整本绘本</Button></div>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">已自动取消疑似广告页，请检查页面并选择封面。</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pages.map(page => <div key={page.pageNumber} className="min-w-0 rounded-xl border border-border p-3">
      <img src={page.imageUrl} alt={`PDF 第 ${page.pageNumber} 页`} loading="lazy" decoding="async" className="h-36 w-full rounded-lg bg-secondary/30 object-contain" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(page.pageNumber)} disabled={disabled} onChange={event => toggle(page.pageNumber, event.target.checked)} />第 {page.pageNumber} 页{page.pdfAnalysis?.kind === "ADVERTISEMENT" ? " · 疑似广告" : ""}</label><label className="flex items-center gap-2"><input type="radio" name="guide-pdf-cover" checked={cover === page.pageNumber} disabled={disabled || !selected.includes(page.pageNumber)} onChange={() => setCover(page.pageNumber)} />封面</label></div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{page.pdfAnalysis?.description}</p>
    </div>)}</div>
  </section>;
}
