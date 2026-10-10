import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {careerSeriesBooks,careerSeriesName,careerSeriesDescription} from './career-series-data.mjs';
import {buildCareerBookRecord,assertCareerRecordMatches,assertCareerReviewTarget} from './career-import.mjs';
import {assertAbEiImportTarget} from './lele-import.mjs';
import {careerCourseInclude,planCareerReplacement,planCareerMaterialRevision,planCareerCourseRevision,saveCareerCourseSafely} from './career-revision.mjs';

// 仅修订已授权系列，原稿基线和完整目标均固定；通过既有服务投稿审核，不直接改公开快照。
const owner='abei-lele-studio',courseId='e2edf14f892a944946c00c80';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return[arg.slice(0,i),arg.slice(i+1)];}));
if(!['--admin-id','--assets','--manifest','--baseline','--previous-publication','--checkpoint'].every(k=>args[k])||!['prepare','publish'].includes(args['--mode']))throw new Error('请提供本次修订的管理员、素材、清单、原稿基线、旧发布清单、恢复清单及模式');
assertAbEiImportTarget(process.env.DATABASE_URL);
createRequire(resolve('apps/api-core/package.json'))('reflect-metadata');
const runtime=path=>import(pathToFileURL(resolve(path)).href);
const [{getPrismaClient},{CoursesService},{CourseReviewService},{MediaService},{inspectImage},{snapshotCourseMaterial,hashCourseSnapshot},{writeAdminOperationLog}]=await Promise.all([
 runtime('packages/database/dist/index.js'),runtime('apps/api-core/dist/courses/courses.service.js'),runtime('apps/api-core/dist/courses/course-review.service.js'),runtime('apps/api-core/dist/media/media.service.js'),runtime('apps/api-core/dist/media/image-inspection.js'),runtime('apps/api-core/dist/courses/course-domain.js'),runtime('apps/api-core/dist/security/admin-operation-log.js')
]);
const {Client}=createRequire(resolve('packages/database/package.json'))('pg');
const lock=new Client({connectionString:process.env.DATABASE_URL}),prisma=getPrismaClient(),media=new MediaService(),courses=new CoursesService(),reviews=new CourseReviewService();
const root=resolve(args['--assets']),checkpointFile=resolve(args['--checkpoint']);
const [generation,baseline,previousPublication]=await Promise.all(['--manifest','--baseline','--previous-publication'].map(async k=>JSON.parse(await readFile(args[k],'utf8'))));
if(generation.series!==careerSeriesName||generation.revision!=='different-children-families-v2'||generation.pages?.length!==48||new Set(generation.pages.map(p=>`${p.slug}:${p.position}`)).size!==48||baseline.courseId!==courseId||baseline.owner!==owner||baseline.records?.length!==3||previousPublication.courseId!==courseId||previousPublication.owner!==owner)throw new Error('修订清单、原稿或资源范围不一致');
const digest=buffer=>createHash('sha256').update(buffer).digest('hex'),imageHashes=new Set();
let checkpoint,writer=Promise.resolve();
const save=()=>writer=writer.then(async()=>{await writeFile(`${checkpointFile}.tmp`,JSON.stringify(checkpoint,null,2));await rename(`${checkpointFile}.tmp`,checkpointFile);});
const fullCourse=()=>prisma.course.findUnique({where:{id:courseId},include:careerCourseInclude});
const latestFor=(client,id)=>client.courseReviewRequest.findFirst({where:{materialPublicationId:id,scope:'MATERIAL_CHANGE'},orderBy:{submittedAt:'desc'}});
const snapshot=record=>{const value=snapshotCourseMaterial('PICTURE_BOOK',record);return{snapshot:value,hash:hashCourseSnapshot(value)};};

async function persistImage(key,path,slug,position){
 const buffer=await readFile(path),detected=inspectImage(buffer),sha256=digest(buffer);
 if(!detected||detected.mimeType!=='image/webp'||(key==='resource'?detected.width*9!==detected.height*16:detected.width*4!==detected.height*3)||imageHashes.has(sha256))throw new Error('素材格式、比例或重复图不符合要求');
 imageHashes.add(sha256);
 let entry=checkpoint.assets[key];
 if(!entry&&previousPublication.assets[key]?.sha256===sha256)entry=previousPublication.assets[key];
 if(entry){
  const asset=await prisma.mediaAsset.findUnique({where:{id:entry.id}});
  if(entry.sha256!==sha256||!asset||asset.createdByUserId!==owner||asset.storageProvider!=='S3'||asset.mediaType!=='IMAGE'||asset.url!==entry.url)throw new Error('恢复素材被修改或归属不一致');
  if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==sha256)throw new Error('存储素材哈希与本地不一致');
 }else{
  const file={originalname:`career-identity-${key.replace(':','-')}.webp`,mimetype:'image/webp',size:buffer.length,buffer};
  const asset=key==='resource'?await media.uploadUserCourseCover(owner,file):await media.uploadUserPictureBookImage(owner,file,true);
  if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==sha256)throw new Error('上传后的素材哈希不一致');
  entry={id:asset.id,url:asset.url,sha256,sizeBytes:buffer.length,width:detected.width,height:detected.height,slug,position};
 }
 checkpoint.assets[key]=entry;await save();return entry;
}

