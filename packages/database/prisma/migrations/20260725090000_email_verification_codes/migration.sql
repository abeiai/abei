CREATE TYPE "EmailCodePurpose" AS ENUM ('REGISTER', 'RESET_PASSWORD');

CREATE TABLE "email_verification_codes" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" "EmailCodePurpose" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "sendProvider" TEXT,
  "sendRequestId" TEXT,
  "sendStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_codes_email_purpose_createdAt_idx"
  ON "email_verification_codes"("email", "purpose", "createdAt");

CREATE INDEX "email_verification_codes_expiresAt_idx"
  ON "email_verification_codes"("expiresAt");
