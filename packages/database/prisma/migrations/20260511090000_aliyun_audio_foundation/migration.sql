-- Aliyun DashScope audio foundation: provider metadata, voice assets, audio assets and audio task state machine.

ALTER TYPE "AiProviderAdapterType" ADD VALUE IF NOT EXISTS 'DASHSCOPE_AUDIO';

CREATE TYPE "AiProviderModality" AS ENUM ('TEXT', 'AUDIO', 'MULTIMODAL');
CREATE TYPE "AudioAssetType" AS ENUM ('SOURCE_SAMPLE', 'PREVIEW', 'TTS_OUTPUT');
CREATE TYPE "AudioTaskType" AS ENUM ('TTS', 'VOICE_CLONE', 'VOICE_DESIGN');
CREATE TYPE "AudioTaskStatus" AS ENUM ('CREATED', 'RESERVED', 'UPLOADING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'COMPENSATED');
CREATE TYPE "VoiceAssetType" AS ENUM ('SYSTEM', 'CLONED', 'DESIGNED');
CREATE TYPE "VoiceAssetStatus" AS ENUM ('DRAFT', 'CREATING', 'PENDING_REVIEW', 'READY', 'FAILED', 'REJECTED', 'DISABLED', 'DELETED');
CREATE TYPE "VoiceAssetVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'ADMIN_ONLY');

ALTER TABLE "ai_provider_presets"
  ADD COLUMN "modality" "AiProviderModality" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "defaultWebSocketUrl" TEXT;

ALTER TABLE "ai_provider_instances"
  ADD COLUMN "webSocketUrl" TEXT,
  ADD COLUMN "region" TEXT;

CREATE TABLE "audio_assets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AudioAssetType" NOT NULL,
  "storageProvider" "MediaStorageProvider" NOT NULL DEFAULT 'LOCAL',
  "url" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "durationMs" INTEGER,
  "sizeBytes" INTEGER NOT NULL,
  "sampleRate" INTEGER,
  "channels" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_assets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerInstanceId" TEXT,
  "provider" TEXT NOT NULL,
  "providerVoiceId" TEXT,
  "name" TEXT NOT NULL,
  "type" "VoiceAssetType" NOT NULL,
  "targetModel" TEXT NOT NULL,
  "status" "VoiceAssetStatus" NOT NULL DEFAULT 'DRAFT',
  "visibility" "VoiceAssetVisibility" NOT NULL DEFAULT 'PRIVATE',
  "language" TEXT,
  "description" TEXT,
  "previewAudioUrl" TEXT,
  "sourceAudioAssetId" TEXT,
  "previewAudioAssetId" TEXT,
  "consentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audio_tasks" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AudioTaskType" NOT NULL,
  "status" "AudioTaskStatus" NOT NULL DEFAULT 'CREATED',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "providerInstanceId" TEXT,
  "modelInstanceId" TEXT,
  "voiceAssetId" TEXT,
  "inputText" TEXT,
  "inputTextLength" INTEGER NOT NULL DEFAULT 0,
  "sourceAudioAssetId" TEXT,
  "outputAudioAssetId" TEXT,
  "estimatedCredits" INTEGER NOT NULL,
  "actualCredits" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "requestId" TEXT,
  "providerPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "audio_tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "credit_reservations"
  ALTER COLUMN "taskId" DROP NOT NULL,
  ADD COLUMN "audioTaskId" TEXT;

ALTER TABLE "ledger_entries"
  ADD COLUMN "relatedAudioTaskId" TEXT;

CREATE INDEX "audio_assets_userId_createdAt_idx" ON "audio_assets"("userId", "createdAt");
CREATE INDEX "audio_assets_type_idx" ON "audio_assets"("type");

CREATE INDEX "voice_assets_userId_createdAt_idx" ON "voice_assets"("userId", "createdAt");
CREATE INDEX "voice_assets_providerInstanceId_idx" ON "voice_assets"("providerInstanceId");
CREATE INDEX "voice_assets_providerVoiceId_idx" ON "voice_assets"("providerVoiceId");
CREATE INDEX "voice_assets_targetModel_idx" ON "voice_assets"("targetModel");
CREATE INDEX "voice_assets_status_idx" ON "voice_assets"("status");

CREATE INDEX "audio_tasks_userId_createdAt_idx" ON "audio_tasks"("userId", "createdAt");
CREATE INDEX "audio_tasks_type_idx" ON "audio_tasks"("type");
CREATE INDEX "audio_tasks_status_idx" ON "audio_tasks"("status");
CREATE INDEX "audio_tasks_providerInstanceId_idx" ON "audio_tasks"("providerInstanceId");
CREATE INDEX "audio_tasks_modelInstanceId_idx" ON "audio_tasks"("modelInstanceId");
CREATE INDEX "audio_tasks_voiceAssetId_idx" ON "audio_tasks"("voiceAssetId");
CREATE INDEX "audio_tasks_sourceAudioAssetId_idx" ON "audio_tasks"("sourceAudioAssetId");
CREATE INDEX "audio_tasks_outputAudioAssetId_idx" ON "audio_tasks"("outputAudioAssetId");

CREATE UNIQUE INDEX "credit_reservations_audioTaskId_key" ON "credit_reservations"("audioTaskId");
CREATE INDEX "credit_reservations_audioTaskId_idx" ON "credit_reservations"("audioTaskId");
CREATE INDEX "ledger_entries_relatedAudioTaskId_idx" ON "ledger_entries"("relatedAudioTaskId");

ALTER TABLE "audio_assets"
  ADD CONSTRAINT "audio_assets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_assets"
  ADD CONSTRAINT "voice_assets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_assets"
  ADD CONSTRAINT "voice_assets_providerInstanceId_fkey"
  FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_assets"
  ADD CONSTRAINT "voice_assets_sourceAudioAssetId_fkey"
  FOREIGN KEY ("sourceAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_assets"
  ADD CONSTRAINT "voice_assets_previewAudioAssetId_fkey"
  FOREIGN KEY ("previewAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_tasks"
  ADD CONSTRAINT "audio_tasks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_tasks"
  ADD CONSTRAINT "audio_tasks_providerInstanceId_fkey"
  FOREIGN KEY ("providerInstanceId") REFERENCES "ai_provider_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_tasks"
  ADD CONSTRAINT "audio_tasks_modelInstanceId_fkey"
  FOREIGN KEY ("modelInstanceId") REFERENCES "ai_model_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_tasks"
  ADD CONSTRAINT "audio_tasks_voiceAssetId_fkey"
  FOREIGN KEY ("voiceAssetId") REFERENCES "voice_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_tasks"
  ADD CONSTRAINT "audio_tasks_sourceAudioAssetId_fkey"
  FOREIGN KEY ("sourceAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_tasks"
  ADD CONSTRAINT "audio_tasks_outputAudioAssetId_fkey"
  FOREIGN KEY ("outputAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_reservations"
  ADD CONSTRAINT "credit_reservations_audioTaskId_fkey"
  FOREIGN KEY ("audioTaskId") REFERENCES "audio_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_relatedAudioTaskId_fkey"
  FOREIGN KEY ("relatedAudioTaskId") REFERENCES "audio_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
