CREATE TABLE "picture_book_submissions" (
    "id" TEXT NOT NULL,
    "pictureBookId" TEXT NOT NULL,
    "status" "CourseReviewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "coverUrl" TEXT,
    "coverTaskId" TEXT,
    "coverToken" TEXT,
    "coverExpiresAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedByAdminId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "picture_book_submissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "picture_book_submissions_pictureBookId_key" ON "picture_book_submissions"("pictureBookId");
CREATE INDEX "picture_book_submissions_status_submittedAt_idx" ON "picture_book_submissions"("status", "submittedAt");
ALTER TABLE "picture_book_submissions" ADD CONSTRAINT "picture_book_submissions_pictureBookId_fkey" FOREIGN KEY ("pictureBookId") REFERENCES "picture_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "picture_book_submissions" ADD CONSTRAINT "picture_book_submissions_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
