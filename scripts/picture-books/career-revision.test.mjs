import assert from 'node:assert/strict';
import test from 'node:test';
import * as revision from './career-revision.mjs';

test('人物修订仅替换已冻结原稿，恢复时拒绝人工修改或作者变更',()=>{
 assert.equal(typeof revision.planCareerReplacement,'function');
 const old={id:'book',userId:'studio',pages:[{caption:'小安',imageUrl:'https://cdn.abei.example/old.webp',audioUrl:null}]};
 const next={...old,pages:[{caption:'小宇',imageUrl:'https://cdn.abei.example/new.webp',audioUrl:null}]};
 assert.equal(revision.planCareerReplacement(old,old,next),'REPLACE');assert.equal(revision.planCareerReplacement(next,old,next),'REUSE');
 assert.throws(()=>revision.planCareerReplacement({...old,userId:'other'},old,next),/修改|归属/);
 assert.throws(()=>revision.planCareerReplacement({...next,pages:[{...next.pages[0],audioUrl:'https://cdn.abei.example/manual.mp3'}]},old,next),/修改/);
});

test('资源保存在同一行锁事务内再次核对，拒绝上传期间出现的人工草稿',async()=>{
 const previous={name:'我想成为',summary:'原稿',coverMediaId:'old',tags:[],items:[]},target={...previous,summary:'新人物',coverMediaId:'new'};
 const revisionOf=(input,status)=>({...input,status,items:[]});
 const old={id:'course',userId:'studio',reviewState:'PUBLISHED',approvedRevisionId:'old',workingRevisionId:'old',approvedRevision:revisionOf(previous,'APPROVED'),workingRevision:revisionOf(previous,'APPROVED')};
 let row=old,locked=false,saves=0;
 const transaction={$queryRaw:async()=>{locked=true;},course:{findUnique:async()=>{assert.equal(locked,true);return row;}}};
 const client={$transaction:async callback=>callback(transaction)};
 const service={prisma:client,saveCourse:async()=>service.prisma.$transaction(async tx=>{assert.equal(tx,transaction);saves++;return 'saved';})};
 assert.equal(typeof revision.saveCareerCourseSafely,'function');
 row={...old,workingRevisionId:'manual',workingRevision:revisionOf({...target,summary:'人工草稿'},'DRAFT')};
 await assert.rejects(()=>revision.saveCareerCourseSafely(service,'studio','course',previous,target),/修改|核对/);
 assert.equal(saves,0);assert.equal(service.prisma,client);
 row=old;locked=false;
 assert.equal(await revision.saveCareerCourseSafely(service,'studio','course',previous,target),'saved');
 assert.equal(saves,1);assert.equal(service.prisma,client);
 row={...old,userId:'other'};locked=false;
 await assert.rejects(()=>revision.saveCareerCourseSafely(service,'studio','course',previous,target),/归属/);
 assert.equal(saves,1);assert.equal(service.prisma,client);
});

test('修订审核必须匹配作者、课件和新人物快照，拒绝既存拒绝或其他待审内容',()=>{
 assert.equal(typeof revision.planCareerMaterialRevision,'function');
 const old={hash:'old',snapshot:{title:'消防员',characters:[{name:'小安'}]}},next={hash:'new',snapshot:{title:'消防员',characters:[{name:'小宇'}]}};
 const pub={id:'pub',status:'APPROVED',approvedHash:'old',approvedSnapshot:old.snapshot};
 assert.equal(revision.planCareerMaterialRevision(pub,null,old,next,'studio'),'SUBMIT');
 const review={scope:'MATERIAL_CHANGE',status:'PENDING',materialPublicationId:'pub',submittedByUserId:'studio',afterSnapshot:next.snapshot};
 const pending={...pub,status:'PENDING',currentHash:'new',currentSnapshot:next.snapshot};
 assert.equal(revision.planCareerMaterialRevision(pending,review,old,next,'studio'),'APPROVE');
 assert.equal(revision.planCareerMaterialRevision({...pub,approvedHash:'new',approvedSnapshot:next.snapshot},null,old,next,'studio'),'PUBLISHED');
 for(const field of ['scope','materialPublicationId','submittedByUserId'])assert.throws(()=>revision.planCareerMaterialRevision(pending,{...review,[field]:'other'},old,next,'studio'),/审核|授权/);
 assert.throws(()=>revision.planCareerMaterialRevision(pending,{...review,afterSnapshot:old.snapshot},old,next,'studio'),/审核|授权/);
 assert.throws(()=>revision.planCareerMaterialRevision(pub,{...review,status:'REJECTED'},old,next,'studio'),/拒绝/);
 assert.throws(()=>revision.planCareerMaterialRevision({...pub,approvedHash:'manual'},null,old,next,'studio'),/修改|快照/);
});

test('系列修订保留地址和目录，只接受原版或本次目标工作版本',()=>{
 assert.equal(typeof revision.planCareerCourseRevision,'function');
 const old={name:'我想成为',summary:'小安',tags:['绘本'],coverMediaId:'old',items:[{materialType:'PICTURE_BOOK',materialId:'book',displayName:'消防员'}]},next={...old,summary:'三个孩子',coverMediaId:'new'};
 const version=(input,status)=>({...input,status,items:input.items.map((i,n)=>({...i,pictureBookId:i.materialId,sortOrder:n}))});
 const course={reviewState:'PUBLISHED',approvedRevisionId:'approved',workingRevisionId:'approved',approvedRevision:version(old,'APPROVED'),workingRevision:version(old,'APPROVED')};
 assert.equal(revision.planCareerCourseRevision(course,old,next),'SAVE');
 const edited={...course,workingRevisionId:'draft',workingRevision:version(next,'DRAFT')};assert.equal(revision.planCareerCourseRevision(edited,old,next),'DRAFT');
 assert.throws(()=>revision.planCareerCourseRevision({...edited,workingRevision:version({...next,summary:'人工修改'},'DRAFT')},old,next),/修改|授权/);
 assert.throws(()=>revision.planCareerCourseRevision({...edited,workingRevision:version(next,'REJECTED')},old,next),/拒绝/);
 const done={...course,approvedRevision:version(next,'APPROVED'),workingRevision:version(next,'APPROVED')};assert.equal(revision.planCareerCourseRevision(done,old,next),'PUBLISHED');
});
