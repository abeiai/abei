CREATE TABLE "dictionary_entries" (
  "id" TEXT NOT NULL,
  "word" TEXT NOT NULL,
  "normalized_word" TEXT NOT NULL,
  "phonetic" TEXT,
  "definition" TEXT,
  "translation" TEXT,
  "part_of_speech" TEXT,
  "collins" INTEGER,
  "oxford" BOOLEAN NOT NULL DEFAULT false,
  "tag" TEXT,
  "bnc" INTEGER,
  "frq" INTEGER,
  "exchange" TEXT,
  "detail" TEXT,
  "audio" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dictionary_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dictionary_entries_word_key" ON "dictionary_entries"("word");
CREATE INDEX "dictionary_entries_normalized_word_idx" ON "dictionary_entries"("normalized_word");
CREATE INDEX "dictionary_entries_collins_idx" ON "dictionary_entries"("collins");
CREATE INDEX "dictionary_entries_bnc_idx" ON "dictionary_entries"("bnc");
CREATE INDEX "dictionary_entries_frq_idx" ON "dictionary_entries"("frq");
