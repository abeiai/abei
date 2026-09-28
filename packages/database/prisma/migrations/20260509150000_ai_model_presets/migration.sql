CREATE TYPE "AiProviderAdapterType" AS ENUM ('OPENAI_COMPATIBLE', 'ANTHROPIC', 'GEMINI', 'CUSTOM_OPENAI_COMPATIBLE');
CREATE TYPE "AiProviderInstanceStatus" AS ENUM ('DISABLED', 'ENABLED', 'TEST_FAILED');

ALTER TABLE "ai_scenarios"
ADD COLUMN "requiredCapabilities" JSONB;

CREATE TABLE "ai_provider_presets" (
  "id" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "adapterType" "AiProviderAdapterType" NOT NULL,
  "defaultBaseUrl" TEXT NOT NULL,
  "apiKeyEnvName" TEXT NOT NULL,
  "docsUrl" TEXT,
  "region" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT true,
  "isEnabledByDefault" BOOLEAN NOT NULL DEFAULT false,
  "presetVersion" TEXT NOT NULL,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_provider_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_model_presets" (
  "id" TEXT NOT NULL,
  "providerPresetId" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "providerModelName" TEXT NOT NULL,
  "capabilityTags" JSONB NOT NULL,
  "contextWindow" INTEGER,
  "supportsStreaming" BOOLEAN NOT NULL DEFAULT false,
  "supportsVision" BOOLEAN NOT NULL DEFAULT false,
  "supportsTools" BOOLEAN NOT NULL DEFAULT false,
  "supportsEmbedding" BOOLEAN NOT NULL DEFAULT false,
  "supportsImageGeneration" BOOLEAN NOT NULL DEFAULT false,
  "supportsAudio" BOOLEAN NOT NULL DEFAULT false,
  "isDeprecated" BOOLEAN NOT NULL DEFAULT false,
  "deprecatedMessage" TEXT,
  "replacementModelKey" TEXT,
  "recommendedAlias" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_model_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_provider_instances" (
  "id" TEXT NOT NULL,
  "providerPresetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "status" "AiProviderInstanceStatus" NOT NULL DEFAULT 'DISABLED',
  "lastTestedAt" TIMESTAMP(3),
  "lastTestResult" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_provider_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_provider_credentials" (
  "id" TEXT NOT NULL,
  "providerInstanceId" TEXT NOT NULL,
  "apiKeyEncrypted" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_model_instances" (
  "id" TEXT NOT NULL,
  "providerInstanceId" TEXT NOT NULL,
  "modelPresetId" TEXT,
  "displayName" TEXT NOT NULL,
  "providerModelName" TEXT NOT NULL,
  "capabilityTags" JSONB NOT NULL,
  "inputPrice" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "outputPrice" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_model_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_model_aliases" (
  "id" TEXT NOT NULL,
  "aliasKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "modelInstanceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_model_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_scenario_model_bindings" (
  "id" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "defaultModelAlias" TEXT NOT NULL,
  "fallbackModelAlias" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_scenario_model_bindings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_tasks"
ADD COLUMN "aiProviderInstanceId" TEXT,
ADD COLUMN "aiModelInstanceId" TEXT;

ALTER TABLE "ai_call_logs"
ADD COLUMN "providerInstanceId" TEXT,
ADD COLUMN "modelInstanceId" TEXT;

CREATE UNIQUE INDEX "ai_provider_presets_providerKey_key" ON "ai_provider_presets"("providerKey");
CREATE INDEX "ai_provider_presets_adapterType_idx" ON "ai_provider_presets"("adapterType");
CREATE INDEX "ai_provider_presets_isBuiltIn_idx" ON "ai_provider_presets"("isBuiltIn");

CREATE UNIQUE INDEX "ai_model_presets_providerPresetId_modelKey_key" ON "ai_model_presets"("providerPresetId", "modelKey");
CREATE INDEX "ai_model_presets_providerPresetId_idx" ON "ai_model_presets"("providerPresetId");
CREATE INDEX "ai_model_presets_isDeprecated_idx" ON "ai_model_presets"("isDeprecated");

CREATE INDEX "ai_provider_instances_providerPresetId_idx" ON "ai_provider_instances"("providerPresetId");
CREATE INDEX "ai_provider_instances_status_idx" ON "ai_provider_instances"("status");

CREATE UNIQUE INDEX "ai_provider_credentials_providerInstanceId_key" ON "ai_provider_credentials"("providerInstanceId");

CREATE UNIQUE INDEX "ai_model_instances_providerInstanceId_providerModelName_key" ON "ai_model_instances"("providerInstanceId", "providerModelName");
CREATE INDEX "ai_model_instances_providerInstanceId_idx" ON "ai_model_instances"("providerInstanceId");
CREATE INDEX "ai_model_instances_modelPresetId_idx" ON "ai_model_instances"("modelPresetId");
CREATE INDEX "ai_model_instances_isEnabled_idx" ON "ai_model_instances"("isEnabled");

CREATE UNIQUE INDEX "ai_model_aliases_aliasKey_key" ON "ai_model_aliases"("aliasKey");
CREATE INDEX "ai_model_aliases_modelInstanceId_idx" ON "ai_model_aliases"("modelInstanceId");

CREATE UNIQUE INDEX "ai_scenario_model_bindings_scenarioId_key" ON "ai_scenario_model_bindings"("scenarioId");
CREATE INDEX "ai_scenario_model_bindings_defaultModelAlias_idx" ON "ai_scenario_model_bindings"("defaultModelAlias");
CREATE INDEX "ai_scenario_model_bindings_fallbackModelAlias_idx" ON "ai_scenario_model_bindings"("fallbackModelAlias");

CREATE INDEX "ai_tasks_aiProviderInstanceId_idx" ON "ai_tasks"("aiProviderInstanceId");
CREATE INDEX "ai_tasks_aiModelInstanceId_idx" ON "ai_tasks"("aiModelInstanceId");
CREATE INDEX "ai_call_logs_providerInstanceId_idx" ON "ai_call_logs"("providerInstanceId");
CREATE INDEX "ai_call_logs_modelInstanceId_idx" ON "ai_call_logs"("modelInstanceId");

ALTER TABLE "ai_model_presets" ADD CONSTRAINT "ai_model_presets_providerPresetId_fkey" FOREIGN KEY ("providerPresetId") REFERENCES "ai_provider_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_instances" ADD CONSTRAINT "ai_provider_instances_providerPresetId_fkey" FOREIGN KEY ("providerPresetId") REFERENCES "ai_provider_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_providerInstanceId_fkey" FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_model_instances" ADD CONSTRAINT "ai_model_instances_providerInstanceId_fkey" FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_model_instances" ADD CONSTRAINT "ai_model_instances_modelPresetId_fkey" FOREIGN KEY ("modelPresetId") REFERENCES "ai_model_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_model_aliases" ADD CONSTRAINT "ai_model_aliases_modelInstanceId_fkey" FOREIGN KEY ("modelInstanceId") REFERENCES "ai_model_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_scenario_model_bindings" ADD CONSTRAINT "ai_scenario_model_bindings_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ai_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_aiProviderInstanceId_fkey" FOREIGN KEY ("aiProviderInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_aiModelInstanceId_fkey" FOREIGN KEY ("aiModelInstanceId") REFERENCES "ai_model_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_providerInstanceId_fkey" FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_modelInstanceId_fkey" FOREIGN KEY ("modelInstanceId") REFERENCES "ai_model_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
