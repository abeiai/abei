import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBooks,assertLocalTarget,buildBookRecord} from './our-homes-publication.mjs';
const books=JSON.parse(readFileSync(new URL('./our-homes-series-data.json',import.meta.url)));
const urls=Array.from({length:17},(_,i)=>`https://r.abeiai.com/uploads/our-homes-${i}.png`);
const env={APP_BASE_URL:'http://localhost:3600',DATABASE_URL:'postgresql://abei:p@postgres:3604/abei?schema=public',S3_PUBLIC_BASE_URL:'https://r.abeiai.com',UPLOAD_DRIVER:'s3'};
test('定稿十二册与每册十六跨页完整',()=>assert.equal(validateBooks(books),true));
test('拒绝缺页、重复册与更改选稿',()=>{for(const change of [b=>b.pop(),b=>b[0].pages.pop(),b=>b[1].slug='01',b=>b[0].images[0].sha256='x']){const b=structuredClone(books);change(b);assert.throws(()=>validateBooks(b));}});
test('只允许本地abei与指定R2',()=>{assert.doesNotThrow(()=>assertLocalTarget(env));for(const patch of [{APP_BASE_URL:'https://new.abeiai.com'},{S3_PUBLIC_BASE_URL:'https://example.com'},{DATABASE_URL:'postgresql://abei:p@postgres:3324/xueleai'},{DATABASE_URL:env.DATABASE_URL+'&host=elsewhere'}])assert.throws(()=>assertLocalTarget({...env,...patch}));});
test('绘本保留封面加16跨页、嵌图文字与无配音状态',()=>{const r=buildBookRecord(books[0],urls);assert.ok(r);assert.equal(r.pages.length,17);assert.equal(r.pageCount,16);assert.equal(r.aspectRatio,'4:5');assert.equal(r.isSpread,true);assert.equal(r.id,'abei-our-homes-01');assert.ok(r.pages.every((p,i)=>p.position===i&&p.textInImage&&p.audioUrl===null));assert.equal(r.pages[1].caption,books[0].pages[0].caption);assert.match(r.pages[1].caption,/动物小博士/);});
test('拒绝非本系列素材域名和缺图',()=>{assert.throws(()=>buildBookRecord(books[0],urls.slice(1)));assert.throws(()=>buildBookRecord(books[0],urls.map(()=> 'https://example.com/x.png')));});

test('拒绝待审、拒审、人工改稿和投稿封面冲突',async()=>{
 const {assertPublicationState}=await import('./our-homes-publication.mjs');
 const target={hash:'same',snapshot:{pages:['定稿']},libraryUrl:urls[0],adminId:'admin'};
 const publication={status:'APPROVED',currentHash:target.hash,approvedHash:target.hash,currentSnapshot:target.snapshot,approvedSnapshot:target.snapshot};
 const submission={status:'APPROVED',snapshotHash:target.hash,snapshot:target.snapshot,coverUrl:urls[0],reviewedByAdminId:'admin'};
 assert.doesNotThrow(()=>assertPublicationState(publication,submission,null,target));
 for(const state of ['PENDING','REJECTED'])assert.throws(()=>assertPublicationState(publication,submission,{status:state},target));
 assert.throws(()=>assertPublicationState({...publication,currentHash:'changed'},submission,null,target));
 assert.throws(()=>assertPublicationState(publication,{...submission,coverUrl:urls[1]},null,target));
 assert.throws(()=>assertPublicationState(publication,{...submission,status:'REJECTED'},null,target));
});
