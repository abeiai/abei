-- Audio billing rules, ledger task metadata, and audio usage logs.

CREATE TYPE "AudioBillingMode" AS ENUM ('PER_CHARACTER', 'PER_TASK', 'PER_SECOND');

ALTER TABLE "ledger_entries"
  ADD COLUMN "relatedTaskType" TEXT,
  ADD COLUMN "operationType" "AudioTaskType";

CREATE TABLE "audio_pricing_rules" (
  "id" TEXT NOT NULL,
  "operationType" "AudioTaskType" NOT NULL,
  "model" TEXT NOT NULL DEFAULT '*',
  "billingMode" "AudioBillingMode" NOT NULL,
  "creditsPerUnit" DECIMAL(10, 4) NOT NULL,
  "minimumCredits" INTEGER NOT NULL DEFAULT 0,
  "modelMultiplier" DECIMAL(8, 4) NOT NULL DEFAULT 1,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audio_pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audio_usage_logs" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "providerInstanceId" TEXT,
  "modelInstanceId" TEXT,
  "voiceAssetId" TEXT,
  "operationType" "AudioTaskType" NOT NULL,
  "characterCount" INTEGER NOT NULL DEFAULT 0,
  "audioDurationMs" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 1,
  "latencyMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "estimatedCost" DECIMAL(12, 4) NOT NULL DEFAULT 0,
  "consumedCredits" INTEGER NOT NULL DEFAULT 0,
  "providerRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audio_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audio_pricing_rules_operationType_model_key"
  ON "audio_pricing_rules"("operationType", "model");
CREATE INDEX "audio_pricing_rules_operationType_isEnabled_idx"
  ON "audio_pricing_rules"("operationType", "isEnabled");
CREATE INDEX "audio_pricing_rules_model_idx"
  ON "audio_pricing_rules"("model");

CREATE UNIQUE INDEX "audio_usage_logs_taskId_key" ON "audio_usage_logs"("taskId");
CREATE INDEX "audio_usage_logs_userId_createdAt_idx" ON "audio_usage_logs"("userId", "createdAt");
CREATE INDEX "audio_usage_logs_operationType_idx" ON "audio_usage_logs"("operationType");
CREATE INDEX "audio_usage_logs_providerInstanceId_idx" ON "audio_usage_logs"("providerInstanceId");
CREATE INDEX "audio_usage_logs_modelInstanceId_idx" ON "audio_usage_logs"("modelInstanceId");
CREATE INDEX "audio_usage_logs_voiceAssetId_idx" ON "audio_usage_logs"("voiceAssetId");
CREATE INDEX "audio_usage_logs_success_idx" ON "audio_usage_logs"("success");
CREATE INDEX "audio_usage_logs_createdAt_idx" ON "audio_usage_logs"("createdAt");

CREATE INDEX "ledger_entries_relatedTaskType_idx" ON "ledger_entries"("relatedTaskType");
CREATE INDEX "ledger_entries_operationType_idx" ON "ledger_entries"("operationType");

ALTER TABLE "audio_usage_logs"
  ADD CONSTRAINT "audio_usage_logs_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "audio_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_usage_logs"
  ADD CONSTRAINT "audio_usage_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_usage_logs"
  ADD CONSTRAINT "audio_usage_logs_providerInstanceId_fkey"
  FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_usage_logs"
  ADD CONSTRAINT "audio_usage_logs_modelInstanceId_fkey"
  FOREIGN KEY ("modelInstanceId") REFERENCES "ai_model_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_usage_logs"
  ADD CONSTRAINT "audio_usage_logs_voiceAssetId_fkey"
  FOREIGN KEY ("voiceAssetId") REFERENCES "voice_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
