ALTER TABLE "voice_assets" ADD COLUMN "isPlatform" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "voice_assets_isPlatform_type_status_idx" ON "voice_assets"("isPlatform", "type", "status");
