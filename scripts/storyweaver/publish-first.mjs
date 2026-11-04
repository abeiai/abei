import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';
import {verifySourcePages,validateManifest,attribution} from './publication.mjs';
import {verifyLiveSources} from './source-verify.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{let i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)]}));
if(!['inspect','publish','verify'].includes(args['--mode'])||!args['--input']||!/^[a-f0-9]{64}$/.test(args['--catalog-sha']||''))throw Error('需要 --mode、--input、--catalog-sha');
const input=resolve(args['--input']);if(!input.startsWith('/tmp/storyweaver-import/'))throw Error('临时输入目录无效');
const {parseFragment}=createRequire('/app/apps/api-core/package.json')('parse5');
const [manifest,detail,raw]=await Promise.all(['harvest.json','details.raw.json','story-pages.raw.json'].map(f=>readFile(input+'/'+f,'utf8').then(JSON.parse)));
validateManifest(manifest,detail);verifySourcePages(manifest,raw,parseFragment);await verifyLiveSources(manifest,detail,parseFragment,fetch,input);
if(manifest.source_id!==698069||manifest.catalog_index!==1||manifest.english_level_code!==2)throw Error('只允许更新已发布的第一本');
const sha=b=>createHash('sha256').update(b).digest('hex');
const catalogData=await readFile('/app/private-creator-assets/storyweaver-import/catalog.json');if(sha(catalogData)!==args['--catalog-sha'])throw Error('来源目录哈希不符');
const catalog=JSON.parse(catalogData);if(catalog.books?.[0]?.id!==698069||catalog.books[0].level!=='2')throw Error('来源目录顺序不符');
const anchor=new Date(catalog.retrieved_at_utc);const sortAt=new Date(anchor.getTime()-1);if(!Number.isFinite(sortAt.getTime()))throw Error('来源目录时间无效');
const [{getPrismaClient},{MediaService},{PictureBookSubmissionService},{snapshotCourseMaterial,hashCourseSnapshot},{writeAdminOperationLog}]=await Promise.all([import('/app/packages/database/dist/index.js'),import('/app/apps/api-core/dist/media/media.service.js'),import('/app/apps/api-core/dist/picture-books/picture-book-submission.service.js'),import('/app/apps/api-core/dist/courses/course-domain.js'),import('/app/apps/api-core/dist/security/admin-operation-log.js')]);
createRequire('/app/apps/api-core/package.json')('reflect-metadata');const {Client}=createRequire('/app/packages/database/package.json')('pg');
const prisma=getPrismaClient(),media=new MediaService(),service=new PictureBookSubmissionService(null,media);const lock=new Client({connectionString:process.env.DATABASE_URL});await lock.connect();
const owner='cmw1my3c14jb501s98saisoex',adminId='cmupmv9tf000196lgbh9s8wf0',id='storyweaver-698069-i-love-to-read',checkpointPath='/app/private-creator-assets/storyweaver-import/698069-backfill.json';
let cp;async function save(){await mkdir('/app/private-creator-assets/storyweaver-import',{recursive:true,mode:0o700});await writeFile(checkpointPath+'.tmp',JSON.stringify(cp,null,2),{mode:0o600});await rename(checkpointPath+'.tmp',checkpointPath)}
const source=attribution(manifest,detail);const sameSource=value=>value&&Object.keys(source).every(k=>value[k]===source[k]);
try{
 const got=await lock.query('SELECT pg_try_advisory_lock(20261105,698069) AS ok');if(!got.rows[0].ok)throw Error('首本任务已运行');
 try{cp=JSON.parse(await readFile(checkpointPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;cp={id,owner}}
 if(cp.id!==id||cp.owner!==owner)throw Error('首本断点身份不符');
 const [account,admin]=await Promise.all([prisma.user.findUnique({where:{accountNumber:46982},select:{id:true,status:true}}),prisma.adminUser.findUnique({where:{id:adminId},select:{role:true,status:true}})]);
 if(account?.id!==owner||account.status!=='ACTIVE'||admin?.role!=='SUPER_ADMIN'||admin.status!=='ACTIVE')throw Error('账号或审核管理员不符');
 let book=await prisma.pictureBook.findUnique({where:{id}}),sub=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:id}});
 if(!book||book.userId!==owner||book.title!==detail.name||book.status!=='COMPLETED'||!sub?.publishedAt||!sub.publishedHash||!sub.publishedCoverUrl)throw Error('原有样本状态不符');
 const coverSha=sha((await media.readPictureBookStoredImage(book.pages[0].imageUrl)).buffer);
 if(cp.originalPublishedCover&&cp.originalPublishedCover!==sub.publishedCoverUrl||cp.storyCoverSha&&cp.storyCoverSha!==coverSha)throw Error('已发布封面发生变化');
 if(args['--mode']==='verify'&&(!cp.originalPublishedCover||!cp.storyCoverSha))throw Error('缺少原封面断点');
 if(book.pages.length!==manifest.pages.length||book.pages.some((p,i)=>p.position!==i||(i===0?p.caption!=='':p.caption!==manifest.pages[i].text)||p.audioUrl))throw Error('原有页面或配音状态与来源不符');
 const [materialRefs,revisionRefs,creatorRefs]=await Promise.all([prisma.courseMaterialPublication.count({where:{pictureBookId:id}}),prisma.courseRevisionItem.count({where:{pictureBookId:id}}),prisma.creatorWork.count({where:{resourceId:id,kind:'BOOK'}})]);
 if(materialRefs||revisionRefs||creatorRefs)throw Error('首本已关联课件或创作者版本，不能直接回填');
 const oldHash=hashCourseSnapshot(snapshotCourseMaterial('PICTURE_BOOK',{...book,englishLevel:null}));
 const newSnapshot=snapshotCourseMaterial('PICTURE_BOOK',{...book,englishLevel:2}),newHash=hashCourseSnapshot(newSnapshot);
 if(newSnapshot.englishLevel!==2||![oldHash,newHash].includes(sub.publishedHash))throw Error('已发布快照与本次作品不一致');
 if(sub.status==='PENDING'&&(!cp.submitIntent||sub.snapshotHash!==newHash))throw Error('已有其他待审版本');
 if(sub.status==='REJECTED'||book.englishLevel!==null&&book.englishLevel!==2)throw Error('原有等级或审核状态冲突');
 const oldSource=sub.publishedSourceInfo;if(oldSource&&Object.keys(oldSource).length&&!sameSource(oldSource))throw Error('原有来源声明已被修改');
 for(const [i,p] of manifest.pages.entries())if(i>0){const actual=await media.readPictureBookStoredImage(book.pages[i].imageUrl);if(sha(actual.buffer)!==p.image.sha256)throw Error('原有插图与来源不符：'+p.position)}
 if(args['--mode']==='publish'&&(!cp.originalPublishedCover||!cp.storyCoverSha)){cp.originalPublishedCover??=sub.publishedCoverUrl;cp.storyCoverSha??=coverSha;await save()}
 if(args['--mode']==='inspect'){console.log(JSON.stringify({mode:'inspect',bookId:id,owner:46982,oldHash,newHash,pages:book.pages.length}));}
 else{
  if(args['--mode']==='verify'&&(book.englishLevel!==2||sub.publishedHash!==newHash||sub.catalogSortAt?.getTime()!==sortAt.getTime()||!sameSource(sub.publishedSourceInfo)))throw Error('首本尚未完成更新');
  if(args['--mode']==='publish'&&book.englishLevel===null){
   cp.started=true;cp.beforeCounts={books:await prisma.pictureBook.count(),submissions:await prisma.pictureBookSubmission.count(),media:await prisma.mediaAsset.count()};await save();
   await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`picture-book-submission:${id}`}))`;await tx.$queryRaw`SELECT 1 FROM picture_books WHERE id=${id} FOR UPDATE`;const current=await tx.pictureBookSubmission.findUnique({where:{pictureBookId:id}});if(!current||current.status!=='APPROVED'||current.publishedHash!==oldHash||current.snapshotHash!==oldHash)throw Error('原有审核状态已变化');if(await tx.courseMaterialPublication.count({where:{pictureBookId:id}})||await tx.courseRevisionItem.count({where:{pictureBookId:id}})||await tx.creatorWork.count({where:{resourceId:id,kind:'BOOK'}}))throw Error('作品已关联课件或创作者版本');const changed=await tx.pictureBook.updateMany({where:{id,userId:owner,version:book.version,englishLevel:null},data:{englishLevel:2,version:{increment:1}}});if(changed.count!==1)throw Error('作品已被并发修改')});
   book=await prisma.pictureBook.findUnique({where:{id}});
  }
  if(args['--mode']==='publish'&&sub.publishedHash!==newHash){
   if(!cp.started)throw Error('缺少本次更新断点');cp.submitIntent=newHash;await save();
   if(sub.status!=='PENDING')await service.submit(owner,id,newHash);sub=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:id}});
   if(sub.status!=='PENDING'||sub.snapshotHash!==newHash||hashCourseSnapshot(sub.snapshot)!==newHash)throw Error('待审快照不匹配');
   if(!sub.coverUrl){const changed=await prisma.pictureBookSubmission.updateMany({where:{id:sub.id,status:'PENDING',updatedAt:sub.updatedAt,snapshotHash:newHash,coverUrl:null,coverToken:null},data:{coverUrl:sub.publishedCoverUrl}});if(changed.count!==1)throw Error('封面状态并发冲突');sub=await prisma.pictureBookSubmission.findUnique({where:{id:sub.id}})}
   if(sub.coverUrl!==cp.originalPublishedCover)throw Error('待审封面已被修改');
   if(sub.sourceInfo&&Object.keys(sub.sourceInfo).length&&!sameSource(sub.sourceInfo))throw Error('来源声明已修改');
   await service.updateSource(sub.id,sub.updatedAt.toISOString(),source);sub=await prisma.pictureBookSubmission.findUnique({where:{id:sub.id}});
   if(!sameSource(sub.sourceInfo)||sub.snapshotHash!==newHash||sub.coverUrl!==cp.originalPublishedCover)throw Error('来源、快照或待审封面已变化');
   await service.decide(adminId,sub.id,sub.updatedAt.toISOString(),'APPROVED',undefined,newHash,sortAt);
  }
  sub=await prisma.pictureBookSubmission.findUnique({where:{pictureBookId:id}});
  if(sub.status!=='APPROVED'||sub.publishedHash!==newHash||sub.publishedCoverUrl!==cp.originalPublishedCover||sub.catalogSortAt?.getTime()!==sortAt.getTime()||!sameSource(sub.publishedSourceInfo))throw Error('首本发布结果不符');
  const playback=await service.publicBook(id);if(playback.englishLevel!==2||playback.pages.length!==15||playback.pages.some((p,i)=>i>0&&p.caption!==manifest.pages[i].text||p.audioUrl))throw Error('公开播放校验失败');
  if(args['--mode']==='publish'){
   if(!await prisma.adminOperationLog.findFirst({where:{action:'STORYWEAVER_ENGLISH_LEVEL_BACKFILL',resourceType:'PICTURE_BOOK_SUBMISSION',resourceId:sub.id}}))await writeAdminOperationLog({adminUserId:adminId,action:'STORYWEAVER_ENGLISH_LEVEL_BACKFILL',resourceType:'PICTURE_BOOK_SUBMISSION',resourceId:sub.id,description:'按 StoryWeaver 来源更新已发布绘本 I Love to Read 的英语分级和来源署名'});
   cp.afterCounts={books:await prisma.pictureBook.count(),submissions:await prisma.pictureBookSubmission.count(),media:await prisma.mediaAsset.count()};cp.verifiedAt=new Date().toISOString();await save();
  }
  if(args['--mode']==='verify'&&!await prisma.adminOperationLog.findFirst({where:{action:'STORYWEAVER_ENGLISH_LEVEL_BACKFILL',resourceType:'PICTURE_BOOK_SUBMISSION',resourceId:sub.id}}))throw Error('首本分级审核日志缺失');
  console.log(JSON.stringify({status:'published',bookId:id,owner:46982,englishLevel:2,pages:15,sortAt:sortAt.toISOString()}));
 }
}finally{await prisma.$disconnect();await lock.end()}
