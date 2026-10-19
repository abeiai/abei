import {guardedService,assertNewSubmission,assertDraftCourse} from './xuxiake-review-guards.mjs';
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { bookId, buildBookRecord, ownerId, sha256, books, seriesTitle, seriesSummary, seriesTags, assertLocalTarget, assertPublicationState, assertPendingSubmission, approvalAdminId, approvalAdminIdentity, localSystemId, selectedCover } from "./xuxiake-publication.mjs";
import { planCareerPublication, assertCareerRecordMatches, assertCareerReviewTarget } from "./career-import.mjs";

const root = resolve(import.meta.dirname, "../..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const index = arg.indexOf("="); return [arg.slice(0, index), arg.slice(index + 1)]; }));
if (!["prepare", "publish", "verify"].includes(args["--mode"]) || !args["--admin-id"] || !args["--checkpoint"]) {
  throw Error("请指定 --mode=prepare/publish/verify、--admin-id 与 --checkpoint");
}
process.loadEnvFile(resolve(args["--env-file"] ?? resolve(root, ".env")));
if (!process.env.POSTGRES_PASSWORD) throw Error("缺少本地数据库配置");
process.env.DATABASE_URL = `postgresql://abei:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:3604/abei?schema=public`;
process.env.UPLOAD_DRIVER="s3";
assertLocalTarget(process.env);
const assetRoot=resolve(args["--root"]);
const coverManifest=JSON.parse(await readFile(resolve(assetRoot,"album/series-cover-publication.json")));

const runtime = (path) => import(pathToFileURL(resolve(root, path)).href);
createRequire(resolve(root, "apps/api-core/package.json"))("reflect-metadata");
const [{ getPrismaClient }, { MediaService }, { AudioService }, { CoursesService }, { CourseReviewService }, { PictureBookSubmissionService }, { normalizePictureBookLibraryCover }, { snapshotCourseMaterial, hashCourseSnapshot }, { writeAdminOperationLog }] = await Promise.all([
  runtime("packages/database/dist/index.js"), runtime("apps/api-core/dist/media/media.service.js"),
  runtime("apps/api-core/dist/audio/audio.service.js"), runtime("apps/api-core/dist/courses/courses.service.js"),
  runtime("apps/api-core/dist/courses/course-review.service.js"), runtime("apps/api-core/dist/picture-books/picture-book-submission.service.js"),
  runtime("apps/api-core/dist/picture-books/picture-book-library-cover.js"), runtime("apps/api-core/dist/courses/course-domain.js"),
  runtime("apps/api-core/dist/security/admin-operation-log.js"),
]);
const prisma = getPrismaClient(), media = new MediaService(), audio = new AudioService();
const courses = new CoursesService(), reviews = new CourseReviewService(), submissions = new PictureBookSubmissionService(null, media);
const checkpointFile = resolve(args["--checkpoint"]);
let checkpoint;
try { checkpoint = JSON.parse(await readFile(checkpointFile)); }
catch (error) { if (error.code !== "ENOENT") throw error; checkpoint = { series: seriesTitle, owner: ownerId, assets: {} }; }
if (checkpoint.series !== seriesTitle || checkpoint.owner !== ownerId) throw Error("断点记录属于其他作品");
let saving = Promise.resolve();
const save = () => saving = saving.then(async () => {
  await mkdir(dirname(checkpointFile), { recursive: true, mode: 0o700 });
  await writeFile(`${checkpointFile}.tmp`, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
  await rename(`${checkpointFile}.tmp`, checkpointFile);
});

async function persist(key, bytes, kind, mimeType, dimensions) {
  const hash = sha256(bytes), previous = checkpoint.assets[key];
  if (previous) {
    if (previous.status === "UPLOADING" && args["--reconcile-key"] === key && args["--reconcile-id"]) {
      const found = kind === "audio" ? await prisma.audioAsset.findUnique({ where: { id: args["--reconcile-id"] } }) : await prisma.mediaAsset.findUnique({ where: { id: args["--reconcile-id"] } });
      if (!found || found.url?.startsWith("https://r.abeiai.com/") !== true ||
          (kind === "audio" ? found.userId : found.createdByUserId) !== ownerId) throw Error(`待核对素材 ID 无效：${key}`);
      const recovered = kind === "audio" ? await media.readPictureBookStoredAudio(found.url) : await media.readPictureBookStoredImage(found.url);
      if (sha256(recovered.buffer) !== hash) throw Error(`待核对素材的 R2 哈希不符：${key}`);
      checkpoint.assets[key] = { status: "READY", id: found.id, url: found.url, sha256: hash, sizeBytes: bytes.length, mimeType, dimensions };
      await save();
    }
    if (checkpoint.assets[key].status !== "READY" || checkpoint.assets[key].sha256 !== hash) throw Error(`素材上传结果不明或内容变化：${key}；确认数据库资产和 R2 字节后，使用 --reconcile-key 与 --reconcile-id 恢复`);
    const ready = checkpoint.assets[key];
    const row = kind === "audio" ? await prisma.audioAsset.findUnique({ where: { id: ready.id } }) : await prisma.mediaAsset.findUnique({ where: { id: ready.id } });
    if (!row || row.url !== ready.url || row.storageProvider !== "S3" ||
        (kind === "audio" ? row.userId : row.createdByUserId) !== ownerId) throw Error(`已上传素材归属变化：${key}`);
    const stored = kind === "audio" ? await media.readPictureBookStoredAudio(ready.url) : await media.readPictureBookStoredImage(ready.url);
    if (sha256(stored.buffer) !== hash) throw Error(`已上传素材的 R2 哈希变化：${key}`);
    return ready;
  }
  checkpoint.assets[key] = { status: "UPLOADING", sha256: hash, startedAt: new Date().toISOString() };
  await save();
  const file = { originalname: `xuxiake-${key.replaceAll(":", "-")}.${kind === "audio" ? "mp3" : mimeType.split("/")[1]}`, mimetype: mimeType, size: bytes.length, buffer: bytes };
  const asset = kind === "audio" ? await audio.uploadAudioAsset(ownerId, "TTS_OUTPUT", file)
    : kind === "resource" ? await media.uploadUserCourseCover(ownerId, file)
    : await media.uploadUserPictureBookImage(ownerId, file, true);
  if (asset.storageProvider !== "S3" || !asset.url.startsWith("https://r.abeiai.com/")) throw Error(`素材未进入指定 R2：${key}`);
  const stored = kind === "audio" ? await media.readPictureBookStoredAudio(asset.url) : await media.readPictureBookStoredImage(asset.url);
  if (sha256(stored.buffer) !== hash) throw Error(`R2 上传后哈希不一致：${key}`);
  checkpoint.assets[key] = { status: "READY", id: asset.id, url: asset.url, sha256: hash, sizeBytes: bytes.length, mimeType, dimensions };
  await save();
  console.log(JSON.stringify({ ready: key, completed: Object.values(checkpoint.assets).filter((item) => item.status === "READY").length }));
  return checkpoint.assets[key];
}

async function expectedRecords() {
  return books.map((book) => buildBookRecord(book,
    Array.from({ length: 17 }, (_, position) => checkpoint.assets[`image:${book.slug}:${position}`]?.url),
    Array.from({ length: 17 }, (_, position) => checkpoint.assets[`audio:${book.slug}:${position}`]?.url)));
}

const {Client}=createRequire(resolve(root,"packages/database/package.json"))("pg");
const lockClient=new Client({connectionString:process.env.DATABASE_URL});
await lockClient.connect();
const locked=await lockClient.query("SELECT pg_try_advisory_lock(20261019, 160256) AS locked");
if(!locked.rows[0].locked){await lockClient.end();throw Error("已有徐霞客游记绘本版发布任务执行中");}
try {
  const identity=(await lockClient.query("SELECT current_database() AS db,current_setting('port') AS port,system_identifier::text AS system FROM pg_control_system()")).rows[0];
  if(identity.db!=="abei"||identity.port!=="3604"||identity.system!==localSystemId)throw Error("本地数据库实例身份不符");
  const adminIdentity=(await lockClient.query("SELECT md5(email || '|' || name) AS digest FROM admin_users WHERE id=$1",[args["--admin-id"]])).rows[0];
  if(args["--admin-id"]!==approvalAdminId||adminIdentity?.digest!==approvalAdminIdentity)throw Error("审核管理员身份不符");
  const user = await prisma.user.findUnique({ where: { id: ownerId } });
  const admin = await prisma.adminUser.findUnique({ where: { id: args["--admin-id"] } });
  if (user?.email !== "lele-studio@abei.example" || user.status !== "ACTIVE" || admin?.role !== "SUPER_ADMIN" || admin.status !== "ACTIVE") throw Error("作者或审核管理员身份不符");
  const existingBooks = await prisma.pictureBook.findMany({ where: { OR: [{ id: { in: books.map((book) => bookId(book.slug)) } }, { title: { in: books.map((book) => book.title) } }] } });
  if (existingBooks.some((row) => row.userId !== ownerId || !books.some((book) => row.id === bookId(book.slug) && row.title === book.title))) throw Error("已有同名或同 ID 作品，不能覆盖");
  const existingSeries = await prisma.courseRevision.findMany({ where: { name: seriesTitle }, select: { courseId: true } });
  if (new Set(existingSeries.map((row) => row.courseId)).size > 1) throw Error("存在重复同名系列");

  const seriesRows=await prisma.course.findMany({where:{id:{in:existingSeries.map(r=>r.courseId)}}});
  if(seriesRows.some(c=>c.userId!==ownerId))throw Error("同名系列不属于指定作者");
  const countTables=["pictureBook","course","courseRevision","courseReviewRequest","courseMaterialPublication","pictureBookSubmission","mediaAsset","audioAsset","adminOperationLog"];
  const counts=async()=>Object.fromEntries(await Promise.all(countTables.map(async name=>[name,await prisma[name].count()])));
  if(!checkpoint.beforeCounts){checkpoint.beforeCounts=await counts();checkpoint.initialRows={books:existingBooks,courses:seriesRows};await save();}
  if (args["--mode"] !== "verify") {
    media.assertPictureBookR2Ready();
    const pendingImages=books.flatMap(book=>book.images.map((entry,position)=>({book,entry,position})));
    let nextImage=0,uploadStopped=false;
    const uploadResults=await Promise.allSettled(Array.from({length:4},async()=>{
    while(!uploadStopped&&nextImage<pendingImages.length){
      const {book,entry,position}=pendingImages[nextImage++];
      const bytes = await readFile(resolve(assetRoot, entry.file));
      if (sha256(bytes) !== entry.sha256) throw Error(`已选插画内容变化：${book.slug}:${position}`);
      try { await persist(`image:${book.slug}:${position}`, bytes, "image", "image/png", entry.dimensions); } catch(error) { uploadStopped=true; throw error; }
    }
    }));
    const uploadFailure=uploadResults.find(r=>r.status==='rejected');if(uploadFailure)throw uploadFailure.reason;
    const pendingAudio=books.flatMap(book=>book.audio.map((entry,position)=>({book,entry,position})));
    let nextAudio=0,audioStopped=false;
    const audioResults=await Promise.allSettled(Array.from({length:4},async()=>{
      while(!audioStopped&&nextAudio<pendingAudio.length){const {book,entry,position}=pendingAudio[nextAudio++];
        try { const bytes=await readFile(resolve(assetRoot,entry.output));if(sha256(bytes)!==entry.sha256)throw Error(`配音选稿内容变化：${book.slug}:${position}`);await persist(`audio:${book.slug}:${position}`,bytes,'audio','audio/mpeg',null); }
        catch(error){audioStopped=true;throw error;}
      }
    }));const audioFailure=audioResults.find(r=>r.status==='rejected');if(audioFailure)throw audioFailure.reason;
    for (const book of books) {
      const source = await readFile(resolve(assetRoot, book.images[0].file));
      const libraryCover = await normalizePictureBookLibraryCover(source);
      if(sha256(libraryCover)!==selectedCover.libraries[`library:${book.slug}`].sha256)throw Error("目录封面选稿哈希变化");
      await persist(`library:${book.slug}`, libraryCover, "image", "image/png", [1536, 1152]);
    }
    const seriesCover = await readFile(resolve(assetRoot, "album/series-cover-publication.png"));
    if(sha256(seriesCover)!==selectedCover.sha256||!isDeepStrictEqual(coverManifest.dimensions,selectedCover.dimensions)||sha256(seriesCover)!==coverManifest.sha256)throw Error("系列入口封面内容变化");
    await persist("resource", seriesCover, "resource", "image/png", coverManifest.dimensions);
  }
  if (Object.keys(checkpoint.assets).length !== 561 || Object.values(checkpoint.assets).some(item=>item.status!=="READY")) throw Error("561份图片素材尚未齐全");
  if (args["--mode"] === "verify") {
    let next=0;const pending=Object.entries(checkpoint.assets);
    const checks=await Promise.allSettled(Array.from({length:4},async()=>{while(next<pending.length){const [key,entry]=pending[next++],isAudio=key.startsWith('audio:');
      const row=isAudio?await prisma.audioAsset.findUnique({where:{id:entry.id}}):await prisma.mediaAsset.findUnique({where:{id:entry.id}});
      if(!row||row.url!==entry.url||row.storageProvider!=='S3'||(isAudio?row.userId:row.createdByUserId)!==ownerId)throw Error(`素材归属变化：${key}`);
      const stored=isAudio?await media.readPictureBookStoredAudio(entry.url):await media.readPictureBookStoredImage(entry.url);
      if(sha256(stored.buffer)!==entry.sha256||stored.buffer.length!==entry.sizeBytes)throw Error(`R2素材哈希不符：${key}`);
    }}));const failed=checks.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  }

  const records = await expectedRecords();
  const preflightPublication=async()=>{
    for(const record of records){
      const existing=await prisma.pictureBook.findUnique({where:{id:record.id}});
      if(existing)assertCareerRecordMatches(existing,record);
      const publication=await prisma.courseMaterialPublication.findUnique({where:{pictureBookId:record.id}});
      const submission=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:record.id}});
      const materialReview=publication?await prisma.courseReviewRequest.findFirst({where:{materialPublicationId:publication.id,scope:"MATERIAL_CHANGE"},orderBy:{createdAt:"desc"}}):null;
      if(submission?.status==="PENDING" && checkpoint.pendingSubmissions?.[record.id]!==submission.id)throw Error(`已有非本次任务待审投稿：${record.id}`);
      const snapshot=snapshotCourseMaterial("PICTURE_BOOK",record);
      assertPublicationState(publication,submission,materialReview,{hash:hashCourseSnapshot(snapshot),snapshot,libraryUrl:checkpoint.assets[`library:${record.id.slice(-2)}`].url,adminId:admin.id});
    }
  };
  await preflightPublication();
  if (args["--mode"] !== "verify") {
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const existing = await tx.pictureBook.findUnique({ where: { id: record.id } });
        if (existing) assertCareerRecordMatches(existing, record);
        else await tx.pictureBook.create({ data: record });
      }
    });
    const input = {
      name: seriesTitle, summary: seriesSummary, coverMediaId: checkpoint.assets.resource.id,
      tags: seriesTags,
      items: records.map((record) => ({ materialType: "PICTURE_BOOK", materialId: record.id, displayName: record.title })),
    };
    let course = existingSeries.length ? await prisma.course.findUnique({ where: { id: existingSeries[0].courseId }, include: { approvedRevision: { include: { items: { orderBy: { sortOrder: "asc" } } } }, workingRevision: { include: { items: { orderBy: { sortOrder: "asc" } } } } } }) : null;
    const plan = planCareerPublication(course, input);
    if(plan==="PENDING" && checkpoint.courseId!==course.id)throw Error("已有非本次任务待审系列");
    if (plan === "CREATE") course = await courses.createCourse(ownerId, input);
    checkpoint.courseId = course.id;
    await save();
    if (args["--mode"] === "publish") {
      let review = await prisma.courseReviewRequest.findFirst({ where: { courseId: course.id, scope: "COURSE_REVISION", status: "PENDING" } });
      if (plan !== "PUBLISHED") {
        if(review && checkpoint.pendingCourseReviewId!==review.id)throw Error("已有非本次任务待审系列版本");
        if (!review) {
          if(plan==='PENDING'||checkpoint.pendingCourseReviewId)throw Error('本次待审版本已被处理，停止重新提交');
          const draft=await prisma.course.findUnique({where:{id:course.id},select:{workingRevisionId:true}});
          review=await guardedService(reviews,tx=>assertDraftCourse(tx,course.id,draft?.workingRevisionId)).submitCourse(ownerId,course.id);
          checkpoint.pendingCourseReviewId=review.id;await save();
        }
        const materials = await Promise.all(records.map(async (record) => {
          const pub = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
          const snapshot = snapshotCourseMaterial("PICTURE_BOOK", record);
          return { publicationId: pub.id, pictureBookId: record.id, hash: hashCourseSnapshot(snapshot), snapshot, approvedHash: pub.approvedHash, approvedSnapshot: pub.approvedSnapshot };
        }));
        assertCareerReviewTarget(review, input, materials, { courseId: course.id, revisionId: review.courseRevisionId, userId: ownerId, coverUrl: checkpoint.assets.resource.url });
        await preflightPublication();
        await reviews.approve(admin.id, review.id, review.updatedAt.toISOString());
      }
      const approved = await prisma.courseReviewRequest.findFirst({ where: { courseId: course.id, scope: "COURSE_REVISION", status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
      if (!approved || approved.reviewedByAdminId !== admin.id) throw Error("系列缺少管理员正式审核记录");
      if (!await prisma.adminOperationLog.findFirst({ where: { action: "APPROVE_COURSE_REVIEW", resourceType: "COURSE_REVIEW_REQUEST", resourceId: approved.id } })) {
        await writeAdminOperationLog({ adminUserId: admin.id, action: "APPROVE_COURSE_REVIEW", resourceType: "COURSE_REVIEW_REQUEST", resourceId: approved.id, description: "经授权审核通过《徐霞客游记绘本版》十六册系列绘本" });
      }
      checkpoint.courseReviewId = approved.id;
      await save();
      for (const book of books) {
        const record = records.find((item) => item.id === bookId(book.slug));
        const snapshot = snapshotCourseMaterial("PICTURE_BOOK", record);
        const expectedHash = hashCourseSnapshot(snapshot);
        const pub = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
        if (pub?.status !== "APPROVED" || pub.approvedHash !== expectedHash || !isDeepStrictEqual(pub.approvedSnapshot, snapshot)) throw Error(`系列课件审核快照不符：${book.slug}`);
        let submission = await prisma.pictureBookSubmission.findUnique({ where: { pictureBookId: record.id } });
        if (submission?.status === "REJECTED" || submission?.snapshotHash && submission.snapshotHash !== expectedHash) throw Error(`既有投稿与当前作品冲突：${book.slug}`);
        if(submission?.status==="PENDING" && checkpoint.pendingSubmissions?.[record.id]!==submission.id)throw Error("投稿预检后出现其他待审版本");
        if (submission?.status !== "APPROVED") {
          if(!submission){
            await guardedService(submissions,tx=>assertNewSubmission(tx,record.id)).submit(ownerId,record.id);
          }
          submission = await prisma.pictureBookSubmission.findUnique({ where: { pictureBookId: record.id } });
          checkpoint.pendingSubmissions??={};checkpoint.pendingSubmissions[record.id]=submission.id;await save();
          const libraryUrl = checkpoint.assets[`library:${book.slug}`].url;
          if (submission.coverUrl && submission.coverUrl !== libraryUrl) throw Error(`既有投稿封面已被修改：${book.slug}`);
          if (!submission.coverUrl) {
            const changed=await prisma.pictureBookSubmission.updateMany({where:{id:submission.id,status:"PENDING",updatedAt:submission.updatedAt,snapshotHash:expectedHash,coverUrl:null,coverToken:null},data:{coverUrl:libraryUrl}});
            if(changed.count!==1)throw Error("投稿在设置目录封面时已变化");
            submission = await prisma.pictureBookSubmission.findUnique({ where: { id: submission.id } });
          }
          assertPendingSubmission(submission,{id:checkpoint.pendingSubmissions[record.id],bookId:record.id,hash:expectedHash,snapshot,libraryUrl});
          await submissions.decide(admin.id, submission.id, submission.updatedAt.toISOString(), "APPROVED");
        }
        submission = await prisma.pictureBookSubmission.findUnique({ where: { pictureBookId: record.id } });
        if (submission.status !== "APPROVED" || submission.snapshotHash !== expectedHash || submission.coverUrl !== checkpoint.assets[`library:${book.slug}`].url || submission.reviewedByAdminId !== admin.id) throw Error(`单本投稿尚未完整审核：${book.slug}`);
        if (!await prisma.adminOperationLog.findFirst({ where: { action: "APPROVE_PICTURE_BOOK_SUBMISSION", resourceType: "PICTURE_BOOK_SUBMISSION", resourceId: submission.id } })) {
          await writeAdminOperationLog({ adminUserId: admin.id, action: "APPROVE_PICTURE_BOOK_SUBMISSION", resourceType: "PICTURE_BOOK_SUBMISSION", resourceId: submission.id, description: `经授权审核通过《${book.title}》绘本投稿` });
        }
        checkpoint.submissions ??= {};
        checkpoint.submissions[book.slug] = submission.id;
        await save();
      }
    }
  }
  if (args["--mode"] !== "prepare") {
    const publicCourse = await courses.getPublicCourse(checkpoint.courseId);
    if (publicCourse.items.length !== 16 || publicCourse.items.some((item) => !item.launchHref)) throw Error("系列目录未公开完整十六册");
    const course = await prisma.course.findUnique({ where: { id: checkpoint.courseId }, include: { approvedRevision: { include: { items: { orderBy: { sortOrder: "asc" } } } } } });
    if (course?.userId !== ownerId || course.reviewState !== "PUBLISHED" || course.approvedRevision?.status !== "APPROVED" ||
        course.approvedRevision.name !== seriesTitle || course.approvedRevision.coverMediaId !== checkpoint.assets.resource.id ||
        course.approvedRevision.items.length !== 16 || course.approvedRevision.items.some((item, index) => item.pictureBookId !== records[index].id || item.sortOrder !== index)) throw Error("系列已批准版本与本次十六册不一致");
    const courseReview = await prisma.courseReviewRequest.findFirst({ where: { courseId: course.id, courseRevisionId: course.approvedRevisionId, scope: "COURSE_REVISION", status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
    if (!courseReview || courseReview.reviewedByAdminId !== admin.id || !await prisma.adminOperationLog.findFirst({ where: { action: "APPROVE_COURSE_REVIEW", resourceType: "COURSE_REVIEW_REQUEST", resourceId: courseReview.id, adminUserId: admin.id } })) throw Error("系列审核记录或管理员日志缺失");
    for (const book of books) {
      const record = records.find((item) => item.id === bookId(book.slug));
      assertCareerRecordMatches(await prisma.pictureBook.findUnique({ where: { id: record.id } }), record);
      const snapshot = snapshotCourseMaterial("PICTURE_BOOK", record), hash = hashCourseSnapshot(snapshot);
      const material = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
      if (material?.status !== "APPROVED" || material.approvedHash !== hash || material.currentHash !== hash ||
          !isDeepStrictEqual(material.approvedSnapshot, snapshot) || !isDeepStrictEqual(material.currentSnapshot, snapshot)) throw Error(`系列课件审核快照不符：${book.slug}`);
      const submission = await prisma.pictureBookSubmission.findUnique({ where: { pictureBookId: record.id } });
      if (submission?.status !== "APPROVED" || submission.snapshotHash !== hash || !isDeepStrictEqual(submission.snapshot, snapshot) ||
          submission.coverUrl !== checkpoint.assets[`library:${book.slug}`].url || submission.reviewedByAdminId !== admin.id ||
          !await prisma.adminOperationLog.findFirst({ where: { action: "APPROVE_PICTURE_BOOK_SUBMISSION", resourceType: "PICTURE_BOOK_SUBMISSION", resourceId: submission.id, adminUserId: admin.id } })) throw Error(`绘本投稿审核快照或日志不符：${book.slug}`);
      const publication = await submissions.publicBook(record.id);
      if (publication.pages.length !== 17 || publication.isSpread || publication.aspectRatio!=="5:4" || publication.pages.some((page, position) => page.position !== position || page.textInImage===true || page.imageUrl !== record.pages[position].imageUrl || page.audioUrl !== record.pages[position].audioUrl)) throw Error(`绘本馆作品不完整：${book.slug}`);
    }
  }
  checkpoint.afterCounts=await counts();
  checkpoint.lastVerifiedAt=new Date().toISOString();
  await save();
  console.log(JSON.stringify({ mode: args["--mode"], courseId: checkpoint.courseId, href: `/c/${checkpoint.courseId}`, books: records.map((record) => record.id), approvedSubmissions: Object.keys(checkpoint.submissions ?? {}).length, assets: Object.keys(checkpoint.assets).length }));
} finally {
  await saving;
  await prisma.$disconnect();
  await lockClient.end();
}
