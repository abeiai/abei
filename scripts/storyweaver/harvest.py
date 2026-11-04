#!/usr/bin/env python3
"""Save StoryWeaver English titles from a fixed catalog, retaining source records and image hashes."""
import argparse, base64, concurrent.futures, hashlib, html.parser, json, os, pathlib, re, shlex, struct, subprocess, sys, threading, time, urllib.parse, zlib

LEVEL_LABELS={'1':'Level 1','2':'Level 2','3':'Level 3','4':'Level 4','5':'Level 1 (Emergent Readers)'}
def valid_slug(sid,slug):
 return isinstance(sid,int) and isinstance(slug,str) and len(slug)<=200 and slug.startswith(str(sid)+'-') and not any(c in slug for c in '/\\\x00') and '..' not in slug
class TextParser(html.parser.HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.parts=[]
 def handle_data(self,x):self.parts.append(x)
 def handle_starttag(self,tag,attrs):
  if tag=='br':self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ('p','div','li'):self.parts.append('\n')
def html_text(value):
 p=TextParser();p.feed(value or '');return '\n'.join(s.strip() for s in ''.join(p.parts).splitlines()).strip()
def source_text_proof(page,text):
 parts=[str(page['id']),str(page['position']),page.get('content') or '']
 for box in sorted(page.get('boxes') or [],key=lambda b:b.get('position') or 0):parts.extend([str(box.get('position') or 0),box.get('content') or ''])
 return hashlib.sha256('\0'.join(parts+[text]).encode('utf-8')).hexdigest()
def extract_story_pages(detail,pages,canonical=None):
 end=detail.get('lastPagePosition'); sid=detail.get('id')
 if detail.get('language')!='English' or not isinstance(end,int) or end<2 or end>500:raise ValueError('missing English story or invalid last page')
 selected=sorted((p for p in pages if isinstance(p.get('position'),int) and p['position']<=end),key=lambda p:p['position'])
 if [p['position'] for p in selected]!=list(range(1,end+1)) or any(p.get('story_id')!=sid for p in selected):raise ValueError('page sequence or story id mismatch')
 result=[]
 for p in selected:
  boxes=sorted(p.get('boxes') or [],key=lambda b:b.get('position') or 0)
  text=canonical[str(p['position'])] if canonical is not None else ('\n'.join(t for t in (html_text(b.get('content')) for b in boxes) if t) or html_text(p.get('content')))
  result.append({'position':p['position'],'page_id':p['id'],'template_id':p.get('page_template_id'),'crop_id':p.get('illustration_crop_id'),'text':text,'text_source_proof':source_text_proof(p,text),'boxes':boxes})
 return result
def canonical_texts(pages):
 script=pathlib.Path(__file__).with_name('normalize-source.mjs')
 result=subprocess.run(['node',str(script)],input=json.dumps(pages,ensure_ascii=False).encode(),stdout=subprocess.PIPE,check=True)
 return json.loads(result.stdout)
def choose_object(items,crop,cover=False):
 prefix=f'illustration_crops/{crop}/'; valid=[x for x in items if int(x.get('size',0))>0 and x.get('name','').startswith(prefix) and re.fullmatch(re.escape(prefix)+r'(?:page_landscape|original|large)/[^/]+\.(?:png|jpg|jpeg|webp)',x['name'],re.I)]
 desired=['original','large','page_landscape'] if cover else ['page_landscape','large','original']
 for kind in desired:
  found=[x for x in valid if x['name'].startswith(prefix+kind+'/') and (kind!='page_landscape' or int(x.get('size',0))>=1000) and (kind=='large' or int(x.get('size',0))<=2000000 or not any(y['name'].startswith(prefix+'large/') for y in valid))]
  if len(found)==1:return found[0]
  if len(found)>1:raise ValueError('ambiguous crop image: '+str(crop)+' '+repr([x['name'] for x in found]))
 raise ValueError('no suitable crop image')
_lock=threading.Lock();_last=0
def get(url,auth=False):
 global _last
 if not (url.startswith('https://storyweaver.org.in/node/api/v1/') or url.startswith('https://storage.googleapis.com/')):raise ValueError('untrusted source')
 with _lock:
  delay=.12-(time.monotonic()-_last)
  if delay>0:time.sleep(delay)
  _last=time.monotonic()
 args=['curl','-fsS','--max-time','25']
 if auth:args+=['-b',os.environ.get('STORYWEAVER_COOKIE_FILE','/tmp/abei-cookies'),'-H','locale: en']
 def attempt(command):
  for n in range(3):
   try:return subprocess.check_output(command)
   except subprocess.CalledProcessError:
    if n==2:raise
    time.sleep(n+1)
 try:return attempt(args+[url])
 except subprocess.CalledProcessError:
  host=os.environ.get('STORYWEAVER_FALLBACK_SSH_HOST');identity=os.environ.get('STORYWEAVER_FALLBACK_SSH_IDENTITY')
  if auth or not url.startswith('https://storage.googleapis.com/') or not host or not identity:raise
  if host!='root@8.130.44.204' or not pathlib.Path(identity).is_file():raise ValueError('invalid fallback host or identity')
  return attempt(['ssh','-i',identity,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=8',host,'curl -fsS --max-time 45 -- '+shlex.quote(url)])

def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_name(path.name+'.tmp');tmp.write_bytes(data);os.replace(tmp,path)
def blank_page_png():
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 width,height=1200,900;raw=(b'\x00'+b'\xff'*(width*3))*height
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
def blank_image(page,out):
 data=blank_page_png();rel=f'images/page-{page["position"]:03d}.png';atomic(out/rel,data)
 return {'file':rel,'origin':'generated_blank','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'dimensions':[1200,900]}
def png_size(data):
 if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data)>24:return struct.unpack('>II',data[16:24])
 if data[:4]==b'RIFF' and data[8:12]==b'WEBP' and len(data)>=30:
  if data[12:16]==b'VP8X':return (1+int.from_bytes(data[24:27],'little'),1+int.from_bytes(data[27:30],'little'))
  if data[12:16]==b'VP8L' and data[20]==0x2f:
   bits=int.from_bytes(data[21:25],'little');return ((bits&0x3fff)+1,((bits>>14)&0x3fff)+1)
  if data[12:16]==b'VP8 ' and data[23:26]==b'\x9d\x01\x2a':return (int.from_bytes(data[26:28],'little')&0x3fff,int.from_bytes(data[28:30],'little')&0x3fff)
  return None
 if not data.startswith(b'\xff\xd8'):return None
 i=2
 while i+9<len(data):
  if data[i]!=0xff:i+=1;continue
  marker=data[i+1];i+=2
  if marker in (0xd8,0xd9) or 0xd0<=marker<=0xd7:continue
  length=int.from_bytes(data[i:i+2],'big')
  if length<2 or i+length>len(data):return None
  if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
   return (int.from_bytes(data[i+5:i+7],'big'),int.from_bytes(data[i+3:i+5],'big'))
  i+=length
 return None
def harvest(book,base):
 sid=book['id'];slug=book['slug']
 if not valid_slug(sid,slug) or book['level'] not in LEVEL_LABELS:raise ValueError('invalid catalog book')
 out=base/slug;manifest_path=out/'harvest.json'
 if manifest_path.exists():
  m=json.loads(manifest_path.read_text())
  if m['source_id']!=sid:raise ValueError('existing manifest mismatch')
  detail=json.loads((out/'details.raw.json').read_text());raw=json.loads((out/'story-pages.raw.json').read_text());raw_pages=raw['data']['pages'];legacy=extract_story_pages(detail,raw_pages);expected=extract_story_pages(detail,raw_pages,canonical_texts(raw_pages));changed=False
  if detail['id']!=sid or str(detail.get('level'))!=book['level'] or bool(detail.get('isGif'))!=bool(book.get('isGif')):raise ValueError('saved detail differs from fixed catalog')
  if len(expected)!=len(m['pages']):raise ValueError('existing page count mismatch')
  for page,original,prior in zip(m['pages'],expected,legacy):
   if any(page.get(k)!=original[k] for k in ('position','page_id','crop_id')):raise ValueError('existing page identity differs from source')
   page['template_id']=original['template_id']
   if page.get('text')!=original['text']:
    if page.get('text')!=prior['text']:raise ValueError('existing page text differs from source')
    if not changed and not (out/'harvest.precanonical.json').exists():atomic(out/'harvest.precanonical.json',manifest_path.read_bytes())
    page['text']=original['text'];changed=True
   page['text_source_proof']=original['text_source_proof']
  for p in m['pages']:
   if p['image'] is None and p['crop_id'] is None and p['template_id']==24 and p['text'].strip():p['image']=blank_image(p,out)
   if p.get('image'):
    image=out/p['image']['file']; data=image.read_bytes()
    if hashlib.sha256(data).hexdigest()!=p['image']['sha256']:raise ValueError('existing file hash mismatch')
    if p['image'].get('origin')!='generated_blank' and not p['image'].get('source_md5'):
     obj=urllib.parse.urlsplit(p['image']['url']).path.removeprefix('/static.storyweaver.org.in/')
     metadata=json.loads(get('https://storage.googleapis.com/storage/v1/b/static.storyweaver.org.in/o/'+urllib.parse.quote(obj,safe='')))
     if not metadata.get('md5Hash') or base64.b64encode(hashlib.md5(data).digest()).decode()!=metadata['md5Hash']:raise ValueError('existing source object hash mismatch')
     p['image']['source_md5']=metadata['md5Hash']
  warnings=[]
  if any(p['image'] is None for p in m['pages']):warnings.append('page_without_illustration')
  if detail.get('isGif'):warnings.append('animated_story')
  if m['pages'][0]['text']:warnings.append('cover_text_needs_layout')
  if not detail.get('authors') or not detail.get('illustrators') or not detail.get('publisher'):warnings.append('missing_attribution')
  m['warnings']=warnings;atomic(manifest_path,(json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode());return m
 detail=json.loads(get('https://storyweaver.org.in/node/api/v1/stories/'+str(sid),True))['data'];raw=json.loads(get('https://storyweaver.org.in/node/api/v1/story_pages/'+str(sid),True))
 if detail['id']!=sid or str(detail.get('level'))!=book['level']:raise ValueError('detail differs from fixed catalog')
 if bool(detail.get('isGif'))!=bool(book.get('isGif')):raise ValueError('animation status differs from fixed catalog')
 pages=extract_story_pages(detail,raw['data']['pages'],canonical_texts(raw['data']['pages']));atomic(out/'details.raw.json',json.dumps(detail,ensure_ascii=False,indent=2).encode());atomic(out/'story-pages.raw.json',json.dumps(raw,ensure_ascii=False,indent=2).encode())
 def image_for(p):
  crop=p['crop_id']
  if crop is None:
   if p['template_id']!=24 or not p['text'].strip():return None
   return blank_image(p,out)
  if not isinstance(crop,int) or crop<=0:raise ValueError('invalid crop id')
  params=urllib.parse.urlencode({'prefix':f'illustration_crops/{crop}/','maxResults':100}); listing=json.loads(get('https://storage.googleapis.com/storage/v1/b/static.storyweaver.org.in/o?'+params)); items=listing.get('items',[])
  obj=choose_object(items,crop,p['position']==1)
  def download(o):
   url='https://storage.googleapis.com/static.storyweaver.org.in/'+urllib.parse.quote(o['name'],safe='/'); data=get(url)
   if len(data)!=int(o['size']):raise ValueError('image size mismatch')
   if not o.get('md5Hash') or base64.b64encode(hashlib.md5(data).digest()).decode()!=o['md5Hash']:raise ValueError('source image hash mismatch')
   return url,data
  url,data=download(obj); size=png_size(data)
  if size and min(size)<300 and '/page_landscape/' in obj['name']:
   obj=choose_object(items,crop,True);url,data=download(obj);size=png_size(data)
  if not size or min(size)<300:raise ValueError('image format invalid or resolution too small: '+str(crop)+' '+str(size)+' '+obj['name'])
  ext=pathlib.PurePosixPath(obj['name']).suffix.lower(); rel=f'images/page-{p["position"]:03d}{ext}';atomic(out/rel,data)
  return {'file':rel,'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'source_md5':obj['md5Hash'],'dimensions':size}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:images=list(ex.map(image_for,pages))
 for p,im in zip(pages,images):p['image']=im
 warnings=[]
 if any(p['image'] is None for p in pages):warnings.append('page_without_illustration')
 if book.get('isGif'):warnings.append('animated_story')
 if pages[0]['text']:warnings.append('cover_text_needs_layout')
 if not detail.get('authors') or not detail.get('illustrators') or not detail.get('publisher'):warnings.append('missing_attribution')
 m={'source_id':sid,'source_slug':slug,'source_url':'https://storyweaver.org.in/en/stories/'+urllib.parse.quote(slug),'catalog_index':book['index'],'english_level_code':int(book['level']),'english_level_label':LEVEL_LABELS[book['level']],'is_gif':bool(book.get('isGif')),'warnings':warnings,'pages':pages}
 atomic(manifest_path,(json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode());return m

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--catalog',required=True);parser.add_argument('--out',required=True);parser.add_argument('--start',type=int,default=1);parser.add_argument('--end',type=int);parser.add_argument('--progress');args=parser.parse_args()
 books=json.loads(pathlib.Path(args.catalog).read_text())['books'];out=pathlib.Path(args.out);end=args.end or len(books);progress_path=pathlib.Path(args.progress) if args.progress else out/'harvest-progress.json';progress=json.loads(progress_path.read_text()) if progress_path.exists() else {};progress.setdefault('books',{}); failures=[]
 for index in range(args.start,min(end,len(books))+1):
  book=books[index-1]
  try:
   result=harvest(book,out); progress['books'][str(book['id'])]={'index':index,'status':'saved','warnings':result['warnings']};print(json.dumps({'index':index,'id':book['id'],'pages':len(result['pages']),'warnings':result['warnings']},ensure_ascii=False),flush=True)
  except Exception as e:
   failures.append({'index':index,'id':book.get('id'),'error':str(e)});progress['books'][str(book.get('id'))]={'index':index,'status':'failed','error':str(e)};print(json.dumps({'failed':failures[-1]},ensure_ascii=False),file=sys.stderr,flush=True)
  progress['last_attempted_index']=index;atomic(progress_path,(json.dumps(progress,ensure_ascii=False,indent=2)+'\n').encode())
 return 1 if failures else 0
if __name__=='__main__':sys.exit(main())
