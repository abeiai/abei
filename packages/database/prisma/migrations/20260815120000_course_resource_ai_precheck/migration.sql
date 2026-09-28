CREATE TYPE "CourseAiPrecheckStatus" AS ENUM ('NOT_STARTED', 'RUNNING', 'PASSED', 'REJECTED', 'FAILED');

CREATE TYPE "CourseAiPrecheckTrigger" AS ENUM ('MANUAL', 'AUTOMATIC');

ALTER TABLE "course_review_requests"
ADD COLUMN "aiPrecheckStatus" "CourseAiPrecheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "aiPrecheckProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiPrecheckMessage" TEXT,
ADD COLUMN "aiPrecheckResult" JSONB,
ADD COLUMN "aiPrecheckTaskId" TEXT,
ADD COLUMN "aiPrecheckTrigger" "CourseAiPrecheckTrigger",
ADD COLUMN "aiPrecheckStartedAt" TIMESTAMP(3),
ADD COLUMN "aiPrecheckCompletedAt" TIMESTAMP(3);

CREATE INDEX "course_review_requests_aiPrecheckStatus_submittedAt_idx"
ON "course_review_requests"("aiPrecheckStatus", "submittedAt");
