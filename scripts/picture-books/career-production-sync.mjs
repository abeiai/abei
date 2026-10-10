import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {careerCollectionBooks,careerExpandedDescription} from './career-expansion-data.mjs';
import {buildCareerBookRecord,assertCareerRecordMatches,assertCareerReviewTarget,validateCareerExpansionBooks} from './career-import.mjs';

export const syncTables=['media_assets','picture_books','course_material_publications','courses','course_revisions','course_revision_items','course_review_requests','admin_operation_logs'];
export const careerSyncOwner='abei-lele-studio',careerSyncCourseId='e2edf14f892a944946c00c80';
export function canonical(value){
 if(value instanceof Date)return value.toISOString();
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/.test(value))return new Date(value.endsWith('Z')||/[+-]\d\d:\d\d$/.test(value)?value:value+'Z').toISOString();
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export const syncDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function planCareerSyncRow(current,expected){
 if(!current)return 'INSERT';
 if(!isDeepStrictEqual(canonical(current),canonical(expected)))throw Error('线上业务行冲突，禁止覆盖');
 return 'REUSE';
}
export function validateApprovedCareerBundle(bundle,domain){
 const {tables,assets}=bundle;
 if(bundle.format!=='abei-career-approved-sync-v1'||bundle.owner!==careerSyncOwner||bundle.courseId!==careerSyncCourseId)throw Error('职业同步包身份错误');
 if(!isDeepStrictEqual(Object.keys(tables??{}).sort(),[...syncTables].sort()))throw Error('同步包包含范围外的表');
 const counts=[273,16,16,1,1,16,1,1];
 for(const [i,name] of syncTables.entries())if(!Array.isArray(tables[name])||tables[name].length!==counts[i]||new Set(tables[name].map(r=>r.id)).size!==counts[i])throw Error('同步包表计数或主键重复');
 if(assets?.length!==273||new Set(assets.map(a=>a.key)).size!==273||new Set(assets.map(a=>a.id)).size!==273||new Set(assets.map(a=>a.sha256)).size!==273)throw Error('选定素材不完整或重复');
 const expectedKeys=['resource',...careerCollectionBooks.flatMap(b=>Array.from({length:17},(_,p)=>b.slug+':'+p))];
 if(assets.some(a=>!expectedKeys.includes(a.key)||!/^[a-f0-9]{64}$/.test(a.sha256)||(a.key==='resource'?a.width!==1600||a.height!==900:a.width!==960||a.height!==1280)))throw Error('素材规格错误');
 for(const a of assets){const row=tables.media_assets.find(r=>r.id===a.id);if(!row||row.url!==a.url||row.size!==a.sizeBytes||row.mimeType!=='image/webp'||row.mediaType!=='IMAGE'||row.storageProvider!=='S3'||row.createdByUserId!==bundle.owner||row.createdByAdminId!==null)throw Error('素材归属或哈希清单不一致');}
 validateCareerExpansionBooks(careerCollectionBooks);
 const materials=[];
 for(const [i,book] of careerCollectionBooks.entries()){
  const record=buildCareerBookRecord(book,bundle.owner,Object.fromEntries(Array.from({length:17},(_,p)=>[p,assets.find(a=>a.key===book.slug+':'+p).url])));
  assertCareerRecordMatches(tables.picture_books.find(r=>r.id===record.id),record);
  const pub=tables.course_material_publications.find(r=>r.pictureBookId===record.id),item=tables.course_revision_items.find(r=>r.sortOrder===i),snapshot=domain.snapshotCourseMaterial('PICTURE_BOOK',record),hash=domain.hashCourseSnapshot(snapshot);
  if(pub?.status!=='APPROVED'||pub.approvedHash!==hash||pub.currentHash!==hash||!isDeepStrictEqual(pub.approvedSnapshot,snapshot)||!isDeepStrictEqual(pub.currentSnapshot,snapshot)||pub.materialType!=='PICTURE_BOOK'||pub.videoGuideLessonId||pub.englishGuidedStudyMaterialId||pub.learningFlashcardDeckId)throw Error('职业课件尚未完整批准');
  if(!item||item.pictureBookId!==record.id||item.publicationId!==pub.id||item.materialType!=='PICTURE_BOOK'||item.displayName!==record.title||item.videoGuideLessonId||item.englishGuidedStudyMaterialId||item.learningFlashcardDeckId)throw Error('目录绑定错误');
  materials.push({publicationId:pub.id,pictureBookId:record.id,hash,snapshot,approvedHash:hash,approvedSnapshot:snapshot});
 }
 const course=tables.courses[0],revision=tables.course_revisions[0],review=tables.course_review_requests[0],log=tables.admin_operation_logs[0],cover=assets.find(a=>a.key==='resource');
 if(course.id!==bundle.courseId||course.userId!==bundle.owner||course.reviewState!=='PUBLISHED'||course.approvedRevisionId!==revision.id||course.workingRevisionId!==null||!course.publishedAt||revision.status!=='APPROVED'||revision.courseId!==course.id||!revision.reviewedAt||tables.course_revision_items.some(i=>i.revisionId!==revision.id))throw Error('系列不是稳定已发布版本');
 const input={name:'我想成为',summary:careerExpandedDescription,coverMediaId:cover.id,tags:['绘本','职业启蒙','幼儿园','中国城市'],items:careerCollectionBooks.map(b=>({materialType:'PICTURE_BOOK',materialId:'abei-career-'+b.slug,displayName:b.title}))};
 assertCareerReviewTarget({...review,status:'PENDING'},input,materials,{courseId:course.id,revisionId:revision.id,userId:bundle.owner,coverUrl:cover.url});
 for(const key of ['name','summary','coverMediaId','tags'])if(!isDeepStrictEqual(revision[key],input[key]))throw Error('系列资料与审核快照不一致');
 if(review.id!==bundle.sourceReviewId||review.status!=='APPROVED'||!review.reviewedByAdminId||!review.reviewedAt||review.materialPublicationId!==null||log.resourceId!==review.id||log.action!=='APPROVE_COURSE_REVIEW'||log.resourceType!=='COURSE_REVIEW_REQUEST'||log.adminUserId!==review.reviewedByAdminId)throw Error('缺少真实审核与操作记录');
 if(bundle.materialReviewStates?.length!==16||new Set(bundle.materialReviewStates.map(r=>r.publicationId)).size!==16||bundle.materialReviewStates.some(r=>!tables.course_material_publications.some(p=>p.id===r.publicationId)||!['APPROVED',null].includes(r.status)))throw Error('源材料审核状态不完整或有独立待审、拒绝');
 return {books:16,assets:273,courseId:course.id,reviewId:review.id,adminId:review.reviewedByAdminId};
}

