import {isDeepStrictEqual} from 'node:util';
import {growthSeriesBooks,growthSeriesName,growthSeriesDescription} from './growth-series-data.mjs';
import {buildGrowthBookRecord} from './growth-import.mjs';
import {applyGrowthNarrationPages,growthNarrationVoice,growthNarrationModel,growthNarrationSpeed} from './growth-narration.mjs';
import {assertCareerRecordMatches,assertCareerReviewTarget} from './career-import.mjs';
import {syncDigest,planCareerSyncRow} from './career-production-sync.mjs';

export const growthSyncOwner='abei-lele-studio',growthSyncCourseId='1885e24ff148bd1a9a877cdd';
export const growthLocalSystemId='7690572978282909730';
export const growthProductionSystemId='7694665003199217698';
export const growthR2PublicBase='https://r.abeiai.com';
export const growthApprovalAdminIdentity='aefb9826ce5041571ec2661e395b7b86';
export const growthSyncTables=['media_assets','audio_assets','picture_books','course_material_publications','courses','course_revisions','course_revision_items','course_review_requests','admin_operation_logs'];
const counts={media_assets:53,audio_assets:52,picture_books:4,course_material_publications:4,courses:1,course_revisions:1,course_revision_items:4,course_review_requests:5,admin_operation_logs:5};
export const planGrowthSyncRow=planCareerSyncRow;
export function assertGrowthStoredR2Url(url,kind,publicBase=growthR2PublicBase){
 const pattern=kind==='image'?/^[a-zA-Z0-9/_-]+\.webp$/:/^[a-zA-Z0-9/_-]+\.(mp3|wav|ogg|aac|m4a|webm)$/;
 if(typeof url!=='string'||!url.startsWith(`${publicBase}/`)||!pattern.test(url.slice(publicBase.length+1))||url.length-publicBase.length>2049)throw Error('素材地址不属于目标 R2 存储');
}
export function validateGrowthSyncInventory({tables,images,audio}){
 if(!tables||!isDeepStrictEqual(Object.keys(tables).sort(),[...growthSyncTables].sort()))throw Error('同步表范围错误');
 for(const [name,count] of Object.entries(counts))if(!Array.isArray(tables[name])||tables[name].length!==count||new Set(tables[name].map(r=>r.id)).size!==count)throw Error('成长绘本同步数据不完整或主键重复');
 if(images?.length!==53||audio?.length!==52||new Set(images.map(a=>a.key)).size!==53||new Set(audio.map(a=>a.key)).size!==52)throw Error('成长绘本素材清单不完整');
}
export function validateApprovedGrowthBundle(bundle,domain){
 if(bundle.format!=='abei-growth-approved-sync-v1'||bundle.owner!==growthSyncOwner||bundle.courseId!==growthSyncCourseId||bundle.series!==growthSeriesName)throw Error('成长绘本同步包身份错误');
 validateGrowthSyncInventory(bundle);
 const imageKeys=['resource',...growthSeriesBooks.flatMap(b=>Array.from({length:13},(_,p)=>`${b.slug}:${p}`))];
 const expectedAudio=new Map(),mediaById=new Map(bundle.tables.media_assets.map(r=>[r.id,r]));
 if(!isDeepStrictEqual(bundle.images.map(a=>a.key).sort(),imageKeys.sort())||new Set(bundle.images.map(a=>a.sha256)).size!==53)throw Error('53张插画清单不完整或重复');
 for(const a of bundle.images){
  const row=mediaById.get(a.id);
  assertGrowthStoredR2Url(a.url,'image');
  if(!/^[a-f0-9]{64}$/.test(a.sha256)||a.width!==1280||a.height!==(a.key==='resource'?720:1024)||!row||row.url!==a.url||row.size!==a.sizeBytes||row.mimeType!=='image/webp'||row.mediaType!=='IMAGE'||row.storageProvider!=='S3'||row.createdByUserId!==bundle.owner||row.createdByAdminId!==null)throw Error('插画尺寸、哈希或归属错误');
 }
 for(const a of bundle.audio){
  const row=bundle.tables.audio_assets.find(r=>r.id===a.assetId);
  assertGrowthStoredR2Url(a.url,'audio');
  if(!row||a.status!=='READY'||a.voice!==growthNarrationVoice||a.model!==growthNarrationModel||a.speed!==growthNarrationSpeed||!/^[a-f0-9]{64}$/.test(a.sha256)||row.userId!==bundle.owner||row.type!=='TTS_OUTPUT'||row.storageProvider!=='S3'||row.url!==a.url||row.sizeBytes!==a.sizeBytes||!row.mimeType.startsWith('audio/'))throw Error('配音素材身份或内容错误');
  const positionKey=`${a.bookId}:${a.position}`;if(expectedAudio.has(positionKey))throw Error('重复配音页');expectedAudio.set(positionKey,a);
 }
 if(new Set(bundle.audio.map(a=>a.sha256)).size!==52)throw Error('重复配音文件');
 const materialRefs=[];
 for(const [index,book] of growthSeriesBooks.entries()){
  const base=buildGrowthBookRecord(book,bundle.owner,Object.fromEntries(Array.from({length:13},(_,p)=>[p,bundle.images.find(a=>a.key===`${book.slug}:${p}`)?.url])));
  const entries=Object.fromEntries(base.pages.map(p=>[p.position,expectedAudio.get(`${book.id}:${p.position}`)]));
  const expected={...base,pages:applyGrowthNarrationPages(base,entries)};
  assertCareerRecordMatches(bundle.tables.picture_books.find(r=>r.id===book.id),expected);
  const pub=bundle.tables.course_material_publications.find(r=>r.pictureBookId===book.id),item=bundle.tables.course_revision_items.find(r=>r.sortOrder===index);
  const snapshot=domain.snapshotCourseMaterial('PICTURE_BOOK',expected),hash=domain.hashCourseSnapshot(snapshot);
  if(pub?.materialType!=='PICTURE_BOOK'||pub.status!=='APPROVED'||pub.approvedHash!==hash||pub.currentHash!==hash||!isDeepStrictEqual(pub.approvedSnapshot,snapshot)||!isDeepStrictEqual(pub.currentSnapshot,snapshot)||pub.videoGuideLessonId||pub.englishGuidedStudyMaterialId||pub.learningFlashcardDeckId)throw Error('四册公开快照未批准或与正文不符');
  if(item?.pictureBookId!==book.id||item.publicationId!==pub.id||item.materialType!=='PICTURE_BOOK'||item.displayName!==book.title||item.sortOrder!==index||item.videoGuideLessonId||item.englishGuidedStudyMaterialId||item.learningFlashcardDeckId)throw Error('系列目录错误');
  const review=bundle.tables.course_review_requests.find(r=>r.materialPublicationId===pub.id);
  if(review?.scope!=='MATERIAL_CHANGE'||review.status!=='APPROVED'||review.submittedByUserId!==bundle.owner||review.reviewedByAdminId!==bundle.adminId||review.courseId!==null||review.courseRevisionId!==null||!isDeepStrictEqual(review.afterSnapshot,snapshot))throw Error('配音变更审核不完整');
  const baseSnapshot=domain.snapshotCourseMaterial('PICTURE_BOOK',base),baseHash=domain.hashCourseSnapshot(baseSnapshot);
  materialRefs.push({publicationId:pub.id,pictureBookId:book.id,hash:baseHash,snapshot:baseSnapshot});
 }
 const course=bundle.tables.courses[0],revision=bundle.tables.course_revisions[0],cover=bundle.images.find(a=>a.key==='resource'),review=bundle.tables.course_review_requests.find(r=>r.scope==='COURSE_REVISION');
 if(course.id!==bundle.courseId||course.userId!==bundle.owner||course.reviewState!=='PUBLISHED'||course.approvedRevisionId!==revision.id||course.workingRevisionId!==null||!course.publishedAt||revision.courseId!==course.id||revision.status!=='APPROVED'||revision.name!==growthSeriesName||revision.summary!==growthSeriesDescription||revision.coverMediaId!==cover.id||!isDeepStrictEqual(revision.tags,['绘本','自然科普','动物成长','亲子共读'])||bundle.tables.course_revision_items.some(i=>i.revisionId!==revision.id))throw Error('系列公开版本不完整');
 if(review?.courseId!==course.id||review.courseRevisionId!==revision.id||review.materialPublicationId!==null||review.status!=='APPROVED'||review.submittedByUserId!==bundle.owner||review.reviewedByAdminId!==bundle.adminId)throw Error('系列正式审核缺失');
 const input={name:growthSeriesName,summary:growthSeriesDescription,coverMediaId:cover.id,tags:['绘本','自然科普','动物成长','亲子共读'],items:growthSeriesBooks.map(b=>({materialType:'PICTURE_BOOK',materialId:b.id,displayName:b.title}))};
 assertCareerReviewTarget({...review,status:'PENDING'},input,materialRefs,{courseId:course.id,revisionId:revision.id,userId:bundle.owner,coverUrl:cover.url});
 for(const r of bundle.tables.course_review_requests){const logs=bundle.tables.admin_operation_logs.filter(l=>l.resourceId===r.id&&l.action==='APPROVE_COURSE_REVIEW'&&l.resourceType==='COURSE_REVIEW_REQUEST'&&l.adminUserId===bundle.adminId);if(logs.length!==1)throw Error('审核操作日志缺失或重复');}
 return {books:4,images:53,audio:52,reviews:5};
}

