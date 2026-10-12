import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
const root=resolve(import.meta.dirname,'../..');
test('immutable archive excludes private material and validates before extraction', () => {
  const dir=mkdtempSync(join(tmpdir(),'abei-release-'));
  try {
    const git=(args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
    git(['init','-q']); git(['config','user.email','fixture@example.test']); git(['config','user.name','Fixture']);
    for(const file of ['package.json','apps/web/src/page.tsx','apps/web/public/yinbiao/generated/ts.png','packages/database/generated/client/index.js','apps/api-core/private-data/creator-assets/secret.png','apps/web/public/private-creator-assets/secret.png','deploy/certs/key.pem','deploy/data/db.dump','.env.production','packages/database/prisma/migrations/test/migration.sql','textbook/private.pdf','apps/web/public/book.pdf']) {
      mkdirSync(join(dir,file,'..'),{recursive:true});writeFileSync(join(dir,file),'synthetic fixture');
    }
    git(['add','.']); git(['commit','-qm','fixture']); const sha=git(['rev-parse','HEAD']);
    const archive=join(dir,'output.tar');
    const pack=spawnSync('python3',[join(root,'scripts/release/abei-archive.py'),'pack',sha,archive],{cwd:dir,encoding:'utf8'});
    assert.equal(pack.status,0,pack.stderr);
    const listing=execFileSync('tar',['tf',archive],{encoding:'utf8'});
    assert.ok(listing.includes('apps/web/src/page.tsx'));assert.ok(listing.includes('migration.sql'));
    assert.ok(listing.includes('apps/web/public/yinbiao/generated/ts.png'), 'intentional public generated asset must survive');
    assert.ok(!listing.includes('packages/database/generated/client/index.js'));
    assert.doesNotMatch(listing,/private|secret|\.env|\.pdf|\.pem|deploy\/data|deploy\/certs/);
    const extract=join(dir,'extract');mkdirSync(extract);
    execFileSync('python3',[join(root,'scripts/release/abei-archive.py'),'extract',sha,archive,extract]);
    assert.equal(readFileSync(join(extract,'RELEASE_COMMIT'),'utf8').trim(),sha);
    assert.equal(readFileSync(join(extract,'apps/web/public/yinbiao/generated/ts.png'),'utf8'),'synthetic fixture');
    assert.notEqual(spawnSync('python3',[join(root,'scripts/release/abei-archive.py'),'extract','0'.repeat(40),archive,extract]).status,0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('server deployment rejects a different destination before invoking Docker', () => {
  const result=spawnSync('bash',[join(root,'scripts/release/abei-server-release.sh'),'0'.repeat(40),'/tmp/nonexistent.tar'],{cwd:tmpdir(),encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/必须在 \/opt\/abei/);
  const source=readFileSync(join(root,'scripts/release/abei-server-release.sh'),'utf8');
  assert.ok(source.indexOf('touch deploy/data/state/maintenance.enabled') < source.indexOf('stop api-core'));
  assert.ok(source.indexOf('stop api-core') < source.indexOf('pg_dump'));
  assert.ok(source.indexOf('pg_dump') < source.indexOf('run --rm migrate'));
  assert.ok(source.indexOf('run --rm migrate') < source.indexOf('rm deploy/data/state/maintenance.enabled'));
  assert.doesNotMatch(source,/migrate reset|db:seed|down -v/);
});
