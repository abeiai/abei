ALTER TYPE "LearnerActivityEventType" ADD VALUE 'MATERIAL_STARTED';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'MEDIA_PROGRESS';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'NODE_LEARNED';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'PRACTICE_SUBMITTED';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'READ_ALONG_COMPLETED';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'FLASHCARD_REVIEWED';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'PART_COMPLETED';
ALTER TYPE "LearnerActivityEventType" ADD VALUE 'MATERIAL_COMPLETED';

CREATE TYPE "LearnerLearningStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "LearnerLearningSignal" AS ENUM ('INTERACTION', 'MEDIA_PLAYING', 'PRACTICE', 'READ_ALONG', 'FLASHCARD');
CREATE TYPE "LearnerLearningSessionEndReason" AS ENUM ('LEFT', 'PROFILE_SWITCHED', 'SIGNED_OUT', 'TIMED_OUT', 'AUTHORIZATION_REVOKED');
CREATE TYPE "LearnerLearningSummaryScope" AS ENUM ('TOTAL', 'SCENARIO', 'COURSE', 'RESOURCE', 'MATERIAL', 'PART');

ALTER TABLE "learner_activity_events"
  ADD COLUMN "courseRevisionId" TEXT,
  ADD COLUMN "courseRevisionItemId" TEXT,
  ADD COLUMN "materialType" "CourseMaterialType",
  ADD COLUMN "materialId" TEXT,
  ADD COLUMN "contentVersion" TEXT,
  ADD COLUMN "partKey" TEXT,
  ADD COLUMN "itemKey" TEXT;

