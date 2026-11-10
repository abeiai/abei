import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {buildBookRecord,attribution,validateManifest,verifySourcePages,bookId,displayStoryText} from './publication.mjs';
import {persistDeterministicAsset} from './storage.mjs';
import {verifyLiveSources} from './source-verify.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{let i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)]}));
if(!['inspect','publish','verify'].includes(args['--mode'])||!args['--input']||!/^[a-f0-9]{64}$/.test(args['--catalog-sha']||''))throw Error('使用 --mode=inspect|publish|verify、--input 和 --catalog-sha');
const input=resolve(args['--input']);
if(!input.startsWith('/tmp/storyweaver-import/'))throw Error('必须使用独立的临时输入目录');
const manifest=JSON.parse(await readFile(input+'/harvest.json','utf8'));
const detail=JSON.parse(await readFile(input+'/details.raw.json','utf8'));
validateManifest(manifest,detail);
const {parseFragment}=createRequire('/app/apps/api-core/package.json')('parse5');
verifySourcePages(manifest,JSON.parse(await readFile(input+'/story-pages.raw.json','utf8')),parseFragment);
await verifyLiveSources(manifest,detail,parseFragment,fetch,input);
const sha=b=>createHash('sha256').update(b).digest('hex');
const [{getPrismaClient},{MediaService},{PictureBookSubmissionService},{snapshotCourseMaterial,hashCourseSnapshot},{writeAdminOperationLog}]=await Promise.all([
 import('/app/packages/database/dist/index.js'),import('/app/apps/api-core/dist/media/media.service.js'),import('/app/apps/api-core/dist/picture-books/picture-book-submission.service.js'),import('/app/apps/api-core/dist/courses/course-domain.js'),import('/app/apps/api-core/dist/security/admin-operation-log.js')]);
