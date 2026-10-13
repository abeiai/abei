import "reflect-metadata";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AdminAuthService } from "../src/admin-auth/admin-auth.service.js";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AuthService } from "../src/auth/auth.service.js";
import { HttpExceptionFilter } from "../src/common/http-exception.filter.js";
import { createValidationPipe } from "../src/common/validation.js";
import { AiService } from "../src/ai/ai.service.js";
import { AudioService } from "../src/audio/audio.service.js";
import { MediaService } from "../src/media/media.service.js";
import { CourseReviewService } from "../src/courses/course-review.service.js";
import { SystemConfigService } from "../src/system-config/system-config.service.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PublicPictureBooksController, PublicBookQuery, AdminPictureBookSubmissionsController, ReviewQuery, DecisionDto, RejectDto } from "../src/picture-books/picture-book-submission.controller.js";
import { PictureBookModule } from "../src/picture-books/picture-book.module.js";

// tsx does not emit the constructor metadata emitted by the production TypeScript build.
Reflect.defineMetadata("design:paramtypes", [AiService, AudioService, MediaService, CourseReviewService, SystemConfigService], PictureBookService);

Reflect.defineMetadata("design:paramtypes", [PublicBookQuery], PublicPictureBooksController.prototype, "list");
Reflect.defineMetadata("design:paramtypes", [PublicBookQuery], PublicPictureBooksController.prototype, "albumCatalog");
Reflect.defineMetadata("design:paramtypes", [Object, ReviewQuery], AdminPictureBookSubmissionsController.prototype, "list");
Reflect.defineMetadata("design:paramtypes", [Object, String, DecisionDto], AdminPictureBookSubmissionsController.prototype, "approve");
Reflect.defineMetadata("design:paramtypes", [Object, String, RejectDto], AdminPictureBookSubmissionsController.prototype, "reject");

