CREATE TABLE "audio_dialogue_projects" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "learnerId" TEXT, "scenarioId" TEXT,
  "title" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "input" JSONB NOT NULL, "clips" JSONB NOT NULL DEFAULT '{}',
  "actualCredits" INTEGER NOT NULL DEFAULT 0, "outputAudioAssetId" TEXT, "outputRevision" INTEGER,
  "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audio_dialogue_projects_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "audio_dialogue_generations" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUOTED', "input" JSONB NOT NULL, "plans" JSONB NOT NULL,
  "fingerprint" TEXT NOT NULL, "estimatedCredits" INTEGER NOT NULL, "actualCredits" INTEGER,
  "billingAudioTaskId" TEXT, "leaseOwner" TEXT, "leaseUntil" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL,
  "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audio_dialogue_generations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "audio_tasks" ADD COLUMN "audioDialogueGenerationId" TEXT;
CREATE INDEX "audio_dialogue_projects_userId_learnerId_createdAt_idx" ON "audio_dialogue_projects"("userId", "learnerId", "createdAt");
CREATE UNIQUE INDEX "audio_dialogue_generations_billingAudioTaskId_key" ON "audio_dialogue_generations"("billingAudioTaskId");
CREATE INDEX "audio_dialogue_generations_projectId_createdAt_idx" ON "audio_dialogue_generations"("projectId", "createdAt");
CREATE INDEX "audio_dialogue_generations_status_leaseUntil_idx" ON "audio_dialogue_generations"("status", "leaseUntil");
CREATE INDEX "audio_tasks_audioDialogueGenerationId_idx" ON "audio_tasks"("audioDialogueGenerationId");
ALTER TABLE "audio_dialogue_projects" ADD CONSTRAINT "audio_dialogue_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audio_dialogue_projects" ADD CONSTRAINT "audio_dialogue_projects_outputAudioAssetId_fkey" FOREIGN KEY ("outputAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audio_dialogue_generations" ADD CONSTRAINT "audio_dialogue_generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "audio_dialogue_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audio_dialogue_generations" ADD CONSTRAINT "audio_dialogue_generations_billingAudioTaskId_fkey" FOREIGN KEY ("billingAudioTaskId") REFERENCES "audio_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audio_tasks" ADD CONSTRAINT "audio_tasks_audioDialogueGenerationId_fkey" FOREIGN KEY ("audioDialogueGenerationId") REFERENCES "audio_dialogue_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
