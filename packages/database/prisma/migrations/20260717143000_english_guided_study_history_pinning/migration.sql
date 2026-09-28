ALTER TABLE "english_guided_study_materials"
ADD COLUMN "pinnedAt" TIMESTAMP(3);

CREATE INDEX "english_guided_study_materials_userId_pinnedAt_createdAt_idx"
ON "english_guided_study_materials"("userId", "pinnedAt", "createdAt");
