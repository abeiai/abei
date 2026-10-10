import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {careerSeriesName} from "./career-series-data.mjs";
import {careerCollectionBooks as careerSeriesBooks,careerExpandedDescription as careerSeriesDescription} from "./career-expansion-data.mjs";
import { buildCareerBookRecord, assertCareerRecordMatches, validateCareerExpansionBooks, assertCareerReviewTarget, assertCareerExpansionMaterialState } from "./career-import.mjs";
import { assertAbEiImportTarget } from "./lele-import.mjs";
import {careerCourseInclude,planCareerCourseRevision,saveCareerCourseSafely,submitCareerCourseSafely,approveCareerCourseSafely} from "./career-revision.mjs";

// 本地职业系列3本扩展至16本，仅创建十三本新稿，复用既有正式投稿和审核服务。
const owner = "abei-lele-studio";
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf("="); return [arg.slice(0,i),arg.slice(i+1)]; }));
if (!["--admin-id","--assets","--manifest","--checkpoint","--baseline","--previous-publication"].every(key=>args[key]) || !["prepare","publish"].includes(args["--mode"])) throw new Error("请指定 --admin-id、--assets、--manifest、--checkpoint 和 --mode=prepare/publish");
assertAbEiImportTarget(process.env.DATABASE_URL);
const runtime = path => import(pathToFileURL(resolve(process.cwd(),path)).href);
createRequire(resolve(process.cwd(),"apps/api-core/package.json"))("reflect-metadata");
const [{getPrismaClient},{CoursesService},{CourseReviewService},{MediaService},{inspectImage},{snapshotCourseMaterial,hashCourseSnapshot},{writeAdminOperationLog}] = await Promise.all([
  runtime("packages/database/dist/index.js"),runtime("apps/api-core/dist/courses/courses.service.js"),runtime("apps/api-core/dist/courses/course-review.service.js"),
  runtime("apps/api-core/dist/media/media.service.js"),runtime("apps/api-core/dist/media/image-inspection.js"),runtime("apps/api-core/dist/courses/course-domain.js"),runtime("apps/api-core/dist/security/admin-operation-log.js")
]);
const {Client} = createRequire(resolve(process.cwd(),"packages/database/package.json"))("pg");
const lock = new Client({connectionString:process.env.DATABASE_URL}), prisma=getPrismaClient(), media=new MediaService(), courses=new CoursesService(), reviews=new CourseReviewService();
const root=resolve(args["--assets"]), checkpointFile=resolve(args["--checkpoint"]);
const [generation,baseline,previousPublication]=await Promise.all(["--manifest","--baseline","--previous-publication"].map(async k=>JSON.parse(await readFile(args[k],"utf8"))));
validateCareerExpansionBooks(careerSeriesBooks);
const courseId="e2edf14f892a944946c00c80";
if(baseline.courseId!==courseId||baseline.owner!==owner||baseline.records?.length!==3||previousPublication.courseId!==courseId||previousPublication.owner!==owner)throw new Error("扩展基线与原系列不一致");
if(generation.series!==careerSeriesName || generation.revision!=="sixteen-careers-v1" || generation.covers?.length!==16 || generation.pages?.length!==256 || new Set(generation.pages.map(e=>`${e.slug}:${e.position}`)).size!==256) throw new Error("必须完成16本共256页独立插画");
const digest=buffer=>createHash("sha256").update(buffer).digest("hex");
const imageHashes=new Set();
let checkpoint, writer=Promise.resolve();
const save=()=>writer=writer.then(async()=>{await writeFile(`${checkpointFile}.tmp`,JSON.stringify(checkpoint,null,2));await rename(`${checkpointFile}.tmp`,checkpointFile);});

