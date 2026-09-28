CREATE TYPE "TextbookMarkdownConversionStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "learning_material_textbooks"
  ADD COLUMN "markdownContent" TEXT,
  ADD COLUMN "markdownAssetsPath" TEXT,
  ADD COLUMN "markdownAssetBaseUrl" TEXT,
  ADD COLUMN "markdownConvertedAt" TIMESTAMP(3),
  ADD COLUMN "markdownPageCount" INTEGER,
  ADD COLUMN "markdownConversionStatus" "TextbookMarkdownConversionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "markdownConversionError" TEXT;
