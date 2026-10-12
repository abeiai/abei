import {readFile,writeFile,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertProductionTarget,audioKey} from './tutu-publication.mjs';
import {acquireNarrationLock} from './tutu-narration.mjs';
const root=resolve(import.meta.dirname,'../..');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
process.env.UPLOAD_DRIVER='s3';assertProductionTarget(process.env);
createRequire(resolve(root,'apps/api-core/package.json'))('reflect-metadata');
const {AudioService}=await import(pathToFileURL(resolve(root,'apps/api-core/dist/audio/audio.service.js')));
const {getPrismaClient}=await import(pathToFileURL(resolve(root,'packages/database/dist/index.js')));
const audio=new AudioService();
const source=JSON.parse(await readFile(resolve(args['--root'],'production/narration-manifest.json')));
const uploaded=JSON.parse(await readFile(args['--checkpoint']));
const out=args['--output'];
const releaseLock=await acquireNarrationLock(out+'.lock');
let report;
try{report=JSON.parse(await readFile(out));}catch(e){if(e.code!=='ENOENT')throw e;report={series:source.series,method:'ASR for omissions only; pronunciation requires listening',entries:{}};}
if(report.series!==source.series)throw Error('错误的核对记录');
const save=async()=>{await writeFile(out+'.tmp',JSON.stringify(report,null,2));await rename(out+'.tmp',out);};
try{
 for(const entry of Object.values(source.entries)){
  const key=entry.key,old=report.entries[key];
  if(old){if(old.status!=='READY'||old.audioHash!==entry.sha256)throw Error('识别结果未知或音频变化：'+key);continue;}
  const asset=uploaded.assets[`audio:${String(entry.book).padStart(2,'0')}:${entry.position}`];
  if(asset?.status!=='READY'||asset.sha256!==entry.sha256)throw Error('已上传音频不匹配');
  report.entries[key]={status:'REQUESTING',audioHash:entry.sha256,expected:entry.text};await save();
  const result=await audio.generateSrtFromMediaUrl({mediaUrl:asset.url,mediaMimeType:'audio/mpeg',mediaName:'tutu-'+audioKey(String(entry.book).padStart(2,'0'),entry.position),language:'zh'});
  report.entries[key]={...report.entries[key],status:'READY',...result};await save();
  console.log(JSON.stringify({ready:key,text:result.punctuatedText||result.subtitleText}));
 }
}finally{await getPrismaClient().$disconnect();await releaseLock();}