async function approvalLog(approval,description){
 if(!approval?.reviewedByAdminId||approval.status!=='APPROVED'||approval.submittedByUserId!==owner)throw new Error('缺少正式作者投稿及管理员审核记录');
 const log={action:'APPROVE_COURSE_REVIEW',resourceType:'COURSE_REVIEW_REQUEST',resourceId:approval.id};
 if(!await prisma.adminOperationLog.findFirst({where:log}))await writeAdminOperationLog({...log,adminUserId:approval.reviewedByAdminId,description});
 if(!await prisma.adminOperationLog.findFirst({where:log}))throw new Error('审核日志写入失败');
}

try{
 await lock.connect();if(!(await lock.query("SELECT pg_try_advisory_lock(hashtext('abei-career-series-import')) AS locked")).rows[0].locked)throw new Error('职业系列正在导入，请勿并发执行');
 const [admin,user]=await Promise.all([prisma.adminUser.findUnique({where:{id:args['--admin-id']}}),prisma.user.findUnique({where:{id:owner},select:{email:true,status:true}})]);
 if(admin?.status!=='ACTIVE'||admin.role!=='SUPER_ADMIN'||user?.status!=='ACTIVE'||user.email!=='lele-studio@abei.example')throw new Error('指定管理员或工作室身份不一致');
 const duplicates=await prisma.course.findMany({where:{userId:owner,revisions:{some:{name:careerSeriesName}}},select:{id:true}});
 if(duplicates.length!==1||duplicates[0].id!==courseId)throw new Error('原系列缺失或出现重复资源');
 media.assertPictureBookR2Ready();await mkdir(resolve(checkpointFile,'..'),{recursive:true});
 try{checkpoint=JSON.parse(await readFile(checkpointFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;checkpoint={series:careerSeriesName,revision:generation.revision,owner,courseId,assets:{},materialReviews:{}};}
 if(checkpoint.owner!==owner||checkpoint.courseId!==courseId||checkpoint.revision!==generation.revision)throw new Error('恢复清单不属于本次修订');
 const queue=careerSeriesBooks.flatMap(book=>Array.from({length:17},(_,position)=>{
  const entry=position===0?generation.covers.find(e=>e.slug===book.slug):generation.pages.find(e=>e.slug===book.slug&&e.position===position);
  if(!entry||(position>0&&entry.caption!==book.story[position-1][0]))throw new Error('插画清单页码或文稿不一致');
  const filename=entry.assetName??(position===0?'cover.webp':`${String(position).padStart(2,'0')}.webp`);
  if(!/^(cover|0[1-9]|1[0-6])(?:-v\d+)?\.webp$/.test(filename))throw new Error('素材文件名超出系列范围');
  return{key:`${book.slug}:${position}`,path:resolve(root,book.slug,filename),slug:book.slug,position};
 }));
 let stopped=false;const uploads=await Promise.allSettled(Array.from({length:3},async()=>{while(queue.length&&!stopped){const j=queue.shift();try{await persistImage(j.key,j.path,j.slug,j.position);}catch(e){stopped=true;throw e;}}}));
 const failure=uploads.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 if(!/^series-cover-v\d+\.webp$/.test(generation.seriesCover.assetName))throw new Error('系列封面修订文件名无效');
 const cover=await persistImage('resource',resolve(root,generation.seriesCover.assetName),null,null);
 const records=careerSeriesBooks.map(book=>buildCareerBookRecord(book,owner,Object.fromEntries(Array.from({length:17},(_,i)=>[i,checkpoint.assets[`${book.slug}:${i}`].url]))));
 const input={name:careerSeriesName,coverMediaId:cover.id,summary:careerSeriesDescription,tags:['绘本','职业启蒙','幼儿园','中国城市'],items:records.map(r=>({materialType:'PICTURE_BOOK',materialId:r.id,displayName:r.title}))};
 const originals=Object.fromEntries(baseline.records.map(r=>[r.id,r]));
 // 在相同课程行锁和课件锁下检查全部三本，任何人工改动都阻止整批原稿替换。
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${courseId} FOR UPDATE`;
  const course=await tx.course.findUnique({where:{id:courseId},include:careerCourseInclude});
  if(course?.userId!==owner)throw new Error('资源作者已改变');planCareerCourseRevision(course,baseline.input,input);
  for(const record of [...records].sort((a,b)=>a.id.localeCompare(b.id))){
   await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${record.id}`}))`;
   const current=await tx.pictureBook.findUnique({where:{id:record.id}}),publication=await tx.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
   const plan=planCareerReplacement(current,originals[record.id],record);
   planCareerMaterialRevision(publication,await latestFor(tx,publication?.id),snapshot(originals[record.id]),snapshot(record),owner);
   if(args['--mode']==='publish'&&plan==='REPLACE'){
    const {id,userId,...data}=record;
    const updated=await tx.pictureBook.updateMany({where:{id,userId,version:current.version},data:{...data,version:{increment:1}}});
    if(updated.count!==1)throw new Error('作品被同时编辑，请核对后恢复');
   }
  }
 });
 if(args['--mode']==='publish'){
  for(const record of records){
   const previous=snapshot(originals[record.id]),target=snapshot(record);
   let publication=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}}),latest=await latestFor(prisma,publication.id);
   assertCareerRecordMatches(await prisma.pictureBook.findUnique({where:{id:record.id}}),record);
   let plan=planCareerMaterialRevision(publication,latest,previous,target,owner);
   if(plan==='SUBMIT')await reviews.recordMaterialChange('PICTURE_BOOK',record.id);
   publication=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});latest=await latestFor(prisma,publication.id);
   plan=planCareerMaterialRevision(publication,latest,previous,target,owner);
   if(plan==='APPROVE')await reviews.approve(admin.id,latest.id,latest.updatedAt.toISOString());
   publication=await prisma.courseMaterialPublication.findUnique({where:{id:publication.id}});
   if(publication.status!=='APPROVED'||publication.approvedHash!==target.hash||!isDeepStrictEqual(publication.approvedSnapshot,target.snapshot))throw new Error('公开课件人物快照不一致');
   const approval=await prisma.courseReviewRequest.findFirst({where:{materialPublicationId:publication.id,scope:'MATERIAL_CHANGE',status:'APPROVED'},orderBy:{reviewedAt:'desc'}});
   if(!isDeepStrictEqual(approval?.afterSnapshot,target.snapshot))throw new Error('已批准课件审核不属于本次目标');
   await approvalLog(approval,`经授权修订《${record.title}》孩子、陪同家长及固定配角，保留16页正文和3:4版式。`);
   checkpoint.materialReviews[record.id]=approval.id;await save();console.log(JSON.stringify({revised:record.title,reviewId:approval.id}));
  }
  let course=await fullCourse(),plan=planCareerCourseRevision(course,baseline.input,input);
  if(plan==='SAVE'){await saveCareerCourseSafely(courses,owner,courseId,baseline.input,input);course=await fullCourse();plan=planCareerCourseRevision(course,baseline.input,input);}
  if(plan!=='PUBLISHED'){
   let review=await prisma.courseReviewRequest.findFirst({where:{courseId,courseRevisionId:course.workingRevisionId,scope:'COURSE_REVISION',status:'PENDING'}});
   if(!review)review=await reviews.submitCourse(owner,courseId);
   const materials=await Promise.all(records.map(async record=>{const pub=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});return{publicationId:pub.id,pictureBookId:record.id,...snapshot(record),approvedHash:pub.approvedHash,approvedSnapshot:pub.approvedSnapshot};}));
   assertCareerReviewTarget(review,input,materials,{courseId,revisionId:course.workingRevisionId,userId:owner,coverUrl:cover.url});
   await reviews.approve(admin.id,review.id,review.updatedAt.toISOString());
  }
  course=await fullCourse();if(planCareerCourseRevision(course,baseline.input,input)!=='PUBLISHED')throw new Error('系列修订未正式发布');
  const approval=await prisma.courseReviewRequest.findFirst({where:{courseId,courseRevisionId:course.approvedRevisionId,scope:'COURSE_REVISION',status:'APPROVED'}});
  await approvalLog(approval,'经授权发布《我想成为》人物修订：小安想当医生，小宇想当消防员，朵朵想当老师；家长分别为妈妈、爸爸、爸爸妈妈。');
  const visible=await courses.getPublicCourse(courseId);if(visible.items.length!==3||visible.items.some(i=>!i.launchHref)||visible.summary!==input.summary)throw new Error('前台目录或新系列说明不一致');
  checkpoint.courseReviewId=approval.id;checkpoint.publishedAt=new Date().toISOString();await save();
 }
 console.log(JSON.stringify({mode:args['--mode'],courseId,href:`/c/${courseId}`,verifiedImages:Object.keys(checkpoint.assets).length,children:careerSeriesBooks.map(b=>b.child.name)}));
}finally{try{await writer;}finally{try{await lock.end();}finally{await prisma.$disconnect();}}}
