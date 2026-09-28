ALTER TABLE "video_guide_assets"
ADD COLUMN "asrObjectKey" TEXT,
ADD COLUMN "asrMimeType" TEXT,
ADD COLUMN "asrSizeBytes" INTEGER,
ADD COLUMN "asrPreparedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "video_guide_assets_asrObjectKey_key"
ON "video_guide_assets"("asrObjectKey");
