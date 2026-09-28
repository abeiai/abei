ALTER TABLE "english_guided_study_materials" ADD COLUMN "audioTaskId" TEXT;

CREATE INDEX "english_guided_study_materials_audioTaskId_idx" ON "english_guided_study_materials"("audioTaskId");

ALTER TABLE "english_guided_study_materials"
  ADD CONSTRAINT "english_guided_study_materials_audioTaskId_fkey"
  FOREIGN KEY ("audioTaskId") REFERENCES "audio_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
