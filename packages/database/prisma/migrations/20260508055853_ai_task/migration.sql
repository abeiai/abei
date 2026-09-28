-- CreateEnum
CREATE TYPE "AiTaskStatus" AS ENUM ('CREATED', 'RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'COMPENSATED');

-- CreateEnum
CREATE TYPE "CreditReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "ai_scenarios" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "promptTemplate" TEXT NOT NULL,
    "costCredits" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "status" "AiTaskStatus" NOT NULL DEFAULT 'CREATED',
    "input" JSONB NOT NULL,
    "output" TEXT,
    "errorMessage" TEXT,
    "estimatedCredits" INTEGER NOT NULL,
    "actualCredits" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_reservations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_scenarios_slug_key" ON "ai_scenarios"("slug");

-- CreateIndex
CREATE INDEX "ai_scenarios_isEnabled_idx" ON "ai_scenarios"("isEnabled");

-- CreateIndex
CREATE INDEX "ai_tasks_userId_createdAt_idx" ON "ai_tasks"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_tasks_scenarioId_idx" ON "ai_tasks"("scenarioId");

-- CreateIndex
CREATE INDEX "ai_tasks_status_idx" ON "ai_tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_reservations_taskId_key" ON "credit_reservations"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_reservations_idempotencyKey_key" ON "credit_reservations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_reservations_userId_status_idx" ON "credit_reservations"("userId", "status");

-- CreateIndex
CREATE INDEX "credit_reservations_expiresAt_idx" ON "credit_reservations"("expiresAt");

-- CreateIndex
CREATE INDEX "ledger_entries_relatedTaskId_idx" ON "ledger_entries"("relatedTaskId");

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ai_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "ai_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
