CREATE TABLE "picture_book_editions" (
  "pictureBookId" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  CONSTRAINT "picture_book_editions_pkey" PRIMARY KEY ("pictureBookId")
);

CREATE UNIQUE INDEX "picture_book_editions_groupKey_language_key" ON "picture_book_editions"("groupKey", "language");
ALTER TABLE "picture_book_editions" ADD CONSTRAINT "picture_book_editions_pictureBookId_fkey" FOREIGN KEY ("pictureBookId") REFERENCES "picture_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
