import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,assertSame,assertCoverOnly,bindTransaction} from './encyclopedia-grid-guards.mjs';
test('only a new cover is allowed; text and members remain frozen',()=>{
 const before={name:'小小百科翻翻书',summary:'20册',tags:['绘本'],coverMediaId:'old',items:[{materialId:'book-01'}]};
 assert.doesNotThrow(()=>assertCoverOnly(before,{...before,coverMediaId:'new'}));
 for(const changed of [{name:'changed'},{items:[]},{summary:'changed'},{tags:[]}])assert.throws(()=>assertCoverOnly(before,{...before,coverMediaId:'new',...changed}));
 assert.throws(()=>assertCoverOnly(before,before));
});
test('content digests tolerate database date serialization, reject changed artwork',()=>{
 assert.equal(digest({b:2,a:new Date('2026-10-16T10:00:00Z')}),digest({a:'2026-10-16T10:00:00',b:2}));
 assert.throws(()=>assertSame({imageUrl:'old'},{imageUrl:'new'}));
});
test('service operations reuse the locked transaction',async()=>{
 let count=0;const tx={item:{},$queryRaw(){count++;return this.item;}};
 const service=bindTransaction({prisma:null},tx);
 assert.equal(await service.prisma.$transaction(t=>t.$queryRaw()),tx.item);
 assert.equal(count,1);
});
