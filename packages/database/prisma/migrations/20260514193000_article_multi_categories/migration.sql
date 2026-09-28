-- CreateTable
CREATE TABLE "article_category_links" (
    "articleId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_category_links_pkey" PRIMARY KEY ("articleId","categoryId")
);

-- Backfill existing primary category as the first linked category.
INSERT INTO "article_category_links" ("articleId", "categoryId")
SELECT "id", "categoryId"
FROM "articles"
ON CONFLICT ("articleId","categoryId") DO NOTHING;

-- CreateIndex
CREATE INDEX "article_category_links_categoryId_idx" ON "article_category_links"("categoryId");

-- AddForeignKey
ALTER TABLE "article_category_links" ADD CONSTRAINT "article_category_links_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_category_links" ADD CONSTRAINT "article_category_links_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "article_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
