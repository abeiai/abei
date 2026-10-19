/** Add an operational precondition inside the existing service's transaction, without
 * changing application services or opening a second transaction/connection. */
export function guardedService(service,guard){
 const scoped=Object.create(service),prisma=service.prisma;
 Object.defineProperty(scoped,'prisma',{value:new Proxy(prisma,{get(target,key){
  if(key==='$transaction')return (fn,options)=>target.$transaction(async tx=>{await guard(tx);return fn(tx);},options);
  return Reflect.get(target,key,target);
 }})});
 return scoped;
}
export async function assertNewSubmission(tx,bookId){
 await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))',`picture-book-submission:${bookId}`);
 const prior=await tx.pictureBookSubmission.findUnique({where:{pictureBookId:bookId}});
 if(prior)throw Error('已有投稿，停止重新提交以保留人工审核状态');
}
export async function assertDraftCourse(tx,courseId,revisionId){
 await tx.$queryRawUnsafe('SELECT id FROM courses WHERE id=$1 FOR UPDATE',courseId);
 const course=await tx.course.findUnique({where:{id:courseId},include:{workingRevision:true}});
 const review=await tx.courseReviewRequest.findFirst({where:{courseId,scope:'COURSE_REVISION',courseRevisionId:revisionId}});
 if(course?.workingRevisionId!==revisionId||course.workingRevision?.status!=='DRAFT'||review)throw Error('系列已不是未经提交的原草稿，停止重新提交');
}
