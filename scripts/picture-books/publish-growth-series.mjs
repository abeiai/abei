import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { growthSeriesBooks, growthSeriesName, growthSeriesDescription } from "./growth-series-data.mjs";
import { buildGrowthBookRecord, validateGrowthManifest } from "./growth-import.mjs";
import { assertCareerRecordMatches, planCareerPublication, assertCareerReviewTarget, assertCareerExpansionMaterialState } from "./career-import.mjs";
import { growthCourseOperationSafely } from "./growth-publication-guard.mjs";
import { assertAbEiImportTarget } from "./lele-import.mjs";

// 受信任的本地运营导入。仅使用既有作者身份；保留账号密码、钱包及其他系列。
const owner = "abei-lele-studio";
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf("="); return [arg.slice(0,i),arg.slice(i+1)]; }));
if (!["--admin-id","--assets","--manifest","--checkpoint"].every(key=>args[key]) || !["prepare","publish"].includes(args["--mode"])) throw new Error("请指定 --admin-id、--assets、--manifest、--checkpoint 和 --mode=prepare/publish");
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
const generation=JSON.parse(await readFile(args["--manifest"],"utf8"));
validateGrowthManifest(generation);
const digest=buffer=>createHash("sha256").update(buffer).digest("hex");
const imageHashes=new Set();
let checkpoint, writer=Promise.resolve();
const save=()=>writer=writer.then(async()=>{await writeFile(`${checkpointFile}.tmp`,JSON.stringify(checkpoint,null,2));await rename(`${checkpointFile}.tmp`,checkpointFile);});

async function persistImage(key,path,position,slug) {
  const buffer=await readFile(path), detected=inspectImage(buffer), hash=digest(buffer);
  if(imageHashes.has(hash))throw new Error("存在重复封面或正文插画，请核对素材");imageHashes.add(hash);
  if(!detected || detected.mimeType!=="image/webp" || detected.width!==1280 || detected.height!==(key==="resource"?720:1024)) throw new Error(`素材尺寸或格式错误：${key}`);
  const expected=key==="resource"?generation.seriesCover:[...generation.covers,...generation.pages].find(e=>e.slug===slug&&e.position===position);
  if(expected?.sha256!==hash)throw new Error("本地素材与制作清单哈希不一致");
  const existing=checkpoint.assets[key];
  if(existing) {
    const asset=await prisma.mediaAsset.findUnique({where:{id:existing.id}});
    if(existing.sha256!==hash || !asset || asset.createdByUserId!==owner || asset.storageProvider!=="S3" || asset.mediaType!=="IMAGE" || asset.url!==existing.url) throw new Error("已上传素材已修改或归属不一致");
    if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==hash) throw new Error("R2素材哈希与本地不一致");
    return existing;
  }
  const file={originalname:`growth-${key.replace(":","-")}.webp`,mimetype:"image/webp",size:buffer.length,buffer};
  const asset=key==="resource" ? await media.uploadUserCourseCover(owner,file) : await media.uploadUserPictureBookImage(owner,file,true);
  if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==hash) throw new Error("上传后的R2素材哈希不一致");
  const entry={id:asset.id,url:asset.url,sha256:hash,sizeBytes:buffer.length,width:detected.width,height:detected.height,slug,position};
  checkpoint.assets[key]=entry;await save();return entry;
}

