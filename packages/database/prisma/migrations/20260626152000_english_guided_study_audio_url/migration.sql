-- Store the generated narration audio URL separately from the structured study content.

ALTER TABLE "english_guided_study_materials"
  ADD COLUMN "audioUrl" TEXT;
