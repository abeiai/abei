ALTER TABLE "payment_orders" ADD COLUMN "membershipSnapshot" JSONB;
ALTER TABLE "ai_scenarios" ADD COLUMN "minimumMembershipRank" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "membershipEarlyAccessUntil" TIMESTAMP(3);
CREATE TABLE "membership_plans" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "rank" INTEGER NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT true,
 "storageGb" INTEGER NOT NULL DEFAULT 0, "learnerLimit" INTEGER NOT NULL DEFAULT 1, "benefits" JSONB NOT NULL, "prices" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "membership_plans_isEnabled_rank_idx" ON "membership_plans"("isEnabled", "rank");
CREATE TABLE "membership_periods" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "planId" TEXT NOT NULL, "orderId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "rank" INTEGER NOT NULL, "storageGb" INTEGER NOT NULL, "learnerLimit" INTEGER NOT NULL,
 "benefits" JSONB NOT NULL, "credits" INTEGER NOT NULL, "remainingCredits" INTEGER NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "grantedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "membership_periods_orderId_key" ON "membership_periods"("orderId");
CREATE INDEX "membership_periods_userId_startsAt_endsAt_idx" ON "membership_periods"("userId", "startsAt", "endsAt");
CREATE TABLE "membership_credit_allocations" (
 "id" TEXT PRIMARY KEY, "operationKey" TEXT NOT NULL, "userId" TEXT NOT NULL, "periodId" TEXT,
 "membershipCredits" INTEGER NOT NULL, "purchasedCredits" INTEGER NOT NULL, "settled" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "membership_credit_allocations_operationKey_key" ON "membership_credit_allocations"("operationKey");
CREATE INDEX "membership_credit_allocations_userId_idx" ON "membership_credit_allocations"("userId");
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_valid_limits" CHECK ("rank" > 0 AND "storageGb" >= 0 AND "learnerLimit" > 0);
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_valid_balance" CHECK ("credits" >= 0 AND "remainingCredits" >= 0 AND "remainingCredits" <= "credits" AND "startsAt" < "endsAt" AND "rank" > 0 AND "storageGb" >= 0 AND "learnerLimit" > 0);
ALTER TABLE "membership_credit_allocations" ADD CONSTRAINT "membership_credit_allocations_valid_balance" CHECK ("membershipCredits" >= 0 AND "purchasedCredits" >= 0);
ALTER TABLE "ai_scenarios" ADD CONSTRAINT "ai_scenarios_valid_membership_rank" CHECK ("minimumMembershipRank" >= 0);
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_credit_allocations" ADD CONSTRAINT "membership_credit_allocations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_credit_allocations" ADD CONSTRAINT "membership_credit_allocations_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "membership_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
