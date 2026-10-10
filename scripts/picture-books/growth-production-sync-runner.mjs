import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {growthSeriesBooks,growthSeriesName} from './growth-series-data.mjs';
import {growthSyncOwner,growthSyncCourseId,growthSyncTables,growthR2PublicBase,growthLocalSystemId,growthApprovalAdminIdentity,validateApprovedGrowthBundle,readGrowthTarget,guardGrowthTarget,applyApprovedGrowthBundle,planGrowthSyncRow} from './growth-production-sync.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return[a.slice(0,i),a.slice(i+1)];}));
const mode=args['--mode'],file=args['--file'];
if(!['export','inspect','apply','verify'].includes(mode)||!file)throw Error('必须指定 --mode=export/inspect/apply/verify 和 --file');
const requireDb=createRequire(resolve(process.cwd(),'packages/database/package.json')),{Client}=requireDb('pg');
createRequire(resolve(process.cwd(),'apps/api-core/package.json'))('reflect-metadata');
const runtime=path=>import(pathToFileURL(resolve(process.cwd(),path)).href);
const domain=await runtime('apps/api-core/dist/courses/course-domain.js');
const client=new Client({connectionString:process.env.DATABASE_URL});
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
async function privateWrite(path,value){await fs.mkdir(dirname(path),{recursive:true,mode:0o700});await fs.chmod(dirname(path),0o700);await fs.writeFile(path,JSON.stringify(value,null,2),{mode:0o600});await fs.chmod(path,0o600);}
const select=async(table,ids)=>(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id`,[JSON.stringify(ids)])).rows.map(r=>r.row);
let report;
try{
 await client.connect();
 const identity=(await client.query("SELECT current_database() AS db,current_setting('port') AS port")).rows[0];
 if(identity.db!=='abei'||identity.port!=='3604')throw Error('运行数据库不是独立 abei 3604');
 if(mode==='export'){
  if(!['http://localhost:3600','http://127.0.0.1:3600'].includes(process.env.APP_BASE_URL)||!args['--images']||!args['--narration'])throw Error('只能从本地 abei 导出固定图片和配音清单');
  const localSystemId=(await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0]?.id;
  if(localSystemId!==growthLocalSystemId)throw Error('导出数据库不是指定本地 abei 实例');
  const imageManifest=JSON.parse(await fs.readFile(args['--images'],'utf8'));
  const narration=JSON.parse(await fs.readFile(args['--narration'],'utf8'));
  if(imageManifest.courseId!==growthSyncCourseId||imageManifest.owner!==growthSyncOwner||imageManifest.series!==growthSeriesName||narration.courseId!==growthSyncCourseId||narration.owner!==growthSyncOwner||!narration.publishedAt)throw Error('本地已发布素材清单身份错误');
  const images=Object.entries(imageManifest.assets).map(([key,a])=>({key,...a}));
  const audio=Object.values(narration.entries).map(a=>Object.fromEntries(['key','bookId','position','text','voice','model','speed','status','assetId','url','sizeBytes','sha256'].map(k=>[k,a[k]])));
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables={};tables.media_assets=await select('media_assets',images.map(a=>a.id));tables.audio_assets=await select('audio_assets',audio.map(a=>a.assetId));
  tables.picture_books=await select('picture_books',growthSeriesBooks.map(b=>b.id));
  tables.courses=await select('courses',[growthSyncCourseId]);const course=tables.courses[0];if(!course)throw Error('本地系列缺失');
  tables.course_revisions=await select('course_revisions',[course.approvedRevisionId]);
  tables.course_revision_items=(await client.query('SELECT to_jsonb(t) AS row FROM course_revision_items t WHERE "revisionId"=$1 ORDER BY "sortOrder"',[course.approvedRevisionId])).rows.map(r=>r.row);
  tables.course_material_publications=await select('course_material_publications',tables.course_revision_items.map(i=>i.publicationId));
  tables.course_review_requests=(await client.query('SELECT to_jsonb(t) AS row FROM course_review_requests t WHERE ("courseId"=$1 AND scope=\'COURSE_REVISION\' AND status=\'APPROVED\') OR "materialPublicationId" IN (SELECT jsonb_array_elements_text($2::jsonb)) ORDER BY id',[course.id,JSON.stringify(tables.course_material_publications.map(p=>p.id))])).rows.map(r=>r.row);
  tables.admin_operation_logs=(await client.query('SELECT to_jsonb(t) AS row FROM admin_operation_logs t WHERE action=\'APPROVE_COURSE_REVIEW\' AND "resourceType"=\'COURSE_REVIEW_REQUEST\' AND "resourceId" IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id',[JSON.stringify(tables.course_review_requests.map(r=>r.id))])).rows.map(r=>r.row);
  const adminId=tables.course_review_requests[0]?.reviewedByAdminId;
  const adminIdentity=(await client.query("SELECT md5(email || '|' || name) AS digest FROM admin_users WHERE id=$1",[adminId])).rows[0]?.digest;
  if(adminIdentity!==growthApprovalAdminIdentity)throw Error('本地审核管理员账号与授权身份不一致');
  const bundle={format:'abei-growth-approved-sync-v1',owner:growthSyncOwner,courseId:growthSyncCourseId,series:growthSeriesName,adminId,images,audio,tables};
  validateApprovedGrowthBundle(bundle,domain);await client.query('COMMIT');await privateWrite(file,bundle);
  report={mode,books:4,images:53,audio:52,reviews:5,sha256:digest(await fs.readFile(file))};
 }else{
  if(process.env.APP_BASE_URL!=='https://new.abeiai.com'||process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/,'')!==growthR2PublicBase)throw Error('只能同步到 new.abeiai.com 的独立生产实例及指定 R2 存储');
  const raw=await fs.readFile(file);if(!/^[a-f0-9]{64}$/.test(args['--sha256']??'')||digest(raw)!==args['--sha256'])throw Error('私有同步包 SHA-256 不一致');
  const bundle=JSON.parse(raw);validateApprovedGrowthBundle(bundle,domain);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await guardGrowthTarget(client,bundle);
  const before=await readGrowthTarget(client,bundle);await client.query('COMMIT');
  if(mode==='apply'){
   const backup=join(dirname(file),`target-before-${Date.now()}.json`);await privateWrite(backup,before);
   const [{MediaService},{inspectImage}]=await Promise.all([runtime('apps/api-core/dist/media/media.service.js'),runtime('apps/api-core/dist/media/image-inspection.js')]);
   const media=new MediaService();media.assertPictureBookR2Ready();const queue=[...bundle.images.map(a=>({type:'image',...a})),...bundle.audio.map(a=>({type:'audio',...a}))];let stopped=false;
   const results=await Promise.allSettled(Array.from({length:3},async()=>{while(queue.length&&!stopped){const a=queue.shift();try{if(a.type==='image'){const stored=await media.readPictureBookStoredImage(a.url),meta=inspectImage(stored.buffer);if(digest(stored.buffer)!==a.sha256||stored.buffer.length!==a.sizeBytes||meta?.width!==a.width||meta?.height!==a.height||meta?.mimeType!=='image/webp')throw Error('线上插画校验失败 '+a.key);}else{const stored=await media.readPictureBookStoredAudio(a.url);if(digest(stored.buffer)!==a.sha256||stored.buffer.length!==a.sizeBytes||!stored.mimetype.startsWith('audio/'))throw Error('线上配音校验失败 '+a.key);}}catch(error){stopped=true;throw error;}}}));
   const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   report={mode,verifiedR2Images:53,verifiedR2Audio:52,backup,...await applyApprovedGrowthBundle(client,bundle,domain)};
   await privateWrite(join(dirname(file),'sync-result.json'),report);
  }else if(mode==='inspect')report={mode,sourceTables:Object.fromEntries(growthSyncTables.map(t=>[t,bundle.tables[t].length])),existingTargetTables:Object.fromEntries(growthSyncTables.map(t=>[t,before.selected[t].length])),targetCounts:before.counts,sha256:digest(raw)};
  else{
   for(const table of growthSyncTables)for(const row of bundle.tables[table])if(planGrowthSyncRow(before.selected[table].find(r=>r.id===row.id),row)!=='REUSE')throw Error('线上同步数据不完整');
   const [{CoursesService},{PictureBookService}]=await Promise.all([runtime('apps/api-core/dist/courses/courses.service.js'),runtime('apps/api-core/dist/picture-books/picture-book.service.js')]);
   const publicCourse=await new CoursesService().getPublicCourse(bundle.courseId);if(publicCourse.items.length!==4||publicCourse.items.some(i=>!i.launchHref))throw Error('线上四册目录不完整');
   const reader=(await client.query("SELECT id FROM users WHERE id<>$1 AND status='ACTIVE' ORDER BY \"createdAt\" LIMIT 1",[bundle.owner])).rows[0];if(!reader)throw Error('缺少普通读者验收账号');
   const player=new PictureBookService();let frames=0,audioFrames=0;
   for(const book of bundle.tables.picture_books){const playback=await player.playback({mode:'ACCOUNT',userId:reader.id},book.id);if(playback.pages.length!==13||playback.aspectRatio!=='5:4')throw Error('线上绘本页数或比例错误');for(const [i,p] of playback.pages.entries()){const expected=book.pages[i];if(p.position!==i||p.caption!==expected.caption||p.imageUrl!==expected.imageUrl||p.audioUrl!==expected.audioUrl||p.textInImage!==true)throw Error('线上阅读画面、配音或正文不一致');if(p.audioUrl)audioFrames++;}frames+=playback.pages.length;}
   report={mode,courseId:bundle.courseId,books:4,readerFrames:frames,audioFrames,href:'https://new.abeiai.com/c/'+bundle.courseId};await privateWrite(join(dirname(file),'verification.json'),report);
  }
 }
 console.log(JSON.stringify(report));
}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
finally{await client.end();if(mode!=='export'){const {getPrismaClient}=await runtime('packages/database/dist/index.js');await getPrismaClient().$disconnect();}}
