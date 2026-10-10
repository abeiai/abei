import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {applyApprovedGrowthBundle,validateApprovedGrowthBundle} from './growth-production-sync.mjs';

test('独立 PostgreSQL 验证失败回滚、完整同步、零写入重放和线上冲突保护',{skip:!process.env.GROWTH_SYNC_TEST_URL||!process.env.GROWTH_SYNC_TEST_BUNDLE},async()=>{
 const url=new URL(process.env.GROWTH_SYNC_TEST_URL);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3608');assert.equal(url.pathname,'/abei_growth_sync_test');
 const {Client}=createRequire(new URL('../../packages/database/package.json',import.meta.url))('pg');
 const domain=createRequire(import.meta.url)('../../apps/api-core/dist/courses/course-domain.js');
 const bundle=JSON.parse(await readFile(process.env.GROWTH_SYNC_TEST_BUNDLE,'utf8'));validateApprovedGrowthBundle(bundle,domain);
 for(const mutate of [
  b=>{b.tables.course_review_requests.find(r=>r.scope==='COURSE_REVISION').afterSnapshot.items[0].materialHash='wrong';},
  b=>{b.tables.course_revision_items[0].videoGuideLessonId='other-material';},
  b=>{b.tables.course_review_requests.find(r=>r.scope==='MATERIAL_CHANGE').courseId='other-course';},
  b=>{const image=b.images[0];image.url='https://outside.example/picture-books/forged.webp';b.tables.media_assets.find(r=>r.id===image.id).url=image.url;},
 ]){const changed=structuredClone(bundle);mutate(changed);assert.throws(()=>validateApprovedGrowthBundle(changed,domain));}
 const client=new Client({connectionString:url.href});await client.connect();
 try{
  await client.query('INSERT INTO users(id,email,"passwordHash","passwordLoginEnabled",nickname,"updatedAt") VALUES($1,$2,$3,false,$4,now())',[bundle.owner,'lele-studio@abei.example','test-only-disabled-hash','乐乐绘本工作室']);
  await client.query('INSERT INTO admin_users(id,email,name,"passwordHash",role,"updatedAt") VALUES($1,$2,$3,$4,$5,now())',[bundle.adminId,'growth-test-admin@abei.example','测试管理员','test-only-disabled-hash','SUPER_ADMIN']);
  const count=async table=>Number((await client.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
  const apply=()=>applyApprovedGrowthBundle(client,bundle,domain,{testing:true});
  await client.query("CREATE FUNCTION growth_sync_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'induced growth sync failure'; END $$");
  await client.query("CREATE TRIGGER growth_sync_test_abort BEFORE INSERT ON picture_books FOR EACH ROW EXECUTE FUNCTION growth_sync_test_abort()");
  await assert.rejects(apply,/induced growth sync failure/);
  assert.equal(await count('media_assets'),0);assert.equal(await count('audio_assets'),0);assert.equal(await count('courses'),0);
  await client.query('DROP TRIGGER growth_sync_test_abort ON picture_books');await client.query('DROP FUNCTION growth_sync_test_abort()');
  const first=await apply();assert.equal(first.changed,130);assert.equal(await count('picture_books'),4);assert.equal(await count('course_review_requests'),5);
  const repeat=await apply();assert.equal(repeat.changed,0);assert.equal(await count('admin_operation_logs'),6);
  await client.query("UPDATE picture_books SET title='线上人工修改' WHERE id=$1",[bundle.tables.picture_books[0].id]);
  await assert.rejects(apply,/冲突/);
  assert.equal((await client.query('SELECT title FROM picture_books WHERE id=$1',[bundle.tables.picture_books[0].id])).rows[0].title,'线上人工修改');
 }finally{await client.end();}
});