try {
  await lock.connect();if(!(await lock.query("SELECT pg_try_advisory_lock(hashtext('abei-growth-series-import')) AS locked")).rows[0].locked) throw new Error("科普系列正在导入，请勿并发运行");
  const admin=await prisma.adminUser.findUnique({where:{id:args["--admin-id"]}});
  if(!admin || admin.status!=="ACTIVE" || admin.role!=="SUPER_ADMIN") throw new Error("必须指定有效超级管理员");
  const user=await prisma.user.findUnique({where:{id:owner},select:{email:true,status:true}});
  if(!user || user.email!=="lele-studio@abei.example" || user.status!=="ACTIVE") throw new Error("指定工作室账号不一致");
  media.assertPictureBookR2Ready();
  await mkdir(resolve(checkpointFile,".."),{recursive:true});
  try{checkpoint=JSON.parse(await readFile(checkpointFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;checkpoint={series:growthSeriesName,owner,assets:{}};}
  if(checkpoint.owner!==owner || checkpoint.series!==growthSeriesName) throw new Error("恢复清单所属系列或账号不一致");
  const found=await prisma.course.findMany({where:{userId:owner,revisions:{some:{name:growthSeriesName}}},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});
  if(found.length>1) throw new Error("存在重复科普系列资源，请人工核对");
  let course=found[0];
  if(course?.reviewState==="REJECTED" || course?.workingRevision?.status==="REJECTED") throw new Error("科普系列已被拒绝，不能自动重审");
  const queue=growthSeriesBooks.flatMap(book=>Array.from({length:13},(_,position)=>{
    const entry=position===0?null:generation.pages.find(e=>e.slug===book.slug&&e.position===position);
    if(position>0 && (!entry || entry.caption!==book.story[position-1][1])) throw new Error("插画页码或文稿清单不一致");
    const filename=position===0?(generation.covers.find(e=>e.slug===book.slug)?.assetName??"cover.webp"):entry.assetName??`${String(position).padStart(2,"0")}.webp`;
    if(!/^(cover|0[1-9]|1[0-2])(?:-v\d+)?\.webp$/.test(filename)) throw new Error("素材文件名不属于本系列");
    return {key:`${book.slug}:${position}`,path:resolve(root,book.slug,filename),position,slug:book.slug};
  }));
  let stopped=false;const results=await Promise.allSettled(Array.from({length:3},async()=>{while(queue.length&&!stopped){const item=queue.shift();try{await persistImage(item.key,item.path,item.position,item.slug);}catch(e){stopped=true;throw e;}}}));
  const failure=results.find(result=>result.status==="rejected");if(failure)throw failure.reason;
  const seriesCoverName=generation.seriesCover?.assetName??"series-cover.webp";
  if(!/^series-cover(?:-v\d+)?\.webp$/.test(seriesCoverName))throw new Error("系列封面文件名错误");
  const cover=await persistImage("resource",resolve(root,seriesCoverName),null,null);
  const records=growthSeriesBooks.map(book=>buildGrowthBookRecord(book,owner,Object.fromEntries(Array.from({length:13},(_,i)=>[i,checkpoint.assets[`${book.slug}:${i}`].url]))));
  await prisma.$transaction(async tx=>{for(const record of records){const existing=await tx.pictureBook.findUnique({where:{id:record.id}});if(existing)assertCareerRecordMatches(existing,record);else await tx.pictureBook.create({data:record});}});
  const input={name:growthSeriesName,coverMediaId:cover.id,summary:growthSeriesDescription,tags:["绘本","自然科普","动物成长","亲子共读"],items:records.map(record=>({materialType:"PICTURE_BOOK",materialId:record.id,displayName:record.title}))};
  const materialGuard=async tx=>{
    const ordered=[...records].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    for(const record of ordered)await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${record.id}`}))`;
    for(const record of ordered)await tx.$queryRaw`SELECT "id" FROM "picture_books" WHERE "id" = ${record.id} FOR UPDATE`;
    for(const record of ordered){const pub=await tx.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});if(!pub)throw new Error("课件投稿记录缺失");await tx.$queryRaw`SELECT "id" FROM "course_material_publications" WHERE "id" = ${pub.id} FOR UPDATE`;}
    const materials=[];
    for(const record of records){
      const current=await tx.pictureBook.findUnique({where:{id:record.id}}),pub=await tx.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
      const latest=await tx.courseReviewRequest.findFirst({where:{materialPublicationId:pub.id,scope:"MATERIAL_CHANGE"},orderBy:{submittedAt:"desc"}});
      const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record),target={snapshot,hash:hashCourseSnapshot(snapshot)};
      assertCareerExpansionMaterialState(current,pub,latest,record,target,false);
      materials.push({publicationId:pub.id,pictureBookId:record.id,...target,approvedHash:pub.approvedHash,approvedSnapshot:pub.approvedSnapshot});
    }
    return materials;
  };
  // 上传可能耗时；重新读取工作版本，不能使用上传前的状态自动审批。
  if(course)course=await prisma.course.findUnique({where:{id:course.id},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});
  else {const refreshed=await prisma.course.findMany({where:{userId:owner,revisions:{some:{name:growthSeriesName}}},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});if(refreshed.length>1)throw new Error("出现重复系列，请人工核对");course=refreshed[0];}
  const plan=planCareerPublication(course,input);
  if(plan==="CREATE")course=await courses.createCourse(owner,input);
  checkpoint.courseId=course.id;await save();
  if(args["--mode"]==="publish"){
    if(plan!=="PUBLISHED"){
      let review=await prisma.courseReviewRequest.findFirst({where:{courseId:course.id,courseRevisionId:course.workingRevisionId,scope:"COURSE_REVISION",status:"PENDING"}});
      if(!review)review=await growthCourseOperationSafely(reviews,{owner,courseId:course.id,input,state:"DRAFT"},()=>reviews.submitCourse(owner,course.id),materialGuard);
      const materials=await Promise.all(records.map(async record=>{const pub=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record);return {publicationId:pub.id,pictureBookId:record.id,hash:hashCourseSnapshot(snapshot),snapshot,approvedHash:pub.approvedHash,approvedSnapshot:pub.approvedSnapshot};}));
      assertCareerReviewTarget(review,input,materials,{courseId:course.id,revisionId:course.workingRevisionId,userId:owner,coverUrl:cover.url});
      await growthCourseOperationSafely(reviews,{owner,courseId:course.id,input,state:"PENDING"},()=>reviews.approve(admin.id,review.id,review.updatedAt.toISOString()),async(tx,fresh)=>{
        const activeAdmin=await tx.adminUser.findUnique({where:{id:admin.id}});
        if(activeAdmin?.status!=="ACTIVE" || activeAdmin.role!=="SUPER_ADMIN")throw new Error("审核管理员权限已改变");
        const targets=await materialGuard(tx),request=await tx.courseReviewRequest.findUnique({where:{id:review.id}});
        if(!request)throw new Error("审核请求已修改");
        assertCareerReviewTarget(request,input,targets,{courseId:course.id,revisionId:fresh.workingRevisionId,userId:owner,coverUrl:cover.url});
      });
    }
    const approval=await prisma.courseReviewRequest.findFirst({where:{courseId:course.id,scope:"COURSE_REVISION",status:"APPROVED"},orderBy:{reviewedAt:"desc"}});
    if(!approval?.reviewedByAdminId)throw new Error("缺少正式管理员审核记录");
    const log={action:"APPROVE_COURSE_REVIEW",resourceType:"COURSE_REVIEW_REQUEST",resourceId:approval.id};
    if(!await prisma.adminOperationLog.findFirst({where:log}))await writeAdminOperationLog({...log,adminUserId:approval.reviewedByAdminId,description:"经授权发布《长大以后，我是谁？》动物成长科普系列，共四册，每册12页正文，5:4横版，文字内嵌于图片。"});
    if(!await prisma.adminOperationLog.findFirst({where:log}))throw new Error("审核日志写入失败");
    for(const record of records){const publication=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});if(publication?.status!=="APPROVED" || publication.approvedHash!==hashCourseSnapshot(snapshotCourseMaterial("PICTURE_BOOK",record)))throw new Error("公开课件快照与科普文稿不一致");}
    const publicCourse=await courses.getPublicCourse(course.id);if(publicCourse.items.length!==4 || publicCourse.items.some(item=>!item.launchHref))throw new Error("前台系列目录验证失败");
    checkpoint.publishedAt=new Date().toISOString();await save();
  }
  console.log(JSON.stringify({mode:args["--mode"],series:growthSeriesName,courseId:course.id,href:`/c/${course.id}`,books:records.map(r=>r.title),pageCount:12,aspectRatio:"5:4",verifiedImages:Object.keys(checkpoint.assets).length}));
}finally{try{await writer;}finally{try{await lock.end();}finally{await prisma.$disconnect();}}}
