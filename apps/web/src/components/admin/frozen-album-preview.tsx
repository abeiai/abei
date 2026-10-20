"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CourseReviewRequest, JsonValue } from "@/lib/course-types";
import { pictureBookLanguageName } from "@/lib/picture-book-languages";

const record = (value: JsonValue | undefined): Record<string, JsonValue> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function hasFrozenAlbum(review: CourseReviewRequest) {
  return review.scope === "COURSE_REVISION" && Boolean(review.courseRevision?.items.some(item => item.materialType === "PICTURE_BOOK" && item.pinnedSnapshot));
}
export function UnpublishAlbum({ courseId, revisionId }: { courseId: string; revisionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function unpublish() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/course-reviews/courses/${courseId}/unpublish`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevisionId: revisionId }) });
      const result = await response.json();
      if (!response.ok || result.code !== 0) throw new Error(result.message || "下架失败");
      setDone(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "下架失败"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2"><Button size="sm" variant="outline" disabled={busy || done} onClick={() => void unpublish()}>{done ? "已下架" : "下架已发布专辑"}</Button>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>;
}

export function FrozenAlbumPreview({ review }: { review: CourseReviewRequest }) {
  if (!hasFrozenAlbum(review)) return null;
  const snapshot = record(review.afterSnapshot);
  const submitted = Array.isArray(snapshot.items) ? snapshot.items.map(record) : [];
  const courseId = review.courseId ?? review.course?.id;
  return <section className="space-y-4">
    <h3 className="text-base font-semibold">{String(snapshot.name ?? review.courseRevision!.name)} · 公开分享版本</h3>
    {snapshot.summary ? <p className="whitespace-pre-wrap text-sm leading-6">{String(snapshot.summary)}</p> : null}
    <img className="max-h-64 rounded-lg object-contain" src={`/api/creator-media/revisions/${review.courseRevision!.id}/cover`} alt="公开分享专辑封面" />
    {review.courseRevision!.items.map(item => {
      if (item.materialType !== "PICTURE_BOOK" || !item.pinnedSnapshot) {
        return <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <span className="text-sm font-semibold">{item.displayName}</span>
          {courseId ? <Button asChild size="sm" variant="outline"><Link aria-label={`${item.displayName}：打开专辑预览`} href={`/c/${courseId}`} rel="noreferrer" target="_blank">打开专辑预览</Link></Button> : <span className="text-sm text-muted-foreground">暂无可预览专辑</span>}
        </div>;
      }
      const frozen = submitted.find(value => value.publicationId === item.publicationId);
      const book = record(frozen?.materialSnapshot ?? item.pinnedSnapshot);
      const pages = Array.isArray(book.pages) ? book.pages.map(record) : [];
      return <details key={item.id} className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">{item.displayName} · v{item.pinnedVersion}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{pages.map(page => {
        const position = Number(page.position);
        const base = `/api/creator-media/items/${item.id}/pages/${position}`;
        const translations = Array.isArray(page.translations) ? page.translations.map(record) : [];
        return <div key={position}>
          <img className="w-full rounded-lg object-contain" src={`${base}/image`} alt={position === 0 ? "绘本封面" : `第 ${position} 页`} />
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{String(page.caption ?? "")}</p>
          {page.narration && page.narration !== page.caption ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">旁白：{String(page.narration)}</p> : null}
          {page.audioUrl ? <audio aria-label="原文语音" controls preload="none" className="mt-2 w-full" src={`${base}/audio`} /> : null}
          {translations.map(translation => <div className="mt-3" key={String(translation.language)}><p className="text-sm font-semibold">{pictureBookLanguageName(String(translation.language))}</p><p className="text-sm leading-6">{String(translation.caption ?? "")}</p>{translation.audioUrl ? <audio aria-label={`${pictureBookLanguageName(String(translation.language))}语音`} controls preload="none" className="mt-2 w-full" src={`${base}/audio?language=${encodeURIComponent(String(translation.language))}`} /> : null}</div>)}
        </div>;
      })}</div></details>;
    })}
  </section>;
}
