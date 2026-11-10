#!/usr/bin/env python3
"""Transfer and publish one verified StoryWeaver snapshot at a time in source order."""
import argparse, hashlib, io, json, pathlib, re, shlex, subprocess, tarfile, uuid

CATALOG=pathlib.Path('/Users/ericword/storyweaver/english-new-arrivals-catalog.json')
ROOT=pathlib.Path('/Users/ericword/storyweaver/english-new-arrivals')
IDENTITY='/Users/ericword/abei/abeibei.pem'
HOST='root@8.130.44.204'
CONTAINER='abei-prod-api-core-1'
SSH=['ssh','-i',IDENTITY,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=12',HOST]
RUNNER=pathlib.Path(__file__).resolve().parent
RUN_ID=uuid.uuid4().hex
RUN_PATH='/tmp/storyweaver-runner-'+RUN_ID
INPUT_PATH='/tmp/storyweaver-import/'+RUN_ID
SCRIPTS=['publication.mjs','storage.mjs','source-verify.mjs','publish.mjs','publish-first.mjs']

def digest(data):return hashlib.sha256(data).hexdigest()
def remote(command,data=None):
 try:return subprocess.run(SSH+[command],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=900).stdout.decode().strip()
 except subprocess.CalledProcessError as error:
  detail=error.stderr.decode(errors='replace')[-4000:]
  detail=re.sub(r'(?i)(_session_id|access.?key|secret|authorization)([=:]\s*)[^\s;]+',r'\1\2[redacted]',detail)
  raise RuntimeError('远程操作失败: '+detail) from None
def shell(args):return ' '.join(shlex.quote(x) for x in args)
def write_container(path,data):
 cmd=f'docker exec -i {CONTAINER} sh -c '+shlex.quote('umask 077; cat > '+shlex.quote(path))
 remote(cmd,data)

def package(book):
 slug=book['slug']; sid=book['id']
 if not isinstance(sid,int) or not slug.startswith(str(sid)+'-') or '/' in slug or '\\' in slug or '..' in slug:raise ValueError('不安全的目录')
 source=ROOT/slug
 m=json.loads((source/'harvest.json').read_text());d=json.loads((source/'details.raw.json').read_text())
 if m['source_id']!=sid or m['catalog_index']!=book['index'] or str(m['english_level_code'])!=book['level'] or m['warnings']:raise ValueError('来源记录存在警告或不匹配')
 paths=['harvest.json','details.raw.json','story-pages.raw.json']
 for p in m['pages']:
  im=p['image'];rel=pathlib.PurePosixPath(im['file'])
  if rel.is_absolute() or '..' in rel.parts or len(rel.parts)!=2 or rel.parts[0]!='images':raise ValueError('图片路径无效')
  path=source/str(rel)
  if path.is_symlink() or digest(path.read_bytes())!=im['sha256']:raise ValueError('本地图片哈希不匹配')
  paths.append(str(rel))
 if len(set(paths))!=len(paths):raise ValueError('重复图片路径')
 out=io.BytesIO()
 with tarfile.open(fileobj=out,mode='w') as archive:
  for rel in paths:
   path=source/rel
   if path.is_symlink() or not path.is_file():raise ValueError('素材不是常规文件')
   data=path.read_bytes();info=tarfile.TarInfo(rel);info.size=len(data);info.mode=0o600;archive.addfile(info,io.BytesIO(data))
 return m,d,out.getvalue()

def prepare(catalog):
 remote(f'docker exec {CONTAINER} sh -c '+shlex.quote(f'umask 077; mkdir -p {RUN_PATH} {INPUT_PATH} /app/private-creator-assets/storyweaver-import'))
 for name in SCRIPTS:write_container(RUN_PATH+'/'+name,(RUNNER/name).read_bytes())
 # A changed directory snapshot must not silently replace a running campaign.
 path='/app/private-creator-assets/storyweaver-import/catalog.json';expected=digest(catalog)
 check=f'docker exec {CONTAINER} sh -c '+shlex.quote(f'if [ -f {path} ]; then sha256sum {path}; else printf missing; fi')
 result=remote(check)
 if result=='missing':
  tmp=path+'.'+RUN_ID;write_container(tmp,catalog)
  remote(f'docker exec {CONTAINER} sh -c '+shlex.quote(f'ln {tmp} {path} 2>/dev/null || true; rm -f {tmp}'))
  result=remote(check)
 if result.split()[0]!=expected:raise ValueError('服务器已有不同的来源目录快照')

def publish(book,catalog_sha,mode):
 manifest,detail,blob=package(book);sid=book['id'];target=f'{INPUT_PATH}/{sid}';archive=f'{INPUT_PATH}/{sid}.tar'
 remote(f'docker exec {CONTAINER} sh -c '+shlex.quote(f'mkdir -p {target}'))
 write_container(archive,blob)
 result=remote(f'docker exec {CONTAINER} sha256sum {archive}')
 if result.split()[0]!=digest(blob):raise ValueError('私有传输哈希不一致')
 remote(f'docker exec {CONTAINER} tar -xf {archive} -C {target}')
 script='publish-first.mjs' if sid==698069 else 'publish.mjs'
 for phase in (['inspect','publish','verify'] if mode=='publish' else ['inspect']):
  cmd=shell(['docker','exec',CONTAINER,'node',RUN_PATH+'/'+script,'--mode='+phase,'--input='+target,'--catalog-sha='+catalog_sha])
  print(remote(cmd),flush=True)
 if mode=='publish':
  bookid='storyweaver-698069-i-love-to-read' if sid==698069 else f'storyweaver-{sid}'
  verify="""import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [id,path,runner]=process.argv.slice(1);
const {attribution,displayStoryText}=await import(runner+'/publication.mjs');
const m=JSON.parse(await readFile(path+'/harvest.json'));
const d=JSON.parse(await readFile(path+'/details.raw.json'));
const source=attribution(m,d);
const r=await fetch('https://abeiai.com/api/public/picture-books/'+id+'/play',{signal:AbortSignal.timeout(30000)});
const j=await r.json(),b=j.data;
const first=m.source_id===698069;
const cp=first?JSON.parse(await readFile('/app/private-creator-assets/storyweaver-import/698069-backfill.json')):null;
if(!r.ok||j.code!==0||b?.englishLevel!==m.english_level_code||b?.title!==displayStoryText(d.name)||b?.pages?.length!==m.pages.length||b.pages.some((p,i)=>p.position!==i||p.caption!==displayStoryText(i===0?(first?'':m.pages[i].text||d.name):m.pages[i].text)||!p.imageUrl||p.audioUrl)||Object.keys(source).some(k=>b.source?.[k]!==source[k]))throw Error('公开阅读 API 的文字、图片、等级或来源不一致');
for(const [i,p] of b.pages.entries()){const img=await fetch(new URL(p.imageUrl,'https://abeiai.com'),{signal:AbortSignal.timeout(30000)});
if(!img.ok||createHash('sha256').update(Buffer.from(await img.arrayBuffer())).digest('hex')!==(first&&i===0?cp.storyCoverSha:m.pages[i].image.sha256))throw Error('公网页面图片哈希不一致 '+i)}console.log('public API verified '+id);
"""
  print(remote(shell(['docker','exec',CONTAINER,'node','--input-type=module','-e',verify,bookid,target,RUN_PATH])),flush=True)
  remote(f'docker exec {CONTAINER} rm -rf {target} {archive}')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--start',type=int,default=1);parser.add_argument('--end',type=int);parser.add_argument('--mode',choices=['publish','inspect','local-check'],default='local-check');args=parser.parse_args()
 raw=CATALOG.read_bytes();catalog=json.loads(raw);books=catalog['books'];end=args.end or len(books)
 if args.start<1 or end<args.start or end>len(books):raise ValueError('索引范围无效')
 try:
  if args.mode!='local-check':prepare(raw)
  for book in books[args.start-1:end]:
   if args.mode=='local-check':
    m,_,_=package(book);print(json.dumps({'index':book['index'],'id':book['id'],'pages':len(m['pages'])}),flush=True)
   else:publish(book,digest(raw),args.mode)
 finally:
  if args.mode!='local-check':
   try:remote(f'docker exec {CONTAINER} rm -rf {RUN_PATH} {INPUT_PATH}')
   except Exception as error:print('临时目录清理失败:',error,flush=True)
if __name__=='__main__':main()