async function persistImage(key,path,position,slug) {
  const buffer=await readFile(path), detected=inspectImage(buffer), hash=digest(buffer);
  if(imageHashes.has(hash))throw new Error("存在重复封面或正文插画，请核对素材");imageHashes.add(hash);
  if(!detected || detected.mimeType!=="image/webp" || (key==="resource" ? detected.width*9!==detected.height*16 : detected.width*4!==detected.height*3)) throw new Error(`素材尺寸或格式错误：${key}`);
  const existing=checkpoint.assets[key]??(previousPublication.assets[key]?.sha256===hash?previousPublication.assets[key]:null);
  if(existing) {
    const asset=await prisma.mediaAsset.findUnique({where:{id:existing.id}});
    if(existing.sha256!==hash || !asset || asset.createdByUserId!==owner || asset.storageProvider!=="S3" || asset.mediaType!=="IMAGE" || asset.url!==existing.url) throw new Error("已上传素材已修改或归属不一致");
    if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==hash) throw new Error("R2素材哈希与本地不一致");
    checkpoint.assets[key]=existing;await save();return existing;
  }
  const file={originalname:`career-${key.replace(":","-")}.webp`,mimetype:"image/webp",size:buffer.length,buffer};
  const asset=key==="resource" ? await media.uploadUserCourseCover(owner,file) : await media.uploadUserPictureBookImage(owner,file,true);
  if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==hash) throw new Error("上传后的R2素材哈希不一致");
  const entry={id:asset.id,url:asset.url,sha256:hash,sizeBytes:buffer.length,width:detected.width,height:detected.height,slug,position};
  checkpoint.assets[key]=entry;await save();return entry;
}

