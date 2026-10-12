import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProductionTarget,buildTutuBookRecord,validateTutuInventories,assertTutuPublicationState} from './tutu-publication.mjs';
import {narrationVoice,narrationModel,narrationSpeed} from './tutu-narration.mjs';
const series={title:'图图来到新城市',books:Array.from({length:12},(_,i)=>({seriesNumber:i+1,title:'测试'+i,characters:{图图:'小浣熊'},pages:Array.from({length:8},(_,j)=>({position:j+1,caption:'你好',narration:'你好',scene:'槐树下'}))}))};
const imageEntries=series.books.flatMap(b=>Array.from({length:9},(_,position)=>({book:b.seriesNumber,position,width:position?1600:800,height:1000,sha256:'a'.repeat(64),file:`books/${b.seriesNumber}/${position}.png`,review:'VISUALLY_REVIEWED'})));
const entries=Object.fromEntries(imageEntries.map(i=>[`${String(i.book).padStart(2,'0')}:${i.position?String(i.position).padStart(2,'0'):'cover'}`,{status:'READY',voiceId:narrationVoice,model:narrationModel,speed:narrationSpeed,text:i.position?'你好':`${series.title}。${series.books[i.book-1].title}。`,sha256:'b'.repeat(64),durationSeconds:5}]));
const narration={series:series.title,voiceId:narrationVoice,model:narrationModel,speed:narrationSpeed,entries};
test('all prior material and single-book decisions are checked before publishing',()=>{
 const target={hash:'h',snapshot:{title:'图图'},libraryUrl:'https://r.abeiai.com/library',adminId:'admin'};
 assert.doesNotThrow(()=>assertTutuPublicationState(null,null,null,target));
 const publication={status:'PENDING',currentHash:'h',currentSnapshot:target.snapshot};
 const submission={status:'PENDING',snapshotHash:'h',snapshot:target.snapshot,coverUrl:target.libraryUrl};
 assert.doesNotThrow(()=>assertTutuPublicationState(publication,submission,null,target));
 for(const bad of [{...submission,status:'REJECTED'},{...submission,snapshotHash:'changed'},{...submission,coverUrl:'changed'},{...submission,coverToken:'in-progress'}])assert.throws(()=>assertTutuPublicationState(publication,bad,null,target));
 assert.throws(()=>assertTutuPublicationState({...publication,status:'REJECTED'},submission,null,target));
 assert.throws(()=>assertTutuPublicationState(publication,submission,{status:'PENDING'},target));
});
test('production cannot target another project, domain or storage',()=>{
 const env={APP_BASE_URL:'https://new.abeiai.com',DATABASE_URL:'postgresql://abei:secret@postgres:3604/abei',S3_PUBLIC_BASE_URL:'https://r.abeiai.com',UPLOAD_DRIVER:'s3'};
 assert.doesNotThrow(()=>assertProductionTarget(env));
 for(const [key,value] of Object.entries({APP_BASE_URL:'https://xueleai.com',DATABASE_URL:'postgresql://x:x@localhost:3324/xueleai',S3_PUBLIC_BASE_URL:'https://example.com',UPLOAD_DRIVER:'local'}))assert.throws(()=>assertProductionTarget({...env,[key]:value}));
});
test('all 108 exact narrations and images are required',()=>{
 assert.doesNotThrow(()=>validateTutuInventories(series,{assets:imageEntries},narration));
 const rounded=structuredClone(imageEntries);rounded[1].width=1584;rounded[1].height=993;
 assert.doesNotThrow(()=>validateTutuInventories(series,{assets:rounded},narration));
 rounded[1].width=1300;assert.throws(()=>validateTutuInventories(series,{assets:rounded},narration));
 for(const change of [n=>delete n.entries['01:01'],n=>n.entries['01:01'].text='修改',n=>n.entries['01:01'].status='UNKNOWN',n=>n.speed=1]){const n=structuredClone(narration);change(n);assert.throws(()=>validateTutuInventories(series,{assets:imageEntries},n));}
 assert.throws(()=>validateTutuInventories(series,{assets:[...imageEntries.slice(1),imageEntries[1]]},narration));
});
test('every page retains hidden text, narration, spread geometry and approved R2 assets',()=>{
 const urls=Array.from({length:9},(_,i)=>`https://r.abeiai.com/${i}`);
 const r=buildTutuBookRecord(series.books[0],urls,urls);
 assert.equal(r.id,'abei-tutu-01');assert.equal(r.aspectRatio,'4:5');assert.equal(r.isSpread,true);assert.equal(r.pageCount,8);assert.equal(r.pages.length,9);
 assert.ok(r.pages.every(p=>p.textInImage===true));assert.equal(r.pages[1].narration,'你好');
 assert.throws(()=>buildTutuBookRecord(series.books[0],urls.map(()=> 'https://other.com/a'),urls));
});
