"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { pictureBookLanguageName } from "@/lib/picture-book-languages";

type ReviewRow = { published?: boolean; publishedVersion?: number; id: string; title: string; author: string; status: string; submittedAt: string; updatedAt: string; coverUrl: string | null; reviewNote: string | null };
type Review = Omit<ReviewRow, "title"> & { coverGenerating: boolean; book: { title: string; pages: Array<{ position: number; caption: string; narration: string; imageUrl: string | null; audioUrl: string | null; translations?: Array<{ language: string; caption: string; audioUrl: string | null }> }> } };
const labels: Record<string, string> = { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已拒绝" };
async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/admin/picture-book-submissions${path}`, { method, credentials: "include", cache: "no-store", signal, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw new Error(result.message || "绘本审核操作失败，请重试");
  return result.data as T;
}

export function PictureBookReviewManager({ rows, status }: { rows: ReviewRow[]; status: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const regenerateFor = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!selected) { regenerateFor.current = null; dialog.current?.close(); return; }
    const regenerate = regenerateFor.current === selected;
    regenerateFor.current = null;
    dialog.current?.showModal();
    const controller = new AbortController();
    setReview(current => current?.id === selected ? current : null); if (!regenerate) { setIndex(0); setReason(""); } setError(""); setBusy(true);
    const update = (value: Review) => { if (!controller.signal.aborted) setReview(value); };
    void (async () => {
      try {
        let latest = await request<Review>(`/${selected}`, "GET", undefined, controller.signal); update(latest);
        if (latest.status === "PENDING" && (!latest.coverUrl || regenerate || latest.coverGenerating)) {
          if (!latest.coverGenerating) { latest = await request<Review>(`/${selected}/cover${regenerate ? "/regenerate" : ""}`, "POST", undefined, controller.signal); update(latest); }
          for (let attempt = 0; latest.coverGenerating && attempt < 180; attempt++) {
            await new Promise(resolve => window.setTimeout(resolve, 2000));
            if (controller.signal.aborted) return;
            latest = await request<Review>(`/${selected}`, "GET", undefined, controller.signal); update(latest);
          }
          if ((!latest.coverUrl || latest.coverGenerating) && !controller.signal.aborted) throw new Error("封面尚未生成完成，请稍后重试。");
        }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "绘本加载失败"); try { update(await request<Review>(`/${selected}`)); } catch { /* 保留错误和重试入口。 */ } }
      } finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [selected, retry]);

  async function decide(action: "approve" | "reject") {
    if (!review || deciding || busy || review.coverGenerating) return;
    if (action === "reject" && reason.trim().length < 2) { setError("请填写至少 2 个字符的拒绝原因。"); return; }
    setDeciding(true); setError("");
    try {
      await request(`/${review.id}/${action}`, "POST", { expectedUpdatedAt: review.updatedAt, ...(action === "reject" ? { reason: reason.trim() } : {}) });
      setSelected(null); setNotice(action === "approve" ? "绘本已通过审核，可在绘本馆阅读。" : "绘本投稿已拒绝。"); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审核操作失败");
      try { setReview(await request<Review>(`/${review.id}`)); } catch { /* 保留操作错误。 */ }
    } finally { setDeciding(false); }
  }
  async function unpublish() {
    if (!review || deciding) return;
    setDeciding(true); setError("");
    try { await request(`/${review.id}/unpublish`, "POST", { expectedVersion: review.publishedVersion }); setSelected(null); setNotice("绘本已下架。"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "下架失败"); }
    finally { setDeciding(false); }
  }
  const page = review?.book.pages[index];
  return <div className="space-y-5">
    <form method="get" className="flex items-end gap-3"><label className="text-sm font-semibold">审核状态<select name="status" defaultValue={status} className="ml-3 rounded-lg border px-3 py-2 font-normal">{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><Button variant="outline" type="submit">筛选</Button></form>
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-secondary"><tr>{["绘本名称","投稿人","提审时间","状态","操作"].map(label=><th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{rows.length ? rows.map(row=><tr key={row.id} className="border-t"><td className="max-w-64 truncate px-4 py-4 font-medium">{row.title}</td><td className="px-4 py-4">{row.author}</td><td className="px-4 py-4 text-muted-foreground">{new Date(row.submittedAt).toLocaleString("zh-CN",{hour12:false})}</td><td className="px-4 py-4">{labels[row.status]}</td><td className="px-4 py-4"><Button size="sm" variant="outline" onClick={()=>{setNotice("");setSelected(row.id);}}> {row.status === "PENDING" ? "审核绘本" : "查看详情"}</Button></td></tr>) : <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">暂无{labels[status]}的单本绘本</td></tr>}</tbody></table></div>
    <dialog ref={dialog} aria-labelledby="book-review-title" onCancel={()=>setSelected(null)} onClose={()=>setSelected(null)} className="m-auto max-h-[90vh] w-[min(960px,94vw)] overflow-y-auto rounded-2xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40">
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="book-review-title" className="text-xl font-semibold">{review?.book.title ?? "单本绘本审核"}</h2>{review ? <p className="mt-1 text-sm text-muted-foreground">{review.author} · {labels[review.status]}</p> : null}</div><button aria-label="关闭审核窗口" disabled={deciding} onClick={()=>setSelected(null)}><X className="size-5" /></button></div>
      {error ? <p role="alert" className="mb-4 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {review ? <div className="grid gap-6 md:grid-cols-2">
        <section><h3 className="mb-3 text-base font-semibold">绘本内容</h3>{page ? <><img className="aspect-square w-full rounded-xl border object-contain" src={`/api/admin/picture-book-submissions/${review.id}/pages/${page.position}/image`} alt={`${review.book.title}${page.position === 0 ? "封面" : `第 ${page.position} 页`}`} /><div className="mt-3 flex items-center justify-between"><Button size="sm" variant="outline" disabled={index===0} onClick={()=>setIndex(index-1)} aria-label="上一页"><ChevronLeft /></Button><span className="text-sm">{page.position===0 ? "原始封面" : `第 ${page.position} 页`} / {review.book.pages.length-1} 页</span><Button size="sm" variant="outline" disabled={index===review.book.pages.length-1} onClick={()=>setIndex(index+1)} aria-label="下一页"><ChevronRight /></Button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{page.caption}</p>{page.narration && page.narration!==page.caption ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">讲解：{page.narration}</p> : null}
          {page.audioUrl ? <audio aria-label="原文语音" controls preload="none" className="mt-3 w-full" src={`/api/admin/picture-book-submissions/${encodeURIComponent(review.id)}/pages/${page.position}/audio`} /> : null}
          {page.translations?.length ? <div className="mt-4 space-y-3 border-t pt-4"><h4 className="text-sm font-semibold">多语种内容</h4>{page.translations.map(item => <div key={item.language} className="rounded-xl border bg-secondary/30 p-3"><p className="text-sm font-semibold">{pictureBookLanguageName(item.language)}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.caption}</p>{item.audioUrl ? <audio aria-label={`${pictureBookLanguageName(item.language)}语音`} controls preload="none" className="mt-3 w-full" src={`/api/admin/picture-book-submissions/${encodeURIComponent(review.id)}/pages/${page.position}/audio?language=${encodeURIComponent(item.language)}`} /> : <p className="mt-2 text-xs text-muted-foreground">尚未合成语音</p>}</div>)}</div> : null}</> : null}</section>
        <section><h3 className="mb-3 text-base font-semibold">绘本馆封面 · 4:3</h3>{review.coverUrl ? <img className="aspect-[4/3] w-full rounded-xl border object-cover" src={`/api/admin/picture-book-submissions/${review.id}/cover/image?v=${encodeURIComponent(review.updatedAt)}`} alt={`${review.book.title}绘本馆封面`} /> : <div className="flex aspect-[4/3] items-center justify-center rounded-xl border bg-secondary text-sm text-muted-foreground">{busy ? <><LoaderCircle className="mr-2 size-4 animate-spin" />正在生成封面…</> : "封面尚未生成"}</div>}
          {review.status === "PENDING" ? <div className="mt-5 space-y-4">{review.coverUrl ? <Button variant="outline" disabled={busy || deciding || review.coverGenerating} onClick={()=>{regenerateFor.current=review.id;setBusy(true);setRetry(value=>value+1);}}>{busy || review.coverGenerating ? <><LoaderCircle className="mr-2 size-4 animate-spin" />正在重新生成…</> : "重新生成"}</Button> : !busy ? <Button variant="outline" onClick={()=>setRetry(retry+1)}>重试生成封面</Button> : null}<label className="block text-sm font-semibold">拒绝原因<Textarea className="mt-2 font-normal" value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder="拒绝投稿时必填" disabled={deciding} /></label><div className="flex gap-3"><Button disabled={busy||deciding||review.coverGenerating||!review.coverUrl} onClick={()=>void decide("approve")}>通过审核</Button><Button variant="outline" disabled={busy||deciding||review.coverGenerating} onClick={()=>void decide("reject")}>拒绝投稿</Button></div></div> : review.reviewNote ? <p className="mt-4 text-sm text-destructive">拒绝原因：{review.reviewNote}</p> : null}
          {review.published ? <Button className="mt-4" variant="outline" disabled={deciding} onClick={() => void unpublish()}>下架已发布绘本</Button> : null}
        </section>
      </div> : <p className="py-12 text-center text-sm text-muted-foreground">{busy ? "正在加载绘本…" : "绘本加载失败"}</p>}
    </dialog>
  </div>;
}
