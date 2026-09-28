-- Add optional phone authentication fields to users.
ALTER TABLE "users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- Store short-lived SMS verification codes for phone login and binding.
CREATE TYPE "SmsCodePurpose" AS ENUM ('LOGIN', 'BIND_PHONE');

CREATE TABLE "sms_verification_codes" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "purpose" "SmsCodePurpose" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "sendProvider" TEXT,
  "sendRequestId" TEXT,
  "sendStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_verification_codes_phone_purpose_createdAt_idx"
  ON "sms_verification_codes"("phone", "purpose", "createdAt");

CREATE INDEX "sms_verification_codes_expiresAt_idx"
  ON "sms_verification_codes"("expiresAt");
