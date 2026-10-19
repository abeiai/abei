import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {applyBundle,validateApprovedBundle} from './xuxiake-production-sync.mjs';

test('隔离PostgreSQL验证失败回滚、完整同步、零写入重放与人工修改保护',{skip:!process.env.XUXIAKE_SYNC_TEST_URL||!process.env.XUXIAKE_TEST_BUNDLE},async()=>{
 const url=new URL(process.env.XUXIAKE_SYNC_TEST_URL);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3607');assert.equal(url.pathname,'/abei_xuxiake_sync_test');
 const {Client}=createRequire(new URL('../../packages/database/package.json',import.meta.url))('pg');
 const domain=await import('../../apps/api-core/dist/courses/course-domain.js');
 const bundle=JSON.parse(await readFile(process.env.XUXIAKE_TEST_BUNDLE));validateApprovedBundle(bundle,domain);
 const client=new Client({connectionString:url.href});await client.connect();
 try{
  await client.query('INSERT INTO users(id,email,"passwordHash","passwordLoginEnabled",nickname,"updatedAt") VALUES($1,$2,$3,false,$4,now())',[bundle.owner,'lele-studio@abei.example','test-disabled-hash','乐乐绘本工作室']);
  await client.query('INSERT INTO admin_users(id,email,name,"passwordHash",role,"updatedAt") VALUES($1,$2,$3,$4,$5,now())',[bundle.adminId,'xuxiake-test@abei.example','测试管理员','test-disabled-hash','SUPER_ADMIN']);
  const count=async table=>Number((await client.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
  const beforeMedia=await count('media_assets'),beforeBooks=await count('picture_books');
  const apply=()=>applyBundle(client,bundle,domain,{testing:true});
  await client.query("CREATE FUNCTION xuxiake_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'induced our homes sync failure'; END $$");
  await client.query("CREATE TRIGGER xuxiake_test_abort BEFORE INSERT ON picture_books FOR EACH ROW EXECUTE FUNCTION xuxiake_test_abort()");
  await assert.rejects(apply,/induced our homes sync failure/);
  assert.equal(await count('media_assets'),beforeMedia);assert.equal(await count('picture_books'),beforeBooks);
  await client.query('DROP TRIGGER xuxiake_test_abort ON picture_books');await client.query('DROP FUNCTION xuxiake_test_abort()');
  const first=await apply();assert.equal(first.changed,646);assert.equal(first.inserted.picture_books,16);assert.equal(first.inserted.media_assets,289);assert.equal(first.inserted.audio_assets,272);
  const repeat=await apply();assert.equal(repeat.changed,0);assert.ok(repeat.outsideUnchanged&&repeat.authorAndWalletUnchanged);
  const id=bundle.tables.picture_books[0].id;
  await client.query("UPDATE picture_books SET title='线上人工修改' WHERE id=$1",[id]);
  await assert.rejects(apply,/冲突/);
  assert.equal((await client.query('SELECT title FROM picture_books WHERE id=$1',[id])).rows[0].title,'线上人工修改');
 }finally{await client.end();}
});