CREATE TABLE "learner_learning_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "learnerId" TEXT NOT NULL,
  "profileSessionId" TEXT NOT NULL,
  "clientSessionKey" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endReason" "LearnerLearningSessionEndReason",
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learner_learning_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learner_learning_time_slices" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "learnerId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "bucketStartedAt" TIMESTAMP(3) NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "isLearning" BOOLEAN NOT NULL,
  "activitySignal" "LearnerLearningSignal" NOT NULL,
  "scenarioId" TEXT,
  "courseId" TEXT,
  "courseRevisionId" TEXT,
  "courseRevisionItemId" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "materialType" "CourseMaterialType",
  "materialId" TEXT,
  "contentVersion" TEXT,
  "partKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learner_learning_time_slices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learner_material_progress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "learnerId" TEXT NOT NULL,
  "materialType" "CourseMaterialType" NOT NULL,
  "materialId" TEXT NOT NULL,
  "contentVersion" TEXT NOT NULL,
  "status" "LearnerLearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "activeStudySeconds" INTEGER NOT NULL DEFAULT 0,
  "firstStartedAt" TIMESTAMP(3),
  "lastStudiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "studyCount" INTEGER NOT NULL DEFAULT 0,
  "completionCount" INTEGER NOT NULL DEFAULT 0,
  "lastPosition" JSONB,
  "progressData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learner_material_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learner_material_part_progress" (
  "id" TEXT NOT NULL,
  "materialProgressId" TEXT NOT NULL,
  "partKey" TEXT NOT NULL,
  "status" "LearnerLearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "activeStudySeconds" INTEGER NOT NULL DEFAULT 0,
  "firstStartedAt" TIMESTAMP(3),
  "lastStudiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "progressData" JSONB,
  "metrics" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learner_material_part_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learner_daily_learning_summaries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "learnerId" TEXT NOT NULL,
  "summaryDate" DATE NOT NULL,
  "scopeType" "LearnerLearningSummaryScope" NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "scenarioId" TEXT,
  "courseId" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "materialType" "CourseMaterialType",
  "materialId" TEXT,
  "partKey" TEXT,
  "onlineSeconds" INTEGER NOT NULL DEFAULT 0,
  "studySeconds" INTEGER NOT NULL DEFAULT 0,
  "meaningfulActionCount" INTEGER NOT NULL DEFAULT 0,
  "startedMaterialCount" INTEGER NOT NULL DEFAULT 0,
  "completedPartCount" INTEGER NOT NULL DEFAULT 0,
  "completedMaterialCount" INTEGER NOT NULL DEFAULT 0,
  "practiceSubmittedCount" INTEGER NOT NULL DEFAULT 0,
  "practiceCorrectCount" INTEGER NOT NULL DEFAULT 0,
  "readAlongCompletedCount" INTEGER NOT NULL DEFAULT 0,
  "flashcardReviewedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learner_daily_learning_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learner_learning_sessions_profileSessionId_clientSessionKey_key" ON "learner_learning_sessions"("profileSessionId", "clientSessionKey");
CREATE INDEX "learner_learning_sessions_learnerId_startedAt_idx" ON "learner_learning_sessions"("learnerId", "startedAt");
CREATE INDEX "learner_learning_sessions_lastHeartbeatAt_endedAt_idx" ON "learner_learning_sessions"("lastHeartbeatAt", "endedAt");

CREATE UNIQUE INDEX "learner_learning_time_slices_learnerId_bucketStartedAt_key" ON "learner_learning_time_slices"("learnerId", "bucketStartedAt");
CREATE INDEX "learner_learning_time_slices_learnerId_bucketStartedAt_idx" ON "learner_learning_time_slices"("learnerId", "bucketStartedAt");
CREATE INDEX "learner_learning_time_slices_courseId_bucketStartedAt_idx" ON "learner_learning_time_slices"("courseId", "bucketStartedAt");
CREATE INDEX "learner_learning_time_slices_materialType_materialId_bucketStartedAt_idx" ON "learner_learning_time_slices"("materialType", "materialId", "bucketStartedAt");

CREATE UNIQUE INDEX "learner_material_progress_learnerId_materialType_materialId_contentVersion_key" ON "learner_material_progress"("learnerId", "materialType", "materialId", "contentVersion");
CREATE INDEX "learner_material_progress_userId_learnerId_lastStudiedAt_idx" ON "learner_material_progress"("userId", "learnerId", "lastStudiedAt");
CREATE INDEX "learner_material_progress_materialType_materialId_idx" ON "learner_material_progress"("materialType", "materialId");

CREATE UNIQUE INDEX "learner_material_part_progress_materialProgressId_partKey_key" ON "learner_material_part_progress"("materialProgressId", "partKey");
CREATE INDEX "learner_material_part_progress_partKey_lastStudiedAt_idx" ON "learner_material_part_progress"("partKey", "lastStudiedAt");

CREATE UNIQUE INDEX "learner_daily_learning_summaries_learnerId_summaryDate_scopeType_scopeKey_key" ON "learner_daily_learning_summaries"("learnerId", "summaryDate", "scopeType", "scopeKey");
CREATE INDEX "learner_daily_learning_summaries_userId_learnerId_summaryDate_idx" ON "learner_daily_learning_summaries"("userId", "learnerId", "summaryDate");
CREATE INDEX "learner_daily_learning_summaries_courseId_summaryDate_idx" ON "learner_daily_learning_summaries"("courseId", "summaryDate");
CREATE INDEX "learner_daily_learning_summaries_materialType_materialId_summaryDate_idx" ON "learner_daily_learning_summaries"("materialType", "materialId", "summaryDate");

CREATE INDEX "learner_activity_events_learnerId_materialType_materialId_occurredAt_idx" ON "learner_activity_events"("learnerId", "materialType", "materialId", "occurredAt");

ALTER TABLE "learner_learning_sessions" ADD CONSTRAINT "learner_learning_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_learning_sessions" ADD CONSTRAINT "learner_learning_sessions_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_learning_sessions" ADD CONSTRAINT "learner_learning_sessions_profileSessionId_fkey" FOREIGN KEY ("profileSessionId") REFERENCES "refresh_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learner_learning_time_slices" ADD CONSTRAINT "learner_learning_time_slices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_learning_time_slices" ADD CONSTRAINT "learner_learning_time_slices_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_learning_time_slices" ADD CONSTRAINT "learner_learning_time_slices_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "learner_learning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learner_material_progress" ADD CONSTRAINT "learner_material_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_material_progress" ADD CONSTRAINT "learner_material_progress_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learner_material_part_progress" ADD CONSTRAINT "learner_material_part_progress_materialProgressId_fkey" FOREIGN KEY ("materialProgressId") REFERENCES "learner_material_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learner_daily_learning_summaries" ADD CONSTRAINT "learner_daily_learning_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_daily_learning_summaries" ADD CONSTRAINT "learner_daily_learning_summaries_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
