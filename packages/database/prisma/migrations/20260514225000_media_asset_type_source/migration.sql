CREATE TYPE "MediaAssetType" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

CREATE TYPE "MediaAssetSource" AS ENUM ('SYSTEM', 'USER_UPLOAD', 'AI_GENERATED', 'WEB_FETCHED');

ALTER TABLE "media_assets"
  ADD COLUMN "mediaType" "MediaAssetType" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "sourceType" "MediaAssetSource" NOT NULL DEFAULT 'USER_UPLOAD';

CREATE INDEX "media_assets_mediaType_idx" ON "media_assets"("mediaType");

CREATE INDEX "media_assets_sourceType_idx" ON "media_assets"("sourceType");