try {
  await lock.connect();if(!(await lock.query("SELECT pg_try_advisory_lock(hashtext('abei-career-series-import')) AS locked")).rows[0].locked) throw new Error("职业系列正在导入，请勿并发运行");
  const admin=await prisma.adminUser.findUnique({where:{id:args["--admin-id"]}});
  if(!admin || admin.status!=="ACTIVE" || admin.role!=="SUPER_ADMIN") throw new Error("必须指定有效超级管理员");
  const user=await prisma.user.findUnique({where:{id:owner},select:{email:true,status:true}});
  if(!user || user.email!=="lele-studio@abei.example" || user.status!=="ACTIVE") throw new Error("指定工作室账号不一致");
  media.assertPictureBookR2Ready();
  await mkdir(resolve(checkpointFile,".."),{recursive:true});
  try{checkpoint=JSON.parse(await readFile(checkpointFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;checkpoint={series:careerSeriesName,revision:generation.revision,owner,courseId,assets:{}};}
  if(checkpoint.owner!==owner || checkpoint.series!==careerSeriesName || checkpoint.revision!==generation.revision || checkpoint.courseId!==courseId) throw new Error("恢复清单所属系列或账号不一致");
  const found=await prisma.course.findMany({where:{userId:owner,revisions:{some:{name:careerSeriesName}}},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});
  if(found.length!==1||found[0].id!==courseId) throw new Error("存在重复职业系列资源，请人工核对");
  let course=found[0];
  if(course?.reviewState==="REJECTED" || course?.workingRevision?.status==="REJECTED") throw new Error("职业系列已被拒绝，不能自动重审");
  const queue=careerSeriesBooks.flatMap(book=>Array.from({length:17},(_,position)=>{
    const entry=position===0?null:generation.pages.find(e=>e.slug===book.slug&&e.position===position);
    if(position>0 && (!entry || entry.caption!==book.story[position-1][0])) throw new Error("插画页码或文稿清单不一致");
    const filename=position===0?(generation.covers.find(e=>e.slug===book.slug)?.assetName??"cover.webp"):entry.assetName??`${String(position).padStart(2,"0")}.webp`;
    if(!/^(cover|0[1-9]|1[0-6])(?:-v\d+)?\.webp$/.test(filename)) throw new Error("素材文件名不属于本系列");
    return {key:`${book.slug}:${position}`,path:resolve(root,book.slug,filename),position,slug:book.slug};
  }));
  let stopped=false;const results=await Promise.allSettled(Array.from({length:3},async()=>{while(queue.length&&!stopped){const item=queue.shift();try{await persistImage(item.key,item.path,item.position,item.slug);}catch(e){stopped=true;throw e;}}}));
  const failure=results.find(result=>result.status==="rejected");if(failure)throw failure.reason;
  const seriesCoverName=generation.seriesCover?.assetName??"series-cover.webp";
  if(!/^series-cover(?:-v\d+)?\.webp$/.test(seriesCoverName))throw new Error("系列封面文件名错误");
  const cover=await persistImage("resource",resolve(root,seriesCoverName),null,null);
  const records=careerSeriesBooks.map(book=>buildCareerBookRecord(book,owner,Object.fromEntries(Array.from({length:17},(_,i)=>[i,checkpoint.assets[`${book.slug}:${i}`].url]))));
  const input={name:careerSeriesName,coverMediaId:cover.id,summary:careerSeriesDescription,tags:["绘本","职业启蒙","幼儿园","中国城市"],items:records.map(record=>({materialType:"PICTURE_BOOK",materialId:record.id,displayName:record.title}))};
  const materialGuard=async tx=>{
    for(const record of [...records].sort((a,b)=>a.id.localeCompare(b.id))){
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${record.id}`}))`;
      await tx.$queryRaw`SELECT "id" FROM "picture_books" WHERE "id" = ${record.id} FOR UPDATE`;
    }
    const references=await tx.courseMaterialPublication.findMany({where:{pictureBookId:{in:records.map(r=>r.id)}},orderBy:{id:"asc"}});
    for(const pub of references)await tx.$queryRaw`SELECT "id" FROM "course_material_publications" WHERE "id" = ${pub.id} FOR UPDATE`;
    const materials=[];
    for(const record of records){
      const current=await tx.pictureBook.findUnique({where:{id:record.id}}),pub=await tx.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
      const latest=pub?await tx.courseReviewRequest.findFirst({where:{materialPublicationId:pub.id,scope:"MATERIAL_CHANGE"},orderBy:{submittedAt:"desc"}}):null;
      const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record),target={snapshot,hash:hashCourseSnapshot(snapshot)};
      assertCareerExpansionMaterialState(current,pub,latest,record,target,baseline.records.some(r=>r.id===record.id));
      materials.push({publicationId:pub?.id,pictureBookId:record.id,...target,approvedHash:pub?.approvedHash,approvedSnapshot:pub?.approvedSnapshot});
    }
    return materials;
  };
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${courseId} FOR UPDATE`;
    const fresh=await tx.course.findUnique({where:{id:courseId},include:careerCourseInclude});
    if(fresh?.userId!==owner)throw new Error("原系列归属已改变");planCareerCourseRevision(fresh,baseline.input,input);
    for(const record of [...records].sort((a,b)=>a.id.localeCompare(b.id))){
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${record.id}`}))`;
      const original=baseline.records.find(r=>r.id===record.id),current=await tx.pictureBook.findUnique({where:{id:record.id}});
      if(original){assertCareerRecordMatches(record,original);assertCareerRecordMatches(current,original);}
      else if(current)assertCareerRecordMatches(current,record);
      const publication=await tx.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
      const latest=publication?await tx.courseReviewRequest.findFirst({where:{materialPublicationId:publication.id,scope:"MATERIAL_CHANGE"},orderBy:{submittedAt:"desc"}}):null;
      const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record);
      if(publication&&!current)throw new Error("已存在公开课件却缺少源稿");
      assertCareerExpansionMaterialState(current??record,publication,latest,record,{snapshot,hash:hashCourseSnapshot(snapshot)},Boolean(original));
      if(!current&&args["--mode"]==="publish")await tx.pictureBook.create({data:record});
    }
  },{timeout:30000});
  course=await prisma.course.findUnique({where:{id:courseId},include:careerCourseInclude});
  let plan=planCareerCourseRevision(course,baseline.input,input);
  if(args["--mode"]==="publish"&&plan==="SAVE"){
    await saveCareerCourseSafely(courses,owner,courseId,baseline.input,input,materialGuard);
    course=await prisma.course.findUnique({where:{id:courseId},include:careerCourseInclude});plan=planCareerCourseRevision(course,baseline.input,input);
  }
  await save();
  if(args["--mode"]==="publish"){
    if(plan!=="PUBLISHED"){
      let review=await prisma.courseReviewRequest.findFirst({where:{courseId:course.id,courseRevisionId:course.workingRevisionId,scope:"COURSE_REVISION",status:"PENDING"}});
      if(!review)review=await submitCareerCourseSafely(reviews,owner,courseId,baseline.input,input,materialGuard);
      const materials=await Promise.all(records.map(async record=>{const pub=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record);return {publicationId:pub.id,pictureBookId:record.id,hash:hashCourseSnapshot(snapshot),snapshot,approvedHash:pub.approvedHash,approvedSnapshot:pub.approvedSnapshot};}));
      assertCareerReviewTarget(review,input,materials,{courseId:course.id,revisionId:course.workingRevisionId,userId:owner,coverUrl:cover.url});
      await approveCareerCourseSafely(reviews,owner,admin.id,courseId,baseline.input,input,review.id,review.updatedAt.toISOString(),async tx=>{
        const approvedMaterials=await materialGuard(tx),fresh=await tx.course.findUnique({where:{id:courseId},select:{workingRevisionId:true}}),lockedReview=await tx.courseReviewRequest.findUnique({where:{id:review.id}});
        const currentAdmin=await tx.adminUser.findUnique({where:{id:admin.id}});
        if(currentAdmin?.status!=="ACTIVE"||currentAdmin.role!=="SUPER_ADMIN")throw new Error("管理员身份已改变");
        assertCareerReviewTarget(lockedReview,input,approvedMaterials,{courseId,revisionId:fresh.workingRevisionId,userId:owner,coverUrl:cover.url});
      });
    }
    const finalCourse=await prisma.course.findUnique({where:{id:courseId},include:careerCourseInclude});
    if(planCareerCourseRevision(finalCourse,baseline.input,input)!=="PUBLISHED")throw new Error("16本系列版本尚未正式通过");
    const approval=await prisma.courseReviewRequest.findFirst({where:{courseId:course.id,courseRevisionId:finalCourse.approvedRevisionId,scope:"COURSE_REVISION",status:"APPROVED"}});
    if(!approval?.reviewedByAdminId||approval.submittedByUserId!==owner)throw new Error("缺少正式管理员审核记录");
    const log={action:"APPROVE_COURSE_REVIEW",resourceType:"COURSE_REVIEW_REQUEST",resourceId:approval.id};
    if(!await prisma.adminOperationLog.findFirst({where:log}))await writeAdminOperationLog({...log,adminUserId:approval.reviewedByAdminId,description:"经授权将《我想成为》扩展到16种职业、16个不同孩子，原三本保留，新添13本，每本16页正文，3:4竖版。"});
    if(!await prisma.adminOperationLog.findFirst({where:log}))throw new Error("审核日志写入失败");
    for(const record of records){const publication=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});assertCareerRecordMatches(await prisma.pictureBook.findUnique({where:{id:record.id}}),record);if(publication?.status!=="APPROVED" || publication.approvedHash!==hashCourseSnapshot(snapshotCourseMaterial("PICTURE_BOOK",record)))throw new Error("公开课件快照与职业文稿不一致");}
    const publicCourse=await courses.getPublicCourse(course.id);if(publicCourse.items.length!==16 || publicCourse.items.some(item=>!item.launchHref))throw new Error("前台系列目录验证失败");
    checkpoint.courseReviewId=approval.id;checkpoint.publishedAt=new Date().toISOString();await save();
  }
  console.log(JSON.stringify({mode:args["--mode"],series:careerSeriesName,courseId:course.id,href:`/c/${course.id}`,books:records.map(r=>r.title),pageCount:16,aspectRatio:"3:4",verifiedImages:Object.keys(checkpoint.assets).length}));
}finally{try{await writer;}finally{try{await lock.end();}finally{await prisma.$disconnect();}}}
