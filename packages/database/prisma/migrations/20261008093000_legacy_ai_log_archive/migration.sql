-- CreateEnum
CREATE TYPE "LegacyAiLogKind" AS ENUM ('CHAT', 'IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "LegacyAiLogStatus" AS ENUM ('WAITING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LegacyAiAssetStatus" AS ENUM ('PENDING', 'AVAILABLE', 'MISSING');

-- CreateTable
CREATE TABLE "legacy_ai_sessions" (
    "id" TEXT NOT NULL,
    "sourceSystem" VARCHAR(64) NOT NULL,
    "sourceTable" VARCHAR(128) NOT NULL,
    "sourcePk" VARCHAR(128) NOT NULL,
    "sourceUserId" VARCHAR(128),
    "sourceMsgId" VARCHAR(128),
    "userId" TEXT,
    "title" TEXT,
    "systemPrompt" TEXT,
    "metadata" JSONB,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_ai_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_ai_logs" (
    "id" TEXT NOT NULL,
    "sourceSystem" VARCHAR(64) NOT NULL,
    "sourceTable" VARCHAR(128) NOT NULL,
    "sourcePk" VARCHAR(128) NOT NULL,
    "sourceMsgId" VARCHAR(128),
    "sourceUserId" VARCHAR(128),
    "sourceTaskId" TEXT,
    "userId" TEXT,
    "kind" "LegacyAiLogKind" NOT NULL,
    "status" "LegacyAiLogStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sourceStatus" TEXT,
    "application" TEXT,
    "providerName" TEXT,
    "modelName" TEXT,
    "versionName" TEXT,
    "voiceName" TEXT,
    "inputPreview" TEXT,
    "outputPreview" TEXT,
    "inputText" TEXT,
    "outputText" TEXT,
    "systemPrompt" TEXT,
    "parameters" JSONB,
    "errorMessage" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "textLength" INTEGER,
    "durationRaw" TEXT,
    "durationUnit" TEXT,
    "usageVerified" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_ai_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_ai_session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "logId" TEXT,
    "position" INTEGER NOT NULL,
    "sourceMsgId" TEXT,
    "sourceVersionId" TEXT,
    "sourceHash" TEXT,

    CONSTRAINT "legacy_ai_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_ai_log_assets" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "mediaType" "MediaAssetType" NOT NULL,
    "status" "LegacyAiAssetStatus" NOT NULL DEFAULT 'PENDING',
    "filename" TEXT,
    "mimeType" TEXT,
    "storageKey" TEXT,
    "sha256" VARCHAR(64),

    CONSTRAINT "legacy_ai_log_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legacy_ai_sessions_userId_idx" ON "legacy_ai_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_ai_sessions_sourceSystem_sourceTable_sourcePk_key" ON "legacy_ai_sessions"("sourceSystem", "sourceTable", "sourcePk");

-- CreateIndex
CREATE INDEX "legacy_ai_logs_requestedAt_id_idx" ON "legacy_ai_logs"("requestedAt", "id");

-- CreateIndex
CREATE INDEX "legacy_ai_logs_kind_requestedAt_id_idx" ON "legacy_ai_logs"("kind", "requestedAt", "id");

-- CreateIndex
CREATE INDEX "legacy_ai_logs_status_requestedAt_idx" ON "legacy_ai_logs"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "legacy_ai_logs_userId_requestedAt_idx" ON "legacy_ai_logs"("userId", "requestedAt");

-- CreateIndex
CREATE INDEX "legacy_ai_logs_sourceUserId_idx" ON "legacy_ai_logs"("sourceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_ai_logs_sourceSystem_sourceTable_sourcePk_key" ON "legacy_ai_logs"("sourceSystem", "sourceTable", "sourcePk");

-- CreateIndex
CREATE INDEX "legacy_ai_session_items_logId_idx" ON "legacy_ai_session_items"("logId");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_ai_session_items_sessionId_position_key" ON "legacy_ai_session_items"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_ai_log_assets_logId_fieldPath_position_key" ON "legacy_ai_log_assets"("logId", "fieldPath", "position");

-- AddForeignKey
ALTER TABLE "legacy_ai_sessions" ADD CONSTRAINT "legacy_ai_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_ai_logs" ADD CONSTRAINT "legacy_ai_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_ai_session_items" ADD CONSTRAINT "legacy_ai_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "legacy_ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_ai_session_items" ADD CONSTRAINT "legacy_ai_session_items_logId_fkey" FOREIGN KEY ("logId") REFERENCES "legacy_ai_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_ai_log_assets" ADD CONSTRAINT "legacy_ai_log_assets_logId_fkey" FOREIGN KEY ("logId") REFERENCES "legacy_ai_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
