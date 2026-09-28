-- Deduplicated storage records and user references for video guide uploaded assets.

CREATE TYPE "VideoGuideAssetType" AS ENUM ('MEDIA', 'SUBTITLE');
CREATE TYPE "VideoGuideAssetRefSource" AS ENUM ('UPLOAD', 'GENERATED');

CREATE TABLE "video_guide_assets" (
  "id" TEXT NOT NULL,
  "assetType" "VideoGuideAssetType" NOT NULL,
  "hash" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "mediaType" "VideoGuideMediaType",
  "subtitleFormat" "VideoGuideSubtitleFormat",
  "storageProvider" "MediaStorageProvider" NOT NULL DEFAULT 'LOCAL',
  "objectKey" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "refCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReferencedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_guide_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_guide_asset_refs" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "source" "VideoGuideAssetRefSource" NOT NULL DEFAULT 'UPLOAD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "video_guide_asset_refs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_guide_assets_objectKey_key" ON "video_guide_assets"("objectKey");
CREATE UNIQUE INDEX "video_guide_assets_assetType_hash_sizeBytes_key" ON "video_guide_assets"("assetType", "hash", "sizeBytes");
CREATE INDEX "video_guide_assets_assetType_createdAt_idx" ON "video_guide_assets"("assetType", "createdAt");
CREATE INDEX "video_guide_assets_hash_idx" ON "video_guide_assets"("hash");
CREATE INDEX "video_guide_asset_refs_assetId_deletedAt_idx" ON "video_guide_asset_refs"("assetId", "deletedAt");
CREATE INDEX "video_guide_asset_refs_deletedAt_idx" ON "video_guide_asset_refs"("deletedAt");
CREATE INDEX "video_guide_asset_refs_userId_createdAt_idx" ON "video_guide_asset_refs"("userId", "createdAt");

ALTER TABLE "video_guide_asset_refs"
  ADD CONSTRAINT "video_guide_asset_refs_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "video_guide_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_guide_asset_refs"
  ADD CONSTRAINT "video_guide_asset_refs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
