CREATE TYPE "EnglishContentEducationStage" AS ENUM ('PRIMARY', 'JUNIOR_HIGH', 'SENIOR_HIGH', 'UNIVERSITY', 'OTHER');

ALTER TABLE "english_content_libraries"
ADD COLUMN "educationStage" "EnglishContentEducationStage";

CREATE INDEX "english_content_libraries_educationStage_status_sortOrder_idx"
ON "english_content_libraries"("educationStage", "status", "sortOrder");
