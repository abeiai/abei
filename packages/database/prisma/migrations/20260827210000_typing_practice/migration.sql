BEGIN;

CREATE TYPE "TypingPracticeMode" AS ENUM ('DICTATION');
CREATE TYPE "TypingPracticeScope" AS ENUM ('UNIT', 'NEW', 'DUE_REVIEW', 'MIXED');
CREATE TYPE "TypingPracticeSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'EXPIRED');
CREATE TYPE "TypingPracticeSessionItemSource" AS ENUM ('NEW', 'DUE_REVIEW', 'RELEARNING');
CREATE TYPE "TypingPracticeSessionItemStatus" AS ENUM ('PENDING', 'ACTIVE', 'CORRECT', 'SKIPPED');
CREATE TYPE "TypingReviewStateStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'MASTERED', 'SUSPENDED');
CREATE TYPE "TypingErrorType" AS ENUM ('SPELLING_ERROR', 'CASE_ERROR', 'PUNCTUATION_ERROR', 'WHITESPACE_ERROR', 'INCOMPLETE');
CREATE TYPE "TypingAccent" AS ENUM ('UK', 'US');
CREATE TYPE "TypingInputStyle" AS ENUM ('UNDERLINE', 'BOX');

CREATE TABLE "typing_library_progress" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learnerId" TEXT,
    "libraryId" TEXT NOT NULL,
    "lastUnitId" TEXT,
    "lastItemId" TEXT,
    "lastSessionId" TEXT,
    "newItemCount" INTEGER NOT NULL DEFAULT 0,
    "learnedItemCount" INTEGER NOT NULL DEFAULT 0,
    "masteredItemCount" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "typing_library_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "typing_practice_sessions" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learnerId" TEXT,
    "libraryId" TEXT NOT NULL,
    "unitId" TEXT,
    "mode" "TypingPracticeMode" NOT NULL DEFAULT 'DICTATION',
    "scope" "TypingPracticeScope" NOT NULL,
    "status" "TypingPracticeSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "targetItemCount" INTEGER NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "hintedCount" INTEGER NOT NULL DEFAULT 0,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "clientSessionKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "typing_practice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "typing_practice_session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemVersion" TEXT NOT NULL,
    "source" "TypingPracticeSessionItemSource" NOT NULL,
    "queueOrder" INTEGER NOT NULL,
    "repeatOfSessionItemId" TEXT,
    "answerSnapshot" TEXT NOT NULL,
    "status" "TypingPracticeSessionItemStatus" NOT NULL DEFAULT 'PENDING',
    "hintLevel" INTEGER NOT NULL DEFAULT 0,
    "lastErrorTokenIndex" INTEGER,
    "audioReplayCount" INTEGER NOT NULL DEFAULT 0,
    "hasLapse" BOOLEAN NOT NULL DEFAULT false,
    "firstShownAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "typing_practice_session_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "typing_attempts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemVersion" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "errorTypes" "TypingErrorType"[],
    "errorPositions" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "hintLevel" INTEGER NOT NULL DEFAULT 0,
    "audioReplayCount" INTEGER NOT NULL DEFAULT 0,
    "isReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "typing_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "typing_review_states" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learnerId" TEXT,
    "itemId" TEXT NOT NULL,
    "itemVersion" TEXT NOT NULL,
    "state" "TypingReviewStateStatus" NOT NULL DEFAULT 'NEW',
    "stage" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "totalCorrect" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "hintCount" INTEGER NOT NULL DEFAULT 0,
    "correctStreak" INTEGER NOT NULL DEFAULT 0,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'typing-stages-v1',
    "difficulty" DOUBLE PRECISION,
    "stability" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "typing_review_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "typing_preferences" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learnerId" TEXT,
    "accent" "TypingAccent" NOT NULL DEFAULT 'UK',
    "autoPlayAudio" BOOLEAN NOT NULL DEFAULT true,
    "replayAfterCorrect" BOOLEAN NOT NULL DEFAULT true,
    "showImage" BOOLEAN NOT NULL DEFAULT true,
    "feedbackSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "inputStyle" "TypingInputStyle" NOT NULL DEFAULT 'UNDERLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "typing_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "typing_library_progress_subjectKey_libraryId_key" ON "typing_library_progress"("subjectKey", "libraryId");
