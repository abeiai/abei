import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import test from 'node:test';
const root=resolve(import.meta.dirname,'../..');
const applicationSources = [
  'apps/web/src/components/textbook/textbook-page-sections.tsx',
  'apps/web/src/app/textbook/[...segments]/page.tsx',
  'apps/web/src/app/api/video-guide/uploads/media/route.ts',
  'apps/web/src/app/uploads/typing-content/[...path]/route.ts'
];
const privateRuntimeAssets = [
  'uploads/runtime.png', 'apps/api-core/uploads/runtime.png', 'apps/web/uploads/runtime.png',
  'apps/web/public/uploads/runtime.png', 'apps/api-core/logs/runtime.txt',
  'textbook/local.md', 'textbook-markdown-assets/page.png', 'apps/web/textbook/local.md',
  'apps/web/src/app/uploads/secret.pem', 'apps/api-core/private-data/creator-assets/private.png'
];
test('immutable archive excludes private material and validates before extraction', () => {
  const dir=mkdtempSync(join(tmpdir(),'abei-release-'));
  try {
    const git=(args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
    git(['init','-q']); git(['config','user.email','fixture@example.test']); git(['config','user.name','Fixture']);
    for(const file of [...applicationSources,...privateRuntimeAssets,'package.json','apps/web/src/page.tsx','apps/web/public/yinbiao/generated/ts.png','packages/database/generated/client/index.js','apps/api-core/private-data/creator-assets/secret.png','apps/web/public/private-creator-assets/secret.png','deploy/certs/key.pem','deploy/data/db.dump','.env.production','packages/database/prisma/migrations/test/migration.sql','textbook/private.pdf','apps/web/public/book.pdf']) {
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
    for (const file of applicationSources) assert.ok(listing.split('\n').includes(file), `missing application source: ${file}`);
    for (const file of privateRuntimeAssets) assert.ok(!listing.split('\n').includes(file), `private runtime asset included: ${file}`);
    assert.doesNotMatch(listing,/private|secret|\.env|\.pdf|\.pem|deploy\/data|deploy\/certs/);
    const extract=join(dir,'extract');mkdirSync(extract);
    execFileSync('python3',[join(root,'scripts/release/abei-archive.py'),'extract',sha,archive,extract]);
    assert.equal(readFileSync(join(extract,'RELEASE_COMMIT'),'utf8').trim(),sha);
    for (const file of applicationSources) assert.equal(readFileSync(join(extract,file),'utf8'),'synthetic fixture');
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
  assert.ok(source.includes('docker buildx build --allow network.host --network host --load'));
  assert.ok(source.includes('--tag "abei-api-core:$sha" "$stage"'));
  assert.ok(source.includes('build web ai-gateway'));
  assert.ok(source.indexOf('docker buildx build --allow network.host --network host --load') < source.indexOf('touch deploy/data/state/maintenance.enabled'));
  assert.ok(source.indexOf('stop api-core') < source.indexOf('pg_dump'));
  assert.ok(source.indexOf('pg_dump') < source.indexOf('run --rm migrate'));
  assert.ok(source.indexOf('run --rm migrate') < source.indexOf('rm deploy/data/state/maintenance.enabled'));
  assert.doesNotMatch(source,/migrate reset|db:seed|down -v/);
});

test('server source synchronization retains named source routes and preserves runtime uploads', () => {
  const dir=mkdtempSync(join(tmpdir(),'abei-source-sync-'));
  try {
    const stage=join(dir,'stage'), target=join(dir,'target');
    for (const base of [stage,target]) for(const folder of ['apps','packages','scripts']) mkdirSync(join(base,folder),{recursive:true});
    const preserved=['apps/api-core/uploads/runtime.png','apps/web/uploads/runtime.png','packages/database/generated/client/index.js'];
    for(const file of applicationSources) { mkdirSync(join(stage,file,'..'),{recursive:true}); writeFileSync(join(stage,file),'new source'); }
    for(const file of preserved) for(const [base,content] of [[stage,'must not replace runtime'],[target,'existing private runtime']]) {
      mkdirSync(join(base,file,'..'),{recursive:true}); writeFileSync(join(base,file),content);
    }
    const source=readFileSync(join(root,'scripts/release/abei-server-release.sh'),'utf8');
    const start=source.indexOf('for directory in apps packages scripts; do');
    const end=source.indexOf('\nrsync -a --delete "$stage/deploy/abei/"',start);
    assert.ok(start >= 0 && end > start);
    // Execute the actual sync block with only the fixed production destination replaced by a temp fixture.
    const block=source.slice(start,end).replaceAll('"/opt/abei/$directory/"','"$target/$directory/"');
    const result=spawnSync('bash',['-c','set -euo pipefail; stage="$1"; target="$2";\n'+block,'--',stage,target],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    for(const file of applicationSources) assert.equal(readFileSync(join(target,file),'utf8'),'new source',file);
    for(const file of preserved) assert.equal(readFileSync(join(target,file),'utf8'),'existing private runtime',file);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('private stage extraction under umask 077 keeps source directories traversable and file modes intact', () => {
  const dir=mkdtempSync(join(tmpdir(),'abei-extract-modes-'));
  try {
    const git=(args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
    git(['init','-q']); git(['config','user.email','fixture@example.test']); git(['config','user.name','Fixture']);
    const files=[
      ['apps/ai-gateway/app/audio_gateway/providers/__init__.py',0o644],
      ['apps/web/src/app/uploads/typing-content/route.ts',0o644],
      ['scripts/release/abei-fixture.sh',0o755]
    ];
    for(const [file,mode] of files) {mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),'fixture source');chmodSync(join(dir,file),mode);}
    git(['add','.']);git(['commit','-qm','fixture']);const sha=git(['rev-parse','HEAD']);
    const archive=join(dir,'release.tar');
    execFileSync('python3',[join(root,'scripts/release/abei-archive.py'),'pack',sha,archive],{cwd:dir});
    const target=join(dir,'private-stage');mkdirSync(target,{mode:0o700});chmodSync(target,0o700);
    execFileSync('bash',['-c','umask 077; exec python3 "$@"','--',join(root,'scripts/release/abei-archive.py'),'extract',sha,archive,target]);
    assert.equal(statSync(target).mode & 0o777,0o700,'stage root must remain private');
    for(const [file,mode] of files) {
      const path=join(target,file);
      assert.equal(readFileSync(path,'utf8'),'fixture source');
      assert.equal(statSync(path).mode & 0o777,mode,'regular/executable file mode preserved');
      for(let parent=dirname(path);parent!==target;parent=dirname(parent)) assert.equal(statSync(parent).mode & 0o777,0o755,`source directory must be traversable: ${parent}`);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
