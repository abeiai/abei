import assert from "node:assert/strict";
import test from "node:test";
import { PaymentService } from "../src/payment/payment.service.js";
import { validateMembershipPlan } from "../src/membership/membership.service.js";
const plan={name:"高级会员",rank:2,isEnabled:true,storageGb:50,learnerLimit:5,benefits:[{code:"resource_access",name:"全部资源",value:true}],prices:[{period:"YEAR",originalPriceCny:"100",discountPercent:90,salePriceCny:null,credits:10000,isEnabled:true}]};
test("membership configuration rejects duplicate periods and unsafe entitlement payloads",()=>{
 assert.equal(validateMembershipPlan(plan).prices[0]?.credits,10000);
 assert.throws(()=>validateMembershipPlan({...plan,prices:[...plan.prices,...plan.prices]}));
 assert.throws(()=>validateMembershipPlan({...plan,benefits:[{code:"x",name:"权益",value:{admin:true}}]}));
 assert.throws(()=>validateMembershipPlan({...plan,rank:0}));
 assert.throws(()=>validateMembershipPlan({...plan,prices:[{...plan.prices[0],credits:0.1}]}));
});
test("paid membership uses order snapshot, queues after current period and is idempotent",async()=>{
 const end=new Date(Date.now()+86400000);
 const snapshot={planId:"plan",name:"购买时名称",rank:2,storageGb:50,learnerLimit:5,benefits:[],period:"YEAR",credits:10000,amountCny:"90.00"};
 const order={id:"order",orderNo:"PAY1",userId:"user",status:"PAYING",provider:"ALIPAY",credits:10000,amountCny:"90.00",membershipSnapshot:snapshot};
 const periods:Record<string,unknown>[]=[];
 let locked=false;
 const wallet={availableCredits:7,totalTopUpCredits:7};
 const transaction={
  paymentOrder:{findUnique:async()=>({...order}),findUniqueOrThrow:async()=>({...order}),updateMany:async()=>{order.status="PAID";return {count:1};},update:async()=>({...order})},
  wallet:{upsert:async()=>wallet,update:async()=>{throw Error("membership must not top up purchased balance");}},
  $queryRaw:async()=>{locked=true;return [];},
  membershipPeriod:{findFirst:async()=>({endsAt:end}),create:async({data}:{data:Record<string,unknown>})=>{assert.equal(locked,true);periods.push(data);return data;}},
  ledgerEntry:{create:async()=>{throw Error("membership grant belongs to lazy activation");}}
 };
 const service=Object.create(PaymentService.prototype) as PaymentService;
 Object.defineProperty(service,"prisma",{value:{$transaction:async(fn:(tx:typeof transaction)=>unknown)=>fn(transaction)}});
 const settle=Reflect.get(service,"settlePaidOrder").bind(service) as (provider:string,verified:unknown)=>Promise<{credited:boolean}>;
 const verified={orderNo:"PAY1",amountCny:"90.00",providerTradeNo:"trade",paidAt:new Date(),raw:{}};
 assert.equal((await settle("ALIPAY",verified)).credited,true);
 assert.equal((await settle("ALIPAY",verified)).credited,false);
 assert.equal(periods.length,1);assert.equal(periods[0]?.name,"购买时名称");assert.equal(periods[0]?.startsAt,end);
 assert.equal(periods[0]?.remainingCredits,10000);assert.equal(wallet.availableCredits,7);
 await assert.rejects(()=>settle("ALIPAY",{...verified,amountCny:"89.99"}),/支付金额/);
 await assert.rejects(()=>settle("WECHAT_PAY",verified),/渠道/);
});