test("单本绘本投稿要求本人账号和完成的图文，重复提交返回同一份待审核稿", async () => {
  const prisma = getPrismaClient();
  const app = await NestFactory.create(PictureBookModule, { logger: ["error"], abortOnError: false });
  app.setGlobalPrefix("api"); app.useGlobalFilters(new HttpExceptionFilter()); app.useGlobalPipes(createValidationPipe());
  await app.listen(3621, "127.0.0.1");
  const users: string[] = [];
  let adminId = "", albumCoverId = "", publicationId = "";
  try {
    const user = await prisma.user.create({ data: { email: `submission-${randomUUID()}@test.invalid`, nickname: "投稿测试", passwordHash: await hashPassword("Fixture-987!") } }); users.push(user.id);
    const other = await prisma.user.create({ data: { email: `submission-${randomUUID()}@test.invalid`, nickname: "其他作者", passwordHash: "unused" } }); users.push(other.id);
    const data = { title: "小熊的雨天", brief: "私密创作对话", style: "watercolor", pageCount: 1, messages: [{ role: "user", content: "私密对话" }], characters: [], pages: [{ position: 0, caption: "小熊的雨天", narration: "", imagePrompt: "封面", imageUrl: "https://r.abeiai.com/picture-books/test-cover.webp", audioUrl: null }, { position: 1, caption: "小熊在雨中散步", narration: "小熊在雨中散步", imagePrompt: "雨中的小熊", imageUrl: "https://r.abeiai.com/picture-books/test-page.webp", audioUrl: null }] };
    const book = await prisma.pictureBook.create({ data: { ...data, userId: user.id, status: "COMPLETED" } });
    const foreign = await prisma.pictureBook.create({ data: { ...data, userId: other.id, status: "COMPLETED" } });
    const incomplete = await prisma.pictureBook.create({ data: { ...data, userId: user.id, status: "EDITING" } });
    const jar: Record<string,string> = {};
    await app.get(AuthService).login({email:user.email,password:"Fixture-987!"},{cookie:(name,value)=>{jar[name]=value;},clearCookie:name=>{delete jar[name];}});
    const cookie=()=>Object.entries(jar).map(([name,value])=>`${name}=${value}`).join("; ");
    const base = "http://127.0.0.1:3621/api";
    const submit=(id:string,withCookie=true)=>fetch(`${base}/picture-books/${id}/submit`,{method:"POST",headers:withCookie?{Cookie:cookie()}:undefined});
    assert.equal((await submit(book.id,false)).status,401);
    assert.equal((await submit(book.id)).status,403);
    const selected=await fetch(`${base}/profiles/select`,{method:"POST",headers:{Cookie:cookie(),"Content-Type":"application/json"},body:JSON.stringify({mode:"ACCOUNT"})});
    for (const line of selected.headers.getSetCookie()) { const [name,...value]=line.split(";")[0]!.split("=");jar[name!]=value.join("="); }
    assert.equal((await submit(foreign.id)).status,404);
    assert.equal((await submit(incomplete.id)).status,400);
    const first=await submit(book.id); assert.equal(first.status,201);
    const result=(await first.json()).data; assert.equal(result.status,"PENDING");
    const again=(await (await submit(book.id)).json()).data; assert.equal(again.id,result.id);
    assert.doesNotMatch(JSON.stringify(result),/私密创作对话|私密对话/);
    assert.equal((await fetch(`${base}/public/picture-books/${book.id}/play`)).status,404);
    const admin = await prisma.adminUser.create({data:{email:`submission-admin-${randomUUID()}@test.invalid`,name:"绘本审核员",passwordHash:await hashPassword("Fixture-987!")}}); adminId=admin.id;
    const adminJar:Record<string,string>={};
    await app.get(AdminAuthService).login({email:admin.email,password:"Fixture-987!"},{cookie:(name,value)=>{adminJar[name]=value;},clearCookie:name=>{delete adminJar[name];}});
    const adminCookie=Object.entries(adminJar).map(([name,value])=>`${name}=${value}`).join("; ");
    const reviewBase=`${base}/admin/picture-book-submissions/${result.id}`;
    const adminPost=(suffix:string,body?:unknown)=>fetch(`${reviewBase}/${suffix}`,{method:"POST",headers:{Cookie:adminCookie,"Content-Type":"application/json"},body:JSON.stringify(body ?? {})});
    assert.equal((await fetch(`${base}/admin/picture-book-submissions`,{headers:{Cookie:cookie()}})).status,401);
    const reviewResponse=await fetch(reviewBase,{headers:{Cookie:adminCookie}}); assert.equal(reviewResponse.status,200);
    const review=(await reviewResponse.json()).data; assert.equal(review.book.title,"小熊的雨天");
    assert.doesNotMatch(JSON.stringify(review),/私密创作对话|私密对话/);
    const sharp=createRequire(new URL("../../web/package.json",import.meta.url))("sharp");
    const coverImage=await sharp({create:{width:1200,height:900,channels:3,background:"#f6f0e5"}}).png().toBuffer();
    Object.assign(app.get(MediaService),{readPictureBookStoredImage:async()=>({buffer:coverImage,mimetype:"image/png"}), storePictureBookGeneratedImage:async (_userId:string,file:{buffer:Buffer})=>{
      const metadata=await sharp(file.buffer).metadata(); assert.equal(metadata.width,1536); assert.equal(metadata.height,1152);
      return {url:"https://r.abeiai.com/picture-books/library-cover.png"};
    }});
    let generations=0, failCover=true;
    Object.assign(app.get(AiService),{generatePictureBookImage:async (_subject:unknown,input:{width:number;height:number;prompt:string;referenceImages:unknown[]},options:{fixedCredits:number})=>{
      generations++; assert.equal(input.width,1536); assert.equal(input.height,1152); assert.match(input.prompt,/小熊的雨天/); assert.match(input.prompt,/4:3/); assert.equal(input.referenceImages.length,1); assert.equal(options.fixedCredits,0);
      if(failCover) throw new Error("provider secret must not reach user");
      await new Promise(resolve=>setTimeout(resolve,30));
      return {id:"cover-task",images:[{url:"https://r.abeiai.com/picture-books/library-cover.png"}]};
    }});
    const failed=await adminPost("cover"); assert.equal(failed.status,502); assert.doesNotMatch(await failed.text(),/provider secret/);
    assert.equal((await fetch(`${base}/public/picture-books/${book.id}/play`)).status,404);
    failCover=false;
    const covers=await Promise.all([adminPost("cover"),adminPost("cover")]);
    assert.ok(covers.every(response=>response.ok)); assert.equal(generations,2);
    const ready=(await (await fetch(reviewBase,{headers:{Cookie:adminCookie}})).json()).data;
    assert.ok(ready.coverUrl); assert.equal(ready.coverGenerating,false);
    await adminPost("cover"); assert.equal(generations,2);
    assert.equal((await adminPost("approve",{expectedUpdatedAt:review.updatedAt})).status,409);
    await prisma.pictureBook.update({where:{id:book.id},data:{title:"未审核的新标题",pages:[{position:0,caption:"私密新页",imageUrl:"https://r.abeiai.com/private-new.png"}]}});
    const approved=await adminPost("approve",{expectedUpdatedAt:ready.updatedAt}); assert.equal(approved.status,201);
    assert.equal((await approved.json()).data.status,"APPROVED");
    assert.equal((await adminPost("reject",{expectedUpdatedAt:ready.updatedAt,reason:"内容不符规范"})).status,409);
    const previousMediaBase=process.env.S3_PUBLIC_BASE_URL;
    process.env.S3_PUBLIC_BASE_URL="https://r.abeiai.com";
    try {
      const publicPlay=await fetch(`${base}/public/picture-books/${book.id}/play`); assert.equal(publicPlay.status,200);
      const publicBook=(await publicPlay.json()).data; assert.equal(publicBook.title,"小熊的雨天"); assert.equal(publicBook.pages.length,2);
      assert.equal(publicBook.publicMediaBaseUrl,"https://r.abeiai.com");
      assert.equal(publicBook.pages[1].imageUrl,"https://r.abeiai.com/picture-books/test-page.webp");
      assert.doesNotMatch(JSON.stringify(publicBook),/私密新页|未审核的新标题|私密创作对话/);
      const publicListing=(await (await fetch(`${base}/public/picture-books?pageSize=20`)).json()).data;
      assert.ok(publicListing.items.some((item:{id:string;title:string})=>item.id===book.id&&item.title==="小熊的雨天"));
      assert.equal(publicListing.items.find((item:{id:string})=>item.id===book.id).coverUrl,"https://r.abeiai.com/picture-books/library-cover.png");
      await prisma.pictureBookSubmission.update({where:{pictureBookId:book.id},data:{coverUrl:"https://r.abeiai.com/uploads/library-cover.png"}});
      const uploadsListing=(await (await fetch(`${base}/public/picture-books?pageSize=20`)).json()).data;
      assert.equal(uploadsListing.items.find((item:{id:string})=>item.id===book.id).coverUrl,"https://r.abeiai.com/picture-books/library-cover.png");
    } finally {
      if(previousMediaBase===undefined) delete process.env.S3_PUBLIC_BASE_URL; else process.env.S3_PUBLIC_BASE_URL=previousMediaBase;
    }
    assert.equal((await fetch(`${base}/public/picture-books?pageSize=1000`)).status,400);
    assert.equal((await fetch(`${base}/public/picture-books?q=${"a".repeat(101)}`)).status,400);
    assert.equal((await fetch(`${base}/public/picture-books/${book.id}/pages/1/image`)).status,200);
    const log=await prisma.adminOperationLog.findFirst({where:{adminUserId:admin.id,action:"APPROVE_PICTURE_BOOK_SUBMISSION"}}); assert.ok(log);
    // Listing limits are enforced by the real database query, with unpublished items excluded.
    for(let index=0;index<23;index++) {
      const title=index===0 ? "独立绘本0 Alpha" : `独立绘本${index}`;
      const extra=await prisma.pictureBook.create({data:{...data,title,userId:user.id,status:"COMPLETED"}});
      await prisma.pictureBookSubmission.create({data:{pictureBookId:extra.id,status:index===22?"PENDING":"APPROVED",snapshot:{type:"PICTURE_BOOK",title,style:"watercolor",aspectRatio:"1:1",pages:data.pages},publishedSnapshot:index===22?undefined:{type:"PICTURE_BOOK",title,style:"watercolor",aspectRatio:"1:1",pages:data.pages},publishedHash:index===22?null:`fixture-${index}`,publishedCoverUrl:index===22?null:"https://r.abeiai.com/picture-books/library-cover.png",publishedAt:index===22?null:new Date(2000000000000+index*1000),publishedVersion:index===22?0:1,snapshotHash:`fixture-${index}`,coverUrl:"https://r.abeiai.com/picture-books/library-cover.png",reviewedAt:new Date(2000000000000+index*1000)}});
    }
    const capped=(await (await fetch(`${base}/public/picture-books?pageSize=20`)).json()).data;
    assert.equal(capped.items.length,20); assert.equal(capped.items[0].title,"独立绘本21"); assert.equal(capped.items[19].title,"独立绘本2");
    assert.ok(!capped.items.some((item:{title:string})=>item.title==="独立绘本22"));
    const next=(await (await fetch(`${base}/public/picture-books?page=2&pageSize=20`)).json()).data;
    assert.ok(next.items.some((item:{title:string})=>item.title==="独立绘本0 Alpha"));
    const searchedBooks=(await (await fetch(`${base}/public/picture-books?q=${encodeURIComponent("独立绘本")}&pageSize=10&page=2`)).json()).data;
    assert.equal(searchedBooks.total,22); assert.equal(searchedBooks.items.length,10); assert.equal(searchedBooks.page,2);
    assert.equal((await (await fetch(`${base}/public/picture-books?q=alpha`)).json()).data.items[0].title,"独立绘本0 Alpha");
    assert.equal((await (await fetch(`${base}/public/picture-books?q=${encodeURIComponent("独立绘本22")}`)).json()).data.total,0);
    assert.equal((await (await fetch(`${base}/public/picture-books?q=${encodeURIComponent("未审核的新标题")}`)).json()).data.total,0);
    albumCoverId=(await prisma.mediaAsset.create({data:{filename:"legacy-cover.png",originalName:"封面.png",mimeType:"image/png",size:1,storageProvider:"S3",url:"https://account.r2.cloudflarestorage.com/private/legacy-cover.png"}})).id;
    publicationId=(await prisma.courseMaterialPublication.create({data:{materialType:"PICTURE_BOOK",pictureBookId:book.id,status:"APPROVED",currentHash:"fixture",approvedHash:"fixture",currentSnapshot:{},approvedSnapshot:{type:"PICTURE_BOOK",title:data.title,pages:data.pages}}})).id;
    for(let index=0;index<11;index++) {
      const course=await prisma.course.create({data:{id:randomUUID(),userId:user.id,reviewState:"PUBLISHED",publishedAt:index===10?null:new Date(2000000000000+index*1000)}});
      const revision=await prisma.courseRevision.create({data:{courseId:course.id,coverMediaId:albumCoverId,name:`专辑${index}`,summary:"测试绘本专辑",status:"APPROVED"}});
      await prisma.courseRevisionItem.create({data:{revisionId:revision.id,publicationId,materialType:"PICTURE_BOOK",pictureBookId:book.id,displayName:data.title}});
      await prisma.course.update({where:{id:course.id},data:{approvedRevisionId:revision.id}});
    }
    const originalPublicBase=process.env.S3_PUBLIC_BASE_URL, originalPrefix=process.env.S3_KEY_PREFIX;
    process.env.S3_PUBLIC_BASE_URL="https://covers.test.invalid"; process.env.S3_KEY_PREFIX="albums/";
    try {
      const albums=(await (await fetch(`${base}/public/picture-books/albums`)).json()).data;
      assert.equal(albums.length,8); assert.equal(albums[0].title,"专辑9"); assert.equal(albums[7].title,"专辑2");
      assert.equal(albums[0].coverUrl,"https://covers.test.invalid/albums/legacy-cover.png"); assert.equal(albums[0].bookCount,1);
      const albumPage=(await (await fetch(`${base}/public/picture-books/albums/catalog?page=2&pageSize=4`)).json()).data;
      assert.ok(albumPage.total>=10); assert.equal(albumPage.items.length,4); assert.equal(albumPage.items[0].title,"专辑5");
      const searchedAlbums=(await (await fetch(`${base}/public/picture-books/albums/catalog?q=${encodeURIComponent("专辑1")}`)).json()).data;
      assert.equal(searchedAlbums.total,1); assert.equal(searchedAlbums.items[0].title,"专辑1");
      assert.equal((await (await fetch(`${base}/public/picture-books/albums/catalog?q=${encodeURIComponent("专辑10")}`)).json()).data.total,0);
    } finally {
      if(originalPublicBase===undefined) delete process.env.S3_PUBLIC_BASE_URL; else process.env.S3_PUBLIC_BASE_URL=originalPublicBase;
      if(originalPrefix===undefined) delete process.env.S3_KEY_PREFIX; else process.env.S3_KEY_PREFIX=originalPrefix;
    }
    // Rejected submissions stay private, then a corrected completed work may be submitted again.
    await prisma.pictureBook.update({where:{id:book.id},data:{title:data.title,pages:data.pages}});
    const rejectBook=await prisma.pictureBook.create({data:{...data,userId:user.id,status:"COMPLETED"}});
    const rejected=(await (await submit(rejectBook.id)).json()).data;
    const reject=await fetch(`${base}/admin/picture-book-submissions/${rejected.id}/reject`,{method:"POST",headers:{Cookie:adminCookie,"Content-Type":"application/json"},body:JSON.stringify({expectedUpdatedAt:rejected.updatedAt,reason:"缺少完整故事"})}); assert.equal(reject.status,201);
    assert.equal((await fetch(`${base}/public/picture-books/${rejectBook.id}/play`)).status,404);
    const resubmit=(await (await submit(rejectBook.id)).json()).data; assert.equal(resubmit.id,rejected.id); assert.equal(resubmit.status,"PENDING"); assert.equal(resubmit.reviewNote,null);
  } finally {
    await app.close();
    await prisma.course.deleteMany({where:{userId:{in:users}}});
    if(publicationId) await prisma.courseMaterialPublication.delete({where:{id:publicationId}});
    if(albumCoverId) await prisma.mediaAsset.delete({where:{id:albumCoverId}});
    await prisma.user.deleteMany({where:{id:{in:users}}});
    if (adminId) await prisma.adminUser.delete({where:{id:adminId}});
    await prisma.$disconnect();
  }
});
