import type { Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

export const albumSharingMessage = "本作品已经通过专辑分享，请不要重复分享";
export const publishedAlbumRevisionWhere = {
  status: "APPROVED", approvedFor: { is: { publishedAt: { not: null } } }
} satisfies Prisma.CourseRevisionWhereInput;

// The same material lock is held by album approval until its publication commits.
export async function assertStandaloneSharingAllowed(transaction: Prisma.TransactionClient, pictureBookId: string) {
  await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${pictureBookId}`}))`;
  const member = await transaction.courseRevisionItem.findFirst({
    where: { materialType: "PICTURE_BOOK", pictureBookId, revision: publishedAlbumRevisionWhere }, select: { id: true }
  });
  if (member) throw new AppException(40901, albumSharingMessage, 409);
}

// Keep approved snapshots and review history; only withdraw the standalone public entry.
export async function withdrawStandaloneBookShares(transaction: Prisma.TransactionClient, pictureBookIds: string[]) {
  if (!pictureBookIds.length) return { count: 0 };
  return transaction.pictureBookSubmission.updateMany({
    where: { pictureBookId: { in: [...new Set(pictureBookIds)] }, publishedAt: { not: null } },
    data: { publishedAt: null, publishedVersion: { increment: 1 } }
  });
}

export function pictureBookSharingState<T extends { status: string; publishedAt?: Date | null }>(row: { submission?: T | null; revisionItems?: unknown[] }) {
  const sharedViaAlbum = Boolean(row.revisionItems?.length);
  return { sharedViaAlbum, submission: sharedViaAlbum || (row.submission?.status === "APPROVED" && row.submission.publishedAt === null) ? null : row.submission ?? null };
}
