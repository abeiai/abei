import test from 'node:test';
import assert from 'node:assert/strict';
import {books,validateBooks,buildBookRecord,assertLocalTarget,assertPendingSubmission,assertPublicationState,selectedCover} from './xuxiake-publication.mjs';
const images=Array.from({length:17},(_,i)=>`https://r.abeiai.com/uploads/test-${i}.png`),audio=images.map((_,i)=>`https://r.abeiai.com/uploads/test-${i}.mp3`);
test('16册选稿必须完整绑定272份原图、272份指定音色配音和原文',()=>{
 assert.equal(validateBooks(books),true);
 for(const change of [b=>b.pop(),b=>b[0].pages.pop(),b=>b[1].slug='01',b=>b[0].images[0].sha256='x',b=>b[0].audio[1].text='改稿',b=>b[0].audio[0].voiceId='other',b=>b[0].images[0].file='../other.png',b=>b[0].audio[0].output='/tmp/other.mp3']){const b=structuredClone(books);change(b);assert.throws(()=>validateBooks(b));}
 assert.deepEqual(selectedCover.dimensions,[1920,1080]);
});
test('发布保留5:4单页、图外文字、17段配音，拒绝缺失或外域音频',()=>{
 const r=buildBookRecord(books[0],images,audio);assert.equal(r.aspectRatio,'5:4');assert.equal(r.isSpread,false);assert.equal(r.pageCount,16);assert.equal(r.pages.length,17);
 assert.ok(r.pages.every((p,i)=>p.position===i&&!p.textInImage&&p.audioUrl===audio[i]));assert.equal(r.pages[1].caption,books[0].pages[0].caption);assert.equal(r.pages[0].narration,books[0].audio[0].text);
 for(const a of [audio.slice(1),audio.map(()=> 'https://example.com/a.mp3'),audio.map(()=> 'https://r.abeiai.com/a.mp3?bad=1')])assert.throws(()=>buildBookRecord(books[0],images,a));
});
test('本地实例必须为abei3604，拒绝生产、xueleai和目标覆盖参数',()=>{
 const env={DATABASE_URL:'postgresql://abei:p@127.0.0.1:3604/abei',APP_BASE_URL:'http://localhost:3600',S3_PUBLIC_BASE_URL:'https://r.abeiai.com',UPLOAD_DRIVER:'s3'};assert.doesNotThrow(()=>assertLocalTarget(env));
 for(const patch of [{APP_BASE_URL:'https://new.abeiai.com'},{DATABASE_URL:'postgresql://abei:p@localhost:3324/xueleai'},{DATABASE_URL:env.DATABASE_URL+'?host=other'}])assert.throws(()=>assertLocalTarget({...env,...patch}));
});
test('拒绝人工改稿、外来待审/拒审和审核前瞬间变化',()=>{
 const target={id:'s',bookId:'b',hash:'h',snapshot:{pages:['原稿']},libraryUrl:images[0],adminId:'admin'};
 const row={id:'s',pictureBookId:'b',status:'PENDING',snapshotHash:'h',snapshot:target.snapshot,coverUrl:images[0],coverToken:null};assert.doesNotThrow(()=>assertPendingSubmission(row,target));
 for(const patch of [{snapshotHash:'changed'},{snapshot:{}},{coverUrl:images[1]},{coverToken:'busy'},{status:'APPROVED'}])assert.throws(()=>assertPendingSubmission({...row,...patch},target));
 assert.throws(()=>assertPublicationState(null,null,{status:'REJECTED'},target));assert.throws(()=>assertPublicationState(null,{...row,snapshotHash:'changed'},null,target));
});
