-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('ALIPAY', 'WECHAT_PAY');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'PAYING', 'PAID', 'CLOSED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('TOP_UP', 'RESERVE', 'CONSUME', 'RELEASE', 'REFUND', 'ADMIN_ADJUST');

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "orderNo" TEXT NOT NULL,
    "amountCny" DECIMAL(10,2) NOT NULL,
    "credits" INTEGER NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "providerTradeNo" TEXT,
    "notifyRaw" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "availableCredits" INTEGER NOT NULL DEFAULT 0,
    "frozenCredits" INTEGER NOT NULL DEFAULT 0,
    "totalTopUpCredits" INTEGER NOT NULL DEFAULT 0,
    "totalConsumedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "relatedOrderId" TEXT,
    "relatedTaskId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_orderNo_key" ON "payment_orders"("orderNo");

-- CreateIndex
CREATE INDEX "payment_orders_userId_idx" ON "payment_orders"("userId");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE INDEX "payment_orders_provider_providerTradeNo_idx" ON "payment_orders"("provider", "providerTradeNo");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotencyKey_key" ON "ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_entries_userId_createdAt_idx" ON "ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_relatedOrderId_idx" ON "ledger_entries"("relatedOrderId");

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_relatedOrderId_fkey" FOREIGN KEY ("relatedOrderId") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
