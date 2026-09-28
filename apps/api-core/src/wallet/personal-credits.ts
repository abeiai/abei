import { HttpStatus } from "@nestjs/common";
import type { Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

type Transaction = Prisma.TransactionClient;

export async function getPersonalCreditBalance(tx: Transaction, userId: string, now = new Date()) {
  const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  const periods = await tx.membershipPeriod.findMany({ where: { userId, startsAt: { lte: now }, endsAt: { gt: now } } });
  const membershipCredits = periods.reduce((sum, period) => sum + period.remainingCredits, 0);
  return { ...wallet, purchasedCredits: wallet.availableCredits, membershipCredits, availableCredits: wallet.availableCredits + membershipCredits };
}

function assertCredits(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_000_000_000) {
    throw new AppException(40001, "点数必须为有效的非负整数", HttpStatus.BAD_REQUEST);
  }
}

// Every personal debit and settlement holds this row until the caller's transaction ends.
async function lockWallet(tx: Transaction, userId: string) {
  await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${userId} FOR UPDATE`;
}

async function refreshPeriods(tx: Transaction, userId: string, now: Date) {
  const unrecorded = await tx.membershipPeriod.findMany({
    where: { userId, startsAt: { lte: now }, grantedAt: null }, orderBy: { startsAt: "asc" }
  });
  for (const period of unrecorded) {
    if (period.grantedAt) continue;
    await tx.membershipPeriod.update({ where: { id: period.id }, data: { grantedAt: now } });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    await tx.ledgerEntry.create({ data: {
      userId, type: "ADMIN_ADJUST", amount: period.credits,
      balanceAfter: wallet.availableCredits + period.remainingCredits,
      idempotencyKey: `membership:${period.id}:grant`,
      note: `${period.name}周期赠送 ${period.credits} 点，到期清零`
    } });
  }
  const expired = await tx.membershipPeriod.findMany({
    where: { userId, endsAt: { lte: now }, remainingCredits: { gt: 0 } }
  });
  for (const period of expired) {
    await tx.membershipPeriod.update({ where: { id: period.id }, data: { remainingCredits: 0 } });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    await tx.ledgerEntry.create({ data: {
      userId, type: "ADMIN_ADJUST", amount: -period.remainingCredits,
      balanceAfter: wallet.availableCredits, idempotencyKey: `membership:${period.id}:expire`,
      note: `${period.name}周期结束，未用赠点 ${period.remainingCredits} 点清零`
    } });
  }
  const active = await tx.membershipPeriod.findMany({
    where: { userId, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { endsAt: "asc" }
  });
  return active;
}

export async function getPersonalWallet(tx: Transaction, userId: string, now = new Date()) {
  await lockWallet(tx, userId);
  const active = await refreshPeriods(tx, userId, now);
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  const membershipCredits = active.reduce((sum, row) => sum + row.remainingCredits, 0);
  return { ...wallet, purchasedCredits: wallet.availableCredits, membershipCredits, availableCredits: wallet.availableCredits + membershipCredits };
}

export async function reservePersonalCredits(tx: Transaction, userId: string, operationKey: string, credits: number, now = new Date()) {
  assertCredits(credits);
  await lockWallet(tx, userId);
  const existing = await tx.membershipCreditAllocation.findUnique({ where: { operationKey } });
  if (existing) {
    if (existing.userId !== userId || existing.membershipCredits + existing.purchasedCredits !== credits) {
      throw new AppException(40901, "该次扣点请求与原请求不一致", HttpStatus.CONFLICT);
    }
    return getPersonalWallet(tx, userId, now);
  }
  const active = await refreshPeriods(tx, userId, now);
  // Paid periods are serialized at purchase and cannot overlap.
  const period = active[0];
  const membershipCredits = Math.min(credits, period?.remainingCredits ?? 0);
  const purchasedCredits = credits - membershipCredits;
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  if (wallet.availableCredits < purchasedCredits) {
    throw new AppException(40004, "点数余额不足，请先充值或开通会员", HttpStatus.BAD_REQUEST);
  }
  if (membershipCredits > 0) {
    await tx.membershipPeriod.update({ where: { id: period!.id }, data: { remainingCredits: { decrement: membershipCredits } } });
  }
  await tx.wallet.update({ where: { userId }, data: {
    availableCredits: { decrement: purchasedCredits }, frozenCredits: { increment: credits }
  } });
  await tx.membershipCreditAllocation.create({ data: {
    operationKey, userId, periodId: membershipCredits > 0 ? period!.id : null,
    membershipCredits, purchasedCredits, settled: false
  } });
  return getPersonalWallet(tx, userId, now);
}

export async function settlePersonalCredits(tx: Transaction, userId: string, operationKey: string, reservedCredits: number, actualCredits: number, now = new Date()) {
  assertCredits(reservedCredits);
  assertCredits(actualCredits);
  await lockWallet(tx, userId);
  let allocation = await tx.membershipCreditAllocation.findUnique({ where: { operationKey } });
  if (allocation && (allocation.userId !== userId || allocation.membershipCredits + allocation.purchasedCredits !== reservedCredits)) {
    throw new AppException(40901, "该次结算与冻结记录不一致", HttpStatus.CONFLICT);
  }
  if (allocation?.settled) return getPersonalWallet(tx, userId, now);
  // Reservations created before this migration consist entirely of purchased credits.
  if (!allocation) {
    allocation = await tx.membershipCreditAllocation.create({ data: {
      operationKey, userId, periodId: null, membershipCredits: 0, purchasedCredits: reservedCredits, settled: false
    } });
  }
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  if (wallet.frozenCredits < reservedCredits) {
    throw new AppException(40901, "冻结点数不足，无法重复结算", HttpStatus.CONFLICT);
  }
  const consumedFromReservation = Math.min(actualCredits, reservedCredits);
  const consumedMembership = Math.min(allocation.membershipCredits, consumedFromReservation);
  const refundMembership = allocation.membershipCredits - consumedMembership;
  const refundPurchased = allocation.purchasedCredits - (consumedFromReservation - consumedMembership);
  if (refundMembership > 0 && allocation.periodId) {
    const period = await tx.membershipPeriod.findUnique({ where: { id: allocation.periodId } });
    if (period && period.startsAt <= now && period.endsAt > now) {
      await tx.membershipPeriod.update({ where: { id: period.id }, data: { remainingCredits: { increment: refundMembership } } });
    } else {
      await tx.ledgerEntry.create({ data: {
        userId, type: "ADMIN_ADJUST", amount: -refundMembership, balanceAfter: wallet.availableCredits,
        idempotencyKey: `membership-release-expired:${operationKey}`, note: `任务释放的会员赠点 ${refundMembership} 点已到期`
      } });
    }
  }
  await tx.wallet.update({ where: { userId }, data: {
    availableCredits: { increment: refundPurchased }, frozenCredits: { decrement: reservedCredits },
    totalConsumedCredits: { increment: consumedFromReservation }
  } });
  await tx.membershipCreditAllocation.update({ where: { operationKey }, data: { settled: true } });
  if (actualCredits > reservedCredits) {
    await consumePersonalCredits(tx, userId, `${operationKey}:extra`, actualCredits - reservedCredits, now);
  }
  return getPersonalWallet(tx, userId, now);
}

export async function consumePersonalCredits(tx: Transaction, userId: string, operationKey: string, credits: number, now = new Date()) {
  await reservePersonalCredits(tx, userId, operationKey, credits, now);
  return settlePersonalCredits(tx, userId, operationKey, credits, credits, now);
}
