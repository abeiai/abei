CREATE TYPE "ProductBillingMode" AS ENUM ('RECHARGE', 'SUBSCRIPTION', 'MIXED');

CREATE TABLE "billing_products" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "billingMode" "ProductBillingMode" NOT NULL DEFAULT 'RECHARGE',
  "amountCny" DECIMAL(10,2) NOT NULL,
  "credits" INTEGER NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_products_code_key" ON "billing_products"("code");
CREATE INDEX "billing_products_billingMode_isEnabled_sortOrder_idx"
  ON "billing_products"("billingMode", "isEnabled", "sortOrder");

INSERT INTO "billing_products" (
  "id",
  "code",
  "name",
  "billingMode",
  "amountCny",
  "credits",
  "description",
  "sortOrder",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
VALUES
  ('starter-recharge-product', 'starter', '入门充值包', 'RECHARGE', 19.90, 1990, '适合体验基础内容生成流程。', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('growth-recharge-product', 'growth', '增长充值包', 'RECHARGE', 49.90, 5990, '适合连续使用和小规模内容运营。', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pro-recharge-product', 'pro', '专业充值包', 'RECHARGE', 99.00, 12900, '适合高频任务和团队试运行。', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "payment_orders"
  ADD COLUMN "rechargeProductId" TEXT;

CREATE INDEX "payment_orders_rechargeProductId_idx" ON "payment_orders"("rechargeProductId");

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_rechargeProductId_fkey"
  FOREIGN KEY ("rechargeProductId") REFERENCES "billing_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
