import { assertCreatorTestDatabase } from "./helpers/abei-test-environment.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { ReferralService, rewardNewReferral } from "../src/referrals/referral.service.js";
import { referralRules } from "../src/referrals/referral-rules.js";
import { referralRecordQuery } from "../src/referrals/admin-referral.controller.js";

test("推荐地址、首次归因、双向奖励的并发幂等与事务回滚", { skip: process.env.RUN_REFERRAL_INTEGRATION !== "1" }, async () => {
  assertCreatorTestDatabase();
  const prisma = getPrismaClient();
  const key = randomUUID();
  const ids: string[] = [];
  const data = (name: string) => ({ email: `${name}-${key}@example.invalid`, nickname: "推荐事务测试", passwordHash: "unusable", wallet: { create: {} } });
  const service = new ReferralService();
  try {
    const inviter = await prisma.user.create({ data: data("inviter") }); ids.push(inviter.id);
    const other = await prisma.user.create({ data: data("other") }); ids.push(other.id);
    const code = await prisma.referralHandle.findUniqueOrThrow({ where: { userId_kind: { userId: inviter.id, kind: "RANDOM" } } });
    assert.match(code.handle, /^[a-z0-9]{8}$/);
    assert.match(code.handle, /[a-z]/); assert.match(code.handle, /[0-9]/);
    const profile = await service.publicProfile(code.handle);
    assert.deepEqual(Object.keys(profile).sort(), ["id", "nickname", "avatarUrl", "handle", "canonicalHandle"].sort());
    const alias = `eric${key.replace(/[^a-f]/g, "").slice(0, 12)}`;
    const bindings = await Promise.allSettled([service.bindAlias(inviter.id, alias), service.bindAlias(inviter.id, `${alias}other`)]);
    assert.equal(bindings.filter(item => item.status === "fulfilled").length, 1);
    const bound = await prisma.referralHandle.findUniqueOrThrow({ where: { userId_kind: { userId: inviter.id, kind: "ALIAS" } } });
    await assert.rejects(service.bindAlias(other.id, bound.handle), /已被使用/);
    assert.equal((await service.publicProfile(code.handle)).canonicalHandle, bound.handle);
    assert.equal((await service.publicProfile(bound.handle)).id, inviter.id);
    const visit = await service.capture(code.handle);
    const otherCode = await prisma.referralHandle.findUniqueOrThrow({ where: { userId_kind: { userId: other.id, kind: "RANDOM" } } });
    assert.deepEqual(await service.capture(otherCode.handle, visit.token), visit, "首次归因不得覆盖或延期");
    const signups = await Promise.all([0, 1].map(index => prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: data(`signup${index}`) });
      const rewarded = await rewardNewReferral(tx, user.id, visit.token);
      return { user, rewarded };
    })));
    ids.push(...signups.map(item => item.user.id));
    assert.equal(signups.filter(item => item.rewarded).length, 1);
    const winner = signups.find(item => item.rewarded)!.user;
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: inviter.id } })).availableCredits, 500);
    const winnerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: winner.id } });
    assert.equal(winnerWallet.availableCredits, 500); assert.equal(winnerWallet.totalTopUpCredits, 0);
    assert.equal(await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: `referral:${winner.id}:` } } }), 2);
    assert.equal(await prisma.$transaction(tx => rewardNewReferral(tx, winner.id, visit.token)), false);
    const expiredToken = referralRules.newToken();
    await prisma.referralVisit.create({ data: { tokenHash: referralRules.hashToken(expiredToken), referrerId: inviter.id, createdAt: new Date(Date.now() - 73 * 3600000), expiresAt: new Date(Date.now() - 3600000) } });
    assert.equal(await prisma.$transaction(tx => rewardNewReferral(tx, other.id, expiredToken)), false);
    const selfVisit = await service.capture(code.handle);
    assert.equal(await prisma.$transaction(tx => rewardNewReferral(tx, inviter.id, selfVisit.token)), false);
    const rollbackVisit = await service.capture(code.handle);
    await assert.rejects(prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: data("rollback") });
      assert.equal(await rewardNewReferral(tx, user.id, rollbackVisit.token), true);
      throw new Error("模拟事务中断");
    }), /模拟事务中断/);
    assert.equal(await prisma.user.count({ where: { email: data("rollback").email } }), 0);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: inviter.id } })).availableCredits, 500);
    assert.equal((await service.me(inviter.id)).rewardCredits, 500);
    const records = await service.records({ referrerId: inviter.id }, 999);
    assert.equal(records.page, 1);
    assert.equal(records.total, 1);
    assert.equal(records.items[0]!.invitee.id, winner.id);
    assert.equal(records.items[0]!.referrer.id, inviter.id);
    assert.equal("passwordHash" in records.items[0]!.referrer, false);
    assert.equal("visitHash" in records.items[0]!, false);
    assert.equal((await service.records({ referrerId: other.id }, 1)).total, 0);
    for (const q of [bound.handle.toUpperCase(), inviter.email.toUpperCase()]) {
      const filter = referralRecordQuery({ q });
      assert.equal((await service.records(filter.where, filter.page)).total, 1);
    }
  } finally {
    await prisma.referralReward.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.referralVisit.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
