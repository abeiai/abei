import { AdminShell } from "@/components/shell/admin-shell";
import { PictureBookReviewManager } from "@/components/admin/picture-book-review-manager";
import { getPictureBookReviews } from "@/lib/picture-book-library-api";
export const dynamic = "force-dynamic";
export default async function PictureBookReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const query = await searchParams;
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(query.status ?? "") ? query.status! : "PENDING";
  let rows: Awaited<ReturnType<typeof getPictureBookReviews>> = [], failed = false;
  try { rows = await getPictureBookReviews(status); } catch { failed = true; }
  return <AdminShell active="/admin/picture-book-reviews" title="单本绘本审核">{failed ? <p role="alert" className="text-sm text-destructive">绘本审核列表加载失败，请稍后刷新重试。</p> : <PictureBookReviewManager rows={rows} status={status} />}</AdminShell>;
}
