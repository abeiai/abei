import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLiveSources} from './source-verify.mjs';

test('在线来源页、署名和会话缺失时禁止发布', async () => {
 await assert.rejects(() => verifyLiveSources({source_id:7,pages:[]},{},()=>{},async()=>({ok:false})));
});

test('来源会话仅用于 StoryWeaver 请求并在临时错误后重试', async () => {
 const calls=[]; let detailsAttempts=0;
 const fetcher=async (url,options={}) => {
  calls.push({url,options});
  if(url.endsWith('/init-session'))return {ok:true,headers:{getSetCookie:()=>['_session_id=test-session; Path=/; HttpOnly']}};
  if(url.includes('/story_pages/'))return {ok:true,json:async()=>({data:{pages:[]}})};
  if(url.includes('/stories/')){if(++detailsAttempts===1)throw Error('temporary failure');return {ok:true,json:async()=>({data:{id:7}})};}
  throw Error('unexpected URL');
 };
 await verifyLiveSources({source_id:7,pages:[]},{id:7},()=>{},fetcher);
 assert.equal(detailsAttempts,2);
 for(const call of calls.filter(x=>!x.url.endsWith('/init-session')))assert.equal(call.options.headers.Cookie,'_session_id=test-session');
});

test('不接受缺失或不安全的来源会话 cookie', async () => {
 for(const value of [[],['other=value; Path=/'],['_session_id=invalid\r\ninjected; Path=/']]){
  await assert.rejects(()=>verifyLiveSources({source_id:7,pages:[]},{},()=>{},async()=>({ok:true,headers:{getSetCookie:()=>value}})));
 }
});
