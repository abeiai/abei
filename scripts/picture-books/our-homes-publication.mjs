import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync} from 'node:fs';
import {assertAbEiImportTarget} from './lele-import.mjs';
export const seriesTitle='我们的家';
export const seriesSummary='十二种小动物，十二个温暖的家。12册自然科普绘本，每册16个跨页，亲子共读。';
export const seriesTags=['绘本','动物家园','自然科普','亲子共读'];
export const ownerId='abei-lele-studio';
export const approvalAdminId='cmupmv9tf000196lgbh9s8wf0';
export const approvalAdminIdentity='aefb9826ce5041571ec2661e395b7b86';
export const localSystemId='7690572978282909730';
export const productionSystemId='7694665003199217698';
export const books=JSON.parse(readFileSync(new URL('./our-homes-series-data.json',import.meta.url)));
export const bookId=slug=>`abei-our-homes-${slug}`;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateBooks(value){
 if(!Array.isArray(value)||value.length!==12)throw Error('必须有12册定稿');
 for(const [i,b] of value.entries()){
  if(b.slug!==String(i+1).padStart(2,'0')||!b.title||!b.species||!b.character||b.pages.length!==16||b.images.length!==17||b.pages.some((p,j)=>p.position!==j+1||!p.caption||!p.scene))throw Error('每册必须有16个连续跨页');
  if(b.images.some((a,j)=>!/^book-\d{2}\/(?:cover|spread-\d{2})-v\d+\.png$/.test(a.file)||!a.file.startsWith(`book-${b.slug}/`)||!/^[a-f0-9]{64}$/.test(a.sha256)||a.dimensions.length!==2||Math.abs(a.dimensions[0]/a.dimensions[1]-(j?1.6:.8))>.005))throw Error('选稿哈希、路径或比例错误');
 }
 if(new Set(value.flatMap(b=>b.images.map(a=>a.sha256))).size!==204)throw Error('选稿重复');
 return true;
}
export function assertLocalTarget(env){
 assertAbEiImportTarget(env.DATABASE_URL);
 if(!['http://localhost:3600','http://127.0.0.1:3600'].includes(env.APP_BASE_URL)||env.S3_PUBLIC_BASE_URL!=='https://r.abeiai.com'||env.UPLOAD_DRIVER!=='s3')throw Error('只允许本地abei与指定R2');
}
export function buildBookRecord(book,images){
 if(book.pages.length!==16||images.length!==17)throw Error('页数不符');
 const pages=images.map((imageUrl,position)=>{
  const url=new URL(imageUrl);
  if(url.origin!=='https://r.abeiai.com'||url.username||url.password||url.search||url.hash)throw Error('仅允许指定R2素材');
  const p=book.pages[position-1];
  return {position,caption:p?.caption??book.title,narration:p?.caption??`${seriesTitle}。${book.title}。`,textInImage:true,imagePrompt:p?.scene??book.title,imageUrl,audioUrl:null,imageTaskId:null,audioTaskId:null};
 });
 return {id:bookId(book.slug),userId:ownerId,title:book.title,brief:`${seriesTitle}｜${book.title}。自然科普，亲子共读。`,theme:'动物家园、自然科普、亲子共读',audience:'幼儿园',style:'classic-oil',aspectRatio:'4:5',isSpread:true,pageCount:16,status:'COMPLETED',messages:[],plot:book.pages.map(p=>p.caption).join('\n\n'),characters:[{name:book.species,description:book.character,imageUrl:null}],pages};
}
export function assertPublicationState(publication,submission,materialReview,target){
 if(materialReview&&['PENDING','REJECTED'].includes(materialReview.status))throw Error('已有独立课件待审或被拒绝');
 if(publication&&(publication.status==='REJECTED'||publication.currentHash!==target.hash||!isDeepStrictEqual(publication.currentSnapshot,target.snapshot)||publication.approvedHash&&(publication.approvedHash!==target.hash||!isDeepStrictEqual(publication.approvedSnapshot,target.snapshot))))throw Error('课件状态或快照与授权版本冲突');
 if(submission&&(submission.status==='REJECTED'||submission.snapshotHash!==target.hash||!isDeepStrictEqual(submission.snapshot,target.snapshot)||submission.coverToken||submission.coverUrl&&submission.coverUrl!==target.libraryUrl||submission.status==='APPROVED'&&submission.reviewedByAdminId!==target.adminId))throw Error('单本投稿状态、封面或快照与授权版本冲突');
}
validateBooks(books);
