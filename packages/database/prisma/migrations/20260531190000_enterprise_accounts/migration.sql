-- CreateEnum
CREATE TYPE "BillingContextType" AS ENUM ('PERSONAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE_ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "OrganizationMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "OrganizationWalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrganizationPointLotStatus" AS ENUM ('ACTIVE', 'USED_UP', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrganizationWalletLedgerDirection" AS ENUM ('CREDIT', 'DEBIT', 'RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "OrganizationWalletTransactionType" AS ENUM ('PURCHASE', 'CONSUME', 'REFUND', 'EXPIRE', 'ADJUST', 'GIFT', 'RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "OrganizationReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrganizationQuotaType" AS ENUM ('ONE_TIME', 'MONTHLY');

-- CreateEnum
CREATE TYPE "OrganizationQuotaStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OrganizationQuotaLedgerDirection" AS ENUM ('GRANT', 'CONSUME', 'RESERVE', 'RELEASE', 'REVOKE', 'ADJUST', 'RESET');

-- CreateEnum
CREATE TYPE "OrganizationUsageEventStatus" AS ENUM ('SUCCESS', 'FAILED', 'REVERSED');

-- AlterTable
ALTER TABLE "ai_tasks" ADD COLUMN "billingContext" "BillingContextType" NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "organizationMemberId" TEXT;

-- AlterTable
ALTER TABLE "audio_tasks" ADD COLUMN "billingContext" "BillingContextType" NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "organizationMemberId" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "type" TEXT NOT NULL DEFAULT '企业',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingMode" TEXT NOT NULL DEFAULT 'PREPAID',
    "ownerUserId" TEXT NOT NULL,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "defaultLocale" TEXT NOT NULL DEFAULT 'zh-CN',
    "industry" TEXT,
    "employeeSize" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "orgId" TEXT NOT NULL,
    "defaultMemberRole" "OrganizationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "defaultQuota" INTEGER NOT NULL DEFAULT 0,
    "quotaResetDay" INTEGER NOT NULL DEFAULT 1,
    "lowBalanceThreshold" INTEGER NOT NULL DEFAULT 1000,
    "usageAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "invoiceRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_wallets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "OrganizationWalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "balanceTotal" INTEGER NOT NULL DEFAULT 0,
    "balanceAvailable" INTEGER NOT NULL DEFAULT 0,
    "balanceReserved" INTEGER NOT NULL DEFAULT 0,
    "totalPurchased" INTEGER NOT NULL DEFAULT 0,
    "totalGranted" INTEGER NOT NULL DEFAULT 0,
    "totalConsumed" INTEGER NOT NULL DEFAULT 0,
    "totalExpired" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_point_lots" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "initialPoints" INTEGER NOT NULL,
    "remainingPoints" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "OrganizationPointLotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_point_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_wallet_ledgers" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "lotId" TEXT,
    "direction" "OrganizationWalletLedgerDirection" NOT NULL,
    "transactionType" "OrganizationWalletTransactionType" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "operatorType" TEXT NOT NULL DEFAULT 'system',
    "operatorId" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_wallet_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_wallet_reservations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "usageRequestId" TEXT NOT NULL,
    "reservedPoints" INTEGER NOT NULL,
    "settledPoints" INTEGER NOT NULL DEFAULT 0,
    "status" "OrganizationReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "organization_wallet_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_orders" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buyerMemberId" TEXT,
    "packageId" TEXT,
    "pointsAmount" INTEGER NOT NULL,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "cashAmount" DECIMAL(10,2) NOT NULL,
    "originalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "paymentMethod" TEXT,
    "paymentTransactionId" TEXT,
    "invoiceStatus" TEXT NOT NULL DEFAULT 'not_required',
    "paidAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_member_quotas" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "quotaType" "OrganizationQuotaType" NOT NULL DEFAULT 'ONE_TIME',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "totalQuota" INTEGER NOT NULL,
    "usedQuota" INTEGER NOT NULL DEFAULT 0,
    "reservedQuota" INTEGER NOT NULL DEFAULT 0,
    "status" "OrganizationQuotaStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_member_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_quota_ledgers" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "quotaAccountId" TEXT NOT NULL,
    "direction" "OrganizationQuotaLedgerDirection" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "quotaAfter" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "operatorId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_quota_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_usage_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "quotaAccountId" TEXT,
    "featureCode" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "usageQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "usageUnit" TEXT,
    "unitPrice" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "pointsCharged" INTEGER NOT NULL,
    "pricingVersion" TEXT,
    "walletLedgerId" TEXT,
    "quotaLedgerId" TEXT,
    "reservationId" TEXT,
    "status" "OrganizationUsageEventStatus" NOT NULL DEFAULT 'SUCCESS',
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_tasks_billingContext_idx" ON "ai_tasks"("billingContext");

-- CreateIndex
CREATE INDEX "ai_tasks_organizationId_idx" ON "ai_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "ai_tasks_organizationMemberId_idx" ON "ai_tasks"("organizationMemberId");

-- CreateIndex
CREATE INDEX "audio_tasks_billingContext_idx" ON "audio_tasks"("billingContext");

-- CreateIndex
CREATE INDEX "audio_tasks_organizationId_idx" ON "audio_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "audio_tasks_organizationMemberId_idx" ON "audio_tasks"("organizationMemberId");

-- CreateIndex
CREATE INDEX "organizations_ownerUserId_idx" ON "organizations"("ownerUserId");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_orgId_userId_key" ON "organization_members"("orgId", "userId");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE INDEX "organization_members_role_idx" ON "organization_members"("role");

-- CreateIndex
CREATE INDEX "organization_members_status_idx" ON "organization_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_wallets_orgId_key" ON "organization_wallets"("orgId");

-- CreateIndex
CREATE INDEX "organization_wallets_status_idx" ON "organization_wallets"("status");

-- CreateIndex
CREATE INDEX "organization_point_lots_walletId_idx" ON "organization_point_lots"("walletId");

-- CreateIndex
CREATE INDEX "organization_point_lots_orgId_idx" ON "organization_point_lots"("orgId");

-- CreateIndex
CREATE INDEX "organization_point_lots_status_expiresAt_idx" ON "organization_point_lots"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "organization_wallet_ledgers_idempotencyKey_key" ON "organization_wallet_ledgers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "organization_wallet_ledgers_orgId_createdAt_idx" ON "organization_wallet_ledgers"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "organization_wallet_ledgers_walletId_idx" ON "organization_wallet_ledgers"("walletId");

-- CreateIndex
CREATE INDEX "organization_wallet_ledgers_lotId_idx" ON "organization_wallet_ledgers"("lotId");

-- CreateIndex
CREATE INDEX "organization_wallet_ledgers_transactionType_idx" ON "organization_wallet_ledgers"("transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "organization_wallet_reservations_usageRequestId_key" ON "organization_wallet_reservations"("usageRequestId");

-- CreateIndex
CREATE INDEX "organization_wallet_reservations_orgId_idx" ON "organization_wallet_reservations"("orgId");

-- CreateIndex
CREATE INDEX "organization_wallet_reservations_memberId_idx" ON "organization_wallet_reservations"("memberId");

-- CreateIndex
CREATE INDEX "organization_wallet_reservations_status_idx" ON "organization_wallet_reservations"("status");

-- CreateIndex
CREATE INDEX "organization_wallet_reservations_expiresAt_idx" ON "organization_wallet_reservations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_orders_orderNo_key" ON "enterprise_orders"("orderNo");

-- CreateIndex
CREATE INDEX "enterprise_orders_orgId_idx" ON "enterprise_orders"("orgId");

-- CreateIndex
CREATE INDEX "enterprise_orders_status_idx" ON "enterprise_orders"("status");

-- CreateIndex
CREATE INDEX "organization_member_quotas_orgId_idx" ON "organization_member_quotas"("orgId");

-- CreateIndex
CREATE INDEX "organization_member_quotas_memberId_idx" ON "organization_member_quotas"("memberId");

-- CreateIndex
CREATE INDEX "organization_member_quotas_status_idx" ON "organization_member_quotas"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_quota_ledgers_idempotencyKey_key" ON "organization_quota_ledgers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "organization_quota_ledgers_orgId_createdAt_idx" ON "organization_quota_ledgers"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "organization_quota_ledgers_memberId_idx" ON "organization_quota_ledgers"("memberId");

-- CreateIndex
CREATE INDEX "organization_quota_ledgers_quotaAccountId_idx" ON "organization_quota_ledgers"("quotaAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_usage_events_idempotencyKey_key" ON "organization_usage_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "organization_usage_events_orgId_occurredAt_idx" ON "organization_usage_events"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "organization_usage_events_userId_occurredAt_idx" ON "organization_usage_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "organization_usage_events_memberId_occurredAt_idx" ON "organization_usage_events"("memberId", "occurredAt");

-- CreateIndex
CREATE INDEX "organization_usage_events_featureCode_idx" ON "organization_usage_events"("featureCode");

-- CreateIndex
CREATE INDEX "organization_usage_events_resourceType_resourceId_idx" ON "organization_usage_events"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_organizationMemberId_fkey" FOREIGN KEY ("organizationMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_tasks" ADD CONSTRAINT "audio_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_tasks" ADD CONSTRAINT "audio_tasks_organizationMemberId_fkey" FOREIGN KEY ("organizationMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallets" ADD CONSTRAINT "organization_wallets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_point_lots" ADD CONSTRAINT "organization_point_lots_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "organization_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_point_lots" ADD CONSTRAINT "organization_point_lots_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallet_ledgers" ADD CONSTRAINT "organization_wallet_ledgers_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallet_ledgers" ADD CONSTRAINT "organization_wallet_ledgers_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "organization_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallet_ledgers" ADD CONSTRAINT "organization_wallet_ledgers_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "organization_point_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallet_reservations" ADD CONSTRAINT "organization_wallet_reservations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallet_reservations" ADD CONSTRAINT "organization_wallet_reservations_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "organization_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_wallet_reservations" ADD CONSTRAINT "organization_wallet_reservations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_orders" ADD CONSTRAINT "enterprise_orders_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member_quotas" ADD CONSTRAINT "organization_member_quotas_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member_quotas" ADD CONSTRAINT "organization_member_quotas_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_quota_ledgers" ADD CONSTRAINT "organization_quota_ledgers_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_quota_ledgers" ADD CONSTRAINT "organization_quota_ledgers_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_quota_ledgers" ADD CONSTRAINT "organization_quota_ledgers_quotaAccountId_fkey" FOREIGN KEY ("quotaAccountId") REFERENCES "organization_member_quotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_quotaAccountId_fkey" FOREIGN KEY ("quotaAccountId") REFERENCES "organization_member_quotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_walletLedgerId_fkey" FOREIGN KEY ("walletLedgerId") REFERENCES "organization_wallet_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_quotaLedgerId_fkey" FOREIGN KEY ("quotaLedgerId") REFERENCES "organization_quota_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_usage_events" ADD CONSTRAINT "organization_usage_events_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "organization_wallet_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
