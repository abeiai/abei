CREATE TYPE "UserProfileMode" AS ENUM ('UNSELECTED', 'ACCOUNT', 'LEARNER');
CREATE TYPE "LearnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "LearnerGrade" AS ENUM (
  'PRESCHOOL', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5',
  'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'HIGH_1', 'HIGH_2',
  'HIGH_3', 'UNIVERSITY_OR_WORK'
);
CREATE TYPE "LearnerActivityEventType" AS ENUM (
  'CREATE_STARTED', 'CREATE_COMPLETED', 'LEARNING_STARTED',
  'LEARNING_COMPLETED', 'REVIEW_COMPLETED'
);

ALTER TABLE "users" ADD COLUMN "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "learnerSwitchPasswordHash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "profileMode" "UserProfileMode" NOT NULL DEFAULT 'UNSELECTED';
ALTER TABLE "refresh_tokens" ADD COLUMN "profileLearnerId" TEXT;

UPDATE "users"
SET "passwordLoginEnabled" = false
WHERE "email" LIKE 'phone-%@users.xueleai.local';

CREATE TABLE "learners" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "grade" "LearnerGrade" NOT NULL,
  "avatarUrl" TEXT,
  "status" "LearnerStatus" NOT NULL DEFAULT 'ACTIVE',
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learner_scenario_authorizations" (
  "learnerId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learner_scenario_authorizations_pkey" PRIMARY KEY ("learnerId", "scenarioId")
);

CREATE TABLE "learner_course_authorizations" (
  "learnerId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learner_course_authorizations_pkey" PRIMARY KEY ("learnerId", "courseId")
);

CREATE TABLE "learner_activity_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "learnerId" TEXT NOT NULL,
  "eventType" "LearnerActivityEventType" NOT NULL,
  "scenarioId" TEXT,
  "courseId" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metrics" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learner_activity_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_tasks" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "audio_tasks" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "audio_tasks" ADD COLUMN "scenarioId" TEXT;
ALTER TABLE "video_guide_lessons" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "english_guided_study_materials" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "learning_flashcard_decks" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "learning_flashcard_reviews" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "copybook_records" ADD COLUMN "learnerId" TEXT;

CREATE INDEX "learners_userId_status_createdAt_idx" ON "learners"("userId", "status", "createdAt");
CREATE INDEX "learner_scenario_authorizations_scenarioId_idx" ON "learner_scenario_authorizations"("scenarioId");
CREATE INDEX "learner_course_authorizations_courseId_idx" ON "learner_course_authorizations"("courseId");
CREATE UNIQUE INDEX "learner_activity_events_idempotencyKey_key" ON "learner_activity_events"("idempotencyKey");
CREATE INDEX "learner_activity_events_learnerId_occurredAt_idx" ON "learner_activity_events"("learnerId", "occurredAt");
CREATE INDEX "learner_activity_events_userId_occurredAt_idx" ON "learner_activity_events"("userId", "occurredAt");
CREATE INDEX "learner_activity_events_scenarioId_occurredAt_idx" ON "learner_activity_events"("scenarioId", "occurredAt");
CREATE INDEX "learner_activity_events_courseId_occurredAt_idx" ON "learner_activity_events"("courseId", "occurredAt");
CREATE INDEX "learner_activity_events_resourceType_resourceId_idx" ON "learner_activity_events"("resourceType", "resourceId");
CREATE INDEX "refresh_tokens_profileLearnerId_idx" ON "refresh_tokens"("profileLearnerId");

CREATE INDEX "ai_tasks_userId_learnerId_createdAt_idx" ON "ai_tasks"("userId", "learnerId", "createdAt");
CREATE INDEX "ai_tasks_learnerId_idx" ON "ai_tasks"("learnerId");
CREATE INDEX "audio_tasks_userId_learnerId_createdAt_idx" ON "audio_tasks"("userId", "learnerId", "createdAt");
CREATE INDEX "audio_tasks_learnerId_idx" ON "audio_tasks"("learnerId");
CREATE INDEX "audio_tasks_scenarioId_idx" ON "audio_tasks"("scenarioId");
CREATE INDEX "video_guide_lessons_userId_learnerId_createdAt_idx" ON "video_guide_lessons"("userId", "learnerId", "createdAt");
CREATE INDEX "video_guide_lessons_learnerId_idx" ON "video_guide_lessons"("learnerId");
CREATE INDEX "english_guided_study_materials_userId_learnerId_createdAt_idx" ON "english_guided_study_materials"("userId", "learnerId", "createdAt");
CREATE INDEX "english_guided_study_materials_learnerId_idx" ON "english_guided_study_materials"("learnerId");
CREATE INDEX "learning_flashcard_decks_userId_learnerId_createdAt_idx" ON "learning_flashcard_decks"("userId", "learnerId", "createdAt");
CREATE INDEX "learning_flashcard_decks_learnerId_idx" ON "learning_flashcard_decks"("learnerId");
CREATE INDEX "learning_flashcard_reviews_userId_learnerId_createdAt_idx" ON "learning_flashcard_reviews"("userId", "learnerId", "createdAt");
CREATE INDEX "learning_flashcard_reviews_learnerId_idx" ON "learning_flashcard_reviews"("learnerId");
CREATE INDEX "copybook_records_userId_learnerId_createdAt_idx" ON "copybook_records"("userId", "learnerId", "createdAt");
CREATE INDEX "copybook_records_learnerId_idx" ON "copybook_records"("learnerId");