const quote=name=>'"'+name.replaceAll('"','""')+'"';
const idsFor=(bundle,table)=>JSON.stringify(bundle.tables[table].map(r=>r.id));
export async function readCareerTarget(client,bundle){
 const selected={},counts={},unrelated={};
 const auditId='abei-career-sync-'+syncDigest(bundle).slice(0,24);
 for(const table of syncTables){
  selected[table]=(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id`,[idsFor(bundle,table)])).rows.map(r=>r.row);
  counts[table]=Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  const rows=(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id NOT IN (SELECT jsonb_array_elements_text($1::jsonb)) AND id <> $2 ORDER BY id`,[idsFor(bundle,table),auditId])).rows.map(r=>r.row);
  unrelated[table]=syncDigest(rows);
 }
 const user=(await client.query('SELECT to_jsonb(t) AS row FROM users t WHERE id=$1',[bundle.owner])).rows[0]?.row;
 const wallet=(await client.query('SELECT to_jsonb(t) AS row FROM wallets t WHERE "userId"=$1',[bundle.owner])).rows[0]?.row??null;
 return {selected,counts,unrelated,authorHash:syncDigest(user),walletHash:syncDigest(wallet),auditId};
}
export async function guardCareerTarget(client,bundle,testing=false,lockActors=false){
 const identity=(await client.query("SELECT current_database() AS db,current_setting('port') AS port")).rows[0];
 if(identity.db!==(testing?'abei_career_sync_test':'abei')||identity.port!==(testing?'3608':'3604'))throw Error('同步目标数据库身份错误');
 const actor=(await client.query('SELECT email,nickname,status FROM users WHERE id=$1'+(lockActors?' FOR SHARE':''),[bundle.owner])).rows[0];
 if(actor?.email!=='lele-studio@abei.example'||actor.nickname!=='乐乐绘本工作室'||actor.status!=='ACTIVE')throw Error('线上工作室账号身份不一致');
 const adminId=bundle.tables.course_review_requests[0].reviewedByAdminId;
 const admin=(await client.query('SELECT role,status FROM admin_users WHERE id=$1'+(lockActors?' FOR SHARE':''),[adminId])).rows[0];
 if(admin?.role!=='SUPER_ADMIN'||admin.status!=='ACTIVE')throw Error('线上审核管理员身份不一致');
 const other=(await client.query('SELECT DISTINCT c.id FROM courses c JOIN course_revisions r ON r."courseId"=c.id WHERE c."userId"=$1 AND r.name=$2 AND c.id<>$3',[bundle.owner,'我想成为',bundle.courseId])).rows;
 if(other.length)throw Error('线上已存在另一个同名工作室系列');
}
export async function applyApprovedCareerBundle(client,original,domain,{testing=false}={}){
 const bundle=structuredClone(original);validateApprovedCareerBundle(bundle,domain);
 for(let attempt=0;attempt<3;attempt++){
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
   await client.query("SET LOCAL lock_timeout='5s'");
   await client.query("SELECT pg_advisory_xact_lock(hashtext('abei-career-production-sync'))");
   await guardCareerTarget(client,bundle,testing,true);
   for(const table of syncTables)await client.query(`SELECT id FROM ${table} WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id FOR UPDATE`,[idsFor(bundle,table)]);
   const before=await readCareerTarget(client,bundle),plans={},inserted=Object.fromEntries(syncTables.map(t=>[t,0]));
   for(const table of syncTables){
    const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table])).rows.map(r=>r.column_name).sort();
    if(bundle.tables[table].some(r=>!isDeepStrictEqual(Object.keys(r).sort(),columns)))throw Error('两端表字段不同，禁止丢失业务字段');
    plans[table]=bundle.tables[table].map(row=>planCareerSyncRow(before.selected[table].find(r=>r.id===row.id),row));
   }
   if(before.selected.courses.length&&syncTables.some(t=>plans[t].includes('INSERT')))throw Error('线上已存在不完整系列，禁止自动修补');
   for(const pub of bundle.tables.course_material_publications){
    const latest=(await client.query('SELECT status FROM course_review_requests WHERE "materialPublicationId"=$1 AND scope=\'MATERIAL_CHANGE\' ORDER BY "submittedAt" DESC LIMIT 1',[pub.id])).rows[0];
    if(latest&&latest.status!=='APPROVED')throw Error('线上素材有待审或拒绝记录');
   }
   for(const table of syncTables)for(const [i,row] of bundle.tables[table].entries()){
    if(plans[table][i]==='REUSE')continue;
    const data=table==='courses'?{...row,approvedRevisionId:null,workingRevisionId:null,reviewState:'DRAFT',publishedAt:null}:row;
    const columns=Object.keys(data).map(quote).join(',');
    await client.query(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[JSON.stringify(data)]);
    inserted[table]++;
   }
   if(inserted.courses){
    const course=bundle.tables.courses[0],columns=Object.keys(course).map(quote).join(',');
    await client.query(`UPDATE courses SET (${columns})=(SELECT ${columns} FROM jsonb_populate_record(NULL::courses,$1::jsonb)) WHERE id=$2`,[JSON.stringify(course),course.id]);
   }
   let changed=Object.values(inserted).reduce((a,b)=>a+b,0);
   if(changed){
    await client.query('INSERT INTO admin_operation_logs(id,"adminUserId",action,"resourceType","resourceId",description) VALUES($1,$2,$3,$4,$5,$6)',[before.auditId,bundle.tables.course_review_requests[0].reviewedByAdminId,'SYNC_APPROVED_CAREER_SERIES','COURSE',bundle.courseId,'同步《我想成为》16本已审核绘本；源审核 '+bundle.sourceReviewId+'；同步包摘要 '+syncDigest(bundle)]);
    inserted.admin_operation_logs++;changed++;
   }
   const after=await readCareerTarget(client,bundle);
   for(const table of syncTables){
    for(const expected of bundle.tables[table])if(planCareerSyncRow(after.selected[table].find(r=>r.id===expected.id),expected)!=='REUSE')throw Error('同步写入复核失败');
    if(after.counts[table]!==before.counts[table]+inserted[table]||after.unrelated[table]!==before.unrelated[table])throw Error('表计数或范围外业务数据已改变');
   }
   if(after.authorHash!==before.authorHash||after.walletHash!==before.walletHash)throw Error('账号或钱包摘要已改变');
   await client.query('COMMIT');
   return {changed,inserted,beforeCounts:before.counts,afterCounts:after.counts,unrelatedUnchanged:true,authorAndWalletUnchanged:true,courseId:bundle.courseId,reviewId:bundle.sourceReviewId};
  }catch(error){
   await client.query('ROLLBACK');
   if(!['40001','40P01'].includes(error.code)||attempt===2)throw error;
  }
 }
}
