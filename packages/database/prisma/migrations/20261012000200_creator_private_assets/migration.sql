CREATE TABLE "creator_assets" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "externalId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL, "kind" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "sha256" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UPLOADING', "offset" INTEGER NOT NULL DEFAULT 0,
  "capabilityHash" TEXT, "capabilityExpiresAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creator_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creator_assets_bounds" CHECK ("size" > 0 AND "offset" >= 0 AND "offset" <= "size")
);
CREATE UNIQUE INDEX "creator_assets_userId_externalId_key" ON "creator_assets"("userId", "externalId");
CREATE INDEX "creator_assets_userId_status_idx" ON "creator_assets"("userId", "status");
