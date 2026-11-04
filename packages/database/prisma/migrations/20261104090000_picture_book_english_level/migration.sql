ALTER TABLE "picture_books" ADD COLUMN "englishLevel" INTEGER;
ALTER TABLE "picture_books" ADD CONSTRAINT "picture_books_english_level_check" CHECK ("englishLevel" IS NULL OR "englishLevel" BETWEEN 1 AND 5);
ALTER TABLE "picture_book_submissions" ADD COLUMN "catalogSortAt" TIMESTAMP(3);
CREATE INDEX "picture_book_submissions_catalog_sort_idx" ON "picture_book_submissions" ((COALESCE("catalogSortAt", "publishedAt")) DESC, "id" DESC) WHERE "publishedAt" IS NOT NULL AND "publishedCoverUrl" IS NOT NULL;
