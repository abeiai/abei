import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {careerCollectionBooks,careerExpandedDescription} from './career-expansion-data.mjs';
import {buildCareerBookRecord} from './career-import.mjs';
import * as sync from './career-production-sync.mjs';
const require=createRequire(import.meta.url),manifest=require('./career-sixteen-publication-manifest.json');
const domain=require('../../apps/api-core/dist/courses/course-domain.js');

export function fixture(){
 const time='2026-10-10T02:00:00.000Z',owner='abei-lele-studio',courseId='e2edf14f892a944946c00c80',revisionId='career-sync-test-revision',admin='career-sync-test-admin';
 const assets=Object.entries(manifest.assets).map(([key,a])=>({key,...a}));
 const books=careerCollectionBooks.map(b=>({...buildCareerBookRecord(b,owner,Object.fromEntries(Array.from({length:17},(_,p)=>[p,manifest.assets[b.slug+':'+p].url]))),version:0,createdAt:time,updatedAt:time}));
 const publications=books.map((b,i)=>{const s=domain.snapshotCourseMaterial('PICTURE_BOOK',b),h=domain.hashCourseSnapshot(s);return {id:'career-sync-test-pub-'+i,materialType:'PICTURE_BOOK',videoGuideLessonId:null,englishGuidedStudyMaterialId:null,learningFlashcardDeckId:null,pictureBookId:b.id,status:'APPROVED',approvedHash:h,currentHash:h,approvedSnapshot:s,currentSnapshot:s,createdAt:time,updatedAt:time};});
 const input={name:'我想成为',summary:careerExpandedDescription,tags:['绘本','职业启蒙','幼儿园','中国城市'],coverMediaId:manifest.assets.resource.id};
 const items=books.map((b,i)=>({id:'career-sync-test-item-'+i,revisionId,publicationId:publications[i].id,materialType:'PICTURE_BOOK',videoGuideLessonId:null,englishGuidedStudyMaterialId:null,learningFlashcardDeckId:null,pictureBookId:b.id,displayName:b.title,sortOrder:i,createdAt:time,updatedAt:time}));
 const afterSnapshot={...input,coverUrl:manifest.assets.resource.url,items:items.map((r,i)=>({...r,firstPublication:true,materialHash:publications[i].approvedHash,materialSnapshot:publications[i].approvedSnapshot}))};
 return {format:'abei-career-approved-sync-v1',owner,courseId,sourceReviewId:'career-sync-test-review',assets,materialReviewStates:publications.map(p=>({publicationId:p.id,status:null})),tables:{
  media_assets:assets.map(a=>({id:a.id,filename:a.id+'.webp',originalName:a.key+'.webp',mimeType:'image/webp',size:a.sizeBytes,url:a.url,mediaType:'IMAGE',sourceType:'USER_UPLOAD',storageProvider:'S3',createdByAdminId:null,createdByUserId:owner,createdAt:time})),picture_books:books,course_material_publications:publications,
  courses:[{id:courseId,userId:owner,approvedRevisionId:revisionId,workingRevisionId:null,reviewState:'PUBLISHED',publishedAt:time,createdAt:time,updatedAt:time}],course_revisions:[{id:revisionId,courseId,...input,status:'APPROVED',submittedAt:time,reviewedAt:time,rejectionReason:null,createdAt:time,updatedAt:time}],course_revision_items:items,
  course_review_requests:[{id:'career-sync-test-review',scope:'COURSE_REVISION',status:'APPROVED',courseId,courseRevisionId:revisionId,materialPublicationId:null,submittedByUserId:owner,reviewedByAdminId:admin,beforeSnapshot:null,afterSnapshot,diff:{},reviewNote:null,aiPrecheckStatus:'NOT_STARTED',aiPrecheckProgress:0,aiPrecheckMessage:null,aiPrecheckResult:null,aiPrecheckTaskId:null,aiPrecheckTrigger:null,aiPrecheckStartedAt:null,aiPrecheckCompletedAt:null,submittedAt:time,reviewedAt:time,createdAt:time,updatedAt:time}],
  admin_operation_logs:[{id:'career-sync-test-approval-log',adminUserId:admin,action:'APPROVE_COURSE_REVIEW',resourceType:'COURSE_REVIEW_REQUEST',resourceId:'career-sync-test-review',description:'已批准职业系列',ip:null,userAgent:null,createdAt:time}]
 }};
}

test('只接受完整16本、273图且可绑定到真实批准记录的系列',()=>{
 assert.equal(typeof sync.validateApprovedCareerBundle,'function');
 assert.doesNotThrow(()=>sync.validateApprovedCareerBundle(fixture(),domain));
 for(const mutate of [b=>b.tables.picture_books.pop(),b=>b.assets.pop(),b=>b.tables.course_review_requests[0].status='PENDING',b=>b.tables.courses[0].workingRevisionId='human-draft',b=>b.tables.course_material_publications[0].approvedSnapshot.title='人工改稿',b=>b.tables.course_revision_items[0].pictureBookId='abei-lele-rabbit',b=>b.tables.admin_operation_logs[0].resourceId='unrelated-review',b=>b.tables.users=[],b=>b.materialReviewStates[0].status='PENDING',b=>b.materialReviewStates.pop()]){
  const b=fixture();mutate(b);assert.throws(()=>sync.validateApprovedCareerBundle(b,domain));
 }
});
test('相同业务行重放为零写入，时间序列格式等价；不同稿件或归属拒绝覆盖',()=>{
 assert.equal(typeof sync.planCareerSyncRow,'function');
 const row={id:'book',userId:'studio',title:'原稿',createdAt:'2026-10-10T02:00:00.000Z'};
 assert.equal(sync.planCareerSyncRow(null,row),'INSERT');
 assert.equal(sync.planCareerSyncRow({...row,createdAt:'2026-10-10T02:00:00'},row),'REUSE');
 assert.throws(()=>sync.planCareerSyncRow({...row,userId:'other'},row),/冲突|覆盖/);
 assert.throws(()=>sync.planCareerSyncRow({...row,title:'线上人工稿'},row),/冲突|覆盖/);
});
