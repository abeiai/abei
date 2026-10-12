-- CreateTable
CREATE TABLE "CreatorClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorAuthRequest" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "scopes" TEXT[],
    "redirectUri" TEXT,
    "state" TEXT,
    "challenge" TEXT,
    "codeHash" TEXT,
    "userCodeHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "grantId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextPollAt" TIMESTAMP(3),
    "pollInterval" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "scopes" TEXT[],
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorToken" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorRateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorRateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAuthRequest_codeHash_key" ON "CreatorAuthRequest"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAuthRequest_userCodeHash_key" ON "CreatorAuthRequest"("userCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAuthRequest_grantId_key" ON "CreatorAuthRequest"("grantId");

-- CreateIndex
CREATE INDEX "CreatorAuthRequest_expiresAt_idx" ON "CreatorAuthRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "CreatorGrant_userId_revokedAt_idx" ON "CreatorGrant"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorToken_hash_key" ON "CreatorToken"("hash");

-- CreateIndex
CREATE INDEX "CreatorToken_grantId_idx" ON "CreatorToken"("grantId");

-- CreateIndex
CREATE INDEX "CreatorToken_expiresAt_idx" ON "CreatorToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CreatorRateBucket_expiresAt_idx" ON "CreatorRateBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "CreatorAuthRequest" ADD CONSTRAINT "CreatorAuthRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CreatorClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorAuthRequest" ADD CONSTRAINT "CreatorAuthRequest_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CreatorGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorGrant" ADD CONSTRAINT "CreatorGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorGrant" ADD CONSTRAINT "CreatorGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CreatorClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorToken" ADD CONSTRAINT "CreatorToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CreatorGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
