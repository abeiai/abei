-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('OPENAI_COMPATIBLE');

-- AlterTable
ALTER TABLE "ai_tasks" ADD COLUMN     "aiModelId" TEXT,
ADD COLUMN     "aiProviderId" TEXT,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "providerName" TEXT,
ADD COLUMN     "totalTokens" INTEGER;

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AiProviderType" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
    "baseUrl" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiKeyPreview" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "supportsStreaming" BOOLEAN NOT NULL DEFAULT false,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "inputPrice" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "outputPrice" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "providerId" TEXT,
    "modelId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_providers_isEnabled_idx" ON "ai_providers"("isEnabled");

-- CreateIndex
CREATE INDEX "ai_models_providerId_idx" ON "ai_models"("providerId");

-- CreateIndex
CREATE INDEX "ai_models_isEnabled_idx" ON "ai_models"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_providerId_modelName_key" ON "ai_models"("providerId", "modelName");

-- CreateIndex
CREATE INDEX "ai_call_logs_taskId_idx" ON "ai_call_logs"("taskId");

-- CreateIndex
CREATE INDEX "ai_call_logs_providerId_idx" ON "ai_call_logs"("providerId");

-- CreateIndex
CREATE INDEX "ai_call_logs_modelId_idx" ON "ai_call_logs"("modelId");

-- CreateIndex
CREATE INDEX "ai_call_logs_success_idx" ON "ai_call_logs"("success");

-- CreateIndex
CREATE INDEX "ai_call_logs_createdAt_idx" ON "ai_call_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_tasks_aiProviderId_idx" ON "ai_tasks"("aiProviderId");

-- CreateIndex
CREATE INDEX "ai_tasks_aiModelId_idx" ON "ai_tasks"("aiModelId");

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