ALTER TABLE "learners"
  ADD CONSTRAINT "learners_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_scenario_authorizations"
  ADD CONSTRAINT "learner_scenario_authorizations_learnerId_fkey"
  FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_scenario_authorizations"
  ADD CONSTRAINT "learner_scenario_authorizations_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "ai_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_course_authorizations"
  ADD CONSTRAINT "learner_course_authorizations_learnerId_fkey"
  FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_course_authorizations"
  ADD CONSTRAINT "learner_course_authorizations_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_activity_events"
  ADD CONSTRAINT "learner_activity_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_activity_events"
  ADD CONSTRAINT "learner_activity_events_learnerId_fkey"
  FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learner_activity_events"
  ADD CONSTRAINT "learner_activity_events_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "ai_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learner_activity_events"
  ADD CONSTRAINT "learner_activity_events_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_profileLearnerId_fkey"
  FOREIGN KEY ("profileLearnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audio_tasks" ADD CONSTRAINT "audio_tasks_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audio_tasks" ADD CONSTRAINT "audio_tasks_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ai_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "video_guide_lessons" ADD CONSTRAINT "video_guide_lessons_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "english_guided_study_materials" ADD CONSTRAINT "english_guided_study_materials_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_flashcard_decks" ADD CONSTRAINT "learning_flashcard_decks_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_flashcard_reviews" ADD CONSTRAINT "learning_flashcard_reviews_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "copybook_records" ADD CONSTRAINT "copybook_records_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_profile_context_shape_check"
  CHECK (
    ("type" = 'ADMIN' AND "profileMode" = 'UNSELECTED' AND "profileLearnerId" IS NULL)
    OR
    ("type" = 'USER' AND (
      ("profileMode" IN ('UNSELECTED', 'ACCOUNT') AND "profileLearnerId" IS NULL)
      OR ("profileMode" = 'LEARNER' AND "profileLearnerId" IS NOT NULL)
    ))
  );

CREATE OR REPLACE FUNCTION enforce_learner_user_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."learnerId" IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM "learners"
  WHERE "id" = NEW."learnerId"
    AND "userId" = NEW."userId"
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'learner_user_ownership_check',
      MESSAGE = 'Learner must belong to the same user as the attributed record';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ai_tasks_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "ai_tasks"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "audio_tasks_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "audio_tasks"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "video_guide_lessons_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "video_guide_lessons"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "english_guided_study_materials_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "english_guided_study_materials"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "learning_flashcard_decks_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "learning_flashcard_decks"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "learning_flashcard_reviews_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "learning_flashcard_reviews"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "copybook_records_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "copybook_records"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();
CREATE TRIGGER "learner_activity_events_learner_user_ownership_check"
BEFORE INSERT OR UPDATE OF "userId", "learnerId" ON "learner_activity_events"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_ownership();

CREATE OR REPLACE FUNCTION enforce_refresh_profile_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."profileLearnerId" IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM "learners"
  WHERE "id" = NEW."profileLearnerId"
    AND "userId" = NEW."userId"
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'refresh_profile_ownership_check',
      MESSAGE = 'Refresh profile learner must belong to the same user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "refresh_tokens_refresh_profile_ownership_check"
BEFORE INSERT OR UPDATE OF "type", "userId", "profileMode", "profileLearnerId" ON "refresh_tokens"
FOR EACH ROW EXECUTE FUNCTION enforce_refresh_profile_ownership();

CREATE OR REPLACE FUNCTION enforce_learner_user_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."userId" IS NOT DISTINCT FROM OLD."userId" THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ai_tasks" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "audio_tasks" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "video_guide_lessons" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "english_guided_study_materials" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "learning_flashcard_decks" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "learning_flashcard_reviews" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "copybook_records" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "learner_activity_events" WHERE "learnerId" = NEW."id"
    UNION ALL SELECT 1 FROM "refresh_tokens" WHERE "profileLearnerId" = NEW."id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'learners_user_reassignment_check',
      MESSAGE = 'Learner with attributed records or profile sessions cannot change user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "learners_user_reassignment_check"
BEFORE UPDATE OF "userId" ON "learners"
FOR EACH ROW EXECUTE FUNCTION enforce_learner_user_reassignment();
