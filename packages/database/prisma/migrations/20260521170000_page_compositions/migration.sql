CREATE TYPE "PageCompositionTargetType" AS ENUM ('HOME', 'PAGE');

CREATE TABLE "page_compositions" (
    "id" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "targetType" "PageCompositionTargetType" NOT NULL,
    "pageId" TEXT,
    "title" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "showHeader" BOOLEAN NOT NULL DEFAULT true,
    "showFooter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_compositions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_composition_items" (
    "id" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_composition_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "page_compositions_targetKey_key" ON "page_compositions"("targetKey");
CREATE INDEX "page_compositions_targetType_idx" ON "page_compositions"("targetType");
CREATE INDEX "page_compositions_pageId_idx" ON "page_compositions"("pageId");
CREATE INDEX "page_compositions_isEnabled_idx" ON "page_compositions"("isEnabled");
CREATE UNIQUE INDEX "page_composition_items_compositionId_moduleId_key" ON "page_composition_items"("compositionId", "moduleId");
CREATE INDEX "page_composition_items_moduleId_idx" ON "page_composition_items"("moduleId");
CREATE INDEX "page_composition_items_sortOrder_idx" ON "page_composition_items"("sortOrder");

ALTER TABLE "page_compositions"
ADD CONSTRAINT "page_compositions_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_composition_items"
ADD CONSTRAINT "page_composition_items_compositionId_fkey"
FOREIGN KEY ("compositionId") REFERENCES "page_compositions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_composition_items"
ADD CONSTRAINT "page_composition_items_moduleId_fkey"
FOREIGN KEY ("moduleId") REFERENCES "content_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
