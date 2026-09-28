-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "providerPayload" JSONB,
ADD COLUMN     "qrCodeUrl" TEXT;

-- CreateTable
CREATE TABLE "payment_notify_logs" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "orderNo" TEXT,
    "headers" JSONB,
    "body" JSONB NOT NULL,
    "verifyResult" TEXT NOT NULL,
    "processResult" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_notify_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_notify_logs_provider_orderNo_idx" ON "payment_notify_logs"("provider", "orderNo");

-- CreateIndex
CREATE INDEX "payment_notify_logs_createdAt_idx" ON "payment_notify_logs"("createdAt");
