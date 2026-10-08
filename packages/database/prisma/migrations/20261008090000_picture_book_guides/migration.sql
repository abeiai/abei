CREATE TABLE "picture_book_guides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pdfName" TEXT NOT NULL,
    "pdfSizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT '幼儿园',
    "style" TEXT NOT NULL DEFAULT 'interactive',
    "pages" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "operationToken" TEXT,
    "operationExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "picture_book_guides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "picture_book_guides_storageKey_key" ON "picture_book_guides"("storageKey");
CREATE INDEX "picture_book_guides_userId_updatedAt_idx" ON "picture_book_guides"("userId", "updatedAt");
ALTER TABLE "picture_book_guides" ADD CONSTRAINT "picture_book_guides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
