-- CreateTable
CREATE TABLE "ai_tool_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tool_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ai_scenarios"
ADD COLUMN "toolCategoryId" TEXT,
ADD COLUMN "inputSchema" JSONB,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "templateVersion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ai_tool_categories_slug_key" ON "ai_tool_categories"("slug");

-- CreateIndex
CREATE INDEX "ai_tool_categories_isVisible_idx" ON "ai_tool_categories"("isVisible");

-- CreateIndex
CREATE INDEX "ai_tool_categories_sortOrder_idx" ON "ai_tool_categories"("sortOrder");

-- CreateIndex
CREATE INDEX "ai_scenarios_toolCategoryId_idx" ON "ai_scenarios"("toolCategoryId");

-- CreateIndex
CREATE INDEX "ai_scenarios_sortOrder_idx" ON "ai_scenarios"("sortOrder");

-- AddForeignKey
ALTER TABLE "ai_scenarios" ADD CONSTRAINT "ai_scenarios_toolCategoryId_fkey" FOREIGN KEY ("toolCategoryId") REFERENCES "ai_tool_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
