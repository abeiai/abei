import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@xueleai/database";
import { reservePersonalCredits, settlePersonalCredits, consumePersonalCredits, getPersonalWallet } from "../src/wallet/personal-credits.js";

function fixture() {
  const now = new Date("2026-09-12T08:00:00Z");
  const wallet = { id: "wallet", userId: "user", availableCredits: 100, frozenCredits: 0, totalTopUpCredits: 100, totalConsumedCredits: 0, createdAt: now, updatedAt: now };
  const period = { id: "period", userId: "user", name: "高级会员", credits: 60, remainingCredits: 60, startsAt: new Date("2026-09-01"), endsAt: new Date("2026-10-01"), grantedAt: now as Date | null };
  type Allocation = { operationKey: string; userId: string; periodId: string | null; membershipCredits: number; purchasedCredits: number; settled: boolean };
  const allocations = new Map<string, Allocation>();
  const ledgers: unknown[] = [];
  function change(row: object, data: Record<string, unknown>) {
    const record = row as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const delta = value as { increment?: number; decrement?: number };
        record[key] = Number(record[key]) + (delta.increment ?? 0) - (delta.decrement ?? 0);
      } else record[key] = value;
    }
    return row;
  }
  const db = {
    $queryRaw: async () => [],
    wallet: {
      upsert: async () => ({ ...wallet }),
      findUniqueOrThrow: async () => ({ ...wallet }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...change(wallet, data) })
    },
    membershipPeriod: {
      findMany: async ({ where }: { where: { endsAt?: { lte?: Date; gt?: Date }; startsAt?: { lte: Date }; remainingCredits?: unknown; grantedAt?: null } }) => {
        if (where.endsAt?.lte && period.endsAt > where.endsAt.lte) return [];
        if (where.endsAt?.gt && period.endsAt <= where.endsAt.gt) return [];
        if (where.startsAt && period.startsAt > where.startsAt.lte) return [];
        if (where.grantedAt === null && period.grantedAt) return [];
        if (where.remainingCredits && period.remainingCredits <= 0) return [];
        return [{ ...period }];
      },
      findUnique: async () => ({ ...period }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...change(period, data) })
    },
    membershipCreditAllocation: {
      findUnique: async ({ where }: { where: { operationKey: string } }) => allocations.get(where.operationKey) ?? null,
      create: async ({ data }: { data: Allocation }) => { allocations.set(data.operationKey, { ...data }); return data; },
      update: async ({ where, data }: { where: { operationKey: string }; data: Record<string, unknown> }) => change(allocations.get(where.operationKey)!, data)
    },
    ledgerEntry: { create: async ({ data }: { data: unknown }) => { ledgers.push(data); return data; } }
  } as unknown as Prisma.TransactionClient;
  return { db, wallet, period, allocations, ledgers, now };
}

test("会员点数优先冻结，不足部分使用购买点数", async () => {
  const f = fixture();
  const result = await reservePersonalCredits(f.db, "user", "op", 80, f.now);
  assert.equal(f.period.remainingCredits, 0);
  assert.equal(f.wallet.availableCredits, 80);
  assert.equal(f.wallet.frozenCredits, 80);
  assert.equal(result.availableCredits, 80);
  assert.equal(f.allocations.get("op")?.membershipCredits, 60);
});

test("结算先消耗会员来源，多余购买点数按原来源释放", async () => {
  const f = fixture();
  await reservePersonalCredits(f.db, "user", "op", 80, f.now);
  await settlePersonalCredits(f.db, "user", "op", 80, 30, f.now);
  assert.equal(f.period.remainingCredits, 30);
  assert.equal(f.wallet.availableCredits, 100);
  assert.equal(f.wallet.frozenCredits, 0);
  assert.equal(f.wallet.totalConsumedCredits, 30);
});

test("跨周期任务失败不会将到期会员冻结点数退成永久余额", async () => {
  const f = fixture();
  await reservePersonalCredits(f.db, "user", "op", 80, f.now);
  await settlePersonalCredits(f.db, "user", "op", 80, 0, new Date("2026-10-01"));
  assert.equal(f.period.remainingCredits, 0);
  assert.equal(f.wallet.availableCredits, 100);
  assert.equal(f.wallet.frozenCredits, 0);
});

test("预占和结算重试不重复变更余额", async () => {
  const f = fixture();
  await reservePersonalCredits(f.db, "user", "op", 80, f.now);
  await reservePersonalCredits(f.db, "user", "op", 80, f.now);
  await settlePersonalCredits(f.db, "user", "op", 80, 40, f.now);
  await settlePersonalCredits(f.db, "user", "op", 80, 40, f.now);
  assert.equal(f.wallet.totalConsumedCredits, 40);
  assert.equal(f.period.remainingCredits, 20);
  assert.equal(f.wallet.frozenCredits, 0);
});

test("余额不足拒绝冻结，且非法负数不能变成充值", async () => {
  const f = fixture();
  await assert.rejects(reservePersonalCredits(f.db, "user", "op", 161, f.now), /点数余额不足/);
  await assert.rejects(reservePersonalCredits(f.db, "user", "op", -1, f.now), /点数/);
  assert.equal(f.wallet.availableCredits, 100);
  assert.equal(f.period.remainingCredits, 60);
});

test("直接消费优先会员点数且可用余额为两类之和", async () => {
  const f = fixture();
  assert.equal((await getPersonalWallet(f.db, "user", f.now)).availableCredits, 160);
  const result = await consumePersonalCredits(f.db, "user", "copybook", 20, f.now);
  assert.equal(result.availableCredits, 140);
  assert.equal(result.purchasedCredits, 100);
  assert.equal(result.membershipCredits, 40);
  assert.equal(f.wallet.totalConsumedCredits, 20);
});

test("到期时刻清零未用点数，下一周期前不可用", async () => {
  const f = fixture();
  const result = await getPersonalWallet(f.db, "user", new Date("2026-10-01"));
  assert.equal(result.membershipCredits, 0);
  assert.equal(f.period.remainingCredits, 0);
  assert.equal(f.wallet.availableCredits, 100);
  assert.equal(f.ledgers.length, 1);
});

test("老版本冻结只按购买来源结算", async () => {
  const f = fixture();
  f.wallet.availableCredits = 70;
  f.wallet.frozenCredits = 30;
  await settlePersonalCredits(f.db, "user", "legacy", 30, 10, f.now);
  assert.equal(f.wallet.availableCredits, 90);
  assert.equal(f.wallet.frozenCredits, 0);
  assert.equal(f.period.remainingCredits, 60);
});

test("整段会员周期未访问钱包，首次访问仍补齐赠点和失效流水", async () => {
  const f = fixture();
  f.period.grantedAt = null;
  await getPersonalWallet(f.db, "user", new Date("2026-10-02"));
  assert.equal(f.ledgers.length, 2);
  assert.deepEqual(f.ledgers.map((entry) => (entry as { amount: number }).amount), [60, -60]);
  await getPersonalWallet(f.db, "user", new Date("2026-10-03"));
  assert.equal(f.ledgers.length, 2);
});
