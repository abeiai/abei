import {isDeepStrictEqual} from 'node:util';
import {assertCareerRecordMatches} from './career-import.mjs';
import {assertLeleDraftMatches} from './lele-import.mjs';

export const careerCourseInclude={approvedRevision:{include:{items:{orderBy:{sortOrder:'asc'}}}},workingRevision:{include:{items:{orderBy:{sortOrder:'asc'}}}}};

// 此独立运营实例复用 saveCourse，行锁后的复核与保存共享同一事务，避免覆盖新人工草稿。
async function careerCourseOperationSafely(service,owner,courseId,previous,target,state,operation,verifyMaterials) {
 const original=service.prisma;
 service.prisma=new Proxy(original,{get(client,key){
  if(key==='$transaction')return (callback,options)=>client.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${courseId} FOR UPDATE`;
   const fresh=await tx.course.findUnique({where:{id:courseId},include:careerCourseInclude});
   if(fresh?.userId!==owner)throw new Error('资源归属已修改');
   if(planCareerCourseRevision(fresh,previous,target)!==state)throw new Error('资源版本已修改，请核对后恢复');
   if(verifyMaterials)await verifyMaterials(tx);
   return callback(tx);
  },options);
  const value=Reflect.get(client,key,client);return typeof value==='function'?value.bind(client):value;
 }});
 try{return await operation();}finally{service.prisma=original;}
}

export function saveCareerCourseSafely(service,owner,courseId,previous,target,verifyMaterials){
 return careerCourseOperationSafely(service,owner,courseId,previous,target,'SAVE',()=>service.saveCourse(owner,courseId,target),verifyMaterials);
}

export function submitCareerCourseSafely(service,owner,courseId,previous,target,verifyMaterials){
 return careerCourseOperationSafely(service,owner,courseId,previous,target,'DRAFT',()=>service.submitCourse(owner,courseId),verifyMaterials);
}

export function approveCareerCourseSafely(service,owner,adminId,courseId,previous,target,reviewId,expectedVersion,verifyMaterials){
 return careerCourseOperationSafely(service,owner,courseId,previous,target,'PENDING',()=>service.approve(adminId,reviewId,expectedVersion),verifyMaterials);
}

export function planCareerReplacement(current,previous,target) {
 try {assertCareerRecordMatches(current,target);return 'REUSE';}catch{}
 assertCareerRecordMatches(current,previous);return 'REPLACE';
}

export function planCareerMaterialRevision(publication,latest,previous,target,owner) {
 if(!publication||publication.status==='REJECTED'||latest?.status==='REJECTED')throw new Error('既存修订已被拒绝，不能自动重审');
 const approved=publication.approvedHash===target.hash&&isDeepStrictEqual(publication.approvedSnapshot,target.snapshot);
 const original=publication.approvedHash===previous.hash&&isDeepStrictEqual(publication.approvedSnapshot,previous.snapshot);
 if(!approved&&!original)throw new Error('已批准快照被人工修改，不能覆盖');
 if(publication.status==='PENDING'||latest?.status==='PENDING') {
  if(latest?.status!=='PENDING'||latest.scope!=='MATERIAL_CHANGE'||latest.materialPublicationId!==publication.id||latest.submittedByUserId!==owner||!isDeepStrictEqual(latest.afterSnapshot,target.snapshot)||publication.currentHash!==target.hash||!isDeepStrictEqual(publication.currentSnapshot,target.snapshot))throw new Error('待审内容超出本次人物修订授权');
  return 'APPROVE';
 }
 if(publication.status!=='APPROVED')throw new Error('课件公开状态不支持本次修订');
 return approved?'PUBLISHED':'SUBMIT';
}

export function planCareerCourseRevision(course,previous,target) {
 if(!course||!['PUBLISHED','PENDING_REVIEW'].includes(course.reviewState)||course.approvedRevision?.status!=='APPROVED')throw new Error('系列公开状态已修改');
 let approvedTarget=false;
 try{assertLeleDraftMatches(course.approvedRevision,target);approvedTarget=true;}catch{assertLeleDraftMatches(course.approvedRevision,previous);}
 if(course.workingRevisionId!==course.approvedRevisionId&&course.workingRevision) {
  if(course.workingRevision.status==='REJECTED')throw new Error('资源修订被拒绝，不能自动重审');
  assertLeleDraftMatches(course.workingRevision,target);
  if(!['DRAFT','PENDING'].includes(course.workingRevision.status))throw new Error('工作版本状态已修改');
  return course.workingRevision.status;
 }
 return approvedTarget?'PUBLISHED':'SAVE';
}
