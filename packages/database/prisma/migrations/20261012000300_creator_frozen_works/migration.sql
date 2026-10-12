ALTER TABLE "picture_book_submissions" ADD COLUMN "publishedSnapshot" JSONB, ADD COLUMN "publishedHash" TEXT,
  ADD COLUMN "publishedCoverUrl" TEXT, ADD COLUMN "publishedAt" TIMESTAMP(3), ADD COLUMN "publishedVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "picture_book_submissions" SET "publishedSnapshot"="snapshot", "publishedHash"="snapshotHash", "publishedCoverUrl"="coverUrl", "publishedAt"=COALESCE("reviewedAt","submittedAt"), "publishedVersion"=1 WHERE "status"='APPROVED' AND "coverUrl" IS NOT NULL;
ALTER TABLE "course_revision_items" ADD COLUMN "pinnedSnapshot" JSONB, ADD COLUMN "pinnedHash" TEXT, ADD COLUMN "pinnedVersion" INTEGER;
-- Existing approved picture-book albums must also stop following mutable publication pointers.
UPDATE "course_revision_items" AS i SET "pinnedSnapshot"=p."approvedSnapshot", "pinnedHash"=p."approvedHash"
FROM "course_material_publications" AS p, "course_revisions" AS r WHERE i."publicationId"=p."id" AND i."revisionId"=r."id" AND i."materialType"='PICTURE_BOOK' AND r."status"='APPROVED' AND p."approvedHash" IS NOT NULL;
CREATE TABLE "creator_works" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "externalId" TEXT NOT NULL,
 "resourceId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "requestHash" TEXT NOT NULL, "input" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "creator_works_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "creator_works_resourceId_key" ON "creator_works"("resourceId");
CREATE UNIQUE INDEX "creator_works_userId_kind_externalId_key" ON "creator_works"("userId","kind","externalId");
