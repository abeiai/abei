import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildNarrationJobs,narrationVoice,narrationModel,narrationSpeed} from './tutu-narration.mjs';
export const seriesTitle='图图来到新城市';
export const ownerId='abei-lele-studio';
export const bookId=slug=>`abei-tutu-${slug}`;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const audioKey=(slug,position)=>`${slug}:${position===0?'cover':String(position).padStart(2,'0')}`;
export const imageKey=audioKey;
export const filename=(position,extension)=>`${position===0?'cover':`spread-${String(position).padStart(2,'0')}`}.${extension}`;
export function assertTutuPublicationState(publication,submission,materialReview,target){
 if(materialReview&&['PENDING','REJECTED'].includes(materialReview.status))throw Error('已有独立课件待审或被拒绝');
 if(publication&&(publication.status==='REJECTED'||publication.currentHash!==target.hash||!isDeepStrictEqual(publication.currentSnapshot,target.snapshot)||publication.approvedHash&&(publication.approvedHash!==target.hash||!isDeepStrictEqual(publication.approvedSnapshot,target.snapshot))))throw Error('课件状态或快照与授权版本冲突');
 if(submission&&(submission.status==='REJECTED'||submission.snapshotHash!==target.hash||!isDeepStrictEqual(submission.snapshot,target.snapshot)||submission.coverToken||submission.coverUrl&&submission.coverUrl!==target.libraryUrl||submission.status==='APPROVED'&&submission.reviewedByAdminId!==target.adminId))throw Error('单本投稿状态、封面或快照与授权版本冲突');
}
export function assertProductionTarget(env){
 const db=new URL(env.DATABASE_URL);
 if(env.APP_BASE_URL!=='https://new.abeiai.com'||env.S3_PUBLIC_BASE_URL!=='https://r.abeiai.com'||env.UPLOAD_DRIVER!=='s3'||db.pathname!=='/abei'||db.username!=='abei'||db.port!=='3604'||!['postgres','abei-prod-postgres'].includes(db.hostname))throw Error('只允许授权的 abei 正式环境');
}
export function validateTutuInventories(series,images,narration){
 if(series.title!==seriesTitle||series.books.length!==12||series.books.some((b,i)=>b.seriesNumber!==i+1||b.pages.length!==8||b.pages.some((p,j)=>p.position!==j+1||p.caption!==p.narration)))throw Error('系列文稿必须为12册，每册8个连续跨页');
 if(images.assets?.length!==108||new Set(images.assets.map(a=>`${a.book}:${a.position}`)).size!==108)throw Error('108张选稿不完整或重复');
 if(narration.series!==seriesTitle||narration.voiceId!==narrationVoice||narration.model!==narrationModel||narration.speed!==narrationSpeed||Object.keys(narration.entries).length!==108)throw Error('配音数量或全局参数错误');
 for(const job of buildNarrationJobs(series)){
  const a=images.assets.find(a=>a.book===job.book&&a.position===job.position),n=narration.entries[job.key];
  if(!a||Math.abs(a.width/a.height-(job.position?1.6:.8))>.005||!/^[a-f0-9]{64}$/.test(a.sha256)||a.review!=='VISUALLY_REVIEWED'||!n||n.status!=='READY'||n.text!==job.text||n.voiceId!==narrationVoice||n.model!==narrationModel||n.speed!==narrationSpeed||!/^[a-f0-9]{64}$/.test(n.sha256)||!(n.durationSeconds>1))throw Error(`图文配音不匹配：${job.key}`);
 }
}
export function buildTutuBookRecord(book,images,audios){
 if(!Number.isInteger(book.seriesNumber)||book.seriesNumber<1||book.seriesNumber>12||book.pages.length!==8||images.length!==9||audios.length!==9)throw Error('绘本页数或编号不符');
 const pages=Array.from({length:9},(_,position)=>{
  const imageUrl=images[position],audioUrl=audios[position];
  for(const value of [imageUrl,audioUrl]){const url=new URL(value);if(url.origin!=='https://r.abeiai.com'||url.username||url.password)throw Error('仅允许指定R2素材');}
  const p=book.pages[position-1];
  return {position,caption:p?.caption??book.title,narration:p?.narration??`${seriesTitle}。${book.title}。`,textInImage:true,imagePrompt:p?.scene??book.coverScene??book.title,imageUrl,audioUrl,imageTaskId:null,audioTaskId:null};
 });
 return {id:bookId(String(book.seriesNumber).padStart(2,'0')),userId:ownerId,title:book.title,brief:`${seriesTitle}｜第${book.seriesNumber}册 ${book.title}。3–8岁亲子共读。`,theme:'慢热社交、接纳差异、互补合作与母子温情',audience:'幼儿园',style:'classic-oil',aspectRatio:'4:5',isSpread:true,pageCount:8,status:'COMPLETED',messages:[],plot:book.pages.map(p=>p.caption).join('\n\n'),characters:Object.entries(book.characters).map(([name,description])=>({name,description,imageUrl:null})),pages};
}
