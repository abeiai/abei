import assert from 'node:assert/strict';
import test from 'node:test';
import { LearnerAccessService } from '../src/profiles/learner-access.service.js';

for (const mode of ['ACCOUNT', 'LEARNER'] as const) {
  for (const [rank, expiry, allowed] of [[0, null, false], [2, null, true], [0, new Date(0), true]] as const) {
    test(`${mode} 场景等级校验 rank=${rank} early=${expiry} allowed=${allowed}`, async () => {
      const service = new LearnerAccessService({
        learner: { findFirst: async () => ({ id: 'learner' }) },
        aiScenario: { findFirst: async () => ({ id: 'scenario', slug: 'typing', isEnabled: true, minimumMembershipRank: 2, membershipEarlyAccessUntil: expiry }) },
        membershipPeriod: { findFirst: async () => rank ? { rank } : null },
        learnerScenarioAuthorization: { findUnique: async () => ({}) }
      } as never);
      const request = service.assertScenarioAuthorized({ userId: 'user', mode, learnerId: mode === 'LEARNER' ? 'learner' : null } as never, 'typing');
      if (allowed) await request;
      else await assert.rejects(request, /会员/);
    });
  }
}

test('内部主账号组合任务仍校验根应用会员等级', async () => {
  const service = new LearnerAccessService({ aiScenario: { findFirst: async () => ({ id: 'root', slug: 'daodu', isEnabled: true, minimumMembershipRank: 3, membershipEarlyAccessUntil: null }) }, membershipPeriod: { findFirst: async () => null } } as never);
  await assert.rejects(service.runWithScenarioAuthorization({ userId: 'user', mode: 'ACCOUNT', learnerId: null }, 'daodu', () => service.assertInternalScenarioAuthorized({ userId:'user', learnerId:null }, 'article-to-speech')), /会员/);
});

test('会员有效期查询排除未来和已到期周期，并使用等级快照', async () => {
  const { currentMembership, hasMembershipResourceAccess } = await import('../src/profiles/membership-access.js');
  const now = new Date('2026-09-12T00:00:00Z');
  const prisma = { membershipPeriod: { findFirst: async (query: unknown) => {
    assert.deepEqual(query, {where:{userId:'user', startsAt:{lte:now},endsAt:{gt:now}},orderBy:[{rank:'desc'},{endsAt:'desc'}]});
    return null;
  } } };
  assert.equal(await currentMembership(prisma as never, 'user', now), null);
  assert.equal(await hasMembershipResourceAccess(prisma as never, 'user', now), false);
});

test('会员等级为零的场景无需会员查询', async () => {
 const { assertMembershipScenarioAccess } = await import('../src/profiles/membership-access.js');
 await assertMembershipScenarioAccess({} as never,'user',{minimumMembershipRank:0,membershipEarlyAccessUntil:null});
});

test('高级别抢先体验在截止前拦截、截止时开放', async () => {
 const { assertMembershipScenarioAccess } = await import('../src/profiles/membership-access.js');
 const until = new Date('2026-09-12T00:00:00Z');
 const prisma = {membershipPeriod:{findFirst:async()=>({rank:1})}};
 const scenario={minimumMembershipRank:2,membershipEarlyAccessUntil:until};
 await assert.rejects(assertMembershipScenarioAccess(prisma as never,'user',scenario,new Date(until.getTime()-1)), /会员/);
 await assertMembershipScenarioAccess(prisma as never,'user',scenario,until);
});

test('主账号语音合成不能绕过场景会员校验', async () => {
 const { AudioController } = await import('../src/audio/audio.controller.js');
 let executed = false;
 const controller = new AudioController({createTtsTask:async()=>{executed=true;}} as never,
 {me:async()=>({id:'user'})} as never,
 {requireSelected:async()=>({userId:'user',mode:'ACCOUNT',learnerId:null})} as never,
 {assertScenarioAuthorized:async (_subject:unknown, slug:string)=>{assert.equal(slug,'article-to-speech');throw new Error('会员等级不足');}} as never, {} as never);
 await assert.rejects(controller.createTtsTask({}, {} as never), /会员等级不足/);
 assert.equal(executed,false);
});

test('主账号字帖生成不能绕过场景会员校验', async () => {
 const { CopybooksController } = await import('../src/copybooks/copybooks.controller.js');
 let executed = false;
 const controller = new CopybooksController({me:async()=>({id:'user'})} as never, {} as never,
 {generate:async()=>{executed=true;}} as never,
 {requireAccount:async()=>({userId:'user',mode:'ACCOUNT',learnerId:null})} as never,
 {assertScenarioAuthorized:async (_subject:unknown, slug:string)=>{assert.equal(slug,'zitie');throw new Error('会员等级不足');}} as never);
 await assert.rejects(controller.generate({}, {} as never), /会员等级不足/);
 assert.equal(executed,false);
});

for (const mode of ['ACCOUNT', 'LEARNER'] as const) {
 test(`${mode} 子场景的会员限制不能被公开根场景绕过`, async () => {
  const root = { id:'root',slug:'english-guided-study-material',isEnabled:true,minimumMembershipRank:0,membershipEarlyAccessUntil:null };
  const child = {...root,id:'child',slug:'english-guided-study-practice',minimumMembershipRank:9};
  const service=new LearnerAccessService({
   learner:{findFirst:async()=>({id:'learner'})},
   aiScenario:{findFirst:async ({where}: {where:{slug?:string;OR?:Array<{slug?:string}>}})=>where.slug === root.slug || where.OR?.some(item=>item.slug===root.slug) ? root : child},
   learnerScenarioAuthorization:{findUnique:async()=>({})},
   membershipPeriod:{findFirst:async()=>null}
  } as never);
  const subject={userId:'user',mode,learnerId:mode==='ACCOUNT'?null:'learner'} as never;
  await assert.rejects(service.assertScenarioAuthorized(subject,child.slug),/会员/);
  await assert.rejects(service.runWithScenarioAuthorization(subject,root.slug,()=>service.assertInternalScenarioAuthorized({userId:'user',learnerId:mode==='ACCOUNT'?null:'learner'},child.slug)),/会员/);
 });
}
