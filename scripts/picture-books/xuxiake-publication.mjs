import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync} from 'node:fs';
import {assertAbEiImportTarget} from './lele-import.mjs';
export const seriesTitle='徐霞客游记绘本版';
export const seriesSummary='跟随徐霞客的脚步，读懂山川与求真的勇气。16册历史地理绘本，每册16页正文，适合8–12岁阅读，含指定音色逐页配音。';
export const seriesTags=['绘本','徐霞客','历史地理','有声绘本'];
export const ownerId='abei-lele-studio';
export const approvalAdminId='cmupmv9tf000196lgbh9s8wf0';
export const approvalAdminIdentity='aefb9826ce5041571ec2661e395b7b86';
export const localSystemId='7690572978282909730';
export const productionSystemId='7694665003199217698';
export const voiceId='ttv-voice-2026082422142526-HkQ1ESKA';
export const books=JSON.parse(readFileSync(new URL('./xuxiake-series-data.json',import.meta.url)));
export const selectedCover=JSON.parse(readFileSync(new URL('./xuxiake-cover-data.json',import.meta.url)));
export const bookId=slug=>`abei-xuxiake-${slug}`;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashPattern=/^[a-f0-9]{64}$/;
const safeFile=value=>typeof value==='string'&&!value.startsWith('/')&&!value.split('/').includes('..')&&!value.includes('\\');
export function validateBooks(value){
 if(!Array.isArray(value)||value.length!==16)throw Error('必须有16册定稿');
 for(const [i,b] of value.entries()){
  if(b.slug!==String(i+1).padStart(2,'0')||!b.title||b.pages.length!==16||b.images.length!==17||b.audio.length!==17||b.pages.some((p,j)=>p.position!==j+1||!p.caption||p.caption!==p.narration||!p.scene))throw Error('文稿必须完整且逐页一致');
  for(const [position,a] of b.images.entries())if(!safeFile(a.file)||!a.file.endsWith('.png')||!hashPattern.test(a.sha256)||!isDeepStrictEqual(a.dimensions,[1400,1120])||a.review!=='PASS_SELECTED_VERSION')throw Error('选稿路径、比例、哈希或审校状态错误');
  for(const [position,a] of b.audio.entries())if(!safeFile(a.output)||!a.output.endsWith('.mp3')||!hashPattern.test(a.sha256)||a.voiceId!==voiceId||a.model!=='speech-2.8-hd'||a.speed!==0.94||!(a.durationSeconds>1)||a.text!==(position?b.pages[position-1].caption:`徐霞客游记。${b.title}。`)||a.listeningReview!=='PENDING_NOT_LISTENED')throw Error('配音与定稿或指定音色不匹配');
 }
 if(new Set(value.flatMap(b=>b.images.map(a=>a.sha256))).size!==272||new Set(value.flatMap(b=>b.audio.map(a=>a.sha256))).size!==272)throw Error('选稿素材重复');
 return true;
}
export function assertLocalTarget(env){
 assertAbEiImportTarget(env.DATABASE_URL);
 const u=new URL(env.DATABASE_URL);if(u.username!=='abei')throw Error('数据库用户不符');
 if(!['http://localhost:3600','http://127.0.0.1:3600'].includes(env.APP_BASE_URL)||env.S3_PUBLIC_BASE_URL!=='https://r.abeiai.com'||env.UPLOAD_DRIVER!=='s3')throw Error('只允许本地abei与指定R2');
}
export function buildBookRecord(book,images,audios){
 if(book.pages.length!==16||images.length!==17||audios.length!==17)throw Error('页数或配音不符');
 for(const source of [...images,...audios]){const url=new URL(source);if(url.origin!=='https://r.abeiai.com'||url.username||url.password||url.search||url.hash)throw Error('仅允许指定R2素材');}
 const pages=images.map((imageUrl,position)=>{const p=book.pages[position-1];return {position,caption:p?.caption??book.title,narration:book.audio[position].text,textInImage:false,imagePrompt:p?.imagePrompt??book.coverPrompt,imageUrl,audioUrl:audios[position],imageTaskId:null,audioTaskId:null};});
 return {id:bookId(book.slug),userId:ownerId,title:book.title,brief:`${seriesTitle}｜第${Number(book.slug)}册 ${book.title}。`,theme:'徐霞客、历史地理、实地观察与求真精神',audience:'小学',style:'watercolor',aspectRatio:'5:4',isSpread:false,pageCount:16,status:'COMPLETED',messages:[],plot:book.pages.map(p=>p.caption).join('\n\n'),characters:[{name:'徐霞客',description:'明代旅行家，烟蓝灰交领长袍、黑色布冠、竹杖与覆油布竹书箱；年龄及胡须随篇章变化。',imageUrl:null}],pages};
}
export function assertPublicationState(publication,submission,materialReview,target){
 if(materialReview&&['PENDING','REJECTED'].includes(materialReview.status))throw Error('已有独立课件待审或被拒绝');
 if(publication&&(publication.status==='REJECTED'||publication.currentHash!==target.hash||!isDeepStrictEqual(publication.currentSnapshot,target.snapshot)||publication.approvedHash&&(publication.approvedHash!==target.hash||!isDeepStrictEqual(publication.approvedSnapshot,target.snapshot))))throw Error('课件状态或快照与授权版本冲突');
 if(submission&&(submission.status==='REJECTED'||submission.snapshotHash!==target.hash||!isDeepStrictEqual(submission.snapshot,target.snapshot)||submission.coverToken||submission.coverUrl&&submission.coverUrl!==target.libraryUrl||submission.status==='APPROVED'&&submission.reviewedByAdminId!==target.adminId))throw Error('单本投稿状态、封面或快照与授权版本冲突');
}
export function assertPendingSubmission(row,target){
 if(row?.id!==target.id||row.pictureBookId!==target.bookId||row.status!=='PENDING'||row.snapshotHash!==target.hash||!isDeepStrictEqual(row.snapshot,target.snapshot)||row.coverUrl!==target.libraryUrl||row.coverToken!==null)throw Error('批准前投稿版本、快照或封面发生变化');
}
validateBooks(books);
