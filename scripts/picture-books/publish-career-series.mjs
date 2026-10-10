import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { careerSeriesBooks, careerSeriesName, careerSeriesDescription } from "./career-series-data.mjs";
import { buildCareerBookRecord, assertCareerRecordMatches, planCareerPublication, assertCareerReviewTarget } from "./career-import.mjs";
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
if(generation.series!==careerSeriesName || generation.pages?.length!==48 || new Set(generation.pages.map(e=>`${e.slug}:${e.position}`)).size!==48) throw new Error("必须完成三本共48页独立插画");
const digest=buffer=>createHash("sha256").update(buffer).digest("hex");
const imageHashes=new Set();
let checkpoint, writer=Promise.resolve();
const save=()=>writer=writer.then(async()=>{await writeFile(`${checkpointFile}.tmp`,JSON.stringify(checkpoint,null,2));await rename(`${checkpointFile}.tmp`,checkpointFile);});

async function persistImage(key,path,position,slug) {
  const buffer=await readFile(path), detected=inspectImage(buffer), hash=digest(buffer);
  if(imageHashes.has(hash))throw new Error("存在重复封面或正文插画，请核对素材");imageHashes.add(hash);
  if(!detected || detected.mimeType!=="image/webp" || (key==="resource" ? detected.width*9!==detected.height*16 : detected.width*4!==detected.height*3)) throw new Error(`素材尺寸或格式错误：${key}`);
  const existing=checkpoint.assets[key];
  if(existing) {
    const asset=await prisma.mediaAsset.findUnique({where:{id:existing.id}});
    if(existing.sha256!==hash || !asset || asset.createdByUserId!==owner || asset.storageProvider!=="S3" || asset.mediaType!=="IMAGE" || asset.url!==existing.url) throw new Error("已上传素材已修改或归属不一致");
    if(digest((await media.readPictureBookStoredImage(asset.url)).buffer)!==hash) throw new Error("R2素材哈希与本地不一致");
    return existing;
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
  try{checkpoint=JSON.parse(await readFile(checkpointFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;checkpoint={series:careerSeriesName,owner,assets:{}};}
  if(checkpoint.owner!==owner || checkpoint.series!==careerSeriesName) throw new Error("恢复清单所属系列或账号不一致");
  const found=await prisma.course.findMany({where:{userId:owner,revisions:{some:{name:careerSeriesName}}},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});
  if(found.length>1) throw new Error("存在重复职业系列资源，请人工核对");
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
  await prisma.$transaction(async tx=>{for(const record of records){const existing=await tx.pictureBook.findUnique({where:{id:record.id}});if(existing)assertCareerRecordMatches(existing,record);else await tx.pictureBook.create({data:record});}});
  const input={name:careerSeriesName,coverMediaId:cover.id,summary:careerSeriesDescription,tags:["绘本","职业启蒙","幼儿园","中国城市"],items:records.map(record=>({materialType:"PICTURE_BOOK",materialId:record.id,displayName:record.title}))};
  // 上传可能耗时；重新读取工作版本，不能使用上传前的状态自动审批。
  if(course)course=await prisma.course.findUnique({where:{id:course.id},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});
  else {const refreshed=await prisma.course.findMany({where:{userId:owner,revisions:{some:{name:careerSeriesName}}},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}},workingRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});if(refreshed.length>1)throw new Error("出现重复系列，请人工核对");course=refreshed[0];}
  const plan=planCareerPublication(course,input);
  if(plan==="CREATE")course=await courses.createCourse(owner,input);
  checkpoint.courseId=course.id;await save();
  if(args["--mode"]==="publish"){
    if(plan!=="PUBLISHED"){
      let review=await prisma.courseReviewRequest.findFirst({where:{courseId:course.id,courseRevisionId:course.workingRevisionId,scope:"COURSE_REVISION",status:"PENDING"}});
      if(!review)review=await reviews.submitCourse(owner,course.id);
      const materials=await Promise.all(records.map(async record=>{const pub=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record);return {publicationId:pub.id,pictureBookId:record.id,hash:hashCourseSnapshot(snapshot),snapshot,approvedHash:pub.approvedHash,approvedSnapshot:pub.approvedSnapshot};}));
      assertCareerReviewTarget(review,input,materials,{courseId:course.id,revisionId:course.workingRevisionId,userId:owner,coverUrl:cover.url});
      await reviews.approve(admin.id,review.id,review.updatedAt.toISOString());
    }
    const approval=await prisma.courseReviewRequest.findFirst({where:{courseId:course.id,scope:"COURSE_REVISION",status:"APPROVED"},orderBy:{reviewedAt:"desc"}});
    if(!approval?.reviewedByAdminId)throw new Error("缺少正式管理员审核记录");
    const log={action:"APPROVE_COURSE_REVIEW",resourceType:"COURSE_REVIEW_REQUEST",resourceId:approval.id};
    if(!await prisma.adminOperationLog.findFirst({where:log}))await writeAdminOperationLog({...log,adminUserId:approval.reviewedByAdminId,description:"经授权发布《我想成为》职业启蒙系列：医生、消防员、老师，共三本，每本16页正文，3:4竖版。"});
    if(!await prisma.adminOperationLog.findFirst({where:log}))throw new Error("审核日志写入失败");
    for(const record of records){const publication=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});if(publication?.status!=="APPROVED" || publication.approvedHash!==hashCourseSnapshot(snapshotCourseMaterial("PICTURE_BOOK",record)))throw new Error("公开课件快照与职业文稿不一致");}
    const publicCourse=await courses.getPublicCourse(course.id);if(publicCourse.items.length!==3 || publicCourse.items.some(item=>!item.launchHref))throw new Error("前台系列目录验证失败");
    checkpoint.publishedAt=new Date().toISOString();await save();
  }
  console.log(JSON.stringify({mode:args["--mode"],series:careerSeriesName,courseId:course.id,href:`/c/${course.id}`,books:records.map(r=>r.title),pageCount:16,aspectRatio:"3:4",verifiedImages:Object.keys(checkpoint.assets).length}));
}finally{try{await writer;}finally{try{await lock.end();}finally{await prisma.$disconnect();}}}
