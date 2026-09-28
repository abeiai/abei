-- AI usage monitoring, estimated cost statistics, alerts, and task content masking.

ALTER TABLE "ai_tasks"
  ADD COLUMN "inputPreview" TEXT,
  ADD COLUMN "outputPreview" TEXT,
  ADD COLUMN "inputHash" TEXT,
  ADD COLUMN "outputHash" TEXT,
  ADD COLUMN "saveFullContent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ai_usage_daily_stats" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "dimensionKey" TEXT NOT NULL,
  "providerId" TEXT,
  "modelId" TEXT,
  "providerInstanceId" TEXT,
  "modelInstanceId" TEXT,
  "scenarioId" TEXT,
  "toolId" TEXT,
  "userId" TEXT,
  "providerName" TEXT,
  "modelName" TEXT,
  "scenarioName" TEXT,
  "toolName" TEXT,
  "userEmail" TEXT,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "consumedCredits" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(12, 4) NOT NULL DEFAULT 0,
  "avgLatencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_usage_daily_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_alerts" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "fingerprint" TEXT NOT NULL,
  "relatedResourceType" TEXT,
  "relatedResourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByAdminId" TEXT,

  CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_usage_daily_stats_dimensionKey_key" ON "ai_usage_daily_stats"("dimensionKey");
CREATE INDEX "ai_usage_daily_stats_date_idx" ON "ai_usage_daily_stats"("date");
CREATE INDEX "ai_usage_daily_stats_providerId_idx" ON "ai_usage_daily_stats"("providerId");
CREATE INDEX "ai_usage_daily_stats_modelId_idx" ON "ai_usage_daily_stats"("modelId");
CREATE INDEX "ai_usage_daily_stats_providerInstanceId_idx" ON "ai_usage_daily_stats"("providerInstanceId");
CREATE INDEX "ai_usage_daily_stats_modelInstanceId_idx" ON "ai_usage_daily_stats"("modelInstanceId");
CREATE INDEX "ai_usage_daily_stats_scenarioId_idx" ON "ai_usage_daily_stats"("scenarioId");
CREATE INDEX "ai_usage_daily_stats_toolId_idx" ON "ai_usage_daily_stats"("toolId");
CREATE INDEX "ai_usage_daily_stats_userId_idx" ON "ai_usage_daily_stats"("userId");

CREATE UNIQUE INDEX "system_alerts_fingerprint_key" ON "system_alerts"("fingerprint");
CREATE INDEX "system_alerts_status_createdAt_idx" ON "system_alerts"("status", "createdAt");
CREATE INDEX "system_alerts_type_idx" ON "system_alerts"("type");
CREATE INDEX "system_alerts_level_idx" ON "system_alerts"("level");

ALTER TABLE "ai_usage_daily_stats"
  ADD CONSTRAINT "ai_usage_daily_stats_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_usage_daily_stats"
  ADD CONSTRAINT "ai_usage_daily_stats_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "ai_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_usage_daily_stats"
  ADD CONSTRAINT "ai_usage_daily_stats_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_usage_daily_stats"
  ADD CONSTRAINT "ai_usage_daily_stats_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_usage_daily_stats"
  ADD CONSTRAINT "ai_usage_daily_stats_providerInstanceId_fkey"
  FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_usage_daily_stats"
  ADD CONSTRAINT "ai_usage_daily_stats_modelInstanceId_fkey"
  FOREIGN KEY ("modelInstanceId") REFERENCES "ai_model_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "system_alerts"
  ADD CONSTRAINT "system_alerts_resolvedByAdminId_fkey"
  FOREIGN KEY ("resolvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
