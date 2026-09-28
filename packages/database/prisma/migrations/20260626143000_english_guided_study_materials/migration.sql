-- Persist generated English guided study materials for logged-in users.

CREATE TYPE "EnglishGuidedStudySourceType" AS ENUM ('TEXT', 'IMAGE');

CREATE TABLE "english_guided_study_materials" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceType" "EnglishGuidedStudySourceType" NOT NULL,
  "sourceName" TEXT,
  "sourceText" TEXT NOT NULL,
  "levelStandardName" TEXT NOT NULL,
  "levelOptionLabel" TEXT NOT NULL,
  "aiLevel" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "narration" TEXT NOT NULL,
  "audioDurationSeconds" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "english_guided_study_materials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "english_guided_study_materials_userId_createdAt_idx"
  ON "english_guided_study_materials"("userId", "createdAt");

CREATE INDEX "english_guided_study_materials_aiLevel_idx"
  ON "english_guided_study_materials"("aiLevel");

ALTER TABLE "english_guided_study_materials"
  ADD CONSTRAINT "english_guided_study_materials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
