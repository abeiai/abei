import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {validateApprovedBundle,planSyncRow,syncTables} from './encyclopedia-production-sync.mjs';
test('同步重跑只复用逐字段相同的行，拒绝修改线上行',()=>{
 const row={id:'source',status:'APPROVED',createdAt:'2026-10-14T08:00:00.000Z'};
 assert.equal(planSyncRow(null,row),'INSERT');assert.equal(planSyncRow({...row},row),'REUSE');
 assert.throws(()=>planSyncRow({...row,status:'PENDING'},row),/冲突/);
});
test('同步限定10个业务表并拒绝不完整身份',()=>{
 assert.equal(syncTables.length,10);
 assert.throws(()=>validateApprovedBundle({format:'abei-encyclopedia-approved-sync-v1',tables:{}},{}));
});
test('真实审核包必须包含20册441张图片，无音频且所有原图哈希与选稿一致',{skip:!process.env.ENCYCLOPEDIA_TEST_BUNDLE},async()=>{
 const domain=createRequire(import.meta.url)('../../apps/api-core/dist/courses/course-domain.js');
 const b=JSON.parse(await readFile(process.env.ENCYCLOPEDIA_TEST_BUNDLE));
 assert.deepEqual(validateApprovedBundle(b,domain),{books:20,interiors:400,images:441,audio:0,submissions:20});
 for(const mutate of [
  c=>c.tables.picture_books.pop(),
  c=>c.tables.audio_assets.push({id:'unexpected'}),
  c=>c.assets['image:01:0'].sha256='1'.repeat(64),
  c=>c.tables.course_review_requests[0].afterSnapshot.items[0].materialHash='changed',
  c=>c.tables.picture_book_submissions[0].reviewedByAdminId='another',
  c=>c.tables.course_revision_items[0].videoGuideLessonId='other',
  c=>c.tables.course_material_publications[0].learningFlashcardDeckId='other',
  c=>c.adminId='other',
  c=>c.tables.picture_book_submissions[0].publishedHash='other',
  c=>c.assets.resource.sha256='2'.repeat(64),
  c=>c.assets['library:01'].dimensions=[1600,1600],
  c=>c.tables.media_assets[0].mimeType='image/jpeg',
  c=>c.tables.media_assets[0].createdByAdminId=c.adminId,
  c=>c.tables.course_revision_items[0].pinnedHash='other',
 ]){const changed=structuredClone(b);mutate(changed);assert.throws(()=>validateApprovedBundle(changed,domain));}
});
