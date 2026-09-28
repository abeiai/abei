ALTER TYPE "VideoGuideLessonStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

ALTER TABLE "video_guide_lessons"
  ALTER COLUMN "subtitleName" DROP NOT NULL,
  ALTER COLUMN "subtitleFormat" DROP NOT NULL;
