import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {careerSyncOwner,careerSyncCourseId,syncTables,validateApprovedCareerBundle,guardCareerTarget,readCareerTarget,applyApprovedCareerBundle,planCareerSyncRow} from './career-production-sync.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return[a.slice(0,i),a.slice(i+1)];}));
const mode=args['--mode'],file=args['--file'];
if(!['export','inspect','apply','verify'].includes(mode)||!file)throw Error('必须指定 mode=export/inspect/apply/verify 和私有 file');
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
 if(identity.db!=='abei'||identity.port!=='3604')throw Error('运行数据库不是 abei 3604');
 if(mode==='export'){
  if(!['http://localhost:3600','http://127.0.0.1:3600'].includes(process.env.APP_BASE_URL)||!args['--manifest'])throw Error('只能在本地abei导出固定发布清单');
  const manifest=JSON.parse(await fs.readFile(args['--manifest'],'utf8'));
  if(manifest.owner!==careerSyncOwner||manifest.courseId!==careerSyncCourseId||manifest.revision!=='sixteen-careers-v1')throw Error('发布来源身份错误');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const assets=Object.entries(manifest.assets).map(([key,a])=>({key,...a})),tables={};
  tables.media_assets=await select('media_assets',assets.map(a=>a.id));
  tables.picture_books=await select('picture_books',[...new Set(assets.filter(a=>a.slug).map(a=>'abei-career-'+a.slug))]);
  tables.courses=await select('courses',[careerSyncCourseId]);
  const course=tables.courses[0];if(!course)throw Error('本地系列缺失');
  tables.course_revisions=await select('course_revisions',[course.approvedRevisionId]);
  tables.course_revision_items=(await client.query('SELECT to_jsonb(t) AS row FROM course_revision_items t WHERE "revisionId"=$1 ORDER BY "sortOrder"',[course.approvedRevisionId])).rows.map(r=>r.row);
  tables.course_material_publications=await select('course_material_publications',tables.course_revision_items.map(i=>i.publicationId));
  tables.course_review_requests=await select('course_review_requests',[manifest.courseReviewId]);
  tables.admin_operation_logs=(await client.query('SELECT to_jsonb(t) AS row FROM admin_operation_logs t WHERE action=\'APPROVE_COURSE_REVIEW\' AND "resourceType"=\'COURSE_REVIEW_REQUEST\' AND "resourceId"=$1',[manifest.courseReviewId])).rows.map(r=>r.row);
  const materialReviewStates=[];
  for(const pub of tables.course_material_publications){const latest=(await client.query('SELECT status FROM course_review_requests WHERE "materialPublicationId"=$1 AND scope=\'MATERIAL_CHANGE\' ORDER BY "submittedAt" DESC LIMIT 1',[pub.id])).rows[0];materialReviewStates.push({publicationId:pub.id,status:latest?.status??null});}
  const bundle={format:'abei-career-approved-sync-v1',owner:careerSyncOwner,courseId:careerSyncCourseId,sourceReviewId:manifest.courseReviewId,assets,materialReviewStates,tables};
  validateApprovedCareerBundle(bundle,domain);await client.query('COMMIT');await privateWrite(file,bundle);
  report={mode,books:16,images:273,sha256:digest(await fs.readFile(file))};
 }else{
  if(process.env.APP_BASE_URL!=='https://new.abeiai.com')throw Error('只能同步到 new.abeiai.com 的独立生产实例');
  const raw=await fs.readFile(file);
  if(!/^[a-f0-9]{64}$/.test(args['--sha256']??'')||digest(raw)!==args['--sha256'])throw Error('私有传输包SHA-256不一致');
  const bundle=JSON.parse(raw);validateApprovedCareerBundle(bundle,domain);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await guardCareerTarget(client,bundle);
  const before=await readCareerTarget(client,bundle);
  for(const table of syncTables)for(const row of bundle.tables[table])planCareerSyncRow(before.selected[table].find(r=>r.id===row.id),row);
  await client.query('COMMIT');
  if(mode==='apply'){
   // 独立私有备份先于任何生产写入；素材由生产实例的R2配置签名读取。
   const beforePath=join(dirname(file),'target-before-'+Date.now()+'.json');await privateWrite(beforePath,before);
   const [{MediaService},{inspectImage}]=await Promise.all([runtime('apps/api-core/dist/media/media.service.js'),runtime('apps/api-core/dist/media/image-inspection.js')]);
   const media=new MediaService();media.assertPictureBookR2Ready();
   const queue=[...bundle.assets];let stopped=false;
   const results=await Promise.allSettled(Array.from({length:3},async()=>{while(queue.length&&!stopped){const a=queue.shift();try{const stored=await media.readPictureBookStoredImage(a.url),meta=inspectImage(stored.buffer);if(digest(stored.buffer)!==a.sha256||stored.buffer.length!==a.sizeBytes||meta?.width!==a.width||meta?.height!==a.height||meta?.mimeType!=='image/webp')throw Error('线上R2素材校验失败 '+a.key);}catch(error){stopped=true;throw error;}}}));
   const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   report={mode,verifiedR2Images:273,backup:beforePath,...await applyApprovedCareerBundle(client,bundle,domain)};
   await privateWrite(join(dirname(file),'sync-result.json'),report);
  }else if(mode==='inspect')report={mode,sourceTables:Object.fromEntries(syncTables.map(t=>[t,bundle.tables[t].length])),existingTargetTables:Object.fromEntries(syncTables.map(t=>[t,before.selected[t].length])),targetCounts:before.counts,sha256:digest(raw)};
  else{
   for(const table of syncTables)for(const row of bundle.tables[table])if(planCareerSyncRow(before.selected[table].find(r=>r.id===row.id),row)!=='REUSE')throw Error('线上同步数据不完整');
   const [{CoursesService},{PictureBookService}]=await Promise.all([runtime('apps/api-core/dist/courses/courses.service.js'),runtime('apps/api-core/dist/picture-books/picture-book.service.js')]);
   const publicCourse=await new CoursesService().getPublicCourse(bundle.courseId);
   if(publicCourse.items.length!==16||publicCourse.items.some(i=>!i.launchHref))throw Error('线上目录或阅读链接不完整');
   const reader=(await client.query("SELECT id FROM users WHERE id<>$1 AND status='ACTIVE' ORDER BY \"createdAt\" LIMIT 1",[bundle.owner])).rows[0];
   if(!reader)throw Error('缺少普通读者验收账号');
   const player=new PictureBookService();let frames=0;
   for(const book of bundle.tables.picture_books){const playback=await player.playback({mode:'ACCOUNT',userId:reader.id},book.id);if(playback.pages.length!==17||playback.aspectRatio!=='3:4')throw Error('线上绘本页数或比例错误');for(const [i,p] of playback.pages.entries())if(p.position!==i||p.caption!==book.pages[i].caption||p.imageUrl!==book.pages[i].imageUrl)throw Error('线上正文与图片不一致');frames+=playback.pages.length;}
   report={mode,courseId:bundle.courseId,submissionStatus:'APPROVED',books:16,readerFrames:frames,images:273,href:'https://new.abeiai.com/c/'+bundle.courseId,sourceReviewId:bundle.sourceReviewId};
   await privateWrite(join(dirname(file),'verification.json'),report);
  }
 }
 console.log(JSON.stringify(report));
}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
finally{await client.end();if(mode!=='export'){const {getPrismaClient}=await runtime('packages/database/dist/index.js');await getPrismaClient().$disconnect();}}
