import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fixture} from './career-production-sync.test.mjs';
import * as sync from './career-production-sync.mjs';
const require=createRequire(import.meta.url),{Client}=createRequire(new URL('../../packages/database/package.json',import.meta.url))('pg');
const domain=require('../../apps/api-core/dist/courses/course-domain.js');
test('真实PostgreSQL同步事务回滚、重放、冲突保护及并发首写', {skip:!process.env.CAREER_SYNC_TEST_URL},async()=>{
 const url=new URL(process.env.CAREER_SYNC_TEST_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3608');assert.equal(url.pathname,'/abei_career_sync_test');
 const client=new Client({connectionString:url.href}),bundle=fixture();await client.connect();
 try{
  assert.deepEqual((await client.query("SELECT current_database() AS db,current_setting('port') AS port")).rows[0],{db:'abei_career_sync_test',port:'3608'});
  const clear=async()=>{await client.query('DELETE FROM courses WHERE id=$1',[bundle.courseId]);await client.query('DELETE FROM course_material_publications WHERE "pictureBookId" IN (SELECT jsonb_array_elements_text($1::jsonb))',[JSON.stringify(bundle.tables.picture_books.map(b=>b.id))]);await client.query('DELETE FROM picture_books WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))',[JSON.stringify(bundle.tables.picture_books.map(b=>b.id))]);await client.query('DELETE FROM media_assets WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))',[JSON.stringify(bundle.tables.media_assets.map(b=>b.id))]);await client.query('DELETE FROM admin_operation_logs WHERE id=$1 OR id=$2',[bundle.tables.admin_operation_logs[0].id,'abei-career-sync-'+sync.syncDigest(bundle).slice(0,24)]);};
  await clear();await client.query('DROP TRIGGER IF EXISTS career_sync_test_abort ON picture_books');await client.query('DROP FUNCTION IF EXISTS career_sync_test_abort()');
  await client.query("INSERT INTO users(id,email,\"passwordHash\",\"passwordLoginEnabled\",nickname,\"updatedAt\") VALUES($1,'lele-studio@abei.example','test-only-disabled-hash',false,'乐乐绘本工作室',now()) ON CONFLICT DO NOTHING",[bundle.owner]);
  await client.query("INSERT INTO admin_users(id,email,name,\"passwordHash\",role,\"updatedAt\") VALUES('career-sync-test-admin','career-test-admin@abei.example','测试管理员','test-only-disabled-hash','SUPER_ADMIN',now()) ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO picture_books(id,\"userId\",title,brief,style,\"pageCount\",messages,characters,pages,\"updatedAt\") VALUES('unrelated-online-book',$1,'既有线上稿','既有线上稿','3d-animation',16,'[]','[]','[]',now()) ON CONFLICT DO NOTHING",[bundle.owner]);
  assert.equal(typeof sync.applyApprovedCareerBundle,'function');
  const apply=c=>sync.applyApprovedCareerBundle(c,bundle,domain,{testing:true});
  const count=async table=>Number((await client.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
  await client.query("CREATE FUNCTION career_sync_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'induced career sync failure'; END $$");
  await client.query("CREATE TRIGGER career_sync_test_abort BEFORE INSERT ON picture_books FOR EACH ROW WHEN (NEW.id='abei-career-veterinarian') EXECUTE FUNCTION career_sync_test_abort()");
  await assert.rejects(()=>apply(client),/induced career sync failure/);
  assert.equal(await count('media_assets'),0);assert.equal(await count('picture_books'),1);assert.equal(await count('courses'),0);
  await client.query('DROP TRIGGER career_sync_test_abort ON picture_books');await client.query('DROP FUNCTION career_sync_test_abort()');
  const first=await apply(client);assert.equal(first.changed,326);assert.equal(await count('course_revision_items'),16);assert.equal(await count('admin_operation_logs'),2);
  const repeat=await apply(client);assert.equal(repeat.changed,0);assert.equal(await count('media_assets'),273);
  await client.query("UPDATE picture_books SET title='线上人工修改' WHERE id='abei-career-doctor'");
  await assert.rejects(()=>apply(client),/冲突|覆盖/);assert.equal((await client.query("SELECT title FROM picture_books WHERE id='abei-career-doctor'")).rows[0].title,'线上人工修改');
  await client.query('UPDATE picture_books SET title=$1 WHERE id=$2',[bundle.tables.picture_books[0].title,bundle.tables.picture_books[0].id]);
  await clear();
  const other=new Client({connectionString:url.href});await other.connect();
  try{const result=await Promise.all([apply(client),apply(other)]);assert.deepEqual(result.map(r=>r.changed).sort((a,b)=>a-b),[0,326]);}finally{await other.end();}
  assert.equal(await count('courses'),1);assert.equal(await count('picture_books'),17);assert.equal(await count('admin_operation_logs'),2);
  assert.equal((await client.query("SELECT title FROM picture_books WHERE id='unrelated-online-book'")).rows[0].title,'既有线上稿');
 }finally{await client.end();}
});
