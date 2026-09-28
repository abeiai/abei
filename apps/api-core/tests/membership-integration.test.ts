import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { PaymentService } from "../src/payment/payment.service.js";
import { getPersonalWallet, reservePersonalCredits, settlePersonalCredits } from "../src/wallet/personal-credits.js";
import type { VerifiedPaymentResult } from "../src/payment/payment-channel.types.js";

test("PostgreSQL serializes membership payments, reservations, expiry and duplicate settlement", {
  skip: process.env.RUN_MEMBERSHIP_INTEGRATION !== "1"
}, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Integration tests require a local database");
  assert.equal(url.port, "3324", "Integration tests require the dedicated local xueleai port");
  assert.equal(url.pathname, "/xueleai", "Integration tests require the local xueleai database");
  const prisma = getPrismaClient();
  const token = randomUUID();
  let userId: string | undefined;
  let planId: string | undefined;
  try {
    const user = await prisma.user.create({data:{email:`membership-test-${token}@example.invalid`,nickname:"会员事务测试",passwordHash:"test-unusable-password",wallet:{create:{availableCredits:10,totalTopUpCredits:10}}}});
    userId=user.id;
    const plan=await prisma.membershipPlan.create({data:{name:"会员事务测试",rank:1,storageGb:1,learnerLimit:2,benefits:[],prices:[]}});
    planId=plan.id;
    const snapshot={planId:plan.id,name:plan.name,rank:plan.rank,storageGb:plan.storageGb,learnerLimit:plan.learnerLimit,benefits:[],period:"DAY",credits:100,amountCny:"1.00"};
    const orders=await Promise.all([0,1].map(index=>prisma.paymentOrder.create({data:{userId:user.id,orderNo:`MEMBERSHIP_TEST_${token}_${index}`,provider:"ALIPAY",amountCny:"1.00",credits:100,membershipSnapshot:snapshot}})));
    const service=Object.create(PaymentService.prototype) as PaymentService;
    Object.defineProperty(service,"prisma",{value:prisma});
    const settle=Reflect.get(service,"settlePaidOrder").bind(service) as (provider:string,verified:VerifiedPaymentResult)=>Promise<{credited:boolean}>;
    const verified=orders.map(order=>({orderNo:order.orderNo,amountCny:"1.00",providerTradeNo:`TEST_${order.id}`,paidAt:new Date(),raw:{}}));
    const paid=await Promise.all([settle("ALIPAY",verified[0]!),settle("ALIPAY",verified[1]!),settle("ALIPAY",verified[0]!)]);
    assert.equal(paid.filter(result=>result.credited).length,2);
    const periods=await prisma.membershipPeriod.findMany({where:{userId:user.id},orderBy:{startsAt:"asc"}});
    assert.equal(periods.length,2);
    assert.equal(periods[0]!.endsAt.getTime(),periods[1]!.startsAt.getTime());
    assert.equal(periods[0]!.credits,100);
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{userId:user.id}})).availableCredits,10);
    // Changing the catalog cannot rewrite a paid snapshot.
    await prisma.membershipPlan.update({where:{id:plan.id},data:{name:"修改后",isEnabled:false,rank:5}});
    assert.equal(periods[0]!.name,"会员事务测试");
    const now=new Date();
    const wallet=await prisma.$transaction(tx=>getPersonalWallet(tx,user.id,now));
    assert.equal(wallet.availableCredits,110);
    assert.equal(wallet.membershipCredits,100);
    const attempts=await Promise.allSettled(["a","b"].map(key=>prisma.$transaction(tx=>reservePersonalCredits(tx,user.id,`${token}:${key}`,80,now))));
    assert.equal(attempts.filter(result=>result.status==="fulfilled").length,1);
    const rejected=attempts.find(result=>result.status==="rejected") as PromiseRejectedResult;
    assert.match(String(rejected.reason),/余额不足/);
    const allocation=await prisma.membershipCreditAllocation.findFirstOrThrow({where:{userId:user.id}});
    assert.equal(allocation.membershipCredits,80);
    assert.equal(allocation.purchasedCredits,0);
    const reserved=await prisma.$transaction(tx=>getPersonalWallet(tx,user.id,now));
    assert.equal(reserved.availableCredits,30);
    assert.equal(reserved.frozenCredits,80);
    // Duplicate release remains idempotent, then reserve across both sources.
    await Promise.all([0,1].map(()=>prisma.$transaction(tx=>settlePersonalCredits(tx,user.id,allocation.operationKey,80,0,now))));
    await prisma.$transaction(tx=>reservePersonalCredits(tx,user.id,`${token}:mixed`,110,now));
    const mixed=await prisma.membershipCreditAllocation.findUniqueOrThrow({where:{operationKey:`${token}:mixed`}});
    assert.equal(mixed.membershipCredits,100);
    assert.equal(mixed.purchasedCredits,10);
    const afterExpiry=new Date(periods[0]!.endsAt.getTime()+1);
    const released=await prisma.$transaction(tx=>settlePersonalCredits(tx,user.id,`${token}:mixed`,110,0,afterExpiry));
    assert.equal(released.purchasedCredits,10);
    assert.equal(released.membershipCredits,100); // The new period's own grant only.
    assert.equal(released.frozenCredits,0);
    const expired=await prisma.membershipPeriod.findUniqueOrThrow({where:{id:periods[0]!.id}});
    assert.equal(expired.remainingCredits,0);
    assert.equal(await prisma.ledgerEntry.count({where:{userId:user.id,idempotencyKey:{startsWith:"membership-release-expired:"}}}),1);
    assert.equal(await prisma.ledgerEntry.count({where:{userId:user.id,idempotencyKey:{endsWith:":grant"}}}),2);
    await assert.rejects(()=>prisma.membershipPeriod.update({where:{id:expired.id},data:{remainingCredits:-1}}));
  } finally {
    if(userId) {
      await prisma.membershipCreditAllocation.deleteMany({where:{userId}});
      await prisma.membershipPeriod.deleteMany({where:{userId}});
      await prisma.user.delete({where:{id:userId}});
    }
    if(planId) await prisma.membershipPlan.delete({where:{id:planId}});
    await prisma.$disconnect();
  }
});
