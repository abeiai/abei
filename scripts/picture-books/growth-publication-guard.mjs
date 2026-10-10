import { planCareerPublication } from "./career-import.mjs";
import { careerCourseInclude } from "./career-revision.mjs";

// 核对和原生投稿/审批共享课程行锁及事务，避免等待审批期间授权内容发生变化。
export async function growthCourseOperationSafely(service, context, operation, verifyMaterials) {
  const original=service.prisma;
  service.prisma=new Proxy(original,{get(client,key){
    if(key==="$transaction")return (callback,options)=>client.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${context.courseId} FOR UPDATE`;
      const fresh=await tx.course.findUnique({where:{id:context.courseId},include:careerCourseInclude});
      if(fresh?.userId!==context.owner)throw new Error("资源归属已修改");
      if(planCareerPublication(fresh,context.input)!==context.state)throw new Error("资源版本已修改，请核对后恢复");
      if(verifyMaterials)await verifyMaterials(tx,fresh);
      return callback(tx);
    },options);
    const value=Reflect.get(client,key,client);return typeof value==="function"?value.bind(client):value;
  }});
  try{return await operation();}finally{service.prisma=original;}
}
