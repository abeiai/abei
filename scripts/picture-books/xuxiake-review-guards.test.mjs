import test from 'node:test';import assert from 'node:assert/strict';
import {guardedService,assertNewSubmission,assertDraftCourse} from './xuxiake-review-guards.mjs';
test('提交前在服务自身事务内核对状态，拒审竞争不能被重新提交',async()=>{
 let state=null,calls=0;const tx={$queryRawUnsafe:async()=>[],pictureBookSubmission:{findUnique:async()=>state}};
 const service={prisma:{$transaction:async fn=>fn(tx)},async submit(){return this.prisma.$transaction(async()=>{calls++;return 'submitted';});}};
 const guarded=guardedService(service,t=>assertNewSubmission(t,'book'));
 state={id:'s',status:'REJECTED'};await assert.rejects(()=>guarded.submit(),/已有投稿/);assert.equal(calls,0);
 state=null;assert.equal(await guarded.submit(),'submitted');assert.equal(calls,1);
});
test('系列在同一行锁事务内只提交原DRAFT版本，拒绝刚被拒审或修改的版本',async()=>{
 let status='REJECTED',revision='r';const tx={$queryRawUnsafe:async()=>[],course:{findUnique:async()=>({workingRevisionId:revision,workingRevision:{status}})},courseReviewRequest:{findFirst:async()=>null}};
 await assert.rejects(()=>assertDraftCourse(tx,'course','r'),/草稿/);status='DRAFT';revision='changed';await assert.rejects(()=>assertDraftCourse(tx,'course','r'),/草稿/);revision='r';await assertDraftCourse(tx,'course','r');
});
test('真实隔离PostgreSQL与Prisma支持事务内advisory lock返回类型',{skip:!process.env.XUXIAKE_SYNC_TEST_URL},async()=>{
 const url=new URL(process.env.XUXIAKE_SYNC_TEST_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3607');assert.equal(url.pathname,'/abei_xuxiake_sync_test');process.env.DATABASE_URL=url.href;
 const {getPrismaClient}=await import('../../packages/database/dist/index.js');const p=getPrismaClient();try{await p.$transaction(tx=>assertNewSubmission(tx,'test-only-absent-book'));}finally{await p.$disconnect();}
});
