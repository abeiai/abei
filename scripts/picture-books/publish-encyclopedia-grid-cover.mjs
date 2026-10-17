import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {courseId,ownerId,adminId,bookIds,sha256,digest,assertSame,contentRows,pinnedItems,courseInput,assertCoverOnly,bindTransaction} from './encyclopedia-grid-guards.mjs';
import {assertCareerReviewTarget} from './career-import.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
const env=args['--env'],action=args['--action'],root=resolve(import.meta.dirname,'../..');
if(!['local','production'].includes(env)||!['prepare','apply','verify'].includes(action)||!args['--state'])throw Error('请指定环境、动作和私有断点路径');
if(env==='local'){process.loadEnvFile(resolve(args['--env-file']??resolve(root,'.env')));if(!process.env.POSTGRES_PASSWORD||!['http://localhost:3600','http://127.0.0.1:3600'].includes(process.env.APP_BASE_URL))throw Error('本地配置不符');process.env.DATABASE_URL=`postgresql://abei:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:3604/abei?schema=public`;}
else if(process.env.APP_BASE_URL!=='https://new.abeiai.com')throw Error('生产目标不符');
process.env.UPLOAD_DRIVER='s3';if(process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/,'')!=='https://r.abeiai.com')throw Error('存储目标不符');
createRequire(resolve(root,'apps/api-core/package.json'))('reflect-metadata');
const runtime=p=>import(pathToFileURL(resolve(root,p)).href);
const [{getPrismaClient},{MediaService},{CoursesService},{CourseReviewService}]=await Promise.all([runtime('packages/database/dist/index.js'),runtime('apps/api-core/dist/media/media.service.js'),runtime('apps/api-core/dist/courses/courses.service.js'),runtime('apps/api-core/dist/courses/course-review.service.js')]);
const p=getPrismaClient(),media=new MediaService(),courses=new CoursesService(),reviews=new CourseReviewService();
const {Client}=createRequire(resolve(root,'packages/database/package.json'))('pg'),db=new Client({connectionString:process.env.DATABASE_URL});
const plan=JSON.parse(await readFile(new URL('./encyclopedia-grid-cover-plan.json',import.meta.url))),stateFile=resolve(args['--state']);
let checkpoint;try{checkpoint=JSON.parse(await readFile(stateFile));}catch(e){if(e.code!=='ENOENT')throw e;}
if(checkpoint&&(checkpoint.env!==env||checkpoint.planDigest!==digest(plan)))throw Error('断点身份不符');
const save=async()=>{await mkdir(dirname(stateFile),{recursive:true,mode:0o700});await writeFile(stateFile+'.tmp',JSON.stringify(checkpoint,null,2),{mode:0o600});await rename(stateFile+'.tmp',stateFile);};
const tables=['mediaAsset','pictureBook','pictureBookSubmission','courseMaterialPublication','course','courseRevision','courseRevisionItem','courseReviewRequest','adminOperationLog','audioAsset'];
const counts=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,await p[t].count()])));
const revisionInclude={coverMedia:true,items:{orderBy:{sortOrder:'asc'}}};
async function state(tx=p){return {course:await tx.course.findUnique({where:{id:courseId},include:{approvedRevision:{include:revisionInclude},workingRevision:{include:revisionInclude},revisions:{include:revisionInclude,orderBy:{createdAt:'asc'}}}}),books:await tx.pictureBook.findMany({where:{id:{in:bookIds}},orderBy:{id:'asc'}}),publications:await tx.courseMaterialPublication.findMany({where:{pictureBookId:{in:bookIds}},orderBy:{id:'asc'}}),submissions:await tx.pictureBookSubmission.findMany({where:{pictureBookId:{in:bookIds}},orderBy:{id:'asc'}}),requests:await tx.courseReviewRequest.findMany({where:{OR:[{courseId},{materialPublication:{pictureBookId:{in:bookIds}}}]},orderBy:{id:'asc'}})};}
function guardMaterials(s){for(const name of ['books','publications','submissions'])if(s[name].length!==20||digest(contentRows(s[name]))!==plan.materialDigests[name])throw Error('原绘本或审核快照变化：'+name);}
async function verifyPublished(tx=p){
 const s=await state(tx),c=s.course,b=checkpoint.before.course;guardMaterials(s);
 assertSame(s.books,checkpoint.before.books);assertSame(s.submissions,checkpoint.before.submissions);
 assertSame(contentRows(s.publications),contentRows(checkpoint.before.publications));
 if(c?.userId!==ownerId||c.reviewState!=='PUBLISHED'||c.workingRevisionId!==null||c.approvedRevision?.status!=='APPROVED')throw Error('公开状态异常');
 assertSame(c.publishedAt,b.publishedAt);assertSame(courseInput(c.approvedRevision),{...courseInput(b.approvedRevision),coverMediaId:checkpoint.asset.id});
 assertSame(pinnedItems(c.approvedRevision.items),pinnedItems(b.approvedRevision.items));
 for(const r of b.revisions)assertSame(s.course.revisions.find(x=>x.id===r.id),r,'历史版本被修改');
 for(const r of checkpoint.before.requests)assertSame(s.requests.find(x=>x.id===r.id),r,'历史审核被修改');
 const review=s.requests.find(r=>r.courseRevisionId===c.approvedRevisionId&&r.scope==='COURSE_REVISION');
 if(review?.status!=='APPROVED'||review.reviewedByAdminId!==adminId||review.submittedByUserId!==ownerId||c.approvedRevision.coverMedia.url!==checkpoint.asset.url)throw Error('新封面审核不完整');
 if(!await tx.adminOperationLog.findFirst({where:{action:'APPROVE_COURSE_REVIEW',resourceType:'COURSE_REVIEW_REQUEST',resourceId:review.id,adminUserId:adminId}}))throw Error('审核日志缺失');
 return {revisionId:c.approvedRevisionId,reviewId:review.id};
}
try{
 await db.connect();const identity=(await db.query("SELECT current_database() db,current_setting('port') port,system_identifier::text system FROM pg_control_system()")).rows[0];
 if(identity.db!=='abei'||identity.port!=='3604'||identity.system!==(env==='local'?'7690572978282909730':'7694665003199217698'))throw Error('数据库实例身份不符');
 if(!(await db.query("SELECT pg_try_advisory_lock(20261016,200400) locked")).rows[0].locked)throw Error('已有系列发布任务');
 const admin=(await db.query("SELECT role,status,md5(email || '|' || name) digest FROM admin_users WHERE id=$1",[adminId])).rows[0],owner=await p.user.findUnique({where:{id:ownerId}});
 if(admin?.role!=='SUPER_ADMIN'||admin.status!=='ACTIVE'||admin.digest!=='aefb9826ce5041571ec2661e395b7b86'||owner?.email!=='lele-studio@abei.example'||owner.status!=='ACTIVE')throw Error('发布身份不符');
 if(!checkpoint){if(action!=='prepare')throw Error('必须先备份');const before=await state(),c=before.course;guardMaterials(before);
  if(c?.userId!==ownerId||c.reviewState!=='PUBLISHED'||c.workingRevisionId!==null||c.approvedRevisionId!==plan.oldRevisionId||c.approvedRevision?.coverMediaId!==plan.oldCoverId||digest(pinnedItems(c.approvedRevision.items))!==plan.itemsDigest||before.requests.some(r=>r.status!=='APPROVED'))throw Error('原专辑存在其他修订');
  checkpoint={env,courseId,planDigest:digest(plan),before,beforeCounts:await counts()};await save();
 }
 if(action==='prepare'){assertSame(await state(),checkpoint.before);console.log(JSON.stringify({env,status:'PREPARED',courseId,books:20}));}
 else{
  if(!checkpoint.asset){if(action!=='apply')throw Error('新封面尚未上传');assertSame(await state(),checkpoint.before);
   if(env==='local'){
    if(checkpoint.uploadStarted)throw Error('上传结果待核对，禁止重复上传');const bytes=await readFile(resolve(args['--image']));if(sha256(bytes)!==plan.cover.sha256||bytes.length!==plan.cover.sizeBytes)throw Error('选稿内容不符');
    media.assertPictureBookR2Ready();checkpoint.uploadStarted=true;await save();checkpoint.asset=await media.uploadUserCourseCover(ownerId,{originalname:'encyclopedia-grid-cover-v2.png',mimetype:'image/png',size:bytes.length,buffer:bytes});await save();
   }else{
    const pack=JSON.parse(await readFile(resolve(args['--asset']))),a=pack.row;if(pack.planDigest!==digest(plan)||a?.createdByUserId!==ownerId||a?.storageProvider!=='S3'||a?.mimeType!=='image/png'||a?.size!==plan.cover.sizeBytes||!a?.url?.startsWith('https://r.abeiai.com/'))throw Error('素材同步包不符');
    if(sha256((await media.readPictureBookStoredImage(a.url)).buffer)!==plan.cover.sha256)throw Error('素材哈希错误');
    const existing=(await db.query('SELECT to_jsonb(t) row FROM media_assets t WHERE id=$1',[a.id])).rows[0]?.row;if(existing)assertSame(existing,a);else await db.query('INSERT INTO media_assets SELECT * FROM jsonb_populate_record(NULL::media_assets,$1::jsonb)',[JSON.stringify(a)]);checkpoint.asset=a;await save();
   }
  }
  const asset=await p.mediaAsset.findUnique({where:{id:checkpoint.asset.id}});
  if(asset?.url!==checkpoint.asset.url||asset.createdByUserId!==ownerId||asset.storageProvider!=='S3'||!asset.url.startsWith('https://r.abeiai.com/')||sha256((await media.readPictureBookStoredImage(asset.url)).buffer)!==plan.cover.sha256)throw Error('新封面素材错误');
  if(action==='apply'&&(await state()).course.approvedRevision.coverMediaId!==asset.id){
   checkpoint.result=await p.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "courses" WHERE "id"=${courseId} FOR UPDATE`;
    await reviews.lockRevisionMaterials(tx,plan.oldRevisionId);await reviews.lockRevisionMaterialPublications(tx,plan.oldRevisionId);
    assertSame(await state(tx),checkpoint.before);const input={...courseInput(checkpoint.before.course.approvedRevision),coverMediaId:asset.id};assertCoverOnly(courseInput(checkpoint.before.course.approvedRevision),input);
    const draft=await bindTransaction(courses,tx).saveCourse(ownerId,courseId,input),scopedReviews=bindTransaction(reviews,tx),review=await scopedReviews.submitCourse(ownerId,courseId);
    const materials=checkpoint.before.course.approvedRevision.items.map(item=>{const pub=checkpoint.before.publications.find(p=>p.id===item.publicationId);if(!pub)throw Error('目录材料缺失');return {publicationId:pub.id,pictureBookId:pub.pictureBookId,hash:pub.currentHash,snapshot:pub.currentSnapshot,approvedHash:pub.approvedHash,approvedSnapshot:pub.approvedSnapshot};});
    assertCareerReviewTarget(review,input,materials,{courseId,revisionId:draft.workingRevisionId,userId:ownerId,coverUrl:asset.url});
    if(review.diff?.length!==1||review.diff[0].kind!=='COVER')throw Error('审核变化超出封面');
    await scopedReviews.approve(adminId,review.id,review.updatedAt.toISOString());
    await tx.adminOperationLog.create({data:{adminUserId:adminId,action:'APPROVE_COURSE_REVIEW',resourceType:'COURSE_REVIEW_REQUEST',resourceId:review.id,description:'按用户要求为《小小百科翻翻书》专辑封面增加浅绿色网格底纹'}});
    return verifyPublished(tx);
   },{maxWait:10000,timeout:30000});await save();
  }
  checkpoint.result=await verifyPublished();checkpoint.afterCounts=await counts();checkpoint.delta=Object.fromEntries(tables.map(t=>[t,checkpoint.afterCounts[t]-checkpoint.beforeCounts[t]]));
  assertSame(checkpoint.delta,{mediaAsset:1,pictureBook:0,pictureBookSubmission:0,courseMaterialPublication:0,course:0,courseRevision:1,courseRevisionItem:20,courseReviewRequest:1,adminOperationLog:1,audioAsset:0},'发布表计数增量异常');
  const visible=await courses.getPublicCourse(courseId);if(visible.coverUrl!==asset.url||visible.items.length!==20)throw Error('公开专辑未更新');
  checkpoint.status='PUBLISHED';checkpoint.verifiedAt=new Date().toISOString();await save();
  if(env==='local'){const row=(await db.query('SELECT to_jsonb(t) row FROM media_assets t WHERE id=$1',[asset.id])).rows[0].row;await writeFile(resolve(dirname(stateFile),'grid-cover-asset.json'),JSON.stringify({planDigest:digest(plan),row},null,2),{mode:0o600});}
  console.log(JSON.stringify({env,status:checkpoint.status,courseId,coverUrl:asset.url,sha256:plan.cover.sha256,...checkpoint.result,delta:checkpoint.delta}));
 }
}finally{await p.$disconnect();await db.end();}
