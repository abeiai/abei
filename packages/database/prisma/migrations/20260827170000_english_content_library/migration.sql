BEGIN;

CREATE TYPE "EnglishContentLibraryType" AS ENUM ('WORDLIST', 'ARTICLE');
CREATE TYPE "EnglishContentItemType" AS ENUM ('WORD', 'PHRASE', 'SENTENCE', 'PARAGRAPH');
CREATE TYPE "EnglishContentItemReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'NEEDS_REVIEW');
CREATE TYPE "EnglishContentMediaKind" AS ENUM ('ILLUSTRATION', 'BRITISH_PRONUNCIATION');
CREATE TYPE "EnglishContentMediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "english_content_libraries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "libraryType" "EnglishContentLibraryType" NOT NULL DEFAULT 'WORDLIST',
    "language" TEXT NOT NULL DEFAULT 'en-GB',
    "description" TEXT,
    "sourceTextbookId" TEXT,
    "sourceHash" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "english_content_libraries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "english_content_units" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourcePageStart" INTEGER,
    "sourcePageEnd" INTEGER,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "mediaStatus" "EnglishContentMediaStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "english_content_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "english_content_items" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "itemType" "EnglishContentItemType" NOT NULL,
    "translation" TEXT,
    "britishPhonetic" TEXT,
    "partOfSpeech" TEXT,
    "isSpellingRequired" BOOLEAN NOT NULL DEFAULT true,
    "sourceOrder" INTEGER NOT NULL,
    "sourcePage" INTEGER,
    "sourceRaw" TEXT,
    "reviewStatus" "EnglishContentItemReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "english_content_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "english_content_accepted_answers" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "normalizedAnswer" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "english_content_accepted_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "english_content_media" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "EnglishContentMediaKind" NOT NULL,
    "status" "EnglishContentMediaStatus" NOT NULL DEFAULT 'PENDING',
    "mediaAssetId" TEXT,
    "generatorProvider" TEXT,
    "generatorModel" TEXT,
    "voice" TEXT,
    "prompt" TEXT,
    "inputHash" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "english_content_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_content_libraries_slug_key" ON "english_content_libraries"("slug");
CREATE INDEX "english_content_libraries_libraryType_status_sortOrder_idx" ON "english_content_libraries"("libraryType", "status", "sortOrder");
CREATE INDEX "english_content_libraries_sourceTextbookId_idx" ON "english_content_libraries"("sourceTextbookId");
CREATE UNIQUE INDEX "english_content_units_libraryId_code_key" ON "english_content_units"("libraryId", "code");
CREATE INDEX "english_content_units_libraryId_sortOrder_idx" ON "english_content_units"("libraryId", "sortOrder");
CREATE INDEX "english_content_units_status_mediaStatus_idx" ON "english_content_units"("status", "mediaStatus");
CREATE UNIQUE INDEX "english_content_items_unitId_sourceOrder_key" ON "english_content_items"("unitId", "sourceOrder");
CREATE INDEX "english_content_items_unitId_normalizedText_idx" ON "english_content_items"("unitId", "normalizedText");
CREATE INDEX "english_content_items_dictionaryEntryId_idx" ON "english_content_items"("dictionaryEntryId");
CREATE INDEX "english_content_items_reviewStatus_idx" ON "english_content_items"("reviewStatus");
CREATE UNIQUE INDEX "english_content_accepted_answers_itemId_normalizedAnswer_key" ON "english_content_accepted_answers"("itemId", "normalizedAnswer");
CREATE INDEX "english_content_accepted_answers_itemId_sortOrder_idx" ON "english_content_accepted_answers"("itemId", "sortOrder");
CREATE UNIQUE INDEX "english_content_media_itemId_kind_key" ON "english_content_media"("itemId", "kind");
CREATE INDEX "english_content_media_status_kind_idx" ON "english_content_media"("status", "kind");
CREATE INDEX "english_content_media_mediaAssetId_idx" ON "english_content_media"("mediaAssetId");

ALTER TABLE "english_content_libraries" ADD CONSTRAINT "english_content_libraries_sourceTextbookId_fkey" FOREIGN KEY ("sourceTextbookId") REFERENCES "learning_material_textbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "english_content_units" ADD CONSTRAINT "english_content_units_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "english_content_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "english_content_items" ADD CONSTRAINT "english_content_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "english_content_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "english_content_items" ADD CONSTRAINT "english_content_items_dictionaryEntryId_fkey" FOREIGN KEY ("dictionaryEntryId") REFERENCES "dictionary_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "english_content_accepted_answers" ADD CONSTRAINT "english_content_accepted_answers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "english_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "english_content_media" ADD CONSTRAINT "english_content_media_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "english_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "english_content_media" ADD CONSTRAINT "english_content_media_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
