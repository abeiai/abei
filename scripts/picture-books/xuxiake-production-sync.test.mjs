import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateApprovedBundle,planSyncRow,syncTables} from './xuxiake-production-sync.mjs';
test('同步只允许10个表，逐字段相同才复用，拒绝覆盖',()=>{
 assert.equal(syncTables.length,10);const row={id:'same',status:'APPROVED'};assert.equal(planSyncRow(null,row),'INSERT');assert.equal(planSyncRow({...row},row),'REUSE');assert.throws(()=>planSyncRow({...row,status:'PENDING'},row));assert.throws(()=>validateApprovedBundle({tables:{}},{}));
});
test('真实审批包的16册图文音频、272段指定音色和封面不可被替换',{skip:!process.env.XUXIAKE_TEST_BUNDLE},async()=>{
 const domain=await import('../../apps/api-core/dist/courses/course-domain.js');const b=JSON.parse(await readFile(process.env.XUXIAKE_TEST_BUNDLE));
 assert.deepEqual(validateApprovedBundle(b,domain),{books:16,interiors:256,images:289,audio:272,submissions:16});
 for(const change of [x=>x.tables.picture_books.pop(),x=>x.tables.audio_assets.pop(),x=>x.assets['audio:01:1'].sha256='1'.repeat(64),x=>x.assets.resource.sha256='1'.repeat(64),x=>x.tables.picture_books[0].pages[1].caption='改稿',x=>x.tables.picture_book_submissions[0].publishedHash='changed',x=>x.tables.course_revision_items[0].pinnedHash='changed',x=>x.tables.course_review_requests[0].afterSnapshot.items[0].materialHash='changed',x=>x.tables.audio_assets[0].userId='other',x=>x.adminId='other']){const c=structuredClone(b);change(c);assert.throws(()=>validateApprovedBundle(c,domain));}
});