CREATE INDEX "typing_library_progress_userId_learnerId_idx" ON "typing_library_progress"("userId", "learnerId");
CREATE INDEX "typing_library_progress_libraryId_lastPracticedAt_idx" ON "typing_library_progress"("libraryId", "lastPracticedAt");
CREATE UNIQUE INDEX "typing_practice_sessions_clientSessionKey_key" ON "typing_practice_sessions"("clientSessionKey");
CREATE UNIQUE INDEX "typing_practice_sessions_one_open_subject_key" ON "typing_practice_sessions"("subjectKey") WHERE "status" IN ('ACTIVE', 'PAUSED');
CREATE INDEX "typing_practice_sessions_subjectKey_status_lastActiveAt_idx" ON "typing_practice_sessions"("subjectKey", "status", "lastActiveAt");
CREATE INDEX "typing_practice_sessions_libraryId_startedAt_idx" ON "typing_practice_sessions"("libraryId", "startedAt");
CREATE INDEX "typing_practice_sessions_unitId_idx" ON "typing_practice_sessions"("unitId");
CREATE INDEX "typing_practice_sessions_userId_learnerId_startedAt_idx" ON "typing_practice_sessions"("userId", "learnerId", "startedAt");
CREATE UNIQUE INDEX "typing_practice_session_items_sessionId_queueOrder_key" ON "typing_practice_session_items"("sessionId", "queueOrder");
CREATE INDEX "typing_practice_session_items_itemId_idx" ON "typing_practice_session_items"("itemId");
CREATE INDEX "typing_practice_session_items_repeatOfSessionItemId_idx" ON "typing_practice_session_items"("repeatOfSessionItemId");
CREATE INDEX "typing_practice_session_items_sessionId_status_idx" ON "typing_practice_session_items"("sessionId", "status");
CREATE UNIQUE INDEX "typing_attempts_clientAttemptId_key" ON "typing_attempts"("clientAttemptId");
CREATE UNIQUE INDEX "typing_attempts_sessionItemId_attemptNumber_key" ON "typing_attempts"("sessionItemId", "attemptNumber");
CREATE INDEX "typing_attempts_sessionId_createdAt_idx" ON "typing_attempts"("sessionId", "createdAt");
CREATE INDEX "typing_attempts_itemId_createdAt_idx" ON "typing_attempts"("itemId", "createdAt");
CREATE UNIQUE INDEX "typing_review_states_subjectKey_itemId_key" ON "typing_review_states"("subjectKey", "itemId");
CREATE INDEX "typing_review_states_subjectKey_dueAt_stage_idx" ON "typing_review_states"("subjectKey", "dueAt", "stage");
CREATE INDEX "typing_review_states_itemId_idx" ON "typing_review_states"("itemId");
CREATE INDEX "typing_review_states_userId_learnerId_idx" ON "typing_review_states"("userId", "learnerId");
CREATE UNIQUE INDEX "typing_preferences_subjectKey_key" ON "typing_preferences"("subjectKey");
CREATE UNIQUE INDEX "typing_preferences_learnerId_key" ON "typing_preferences"("learnerId");
CREATE INDEX "typing_preferences_userId_idx" ON "typing_preferences"("userId");

ALTER TABLE "typing_library_progress" ADD CONSTRAINT "typing_library_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_library_progress" ADD CONSTRAINT "typing_library_progress_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_library_progress" ADD CONSTRAINT "typing_library_progress_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "english_content_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_practice_sessions" ADD CONSTRAINT "typing_practice_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_practice_sessions" ADD CONSTRAINT "typing_practice_sessions_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_practice_sessions" ADD CONSTRAINT "typing_practice_sessions_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "english_content_libraries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_practice_sessions" ADD CONSTRAINT "typing_practice_sessions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "english_content_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_practice_session_items" ADD CONSTRAINT "typing_practice_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "typing_practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_practice_session_items" ADD CONSTRAINT "typing_practice_session_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "english_content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_practice_session_items" ADD CONSTRAINT "typing_practice_session_items_repeatOfSessionItemId_fkey" FOREIGN KEY ("repeatOfSessionItemId") REFERENCES "typing_practice_session_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "typing_attempts" ADD CONSTRAINT "typing_attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "typing_practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_attempts" ADD CONSTRAINT "typing_attempts_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "typing_practice_session_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_attempts" ADD CONSTRAINT "typing_attempts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "english_content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_review_states" ADD CONSTRAINT "typing_review_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_review_states" ADD CONSTRAINT "typing_review_states_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_review_states" ADD CONSTRAINT "typing_review_states_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "english_content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "typing_preferences" ADD CONSTRAINT "typing_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "typing_preferences" ADD CONSTRAINT "typing_preferences_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
