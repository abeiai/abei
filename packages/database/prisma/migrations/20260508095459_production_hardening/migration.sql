-- CreateTable
CREATE TABLE "login_failures" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_operation_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "description" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_failures_subject_key" ON "login_failures"("subject");

-- CreateIndex
CREATE INDEX "login_failures_lockedUntil_idx" ON "login_failures"("lockedUntil");

-- CreateIndex
CREATE INDEX "admin_operation_logs_adminUserId_idx" ON "admin_operation_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "admin_operation_logs_action_idx" ON "admin_operation_logs"("action");

-- CreateIndex
CREATE INDEX "admin_operation_logs_resourceType_resourceId_idx" ON "admin_operation_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "admin_operation_logs_createdAt_idx" ON "admin_operation_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