const idsFor=(bundle,table)=>JSON.stringify(bundle.tables[table].map(r=>r.id));
const quote=name=>'"'+name.replaceAll('"','""')+'"';
export async function readGrowthTarget(client,bundle){
 const selected={},countsOut={},unrelated={};const auditId='abei-growth-sync-'+syncDigest(bundle).slice(0,24);
 for(const table of growthSyncTables){
  selected[table]=(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id`,[idsFor(bundle,table)])).rows.map(r=>r.row);
  countsOut[table]=Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  const rows=(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id NOT IN (SELECT jsonb_array_elements_text($1::jsonb)) AND id <> $2 ORDER BY id`,[idsFor(bundle,table),auditId])).rows.map(r=>r.row);
  unrelated[table]=syncDigest(rows);
 }
 const actor=(await client.query('SELECT to_jsonb(t) AS row FROM users t WHERE id=$1',[bundle.owner])).rows[0]?.row;
 const wallet=(await client.query('SELECT to_jsonb(t) AS row FROM wallets t WHERE "userId"=$1',[bundle.owner])).rows[0]?.row??null;
 return {selected,counts:countsOut,unrelated,authorHash:syncDigest(actor),walletHash:syncDigest(wallet),auditId};
}
export async function guardGrowthTarget(client,bundle,lockActors=false,testing=false){
 const identity=(await client.query("SELECT current_database() AS db,current_setting('port') AS port")).rows[0];
 if(identity.db!==(testing?'abei_growth_sync_test':'abei')||identity.port!==(testing?'3608':'3604'))throw Error('同步目标数据库不是独立 abei 3604');
 if(!testing){const systemId=(await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0]?.id;if(systemId!==growthProductionSystemId)throw Error('数据库实例不是指定 abei-prod 生产集群');}
 const actor=(await client.query('SELECT email,nickname,status FROM users WHERE id=$1'+(lockActors?' FOR SHARE':''),[bundle.owner])).rows[0];
 if(actor?.email!=='lele-studio@abei.example'||actor.nickname!=='乐乐绘本工作室'||actor.status!=='ACTIVE')throw Error('工作室账号身份不一致');
 const admin=(await client.query('SELECT role,status FROM admin_users WHERE id=$1'+(lockActors?' FOR SHARE':''),[bundle.adminId])).rows[0];
 if(admin?.role!=='SUPER_ADMIN'||admin.status!=='ACTIVE')throw Error('审核管理员身份不一致');
 if(!testing){const identityHash=(await client.query("SELECT md5(email || '|' || name) AS digest FROM admin_users WHERE id=$1",[bundle.adminId])).rows[0]?.digest;if(identityHash!==growthApprovalAdminIdentity)throw Error('审核管理员账号与授权身份不一致');}
 const other=(await client.query('SELECT DISTINCT c.id FROM courses c JOIN course_revisions r ON r."courseId"=c.id WHERE c."userId"=$1 AND r.name=$2 AND c.id<>$3',[bundle.owner,growthSeriesName,bundle.courseId])).rows;
 if(other.length)throw Error('线上已存在另一个同名系列');
}
export async function applyApprovedGrowthBundle(client,original,domain,{testing=false}={}){
 const bundle=structuredClone(original);validateApprovedGrowthBundle(bundle,domain);
 for(let attempt=0;attempt<3;attempt++){
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
   await client.query("SET LOCAL lock_timeout='5s'");await client.query("SELECT pg_advisory_xact_lock(hashtext('abei-growth-production-sync'))");
   await guardGrowthTarget(client,bundle,true,testing);
   for(const table of growthSyncTables)await client.query(`SELECT id FROM ${table} WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id FOR UPDATE`,[idsFor(bundle,table)]);
   const before=await readGrowthTarget(client,bundle),plans={},inserted=Object.fromEntries(growthSyncTables.map(t=>[t,0]));
   for(const table of growthSyncTables){
    const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table])).rows.map(r=>r.column_name).sort();
    if(bundle.tables[table].some(r=>!isDeepStrictEqual(Object.keys(r).sort(),columns)))throw Error('生产和本地表字段不同');
    plans[table]=bundle.tables[table].map(row=>planGrowthSyncRow(before.selected[table].find(r=>r.id===row.id),row));
   }
   if(before.selected.courses.length&&growthSyncTables.some(t=>plans[t].includes('INSERT')))throw Error('线上存在不完整专辑，禁止自动修补');
   for(const pub of bundle.tables.course_material_publications){const latest=(await client.query('SELECT status FROM course_review_requests WHERE "materialPublicationId"=$1 AND scope=\'MATERIAL_CHANGE\' ORDER BY "submittedAt" DESC LIMIT 1',[pub.id])).rows[0];if(latest&&latest.status!=='APPROVED')throw Error('线上课件审核存在待审或拒绝');}
   for(const table of growthSyncTables)for(const [i,row] of bundle.tables[table].entries()){
    if(plans[table][i]==='REUSE')continue;
    const data=table==='courses'?{...row,approvedRevisionId:null,workingRevisionId:null,reviewState:'DRAFT',publishedAt:null}:row;
    const columns=Object.keys(data).map(quote).join(',');await client.query(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[JSON.stringify(data)]);inserted[table]++;
   }
   if(inserted.courses){const course=bundle.tables.courses[0],columns=Object.keys(course).map(quote).join(',');await client.query(`UPDATE courses SET (${columns})=(SELECT ${columns} FROM jsonb_populate_record(NULL::courses,$1::jsonb)) WHERE id=$2`,[JSON.stringify(course),course.id]);}
   let changed=Object.values(inserted).reduce((a,b)=>a+b,0);
   if(changed){await client.query('INSERT INTO admin_operation_logs(id,"adminUserId",action,"resourceType","resourceId",description) VALUES($1,$2,$3,$4,$5,$6)',[before.auditId,bundle.adminId,'SYNC_APPROVED_GROWTH_SERIES','COURSE',bundle.courseId,`同步《${growthSeriesName}》四册、53图、52段配音；同步包摘要 ${syncDigest(bundle)}`]);inserted.admin_operation_logs++;changed++;}
   const after=await readGrowthTarget(client,bundle);
   for(const table of growthSyncTables){for(const expected of bundle.tables[table])if(planGrowthSyncRow(after.selected[table].find(r=>r.id===expected.id),expected)!=='REUSE')throw Error('同步写入复核缺失业务行');if(after.counts[table]!==before.counts[table]+inserted[table]||after.unrelated[table]!==before.unrelated[table])throw Error('同步表计数或范围外业务已改变');}
   if(after.authorHash!==before.authorHash||after.walletHash!==before.walletHash)throw Error('账号或钱包记录已改变');
   await client.query('COMMIT');return {changed,inserted,beforeCounts:before.counts,afterCounts:after.counts,unrelatedUnchanged:true,authorAndWalletUnchanged:true,courseId:bundle.courseId};
  }catch(error){await client.query('ROLLBACK');if(!['40001','40P01'].includes(error.code)||attempt===2)throw error;}
 }
}
