-- Voice safety consent details, moderation metadata, and review ownership.

CREATE TYPE "VoiceConsentType" AS ENUM ('SELF_VOICE', 'AUTHORIZED_VOICE');

ALTER TABLE "voice_assets"
  ADD COLUMN "reviewedByAdminId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "disabledReason" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "voice_consents"
  ADD COLUMN "voiceAssetId" TEXT,
  ADD COLUMN "consentText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "consentType" "VoiceConsentType" NOT NULL DEFAULT 'SELF_VOICE',
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "ownerContact" TEXT,
  ADD COLUMN "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "voice_consents"
SET "consentText" = "statement"
WHERE "consentText" = '';

CREATE UNIQUE INDEX "voice_consents_voiceAssetId_key" ON "voice_consents"("voiceAssetId");
CREATE INDEX "voice_assets_reviewedByAdminId_idx" ON "voice_assets"("reviewedByAdminId");
CREATE INDEX "voice_consents_voiceAssetId_idx" ON "voice_consents"("voiceAssetId");

ALTER TABLE "voice_assets"
  ADD CONSTRAINT "voice_assets_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_consents"
  ADD CONSTRAINT "voice_consents_voiceAssetId_fkey"
  FOREIGN KEY ("voiceAssetId") REFERENCES "voice_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
