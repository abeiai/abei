ALTER TABLE "picture_book_submissions" ADD COLUMN "sourceInfo" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "publishedSourceInfo" JSONB NOT NULL DEFAULT '{}';
