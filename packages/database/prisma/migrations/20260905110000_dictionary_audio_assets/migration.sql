CREATE TABLE "dictionary_audio_assets" (
  "id" TEXT NOT NULL,
  "dictionary_entry_id" TEXT NOT NULL,
  "variant" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "accent" TEXT NOT NULL,
  "gender" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "voice" TEXT NOT NULL,
  "asset_version" TEXT NOT NULL DEFAULT 'v1',
  "storage_provider" "MediaStorageProvider" NOT NULL DEFAULT 'S3',
  "object_key" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'audio/mpeg',
  "size_bytes" INTEGER NOT NULL,
  "duration_ms" INTEGER,
  "sample_rate" INTEGER,
  "channels" INTEGER,
  "sha256" TEXT NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dictionary_audio_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dictionary_audio_assets_dictionary_entry_id_fkey"
    FOREIGN KEY ("dictionary_entry_id") REFERENCES "dictionary_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "dictionary_audio_assets_dictionary_entry_id_variant_key"
ON "dictionary_audio_assets"("dictionary_entry_id", "variant");

CREATE UNIQUE INDEX "dictionary_audio_assets_object_key_key"
ON "dictionary_audio_assets"("object_key");

CREATE INDEX "dictionary_audio_assets_variant_idx"
ON "dictionary_audio_assets"("variant");

CREATE INDEX "dictionary_audio_assets_provider_model_idx"
ON "dictionary_audio_assets"("provider", "model");

CREATE INDEX "dictionary_audio_assets_asset_version_idx"
ON "dictionary_audio_assets"("asset_version");
