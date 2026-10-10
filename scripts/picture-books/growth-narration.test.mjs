import assert from "node:assert/strict";
import test from "node:test";
let helpers={};try{helpers=await import("./growth-narration.mjs");}catch(error){if(error.code!=="ERR_MODULE_NOT_FOUND")throw error;}
const page=()=>({position:1,caption:"原来我是蝉！",narration:"原来我是蝉！",textInImage:true,imageUrl:"https://r.abeiai.com/test.webp",audioUrl:null,audioTaskId:null});
const book=()=>({id:"abei-growth-forest-armor",pageCount:12,pages:Array.from({length:13},(_,position)=>({...page(),position}))});
const ready=(p)=>({key:helpers.growthNarrationKey(book().id,p),voice:"Chinese_huolishaonv",model:"speech-2.8-hd",speed:1,status:"READY",assetId:`asset-${p.position}`,url:`https://r.abeiai.com/audio-${p.position}.mp3`});

test("Minimax配音记录绑定指定音色、模型和原文，未知请求不能重复发起",()=>{
  const {growthNarrationKey:key,planGrowthNarrationEntry:plan}=helpers;assert.equal(typeof key,"function");assert.equal(typeof plan,"function");
  const p=page(),entry=ready(p);
  assert.equal(plan(undefined,book().id,p),"GENERATE");assert.equal(plan(entry,book().id,p),"REUSE");
  assert.equal(plan({...entry,status:"GENERATED",payloadFile:"page.json"},book().id,p),"STORE");
  assert.throws(()=>plan({...entry,status:"REQUESTING"},book().id,p),/未知/);
  assert.throws(()=>plan({...entry,status:"FAILED_RESPONSE"},book().id,p),/失败|核对/);
  assert.equal(plan({...entry,status:"FAILED_RESPONSE",attempts:1,failure:{errorCode:"MINIMAX_STATUS_1002",message:"rate limit exceeded(RPM)"}},book().id,p),"GENERATE");
  assert.throws(()=>plan({...entry,status:"FAILED_RESPONSE",attempts:3,failure:{errorCode:"MINIMAX_STATUS_1002",message:"rate limit exceeded(RPM)"}},book().id,p),/失败|核对/);
  for(const change of [{voice:"yezhiqing_v3.1"},{model:"sambert"},{speed:1.2},{key:"other"}])assert.throws(()=>plan({...entry,...change},book().id,p),/音色|模型|文稿/);
  assert.throws(()=>plan(entry,book().id,{...p,narration:"已编辑的原文"}),/文稿/);
});

test("已经发布目标音频的重跑也须先验证锁内授权，拒绝时不记录成功",async()=>{
  const {finalizeGrowthNarrationPublication:finish}=helpers;assert.equal(typeof finish,"function");
  let recorded=0;
  await assert.rejects(()=>finish(async()=>{throw new Error("最新审核已拒绝");},async()=>{recorded++;}),/拒绝/);
  assert.equal(recorded,0);
  const order=[];await finish(async()=>{order.push("verify");},async()=>{order.push("audit");});
  assert.deepEqual(order,["verify","audit"]);
});

test("整本13段就绪后只添加音频，保持内嵌文字、插画和页序",()=>{
  const {applyGrowthNarrationPages:apply}=helpers;assert.equal(typeof apply,"function");
  const b=book(),entries=Object.fromEntries(b.pages.map(p=>[p.position,ready(p)]));const pages=apply(b,entries);
  assert.equal(pages.length,13);assert.equal(pages[1].textInImage,true);assert.equal(pages[1].imageUrl,b.pages[1].imageUrl);
  assert.equal(pages[1].narration,b.pages[1].narration);assert.equal(b.pages[1].audioUrl,null);
  assert.throws(()=>apply(b,{...entries,12:undefined}),/就绪/);
  assert.deepEqual(apply({...b,pages},entries),pages);
  const changed=structuredClone(b);changed.pages[1].audioUrl="https://r.abeiai.com/manual.mp3";
  assert.throws(()=>apply(changed,entries),/人工|修改/);
});

test("配音审核拒绝其他待审内容、拒绝记录及已被替换的公开版本",()=>{
  const {assertGrowthNarrationPublication:check}=helpers;assert.equal(typeof check,"function");
  const base={title:"树林里的铠甲勇士",pages:[page()]},target=structuredClone(base);target.pages[0].audioUrl="https://r.abeiai.com/test.mp3";
  const hash=JSON.stringify,pub={status:"APPROVED",approvedHash:hash(base),approvedSnapshot:base};
  assert.doesNotThrow(()=>check(pub,null,base,target,hash));
  assert.doesNotThrow(()=>check({...pub,status:"PENDING"},{status:"PENDING",afterSnapshot:target},base,target,hash));
  assert.throws(()=>check(pub,{status:"REJECTED"},base,target,hash),/拒绝/);
  assert.throws(()=>check({...pub,status:"PENDING"},{status:"PENDING",afterSnapshot:{}},base,target,hash),/待审/);
  assert.throws(()=>check({...pub,approvedSnapshot:{...base,title:"其他内容"}},null,base,target,hash),/公开|版本/);
  assert.throws(()=>check({...pub,approvedHash:"other"},null,base,target,hash),/公开|版本/);
});
