import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {persistDeterministicAsset} from './storage.mjs';
test('断电后按固定对象键对账，重试不重复上传或重复建行',async()=>{
 const objects=new Map(),rows=new Map(),bytes=Buffer.from('picture'),hash=createHash('sha256').update(bytes).digest('hex');let puts=0,creates=0;
 const adapter={get:async k=>objects.get(k)??null,put:async(k,b)=>{puts++;objects.set(k,b)},find:async id=>rows.get(id)??null,create:async row=>{creates++;rows.set(row.id,row);return row}};
 const options={sourceId:123,key:'page-2',owner:'owner',bytes,mime:'image/png',sha256:hash};
 const one=await persistDeterministicAsset(adapter,options);const two=await persistDeterministicAsset(adapter,options);assert.deepEqual(one,two);assert.equal(puts,1);assert.equal(creates,1);
 rows.clear();await persistDeterministicAsset(adapter,options);assert.equal(puts,1);assert.equal(creates,2);
});
test('固定键若已有不同内容不得覆盖',async()=>{
 let puts=0;const bytes=Buffer.from('picture');const adapter={get:async()=>Buffer.from('wrong'),put:async()=>{puts++},find:async()=>null,create:async()=>{}};
 await assert.rejects(()=>persistDeterministicAsset(adapter,{sourceId:123,key:'page-2',owner:'owner',bytes,mime:'image/png',sha256:createHash('sha256').update(bytes).digest('hex')}));assert.equal(puts,0);
});
