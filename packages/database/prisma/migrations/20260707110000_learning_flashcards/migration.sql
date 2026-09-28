CREATE TYPE "LearningFlashcardSourceType" AS ENUM ('TEXTBOOK', 'UPLOAD', 'IMPORT');

CREATE TYPE "LearningFlashcardStrategy" AS ENUM ('SUBJECT_KNOWLEDGE', 'SCIENCE_POPULARIZATION', 'DAILY_MEMORY');

CREATE TYPE "LearningFlashcardDeckStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'FAILED');

CREATE TYPE "LearningFlashcardReviewGrade" AS ENUM ('HARD', 'BLURRY', 'MASTERED');

CREATE TABLE "learning_flashcard_decks" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceType" "LearningFlashcardSourceType" NOT NULL,
  "sourceName" TEXT,
  "sourceText" TEXT,
  "textbookId" TEXT,
  "textbookRange" TEXT,
  "detailRequest" TEXT,
  "strategy" "LearningFlashcardStrategy" NOT NULL DEFAULT 'SUBJECT_KNOWLEDGE',
  "cardTypes" JSONB NOT NULL,
  "targetCardCount" INTEGER NOT NULL DEFAULT 80,
  "summary" TEXT NOT NULL DEFAULT '',
  "knowledgeMap" JSONB NOT NULL,
  "status" "LearningFlashcardDeckStatus" NOT NULL DEFAULT 'READY',
  "aiTaskId" TEXT,
  "providerName" TEXT,
  "modelName" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learning_flashcard_decks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_flashcards" (
  "id" TEXT NOT NULL,
  "deckId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "front" TEXT NOT NULL,
  "back" TEXT NOT NULL,
  "source" TEXT,
  "tags" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learning_flashcards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_flashcard_reviews" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deckId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "grade" "LearningFlashcardReviewGrade" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_flashcard_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learning_flashcard_decks_userId_createdAt_idx" ON "learning_flashcard_decks"("userId", "createdAt");
CREATE INDEX "learning_flashcard_decks_sourceType_idx" ON "learning_flashcard_decks"("sourceType");
CREATE INDEX "learning_flashcard_decks_textbookId_idx" ON "learning_flashcard_decks"("textbookId");
CREATE INDEX "learning_flashcard_decks_aiTaskId_idx" ON "learning_flashcard_decks"("aiTaskId");
CREATE INDEX "learning_flashcard_decks_status_idx" ON "learning_flashcard_decks"("status");
CREATE INDEX "learning_flashcards_deckId_sortOrder_idx" ON "learning_flashcards"("deckId", "sortOrder");
CREATE INDEX "learning_flashcard_reviews_userId_createdAt_idx" ON "learning_flashcard_reviews"("userId", "createdAt");
CREATE INDEX "learning_flashcard_reviews_deckId_createdAt_idx" ON "learning_flashcard_reviews"("deckId", "createdAt");
CREATE INDEX "learning_flashcard_reviews_cardId_createdAt_idx" ON "learning_flashcard_reviews"("cardId", "createdAt");

ALTER TABLE "learning_flashcard_decks"
  ADD CONSTRAINT "learning_flashcard_decks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_flashcard_decks"
  ADD CONSTRAINT "learning_flashcard_decks_textbookId_fkey"
  FOREIGN KEY ("textbookId") REFERENCES "learning_material_textbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_flashcard_decks"
  ADD CONSTRAINT "learning_flashcard_decks_aiTaskId_fkey"
  FOREIGN KEY ("aiTaskId") REFERENCES "ai_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_flashcards"
  ADD CONSTRAINT "learning_flashcards_deckId_fkey"
  FOREIGN KEY ("deckId") REFERENCES "learning_flashcard_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_flashcard_reviews"
  ADD CONSTRAINT "learning_flashcard_reviews_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_flashcard_reviews"
  ADD CONSTRAINT "learning_flashcard_reviews_deckId_fkey"
  FOREIGN KEY ("deckId") REFERENCES "learning_flashcard_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_flashcard_reviews"
  ADD CONSTRAINT "learning_flashcard_reviews_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "learning_flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
