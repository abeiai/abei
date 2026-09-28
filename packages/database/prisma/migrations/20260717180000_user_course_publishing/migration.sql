-- CreateEnum
CREATE TYPE "CourseReviewState" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourseRevisionStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourseMaterialType" AS ENUM ('VIDEO_GUIDE', 'ENGLISH_GUIDED_STUDY', 'LEARNING_FLASHCARD');

-- CreateEnum
CREATE TYPE "CourseMaterialPublicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourseReviewScope" AS ENUM ('COURSE_REVISION', 'MATERIAL_CHANGE');

-- CreateEnum
CREATE TYPE "CourseReviewRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvedRevisionId" TEXT,
    "workingRevisionId" TEXT,
    "reviewState" "CourseReviewState" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_revisions" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "coverMediaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CourseRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_revision_items" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "materialType" "CourseMaterialType" NOT NULL,
    "videoGuideLessonId" TEXT,
    "englishGuidedStudyMaterialId" TEXT,
    "learningFlashcardDeckId" TEXT,
    "displayName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_material_publications" (
    "id" TEXT NOT NULL,
    "materialType" "CourseMaterialType" NOT NULL,
    "videoGuideLessonId" TEXT,
    "englishGuidedStudyMaterialId" TEXT,
    "learningFlashcardDeckId" TEXT,
    "status" "CourseMaterialPublicationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedHash" TEXT,
    "currentHash" TEXT NOT NULL,
    "approvedSnapshot" JSONB,
    "currentSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_material_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_review_requests" (
    "id" TEXT NOT NULL,
    "scope" "CourseReviewScope" NOT NULL,
    "status" "CourseReviewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "courseId" TEXT,
    "courseRevisionId" TEXT,
    "materialPublicationId" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "reviewedByAdminId" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_approvedRevisionId_key" ON "courses"("approvedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_workingRevisionId_key" ON "courses"("workingRevisionId");

-- CreateIndex
CREATE INDEX "courses_userId_updatedAt_idx" ON "courses"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "courses_reviewState_publishedAt_idx" ON "courses"("reviewState", "publishedAt");

-- CreateIndex
CREATE INDEX "course_revisions_courseId_createdAt_idx" ON "course_revisions"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "course_revisions_status_submittedAt_idx" ON "course_revisions"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "course_revision_items_revisionId_sortOrder_idx" ON "course_revision_items"("revisionId", "sortOrder");

-- CreateIndex
CREATE INDEX "course_revision_items_publicationId_idx" ON "course_revision_items"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "course_revision_items_revisionId_publicationId_key" ON "course_revision_items"("revisionId", "publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "course_material_publications_videoGuideLessonId_key" ON "course_material_publications"("videoGuideLessonId");

-- CreateIndex
CREATE UNIQUE INDEX "course_material_publications_englishGuidedStudyMaterialId_key" ON "course_material_publications"("englishGuidedStudyMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "course_material_publications_learningFlashcardDeckId_key" ON "course_material_publications"("learningFlashcardDeckId");

-- CreateIndex
CREATE INDEX "course_material_publications_status_updatedAt_idx" ON "course_material_publications"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "course_review_requests_status_submittedAt_idx" ON "course_review_requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "course_review_requests_courseId_submittedAt_idx" ON "course_review_requests"("courseId", "submittedAt");

-- CreateIndex
CREATE INDEX "course_review_requests_materialPublicationId_submittedAt_idx" ON "course_review_requests"("materialPublicationId", "submittedAt");

-- CreateIndex
CREATE INDEX "media_assets_createdByUserId_idx" ON "media_assets"("createdByUserId");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_approvedRevisionId_fkey" FOREIGN KEY ("approvedRevisionId") REFERENCES "course_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_workingRevisionId_fkey" FOREIGN KEY ("workingRevisionId") REFERENCES "course_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "course_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "course_material_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_videoGuideLessonId_fkey" FOREIGN KEY ("videoGuideLessonId") REFERENCES "video_guide_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_englishGuidedStudyMaterialId_fkey" FOREIGN KEY ("englishGuidedStudyMaterialId") REFERENCES "english_guided_study_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_learningFlashcardDeckId_fkey" FOREIGN KEY ("learningFlashcardDeckId") REFERENCES "learning_flashcard_decks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_material_publications" ADD CONSTRAINT "course_material_publications_videoGuideLessonId_fkey" FOREIGN KEY ("videoGuideLessonId") REFERENCES "video_guide_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_material_publications" ADD CONSTRAINT "course_material_publications_englishGuidedStudyMaterialId_fkey" FOREIGN KEY ("englishGuidedStudyMaterialId") REFERENCES "english_guided_study_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_material_publications" ADD CONSTRAINT "course_material_publications_learningFlashcardDeckId_fkey" FOREIGN KEY ("learningFlashcardDeckId") REFERENCES "learning_flashcard_decks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_courseRevisionId_fkey" FOREIGN KEY ("courseRevisionId") REFERENCES "course_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_materialPublicationId_fkey" FOREIGN KEY ("materialPublicationId") REFERENCES "course_material_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "course_revision_items"
ADD CONSTRAINT "course_revision_items_one_source_check" CHECK (
  (("videoGuideLessonId" IS NOT NULL)::int +
   ("englishGuidedStudyMaterialId" IS NOT NULL)::int +
   ("learningFlashcardDeckId" IS NOT NULL)::int) = 1
);

ALTER TABLE "course_material_publications"
ADD CONSTRAINT "course_material_publications_one_source_check" CHECK (
  (("videoGuideLessonId" IS NOT NULL)::int +
   ("englishGuidedStudyMaterialId" IS NOT NULL)::int +
   ("learningFlashcardDeckId" IS NOT NULL)::int) = 1
);

CREATE UNIQUE INDEX "course_review_requests_pending_revision_key"
ON "course_review_requests"("courseRevisionId")
WHERE "status" = 'PENDING' AND "scope" = 'COURSE_REVISION';

CREATE UNIQUE INDEX "course_review_requests_pending_material_key"
ON "course_review_requests"("materialPublicationId")
WHERE "status" = 'PENDING' AND "scope" = 'MATERIAL_CHANGE';
