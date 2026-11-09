import type { Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { hashCourseSnapshot } from "../courses/course-domain.js";
import { publicTextLayout } from "./picture-book-text-layout.js";

const markerKey = "_automaticTextLayoutReview";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function withoutAutomaticTextLayoutMarker(value: unknown) {
  const content = { ...record(value) };
  delete content[markerKey];
  return content;
}

/** Called with the submission and material advisory locks held in the page-save transaction. */
export async function stagePublishedTextLayout(transaction: Prisma.TransactionClient, userId: string, pictureBookId: string) {
  const submission = await transaction.pictureBookSubmission.findUnique({ where: { pictureBookId } });
  if (!submission?.publishedAt || !submission.publishedSnapshot || !submission.publishedHash) return;
  const book = await transaction.pictureBook.findFirst({ where: { id: pictureBookId, userId } });
  if (!book) throw new AppException(40401, "绘本作品不存在", 404);
  const currentPages = Array.isArray(book.pages) ? book.pages.map(record) : [];
  const published = record(submission.publishedSnapshot);
  const marker = record(record(submission.snapshot)[markerKey]);
  const automaticPending = submission.status === "PENDING" && marker.basePublishedHash === submission.publishedHash && marker.version === 1;
  const publicPages = Array.isArray(published.pages) ? published.pages.map(record) : [];
  if (!currentPages.some(page => record(page.textLayout).enabled === true) && !publicPages.some(page => record(page.textLayout).enabled === true)) {
    if (automaticPending) await transaction.pictureBookSubmission.update({ where: { id: submission.id }, data: { status: "APPROVED", snapshot: submission.publishedSnapshot as Prisma.InputJsonValue, snapshotHash: submission.publishedHash, sourceInfo: submission.publishedSourceInfo as Prisma.InputJsonValue, coverUrl: submission.publishedCoverUrl, coverTaskId: null, coverToken: null, coverExpiresAt: null } });
    return;
  }
  const legacy = currentPages.length === book.pageCount && currentPages.every((page, index) => page.position === index + 1);
  const byPosition = new Map(currentPages.map(page => [Number(page.position) - Number(legacy), page]));
  const pages = publicPages.map(page => {
    const current = byPosition.get(Number(page.position));
    if (!current) return page;
    const textLayout = record(current.textLayout);
    if (textLayout.enabled !== true) {
      const approvedLayout = record(page.textLayout);
      if (approvedLayout.enabled !== true) return page;
      const versions = publicTextLayout(approvedLayout).versions;
      const captionOf = (version: typeof versions[number]) => version.boxes.map(box => box.text).filter(Boolean).join("\n");
      const original = versions.find(version => version.language === "original");
      const caption = original ? captionOf(original) : "";
      const translations = versions.filter(version => version.language !== "original" && captionOf(version).trim()).map(version => ({ language: version.language, caption: captionOf(version), audioUrl: version.audioUrl }));
      const rest = { ...page };
      delete rest.textLayout;
      delete rest.translations;
      return { ...rest, caption, narration: caption, audioUrl: original?.audioUrl ?? null, ...(translations.length ? { translations } : {}) };
    }
    const rest = { ...page };
    delete rest.translations;
    return { ...rest, caption: "", narration: "", audioUrl: null, textLayout: publicTextLayout(textLayout) };
  });
  const publishedContent = withoutAutomaticTextLayoutMarker(published);
  const content = { ...publishedContent, pages };
  if (hashCourseSnapshot(content) === hashCourseSnapshot(publishedContent)) {
    if (automaticPending) await transaction.pictureBookSubmission.update({ where: { id: submission.id }, data: { status: "APPROVED", snapshot: submission.publishedSnapshot as Prisma.InputJsonValue, snapshotHash: submission.publishedHash, sourceInfo: submission.publishedSourceInfo as Prisma.InputJsonValue, coverUrl: submission.publishedCoverUrl, coverTaskId: null, coverToken: null, coverExpiresAt: null } });
    return;
  }
  if (publicPages.length !== currentPages.length || publicPages.some(page => {
    const current = byPosition.get(Number(page.position));
    return !current || current.imageUrl !== page.imageUrl;
  })) throw new AppException(40901, "绘本图片或页数与公开版本不同，请通过更新公开分享提交审核", 409);
  if (submission.status === "PENDING" && !automaticPending) throw new AppException(40901, "已有其他内容正在审核，请先完成审核再保存图文编排", 409);
  const snapshot = { ...content, [markerKey]: { version: 1, basePublishedHash: submission.publishedHash } };
  const snapshotHash = hashCourseSnapshot(snapshot);
  if ((submission.status === "PENDING" || submission.status === "REJECTED") && submission.snapshotHash === snapshotHash) return;
  const updatedAt = new Date(Math.max(Date.now(), submission.updatedAt.getTime() + 1));
  await transaction.pictureBookSubmission.update({ where: { id: submission.id }, data: {
    submittedVersion: book.version, snapshot: snapshot as Prisma.InputJsonValue, snapshotHash,
    status: "PENDING", ...(!automaticPending ? { sourceInfo: submission.publishedSourceInfo as Prisma.InputJsonValue } : {}), coverUrl: submission.publishedCoverUrl, coverTaskId: null, coverToken: null, coverExpiresAt: null,
    reviewedByAdminId: null, reviewedAt: null, reviewNote: null, submittedAt: new Date(), updatedAt
  } });
}
