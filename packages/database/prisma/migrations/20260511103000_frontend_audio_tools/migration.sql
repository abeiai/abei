-- Frontend audio tools: voice clone consent records and per-user default voice preference.

CREATE TABLE "voice_consents" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceAudioAssetId" TEXT,
  "statement" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_audio_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "defaultVoiceAssetId" TEXT,
  "defaultSystemVoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_audio_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_assets_consentId_idx" ON "voice_assets"("consentId");
CREATE INDEX "voice_consents_userId_createdAt_idx" ON "voice_consents"("userId", "createdAt");
CREATE INDEX "voice_consents_sourceAudioAssetId_idx" ON "voice_consents"("sourceAudioAssetId");
CREATE UNIQUE INDEX "user_audio_preferences_userId_key" ON "user_audio_preferences"("userId");
CREATE INDEX "user_audio_preferences_defaultVoiceAssetId_idx" ON "user_audio_preferences"("defaultVoiceAssetId");

ALTER TABLE "voice_consents"
  ADD CONSTRAINT "voice_consents_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_consents"
  ADD CONSTRAINT "voice_consents_sourceAudioAssetId_fkey"
  FOREIGN KEY ("sourceAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_assets"
  ADD CONSTRAINT "voice_assets_consentId_fkey"
  FOREIGN KEY ("consentId") REFERENCES "voice_consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_audio_preferences"
  ADD CONSTRAINT "user_audio_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_audio_preferences"
  ADD CONSTRAINT "user_audio_preferences_defaultVoiceAssetId_fkey"
  FOREIGN KEY ("defaultVoiceAssetId") REFERENCES "voice_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
