import { Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { calculateMembershipPrice, MEMBERSHIP_PERIODS, type MembershipBillingPeriod } from "./membership-rules.js";
export interface MembershipPrice { period: MembershipBillingPeriod; originalPriceCny:string; discountPercent:number; salePriceCny:string|null; credits:number; isEnabled:boolean }
export interface MembershipSnapshot {planId:string; name:string; rank:number; storageGb:number; learnerLimit:number; benefits:Prisma.InputJsonValue; period:MembershipBillingPeriod; credits:number; amountCny:string}
const invalid = () => new AppException(40001,"会员配置不正确，请检查名称、等级、权益和价格",400);
function integer(value:unknown,min:number,max=1000000000):number {if(typeof value!=="number" || !Number.isInteger(value) || value<min || value>max) throw invalid(); return value;}
export function validateMembershipPlan(input:unknown) {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw invalid();
  const d=input as Record<string,unknown>;
  if(typeof d.name!=="string" || !d.name.trim() || d.name.trim().length>80 || typeof d.isEnabled!=="boolean" || !Array.isArray(d.prices) || d.prices.length>5 || !Array.isArray(d.benefits) || d.benefits.length>30) throw invalid();
  const seen=new Set<string>();
  const prices=d.prices.map((item:unknown):MembershipPrice=>{
    if(!item || typeof item!=="object") throw invalid();
    const p=item as Record<string,unknown>;
    if(typeof p.period!=="string" || !MEMBERSHIP_PERIODS.includes(p.period as MembershipBillingPeriod) || seen.has(p.period) || typeof p.originalPriceCny!=="string" || typeof p.isEnabled!=="boolean" || (p.salePriceCny!=null && typeof p.salePriceCny!=="string")) throw invalid();
    seen.add(p.period);
    const price={period:p.period as MembershipBillingPeriod,originalPriceCny:p.originalPriceCny,discountPercent:integer(p.discountPercent??100,1,100),salePriceCny:(p.salePriceCny as string|null)||null,credits:integer(p.credits,0),isEnabled:p.isEnabled};
    calculateMembershipPrice(price); return price;
  });
  const codes=new Set<string>();
  const benefits=d.benefits.map((item:unknown)=>{
    if(!item || typeof item!=="object") throw invalid();
    const b=item as Record<string,unknown>;
    if(typeof b.code!=="string" || !/^[a-z][a-z0-9_]{0,63}$/.test(b.code) || codes.has(b.code) || typeof b.name!=="string" || !b.name.trim() || b.name.length>100 || !["string","number","boolean"].includes(typeof b.value) || String(b.value).length>500 || (typeof b.value==="number"&&!Number.isFinite(b.value))) throw invalid();
    codes.add(b.code); return {code:b.code,name:b.name.trim(),type:typeof b.value,value:b.value as string|number|boolean};
  });
  return {name:d.name.trim(),rank:integer(d.rank,1,1000000),isEnabled:d.isEnabled,storageGb:integer(d.storageGb,0),learnerLimit:integer(d.learnerLimit,1,999),benefits,prices};
}
@Injectable()
export class MembershipService {
 private readonly prisma=getPrismaClient();
 async list(admin=false) {
   const plans=await this.prisma.membershipPlan.findMany({where:admin?{}:{isEnabled:true},orderBy:[{rank:"asc"},{createdAt:"asc"}]});
   return plans.map(plan=>({...plan,prices:(plan.prices as unknown as MembershipPrice[]).filter(p=>admin||p.isEnabled).map(p=>({...p,...calculateMembershipPrice(p)}))}));
 }
 async save(input:unknown,id?:string) {
   const data=validateMembershipPlan(input);
   if(id && !await this.prisma.membershipPlan.findUnique({where:{id}})) throw new AppException(40401,"会员等级不存在",404);
   const stored={...data,prices:data.prices.map(price=>({...price}))};
   const plan=id ? await this.prisma.membershipPlan.update({where:{id},data:stored}) : await this.prisma.membershipPlan.create({data:stored});
   return {...plan,prices:data.prices.map(p=>({...p,...calculateMembershipPrice(p)}))};
 }
 async me(userId:string) {
   const now=new Date();
   const periods=await this.prisma.membershipPeriod.findMany({where:{userId,endsAt:{gt:now}},orderBy:{startsAt:"asc"}});
   const current=periods.find(p=>p.startsAt<=now)??null;
   return {current,upcoming:periods.filter(p=>p.startsAt>now),membershipCredits:current?.remainingCredits??0};
 }
 async settings() {
   const setting=await this.prisma.systemConfig.findUnique({where:{key:"membership.freeLearnerLimit"}});
   return {freeLearnerLimit:setting?Number(setting.value):1};
 }
 async saveSettings(input:unknown) {
   const limit=integer((input as {freeLearnerLimit?:unknown})?.freeLearnerLimit,1,999);
   await this.prisma.systemConfig.upsert({where:{key:"membership.freeLearnerLimit"},create:{key:"membership.freeLearnerLimit",label:"非会员学习者额度",value:String(limit),group:"membership"},update:{value:String(limit)}});
   return {freeLearnerLimit:limit};
 }
 async snapshot(packageCode:string):Promise<MembershipSnapshot> {
   const parts=packageCode.split(":");
   if(parts.length!==3 || parts[0]!=="membership" || !MEMBERSHIP_PERIODS.includes(parts[2] as MembershipBillingPeriod)) throw invalid();
   const plan=await this.prisma.membershipPlan.findFirst({where:{id:parts[1],isEnabled:true}});
   const price=(plan?.prices as unknown as MembershipPrice[]|undefined)?.find(p=>p.period===parts[2]&&p.isEnabled);
   if(!plan || !price) throw new AppException(40001,"会员等级或付费周期未开放",400);
   return {planId:plan.id,name:plan.name,rank:plan.rank,storageGb:plan.storageGb,learnerLimit:plan.learnerLimit,benefits:plan.benefits as Prisma.InputJsonValue,period:price.period,credits:price.credits,amountCny:calculateMembershipPrice(price).amountCny};
 }
}
