import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {buildNarrationJobs,narrationVoice as voiceId,narrationModel as modelName,narrationSpeed as speed,planAudioResume,pronunciationFor,canRetryRateLimit,acquireNarrationLock} from './tutu-narration.mjs';

const root=resolve(import.meta.dirname,'../..');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const dataRoot=resolve(args['--root']??resolve(root,'output/picture-books/tutu-new-city'));
const series=JSON.parse(await readFile(resolve(dataRoot,'series.json')));
if(series.title!=='图图来到新城市'||series.books.length!==12||series.books.some(b=>b.pages.length!==8))throw Error('只允许本次完整12册文稿');
const pilot=args['--mode']==='pilot';
if(!['pilot','generate'].includes(args['--mode']))throw Error('指定 --mode=pilot/generate');
const pilotText='302号房。图图踮起脚，拧开水阀。他们量一量，拧一拧。班长弯弯。呱呱摸摸贝壳的小脊背。花坛里窸窣一声，米娅怕扎疼朋友。铁桦树干旁，红风筝挣开了线。银笛藏得看不见。小果蝠坐在长椅旁。老工坊，通风处。壳壳来到树荫下。';
const jobs=pilot?[{key:'pilot',book:0,position:0,text:pilotText,pronunciation:pronunciationFor(pilotText)}]:buildNarrationJobs(series);
const selected=args['--only']?jobs.filter(j=>j.key===args['--only']):jobs;
if(!selected.length)throw Error('没有匹配的配音页');
const manifestFile=resolve(dataRoot,'production',pilot?'narration-pilot.json':'narration-manifest.json');
const sha=x=>createHash('sha256').update(x).digest('hex');
process.loadEnvFile(resolve(root,'.env'));
if(!process.env.POSTGRES_PASSWORD||!['http://localhost:3600','http://127.0.0.1:3600'].includes(process.env.APP_BASE_URL))throw Error('只允许本地abei配置');
process.env.DATABASE_URL=`postgresql://abei:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:3604/abei?schema=public`;
createRequire(resolve(root,'apps/api-core/package.json'))('reflect-metadata');
const {AudioService}=await import(pathToFileURL(resolve(root,'apps/api-core/dist/audio/audio.service.js')));
const {getPrismaClient}=await import(pathToFileURL(resolve(root,'packages/database/dist/index.js')));
const audio=new AudioService();
const releaseLock=await acquireNarrationLock(manifestFile+'.lock');
try{
 const model=await audio.getAudioModelById('cmupm4wcp005izy8oleycz6i8','TTS');
 if(model.providerKey!=='minimax_audio'||model.adapterType!=='MINIMAX_AUDIO'||model.modelName!==modelName)throw Error('配音模型配置不符');
 const endpoint=new URL('/v1/t2a_v2',model.baseUrl);
 if(endpoint.protocol!=='https:'||!['api.minimaxi.com','api.minimax.io'].includes(endpoint.hostname))throw Error('非MiniMax官方接口');
 const key=audio.resolveProviderApiKey(model);if(!key)throw Error('MiniMax未配置密钥');
 let manifest;try{manifest=JSON.parse(await readFile(manifestFile));}catch(e){if(e.code!=='ENOENT')throw e;manifest={series:series.title,provider:'minimax_audio',model:modelName,voiceId,speed,sampleRate:32000,entries:{}};}
 if(manifest.voiceId!==voiceId||manifest.model!==modelName||manifest.speed!==speed||manifest.series!==series.title)throw Error('断点属于其他配音任务');
 const save=async()=>{await writeFile(manifestFile+'.tmp',JSON.stringify(manifest,null,2)+'\n');await rename(manifestFile+'.tmp',manifestFile);};
 for(const job of selected){
  const folder=pilot?resolve(dataRoot,'production/audio-review'):resolve(dataRoot,'books',String(job.book).padStart(2,'0'),'audio');
  await mkdir(folder,{recursive:true});
  const file=resolve(folder,pilot?'pilot.mp3':job.position===0?'cover.mp3':`spread-${String(job.position).padStart(2,'0')}.mp3`);
  const inputHash=sha(JSON.stringify([job.text,voiceId,modelName,speed,32000,job.pronunciation]));
  let old=manifest.entries[job.key];
  if(old?.status==='FAILED_RESPONSE'&&args['--retry-rate-limit']===job.key){
   const receipt=JSON.parse(await readFile(file.replace('.mp3','-receipt.json')));
   if(!canRetryRateLimit(receipt)||old.inputHash!==inputHash)throw Error('没有明确的无音频RPM拒绝回执，禁止重发');
   manifest.recoveryHistory??=[];manifest.recoveryHistory.push({...old,receipt,recoveredAt:new Date().toISOString(),reason:'明确RPM拒绝，无音频；降至每次请求至少间隔5秒'});
   delete manifest.entries[job.key];old=null;await save();
  }
  if(old && planAudioResume(old,inputHash,await readFile(file).then(sha).catch(()=>null))==='REUSE')continue;
  await delay(5000);
  const entry=manifest.entries[job.key]={...job,voiceId,model:modelName,speed,inputHash,status:'REQUESTING',requestedAt:new Date().toISOString()};await save();
  const body={model:modelName,text:job.text,stream:false,output_format:'hex',language_boost:'Chinese',voice_setting:{voice_id:voiceId,speed,vol:1,pitch:0},audio_setting:{sample_rate:32000,bitrate:128000,format:'mp3',channel:1},...(job.pronunciation.length?{pronunciation_dict:{tone:job.pronunciation}}:{})};
  let result,response;
  try{response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(100000)});result=await response.json();}
  catch(e){entry.status='UNKNOWN';entry.error='请求或接收失败，需核对服务商回执';await save();throw Error('配音请求结果未知：'+job.key);}
  await writeFile(resolve(folder,(pilot?'pilot':job.position===0?'cover':`spread-${String(job.position).padStart(2,'0')}`)+'-receipt.json'),JSON.stringify(result));
  if(!response.ok||result?.base_resp?.status_code!==0){Object.assign(entry,{status:'FAILED_RESPONSE',httpStatus:response.status,providerStatus:result?.base_resp?.status_code,requestId:result?.trace_id});await save();throw Error('MiniMax返回失败：'+job.key);}
  const hex=result?.data?.audio;if(typeof hex!=='string'||!/^(?:[0-9a-fA-F]{2})+$/.test(hex))throw Error('MiniMax音频格式异常');
  const bytes=Buffer.from(hex,'hex');if(bytes.length<1000)throw Error('音频过短');
  await writeFile(file+'.tmp',bytes);await rename(file+'.tmp',file);
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',file],{encoding:'utf8'}).trim());
  Object.assign(entry,{status:'READY',output:file.slice(dataRoot.length+1),sha256:sha(bytes),sizeBytes:bytes.length,durationSeconds:duration,requestId:result.trace_id??null,usageCharacters:result.extra_info?.usage_characters??null,completedAt:new Date().toISOString(),listeningReview:'PENDING'});await save();
  console.log(JSON.stringify({ready:job.key,durationSeconds:duration,completed:Object.values(manifest.entries).filter(e=>e.status==='READY').length,total:jobs.length}));
 }
}finally{await getPrismaClient().$disconnect();await releaseLock();}