createRequire('/app/apps/api-core/package.json')('reflect-metadata');
const require=createRequire('/app/packages/database/package.json');const {Client}=require('pg');const {S3Client,GetObjectCommand,PutObjectCommand}=require('@aws-sdk/client-s3');const sharp=createRequire('/app/apps/api-core/package.json')('sharp');
const expectedOwner='cmw1my3c14jb501s98saisoex',adminId='cmupmv9tf000196lgbh9s8wf0';
process.env.UPLOAD_DRIVER='s3';
const prisma=getPrismaClient(),media=new MediaService(),service=new PictureBookSubmissionService(null,media);const lock=new Client({connectionString:process.env.DATABASE_URL});await lock.connect();
const checkpointFile=`/app/private-creator-assets/storyweaver-import/${manifest.source_id}.json`;
let checkpoint;
async function save(){await mkdir('/app/private-creator-assets/storyweaver-import',{recursive:true,mode:0o700});await writeFile(checkpointFile+'.tmp',JSON.stringify(checkpoint,null,2),{mode:0o600});await rename(checkpointFile+'.tmp',checkpointFile)}
try{
 const got=await lock.query('SELECT pg_try_advisory_lock(20261105, $1) AS ok',[manifest.source_id]);if(!got.rows[0].ok)throw Error('本书发布任务正在执行');
 try{checkpoint=JSON.parse(await readFile(checkpointFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;checkpoint={sourceId:manifest.source_id,owner:expectedOwner,assets:{}}}
 if(checkpoint.sourceId!==manifest.source_id||checkpoint.owner!==expectedOwner)throw Error('断点记录身份不匹配');
 const catalogBytes=await readFile('/app/private-creator-assets/storyweaver-import/catalog.json');
 if(sha(catalogBytes)!==args['--catalog-sha'])throw Error('来源目录快照校验失败');
 const catalog=JSON.parse(catalogBytes.toString('utf8')), entry=catalog.books?.[manifest.catalog_index-1];
 if(entry?.id!==manifest.source_id||Number(entry.level)!==manifest.english_level_code)throw Error('书籍与来源目录顺序不一致');
 const anchor=new Date(catalog.retrieved_at_utc),sortAt=new Date(anchor.getTime()-manifest.catalog_index);
 if(!Number.isFinite(sortAt.getTime()))throw Error('来源目录时间无效');
 const [owner,admin,existing]=await Promise.all([prisma.user.findUnique({where:{accountNumber:46982},select:{id:true,status:true}}),prisma.adminUser.findUnique({where:{id:adminId},select:{role:true,status:true}}),prisma.pictureBook.findUnique({where:{id:bookId(manifest.source_id)}})]);
 if(owner?.id!==expectedOwner||owner.status!=='ACTIVE'||admin?.role!=='SUPER_ADMIN'||admin.status!=='ACTIVE')throw Error('账号或审核管理员身份不符');
 if(manifest.source_id===698069)throw Error('已发布样本使用专门的非覆盖更新流程');
 if(manifest.catalog_index>1){const previous=catalog.books[manifest.catalog_index-2];const prior=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:bookId(previous.id)},select:{publishedAt:true,catalogSortAt:true,publishedHash:true,publishedSnapshot:true,publishedSourceInfo:true,pictureBook:{select:{userId:true}}}});if(!prior?.publishedAt||!prior.publishedHash||prior.pictureBook.userId!==expectedOwner||prior.publishedSnapshot?.englishLevel!==Number(previous.level)||prior.publishedSourceInfo?.url!==`https://storyweaver.org.in/en/stories/${encodeURIComponent(previous.slug)}`||prior.catalogSortAt?.getTime()!==anchor.getTime()-(manifest.catalog_index-1))throw Error('前一本尚未按顺序发布');}
 if(existing && (!checkpoint.createdBook||existing.userId!==expectedOwner))throw Error('已存在非本次任务作品，不能覆盖');
 media.assertPictureBookR2Ready();
 if(args['--mode']==='inspect'){console.log(JSON.stringify({mode:'inspect',id:manifest.source_id,index:manifest.catalog_index,pages:manifest.pages.length,englishLevel:manifest.english_level_code,alreadyExists:!!existing}));} else {
 const counts=async()=>({books:await prisma.pictureBook.count(),submissions:await prisma.pictureBookSubmission.count(),media:await prisma.mediaAsset.count()});
 if(!checkpoint.beforeCounts){if(args['--mode']==='verify')throw Error('缺少发布前表计数');checkpoint.beforeCounts=await counts();await save()}
 const s3=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'auto',forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='0',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});
 if(process.env.S3_BUCKET!=='abeiai'||process.env.S3_KEY_PREFIX!=='picture-books/'||process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/,'')!=='https://r.abeiai.com')throw Error('对象存储配置不符合预期');
 const adapter={
  get:async key=>{try{const response=await s3.send(new GetObjectCommand({Bucket:'abeiai',Key:key}));return Buffer.from(await response.Body.transformToByteArray())}catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')return null;throw e}},
  put:async(key,body,mime)=>{if(args['--mode']==='verify')throw Error('验收不能上传');try{await s3.send(new PutObjectCommand({Bucket:'abeiai',Key:key,Body:body,ContentType:mime,IfNoneMatch:'*'}))}catch(e){if(e?.$metadata?.httpStatusCode!==412)throw e}},
  find:id=>prisma.mediaAsset.findUnique({where:{id}}),
  create:data=>{if(args['--mode']==='verify')throw Error('验收不能创建素材');return prisma.mediaAsset.create({data})}
 };
 async function upload(key,bytes,mime){
  const prior=checkpoint.assets[key];if(prior&&prior.sha256!==sha(bytes))throw Error('素材断点内容变化 '+key);
  if(!prior&&args['--mode']==='verify')throw Error('素材断点缺失 '+key);
  if(!prior){checkpoint.assets[key]={state:'UPLOADING',sha256:sha(bytes)};await save()}
  const result=await persistDeterministicAsset(adapter,{sourceId:manifest.source_id,key,owner:expectedOwner,bytes,mime,sha256:sha(bytes)});
  if(prior?.state==='READY'&&(prior.id!==result.id||prior.url!==result.url))throw Error('素材记录发生变化 '+key);
  const stored=await media.readPictureBookStoredImage(result.url);if(sha(stored.buffer)!==result.sha256)throw Error('公开素材哈希不符 '+key);
  const publicResponse=await fetch(result.url,{signal:AbortSignal.timeout(30000)});if(!publicResponse.ok||sha(Buffer.from(await publicResponse.arrayBuffer()))!==result.sha256)throw Error('公网素材访问或哈希不符 '+key);
  if(args['--mode']!=='verify'){checkpoint.assets[key]={state:'READY',...result};await save()}
  return result.url;
 }
 const urls=[];
 for(const p of manifest.pages){const bytes=await readFile(input+'/'+p.image.file),ext=p.image.file.split('.').pop();if(bytes.length!==p.image.bytes||sha(bytes)!==p.image.sha256)throw Error('上传前图片已变化 '+p.position);const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';urls.push(await upload('page-'+p.position,bytes,mime));}
 const cover=await readFile(input+'/'+manifest.pages[0].image.file);
 if(cover.length!==manifest.pages[0].image.bytes||sha(cover)!==manifest.pages[0].image.sha256)throw Error('上传前封面已变化');
 const library=await sharp(cover).resize(1536,1152,{fit:'contain',background:'#f8f8f6'}).png().toBuffer();
 const coverUrl=await upload('library',library,'image/png');const record=buildBookRecord(manifest,detail,expectedOwner,urls);
 const snapshot=snapshotCourseMaterial('PICTURE_BOOK',record),hash=hashCourseSnapshot(snapshot);
 if(snapshot.englishLevel!==record.englishLevel)throw Error('生产服务尚未支持英语分级，禁止发布');
 if(existing){if(hashCourseSnapshot(snapshotCourseMaterial('PICTURE_BOOK',existing))!==hash)throw Error('现有作品与导入快照不一致');}
 else {if(args['--mode']==='verify')throw Error('作品不存在');checkpoint.createdBook=true;await save();await prisma.pictureBook.create({data:record});}
 let sub=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:record.id}});
 if(sub&&!checkpoint.submissionId&&checkpoint.submissionIntent===hash&&sub.snapshotHash===hash&&sub.status==='PENDING'){
  if(args['--mode']==='verify')throw Error('投稿断点尚未核对');checkpoint.submissionId=sub.id;await save();
 }
 if(sub&&(!checkpoint.submissionId||sub.id!==checkpoint.submissionId||sub.snapshotHash!==hash||sub.status==='REJECTED'||sub.coverUrl&&sub.coverUrl!==coverUrl))throw Error('存在非本任务或冲突的投稿');
 if(!sub){if(args['--mode']==='verify')throw Error('投稿不存在');checkpoint.submissionIntent=hash;await save();await service.submit(expectedOwner,record.id,hash);sub=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:record.id}});checkpoint.submissionId=sub.id;await save()}
 if(sub.status==='PENDING'){
  if(args['--mode']==='verify')throw Error('尚未审核');
  if(!sub.coverUrl){const result=await prisma.pictureBookSubmission.updateMany({where:{id:sub.id,status:'PENDING',updatedAt:sub.updatedAt,snapshotHash:hash,coverUrl:null,coverToken:null},data:{coverUrl}});if(result.count!==1)throw Error('投稿封面并发冲突');sub=await prisma.pictureBookSubmission.findUnique({where:{id:sub.id}})}
  const source=attribution(manifest,detail);await service.updateSource(sub.id,sub.updatedAt.toISOString(),source);sub=await prisma.pictureBookSubmission.findUnique({where:{id:sub.id}});
  if(sub.snapshotHash!==hash||hashCourseSnapshot(sub.snapshot)!==hash)throw Error('待审快照不是目标版本');
  if(!sub.sourceInfo||Object.keys(source).some(k=>sub.sourceInfo[k]!==source[k]))throw Error('待审来源署名已变化');
  await service.decide(adminId,sub.id,sub.updatedAt.toISOString(),'APPROVED',undefined,hash,sortAt);
 }
 sub=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:record.id}});
 if(sub.status!=='APPROVED'||sub.publishedHash!==hash||sub.publishedCoverUrl!==coverUrl||sub.reviewedByAdminId!==adminId||sub.catalogSortAt?.getTime()!==sortAt.getTime())throw Error('发布快照、排序或审核状态不匹配');
 const source=attribution(manifest,detail);if(JSON.stringify(sub.publishedSourceInfo)!==JSON.stringify(source)){
  const a=sub.publishedSourceInfo;if(!a||Object.keys(source).some(k=>a[k]!==source[k]))throw Error('来源署名不匹配');
 }
 if(!await prisma.adminOperationLog.findFirst({where:{action:'APPROVE_PICTURE_BOOK_SUBMISSION',resourceType:'PICTURE_BOOK_SUBMISSION',resourceId:sub.id}})){
  if(args['--mode']==='verify')throw Error('审核日志缺失');
  await writeAdminOperationLog({adminUserId:adminId,action:'APPROVE_PICTURE_BOOK_SUBMISSION',resourceType:'PICTURE_BOOK_SUBMISSION',resourceId:sub.id,description:`审核发布 StoryWeaver 英语绘本 ${manifest.source_id}，保留来源和许可署名`});
 }
 const publicBook=await service.publicBook(record.id);
 if(publicBook.englishLevel!==record.englishLevel||publicBook.pages.length!==record.pages.length||publicBook.pages.some((p,i)=>p.position!==i||p.imageUrl!==urls[i]||p.caption!==displayStoryText(record.pages[i].caption)||p.audioUrl))throw Error('公开阅读数据与来源不一致');
 if(args['--mode']!=='verify'){checkpoint.publishedAt=new Date().toISOString();checkpoint.snapshotHash=hash;checkpoint.afterCounts=await counts();await save()};console.log(JSON.stringify({status:'published',id:manifest.source_id,index:manifest.catalog_index,bookId:record.id,submissionId:sub.id,pages:record.pages.length,englishLevel:record.englishLevel,before:checkpoint.beforeCounts,after:checkpoint.afterCounts}));
 }
}finally{await prisma.$disconnect();await lock.end()}
