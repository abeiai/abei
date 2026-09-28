ALTER TABLE "copybook_records"
ADD COLUMN IF NOT EXISTS "sourceConfig" JSONB,
ADD COLUMN IF NOT EXISTS "sourceConfigVersion" INTEGER;
