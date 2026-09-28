-- Store uploaded media and subtitle file URLs for shareable video guide lessons.

ALTER TABLE "video_guide_lessons"
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "mediaStorageKey" TEXT,
  ADD COLUMN "subtitleUrl" TEXT,
  ADD COLUMN "subtitleStorageKey" TEXT;
