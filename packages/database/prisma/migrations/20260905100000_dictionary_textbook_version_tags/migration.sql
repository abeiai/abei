CREATE TABLE "dictionary_textbook_version_tags" (
  "id" TEXT NOT NULL,
  "dictionary_entry_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "source_library_count" INTEGER NOT NULL DEFAULT 0,
  "source_item_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dictionary_textbook_version_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dictionary_textbook_version_tags_dictionary_entry_id_version_key"
ON "dictionary_textbook_version_tags"("dictionary_entry_id", "version");

CREATE INDEX "dictionary_textbook_version_tags_version_idx"
ON "dictionary_textbook_version_tags"("version");

ALTER TABLE "dictionary_textbook_version_tags"
ADD CONSTRAINT "dictionary_textbook_version_tags_dictionary_entry_id_fkey"
FOREIGN KEY ("dictionary_entry_id") REFERENCES "dictionary_entries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
