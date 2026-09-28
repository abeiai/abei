CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX "dictionary_entries_translation_trgm_idx"
ON "dictionary_entries" USING GIN ("translation" gin_trgm_ops)
WHERE "translation" IS NOT NULL;
