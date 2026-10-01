CREATE TABLE "picture_books" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "plot" TEXT NOT NULL DEFAULT '',
    "style" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
    "pageCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "messages" JSONB NOT NULL,
    "characters" JSONB NOT NULL,
    "pages" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "picture_books_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "picture_book_characters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "picture_book_characters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "picture_books_userId_updatedAt_idx" ON "picture_books"("userId", "updatedAt");
CREATE INDEX "picture_book_characters_userId_updatedAt_idx" ON "picture_book_characters"("userId", "updatedAt");
ALTER TABLE "picture_books" ADD CONSTRAINT "picture_books_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "picture_book_characters" ADD CONSTRAINT "picture_book_characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
