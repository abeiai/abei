import {readFile,writeFile,rename,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {isDeepStrictEqual} from "node:util";
import {growthSeriesBooks,growthSeriesName,growthSeriesDescription} from "./growth-series-data.mjs";
import {buildGrowthBookRecord} from "./growth-import.mjs";
import {assertAbEiImportTarget} from "./lele-import.mjs";
import {assertNarrationSource,assertNarrationApproval} from "./lele-narration.mjs";
import {growthCourseOperationSafely} from "./growth-publication-guard.mjs";
import {growthNarrationVoice as voice,growthNarrationModel as modelName,growthNarrationSpeed as speed,growthNarrationKey as keyFor,planGrowthNarrationEntry as planEntry,applyGrowthNarrationPages as applyPages,assertGrowthNarrationPublication,finalizeGrowthNarrationPublication} from "./growth-narration.mjs";

// 本地运营配音：密钥仅从已加密的服务商配置读取，不写入脚本、请求记录或清单。
const owner="abei-lele-studio",courseId="1885e24ff148bd1a9a877cdd",modelId="cmupm4wcp005izy8oleycz6i8",total=52;
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf("=");return [a.slice(0,i),a.slice(i+1)];}));
if(!args["--images"]||!args["--output"]||!args["--admin-id"]||!["generate","publish"].includes(args["--mode"]))throw new Error("须指定 --images、--output、--admin-id 和 --mode=generate/publish");
const limit=args["--limit"]?Number(args["--limit"]):total;if(!Number.isSafeInteger(limit)||limit<1||limit>total)throw new Error("生成数量须为1至52");
assertAbEiImportTarget(process.env.DATABASE_URL);
const images=JSON.parse(await readFile(args["--images"],"utf8"));
if(images.courseId!==courseId||images.owner!==owner||images.series!==growthSeriesName)throw new Error("图片清单不属于目标系列");
const expected=growthSeriesBooks.map(b=>buildGrowthBookRecord(b,owner,Object.fromEntries(Array.from({length:13},(_,i)=>[i,images.assets[`${b.slug}:${i}`]?.url]))));
const input={name:growthSeriesName,coverMediaId:images.assets.resource.id,summary:growthSeriesDescription,tags:["绘本","自然科普","动物成长","亲子共读"],items:expected.map(b=>({materialType:"PICTURE_BOOK",materialId:b.id,displayName:b.title}))};
const runtime=path=>import(pathToFileURL(resolve(process.cwd(),path)).href);
createRequire(resolve(process.cwd(),"apps/api-core/package.json"))("reflect-metadata");
const [{getPrismaClient},{AudioService},{MediaService},{CourseReviewService},{snapshotCourseMaterial,hashCourseSnapshot},{writeAdminOperationLog}]=await Promise.all([
  runtime("packages/database/dist/index.js"),runtime("apps/api-core/dist/audio/audio.service.js"),runtime("apps/api-core/dist/media/media.service.js"),runtime("apps/api-core/dist/courses/course-review.service.js"),runtime("apps/api-core/dist/courses/course-domain.js"),runtime("apps/api-core/dist/security/admin-operation-log.js")
]);
const {Client}=createRequire(resolve(process.cwd(),"packages/database/package.json"))("pg");
const lock=new Client({connectionString:process.env.DATABASE_URL}),p=getPrismaClient(),audio=new AudioService(),media=new MediaService(),reviews=new CourseReviewService();
const output=resolve(args["--output"]),manifestFile=resolve(output,"manifest.json"),digest=buffer=>createHash("sha256").update(buffer).digest("hex");
let manifest,writer=Promise.resolve();
const save=()=>writer=writer.then(async()=>{await writeFile(`${manifestFile}.tmp`,JSON.stringify(manifest,null,2));await rename(`${manifestFile}.tmp`,manifestFile);});
const entriesFor=book=>Object.fromEntries(book.pages.map(page=>[page.position,manifest.entries[keyFor(book.id,page)]]));
async function verifyAudio(entry){
  const asset=await p.audioAsset.findUnique({where:{id:entry.assetId}});
  if(!asset||asset.userId!==owner||asset.type!=="TTS_OUTPUT"||asset.storageProvider!=="S3"||asset.url!==entry.url)throw new Error("音频素材归属不一致");
  const stored=await media.readPictureBookStoredAudio(entry.url);
  if(stored.buffer.length!==asset.sizeBytes||digest(stored.buffer)!==entry.sha256||!stored.mimetype.startsWith("audio/"))throw new Error("R2音频哈希、大小或类型不一致");
}
async function materialGuard(tx,record,target,{update=false,requestId=null,requireTarget=false}={}){
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${record.id}`}))`;
  await tx.$queryRaw`SELECT "id" FROM "picture_books" WHERE "id" = ${record.id} FOR UPDATE`;
  const ref=await tx.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});if(!ref)throw new Error("课件公开记录缺失");
  await tx.$queryRaw`SELECT "id" FROM "course_material_publications" WHERE "id" = ${ref.id} FOR UPDATE`;
  const current=await tx.pictureBook.findUnique({where:{id:record.id}}),pub=await tx.courseMaterialPublication.findUnique({where:{id:ref.id}});
  assertNarrationSource(current,record);
  const latest=await tx.courseReviewRequest.findFirst({where:{materialPublicationId:ref.id,scope:"MATERIAL_CHANGE"},orderBy:{submittedAt:"desc"}});
  assertGrowthNarrationPublication(pub,latest,snapshotCourseMaterial("PICTURE_BOOK",record),target,hashCourseSnapshot);
  const admin=await tx.adminUser.findUnique({where:{id:args["--admin-id"]}});
  if(admin?.status!=="ACTIVE"||admin.role!=="SUPER_ADMIN")throw new Error("审核管理员权限已改变");
  const user=await tx.user.findUnique({where:{id:owner},select:{email:true,status:true}});
  if(user?.email!=="lele-studio@abei.example"||user.status!=="ACTIVE")throw new Error("作者状态已改变");
  const pages=applyPages(current,entriesFor(record));
  if(requireTarget)assertNarrationApproval(target,snapshotCourseMaterial("PICTURE_BOOK",current),target);
  if(update&&!isDeepStrictEqual(current.pages,pages)){
    const result=await tx.pictureBook.updateMany({where:{id:record.id,userId:owner,version:current.version},data:{pages,version:{increment:1}}});
    if(result.count!==1)throw new Error("作品已被同时编辑");
  }
  if(requestId){
    const request=await tx.courseReviewRequest.findUnique({where:{id:requestId}});
    if(!request||latest?.id!==requestId||request.scope!=="MATERIAL_CHANGE"||request.materialPublicationId!==pub.id||request.submittedByUserId!==owner||request.status!=="PENDING")throw new Error("配音审核请求已改变");
    assertNarrationApproval(target,snapshotCourseMaterial("PICTURE_BOOK",current),request.afterSnapshot);
  }
}
try{
  await lock.connect();if(!(await lock.query("SELECT pg_try_advisory_lock(hashtext('abei-growth-series-import')) AS locked")).rows[0].locked)throw new Error("目标系列正在修改，请勿并发运行");
  const admin=await p.adminUser.findUnique({where:{id:args["--admin-id"]}});
  if(admin?.status!=="ACTIVE"||admin.role!=="SUPER_ADMIN")throw new Error("须指定有效超级管理员");
  const course=await p.course.findUnique({where:{id:courseId},include:{approvedRevision:{include:{items:{orderBy:{sortOrder:"asc"}}}}}});
  if(course?.userId!==owner||course.reviewState!=="PUBLISHED"||!isDeepStrictEqual(course.approvedRevision.items.map(i=>i.pictureBookId),expected.map(b=>b.id)))throw new Error("系列作者、公开状态或目录已改变");
  for(const record of expected)assertNarrationSource(await p.pictureBook.findUnique({where:{id:record.id}}),record);
  media.assertPictureBookR2Ready();
  const model=await audio.getAudioModelById(modelId,"TTS");
  if(model.providerKey!=="minimax_audio"||model.adapterType!=="MINIMAX_AUDIO"||model.modelName!==modelName)throw new Error("必须使用已启用的Minimax speech-2.8-hd模型");
  const apiKey=audio.resolveProviderApiKey(model);
  await mkdir(output,{recursive:true});
  try{manifest=JSON.parse(await readFile(manifestFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;manifest={courseId,owner,provider:"minimax_audio",model:modelName,modelInstanceId:modelId,voice,speed,createdAt:new Date().toISOString(),entries:{}};}
  if(manifest.courseId!==courseId||manifest.owner!==owner||manifest.provider!=="minimax_audio"||manifest.model!==modelName||manifest.modelInstanceId!==modelId||manifest.voice!==voice||manifest.speed!==speed)throw new Error("配音清单目标不一致");
  await save();
  if(args["--mode"]==="generate"){
    const gateway=new URL(process.env.AI_GATEWAY_BASE_URL||"http://ai-gateway:3603");
    if(gateway.protocol!=="http:"||gateway.port!=="3603"||!["ai-gateway","localhost","127.0.0.1"].includes(gateway.hostname))throw new Error("仅使用abei的3603语音网关");
    const queue=expected.flatMap(book=>book.pages.map(page=>({book,page,key:keyFor(book.id,page)}))).filter(({book,page,key})=>planEntry(manifest.entries[key],book.id,page)!=="REUSE").slice(0,limit);
    const rateFailures=Object.values(manifest.entries).filter(e=>e.status==="FAILED_RESPONSE"&&e.failure?.errorCode==="MINIMAX_STATUS_1002");
    let nextRequestAt=Math.max(Date.now(),...rateFailures.map(e=>Date.parse(e.requestedAt)+65000));
    let stopped=false;
    const results=await Promise.allSettled(Array.from({length:1},async()=>{
      while(queue.length&&!stopped){
        const {book,page,key}=queue.shift();
        try{
          let entry=manifest.entries[key];const payloadFile=resolve(output,`${key}.json`);
          if(planEntry(entry,book.id,page)==="GENERATE"){
            const delay=Math.max(0,nextRequestAt-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));
            nextRequestAt=Date.now()+3000;
            entry=manifest.entries[key]={key,bookId:book.id,position:page.position,text:page.narration,voice,model:modelName,speed,status:"REQUESTING",requestedAt:new Date().toISOString(),attempts:(entry?.attempts??(entry?1:0))+1,failures:[...(entry?.failures??[]),...(entry?.failure?[entry.failure]:[])]};await save();
            const response=await fetch(`${gateway.origin}/audio/tts`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({baseUrl:model.baseUrl,webSocketUrl:model.webSocketUrl,apiKey,region:model.region,providerKey:model.providerKey,adapterType:model.adapterType,model:modelName,voice,text:page.narration,format:"mp3",sampleRate:24000,speed,timeoutMs:90000}),signal:AbortSignal.timeout(100000)});
            const payload=await response.json();
            if(!response.ok){Object.assign(entry,{status:"FAILED_RESPONSE",failure:{httpStatus:response.status,errorCode:payload.detail?.errorCode,message:payload.detail?.errorMessage}});await save();throw new Error(`Minimax语音请求失败：HTTP ${response.status}`);}
            if(payload.provider!=="minimax_audio"||payload.model!==modelName||payload.voice!==voice||!payload.audioBase64)throw new Error("服务商输出缺失或音色、模型不一致");
            await writeFile(payloadFile,JSON.stringify({key,payload}));
            Object.assign(entry,{status:"GENERATED",payloadFile:`${key}.json`,requestId:payload.requestId,usage:payload.usage});await save();
          }
          const receipt=JSON.parse(await readFile(payloadFile,"utf8")),payload=receipt.payload;
          if(receipt.key!==key||payload.provider!=="minimax_audio"||payload.model!==modelName||payload.voice!==voice)throw new Error("音频生成回执与任务不一致");
          const buffer=Buffer.from(payload.audioBase64,"base64"),sha256=digest(buffer);
          if(!buffer.length)throw new Error("生成音频为空");
          const filename=`${book.id}-${String(page.position).padStart(2,"0")}.mp3`;await writeFile(resolve(output,filename),buffer);
          if(!entry.storage){entry.storage=await audio.persistTtsAudioToS3(payload);await save();}
          let asset=await p.audioAsset.findFirst({where:{userId:owner,url:entry.storage.url,type:"TTS_OUTPUT"}});
          const durationMs=Number(payload.raw?.extra_info?.audio_length)||null;
          if(!asset)asset=await audio.createAudioAsset(owner,{type:"TTS_OUTPUT",storageProvider:"S3",...entry.storage,durationMs,sampleRate:24000,channels:1});
          Object.assign(entry,{status:"READY",url:asset.url,assetId:asset.id,sizeBytes:asset.sizeBytes,sha256,filename,durationMs});await verifyAudio(entry);await save();
          console.log(JSON.stringify({ready:Object.values(manifest.entries).filter(e=>e.status==="READY").length,total,book:book.title,page:page.position,durationMs}));
        }catch(error){stopped=true;throw error;}
      }
    }));const failure=results.find(r=>r.status==="rejected");if(failure)throw failure.reason;
  }else{
    const hashes=new Set();
    for(const record of expected){applyPages(record,entriesFor(record));for(const entry of Object.values(entriesFor(record))){await verifyAudio(entry);if(hashes.has(entry.sha256))throw new Error("不同页面返回重复音频");hashes.add(entry.sha256);}}
    for(const record of expected){
      const pages=applyPages(record,entriesFor(record)),target=snapshotCourseMaterial("PICTURE_BOOK",{...record,pages}),targetHash=hashCourseSnapshot(target);
      let pub=await p.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
      if(pub.approvedHash!==targetHash){
        await growthCourseOperationSafely(reviews,{owner,courseId,input,state:"PUBLISHED"},()=>reviews.recordMaterialChange("PICTURE_BOOK",record.id),tx=>materialGuard(tx,record,target,{update:true}));
        pub=await p.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
        const request=await p.courseReviewRequest.findFirst({where:{materialPublicationId:pub.id,scope:"MATERIAL_CHANGE",status:"PENDING"},orderBy:{submittedAt:"desc"}});
        if(!request)throw new Error("缺少配音变更审核请求");
        await growthCourseOperationSafely(reviews,{owner,courseId,input,state:"PUBLISHED"},()=>reviews.approve(admin.id,request.id,request.updatedAt.toISOString()),tx=>materialGuard(tx,record,target,{requestId:request.id}));
      }
      await finalizeGrowthNarrationPublication(
        ()=>growthCourseOperationSafely(reviews,{owner,courseId,input,state:"PUBLISHED"},()=>reviews.prisma.$transaction(async()=>{}),tx=>materialGuard(tx,record,target,{requireTarget:true})),
        async()=>{
      const approval=await p.courseReviewRequest.findFirst({where:{materialPublicationId:pub.id,scope:"MATERIAL_CHANGE",status:"APPROVED"},orderBy:{reviewedAt:"desc"}});
      if(!approval?.reviewedByAdminId||hashCourseSnapshot(approval.afterSnapshot)!==targetHash)throw new Error("缺少匹配配音内容的正式审核记录");
      const log={action:"APPROVE_COURSE_REVIEW",resourceType:"COURSE_REVIEW_REQUEST",resourceId:approval.id};
      if(!await p.adminOperationLog.findFirst({where:log}))await writeAdminOperationLog({...log,adminUserId:approval.reviewedByAdminId,description:`经授权为《${record.title}》封面及12页正文发布Minimax配音；音色Chinese_huolishaonv，共13段。`});
      const final=await p.courseMaterialPublication.findUnique({where:{id:pub.id}});
      if(final.status!=="APPROVED"||final.approvedHash!==targetHash||!await p.adminOperationLog.findFirst({where:log}))throw new Error("配音公开版本或审核日志验证失败");
      console.log(JSON.stringify({published:record.title,clips:13,voice}));
      });
    }
    manifest.publishedAt=new Date().toISOString();await save();
  }
  console.log(JSON.stringify({mode:args["--mode"],ready:Object.values(manifest.entries).filter(e=>e.status==="READY").length,total,courseId,model:modelName,voice}));
}finally{try{await writer;}finally{try{await lock.end();}finally{await p.$disconnect();}}}
