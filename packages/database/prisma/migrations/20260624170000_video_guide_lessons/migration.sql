-- Video guide lesson persistence for shareable parent-created learning pages.

CREATE TYPE "VideoGuideMediaType" AS ENUM ('VIDEO', 'AUDIO');
CREATE TYPE "VideoGuideSubtitleFormat" AS ENUM ('SRT', 'ASS');
CREATE TYPE "VideoGuideLessonStatus" AS ENUM ('QUEUED', 'GENERATING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "video_guide_lessons" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mediaName" TEXT NOT NULL,
  "mediaType" "VideoGuideMediaType" NOT NULL,
  "mediaMimeType" TEXT,
  "mediaSizeBytes" INTEGER NOT NULL,
  "subtitleName" TEXT NOT NULL,
  "subtitleFormat" "VideoGuideSubtitleFormat" NOT NULL,
  "subtitleSizeBytes" INTEGER,
  "status" "VideoGuideLessonStatus" NOT NULL DEFAULT 'QUEUED',
  "shareToken" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "video_guide_lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_guide_lessons_shareToken_key" ON "video_guide_lessons"("shareToken");
CREATE INDEX "video_guide_lessons_userId_createdAt_idx" ON "video_guide_lessons"("userId", "createdAt");
CREATE INDEX "video_guide_lessons_status_idx" ON "video_guide_lessons"("status");
CREATE INDEX "video_guide_lessons_shareToken_idx" ON "video_guide_lessons"("shareToken");

ALTER TABLE "video_guide_lessons"
  ADD CONSTRAINT "video_guide_lessons_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
