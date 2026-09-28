-- CMS growth and SEO additions: media assets, article tags, richer SEO fields and scheduling.
CREATE TYPE "MediaStorageProvider" AS ENUM ('LOCAL', 'S3');

ALTER TABLE "articles"
  ADD COLUMN "coverMediaId" TEXT,
  ADD COLUMN "seoKeywords" TEXT,
  ADD COLUMN "canonicalUrl" TEXT,
  ADD COLUMN "noIndex" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ogTitle" TEXT,
  ADD COLUMN "ogDescription" TEXT,
  ADD COLUMN "ogImage" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3);

ALTER TABLE "pages"
  ADD COLUMN "seoKeywords" TEXT,
  ADD COLUMN "canonicalUrl" TEXT,
  ADD COLUMN "noIndex" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ogTitle" TEXT,
  ADD COLUMN "ogDescription" TEXT,
  ADD COLUMN "ogImage" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3);

CREATE TABLE "tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "article_tags" (
  "articleId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "article_tags_pkey" PRIMARY KEY ("articleId","tagId")
);

CREATE TABLE "media_assets" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "storageProvider" "MediaStorageProvider" NOT NULL DEFAULT 'LOCAL',
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");
CREATE INDEX "article_tags_tagId_idx" ON "article_tags"("tagId");
CREATE INDEX "media_assets_createdByAdminId_idx" ON "media_assets"("createdByAdminId");
CREATE INDEX "media_assets_createdAt_idx" ON "media_assets"("createdAt");
CREATE INDEX "articles_coverMediaId_idx" ON "articles"("coverMediaId");
CREATE INDEX "articles_scheduledAt_idx" ON "articles"("scheduledAt");
CREATE INDEX "pages_scheduledAt_idx" ON "pages"("scheduledAt");

ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "articles" ADD CONSTRAINT "articles_coverMediaId_fkey"
  FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
