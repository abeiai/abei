CREATE TYPE "ContentModuleType" AS ENUM ('SLIDESHOW', 'IMAGE_CARD_LIST', 'SPLIT_IMAGE_TEXT');

CREATE TABLE "content_modules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ContentModuleType" NOT NULL,
    "description" TEXT,
    "settings" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_module_items" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "linkType" TEXT,
    "linkTarget" TEXT,
    "config" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_module_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_modules_slug_key" ON "content_modules"("slug");
CREATE INDEX "content_modules_type_idx" ON "content_modules"("type");
CREATE INDEX "content_modules_isEnabled_idx" ON "content_modules"("isEnabled");
CREATE INDEX "content_modules_sortOrder_idx" ON "content_modules"("sortOrder");
CREATE INDEX "content_module_items_moduleId_idx" ON "content_module_items"("moduleId");
CREATE INDEX "content_module_items_sortOrder_idx" ON "content_module_items"("sortOrder");

ALTER TABLE "content_module_items"
ADD CONSTRAINT "content_module_items_moduleId_fkey"
FOREIGN KEY ("moduleId") REFERENCES "content_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
