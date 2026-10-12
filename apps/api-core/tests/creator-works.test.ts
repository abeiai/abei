import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { getPrismaClient } from '@xueleai/database';
import { CreatorAssetsService } from '../src/creator/creator-assets.service.js';
import { AudioService } from '../src/audio/audio.service.js';
import { MediaService } from '../src/media/media.service.js';
import { PictureBookService } from '../src/picture-books/picture-book.service.js';
import { PictureBookSubmissionService } from '../src/picture-books/picture-book-submission.service.js';
import { CreatorMediaService } from '../src/creator/creator-media.service.js';
import { CoursesService } from '../src/courses/courses.service.js';
import { CourseReviewService } from '../src/courses/course-review.service.js';
import type { CreatorPrincipal } from '../src/creator-auth/creator-auth.service.js';
const db=getPrismaClient();
const status=(n:number)=>(e:unknown)=>(e as {getStatus():number}).getStatus()===n;
test('Creator works and immutable publication: real database',async t=>{
  assert.equal(new URL(process.env.DATABASE_URL!).port,'3668');
  const module=await import('../src/creator/creator.service.js').catch(()=>null); assert.ok(module?.CreatorService,'creator works service required');
  const dir=await mkdtemp(`${tmpdir()}/abei-works-`);process.env.CREATOR_ASSET_DIR=dir;
  const users=await Promise.all([1,2].map(i=>db.user.create({data:{email:`works-${randomUUID()}@example.test`,nickname:`作品测试${i}`,passwordHash:'unused'}})));
  const admin=await db.adminUser.create({data:{email:`admin-${randomUUID()}@example.test`,name:'审核测试',passwordHash:'unused'}});
  const client=await db.creatorClient.create({data:{name:'works test',redirectUris:['https://test.invalid/cb']}});
  const [a,b]=await Promise.all(users.map(async u=>{const g=await db.creatorGrant.create({data:{userId:u.id,clientId:client.id,audience:'https://mcp.abeiai.com/mcp',scopes:['creator:read','creator:write','creator:submit'],expiresAt:new Date(Date.now()+3600000)}});return {userId:u.id,grantId:g.id,clientId:g.clientId,audience:g.audience,scopes:g.scopes} as CreatorPrincipal;}));
  const assets=new CreatorAssetsService();const service=new module.CreatorService(assets);
  const submissions=new PictureBookSubmissionService(undefined as never,undefined as never);const reviews=new CourseReviewService();
  const image=await sharp({create:{width:16,height:16,channels:3,background:'red'}}).png().toBuffer();
  const upload=await assets.createUpload(a,{schemaVersion:1,externalId:'cover',expectedVersion:0,kind:'IMAGE',mimeType:'image/png',size:image.length,sha256:createHash('sha256').update(image).digest('hex')});
  await assets.chunk(a,upload.id,0,image);await assets.complete(a,upload.id);
  const manifest=(title='第一版')=>({schemaVersion:1,externalId:'book',expectedVersion:0,title,brief:'私人创作过程',style:'watercolor',aspectRatio:'1:1',pageCount:4,coverAssetId:upload.id,pages:Array.from({length:5},(_,position)=>({position,caption:`第${position}页`,narration:`旁白${position}`,imageAssetId:upload.id,imagePrompt:'私密提示词'}))});
  let book:{id:string;version:number};
  try {
    await t.test('book save retries, foreign ownership, stale concurrency and complete reader pages',async()=>{
      book=await service.saveBook(a,manifest());assert.equal(book.version,1);
      assert.equal((await service.saveBook(a,manifest())).id,book.id);
      await assert.rejects(service.getBook(b,book.id),status(404));
      await assert.rejects(service.saveBook(b,manifest()),status(404));
      const results=await Promise.allSettled(['第二版','不同第二版'].map(title=>service.saveBook(a,{...manifest(title),expectedVersion:1})));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      book=await service.getBook(a,book.id);assert.equal(book.version,2);
      const record=await db.pictureBook.findUniqueOrThrow({where:{id:book.id}});assert.equal(record.status,'COMPLETED'); assert.equal((record.pages as unknown[]).length,5);
      await assert.rejects(service.saveBook(a,{...manifest(),externalId:'url',pages:[{position:0,imageUrl:'https://evil.test/image'}]}),status(400));
    });
    await t.test('website completion cannot bypass creator playback integrity or freeze incomplete album members',async()=>{
      const website=new PictureBookService(undefined as never,undefined as never,undefined as never,reviews,undefined as never);
      for (const variant of ['missing-images','body-only']) {
        const draft=await service.saveBook(a,{...manifest(),externalId:variant});
        if (variant==='missing-images') await website.startBlank(a.userId,draft.id);
        else {
          const current=await db.pictureBook.findUniqueOrThrow({where:{id:draft.id}});
          await db.pictureBook.update({where:{id:draft.id},data:{pages:(current.pages as Array<Record<string,never>>).slice(1)}});
        }
        const current=await db.pictureBook.findUniqueOrThrow({where:{id:draft.id}});
        for (const page of current.pages as Array<{position:number}>) await website.updatePage(a.userId,draft.id,page.position,{caption:'网页文字',imagePrompt:'网页画面'});
        const completed=await website.complete(a.userId,draft.id);
        assert.equal(completed.status,'COMPLETED');
        assert.equal((await service.validateBook(a,draft.id)).valid,false);
        await assert.rejects(service.submitBook(a,draft.id,{expectedVersion:completed.version}),status(400));
        assert.equal(await db.pictureBookSubmission.count({where:{pictureBookId:draft.id}}),0);
        await assert.rejects(service.saveAlbum(a,{schemaVersion:1,externalId:`bad-${variant}`,expectedVersion:0,title:'专辑',summary:'测试',coverAssetId:upload.id,items:[{bookId:draft.id,expectedVersion:completed.version,displayName:'绘本'}]}),status(400));
        const valid=await service.saveAlbum(a,{schemaVersion:1,externalId:`web-${variant}`,expectedVersion:0,title:'专辑',summary:'测试',coverAssetId:upload.id,items:[{bookId:book.id,expectedVersion:2,displayName:'绘本'}]});
        const course=await db.course.findUniqueOrThrow({where:{id:valid.id},include:{workingRevision:true}});
        await new CoursesService().saveCourse(a.userId,valid.id,{name:'网页专辑',summary:'网页',coverMediaId:course.workingRevision!.coverMediaId,tags:[],items:[{materialType:'PICTURE_BOOK',materialId:draft.id,displayName:'不完整'}]});
        assert.equal((await service.validateAlbum(a,valid.id)).valid,false);
        await assert.rejects(service.submitAlbum(a,valid.id,{expectedVersion:2}),status(400));
        assert.equal(await db.courseReviewRequest.count({where:{courseId:valid.id}}),0);
      }
      const withoutDirectory=await service.saveBook(a,{...manifest(),externalId:'no-directory',coverAssetId:undefined});
      const complete=await website.complete(a.userId,withoutDirectory.id);
      assert.equal((await service.validateBook(a,complete.id)).valid,false);
      await assert.rejects(service.submitBook(a,complete.id,{expectedVersion:complete.version}),status(400));
      assert.equal(await db.pictureBookSubmission.count({where:{pictureBookId:complete.id}}),0);
      const album=await service.saveAlbum(a,{schemaVersion:1,externalId:'reader-only',expectedVersion:0,title:'专辑',summary:'不要求成员目录封面',coverAssetId:upload.id,items:[{bookId:complete.id,expectedVersion:complete.version,displayName:'绘本'}]});
      assert.equal((await service.validateAlbum(a,album.id)).valid,true);
    });
    await t.test('authorized account reader serves persisted demo images and legacy local audio',async()=>{
      const filename=`legacy-${randomUUID()}.wav`,audioBytes=Buffer.from('local audio fixture');
      const oldUploadDir=process.env.UPLOAD_DIR;process.env.UPLOAD_DIR=`${dir}/legacy`;
      await mkdir(`${dir}/legacy/audio`,{recursive:true});await writeFile(`${dir}/legacy/audio/${filename}`,audioBytes);
      const url=`/api/audio/files/${filename}`;
      await db.audioAsset.create({data:{userId:a.userId,type:'TTS_OUTPUT',storageProvider:'LOCAL',url,objectKey:filename,mimeType:'audio/wav',sizeBytes:audioBytes.length}});
      const demo=await db.pictureBook.create({data:{userId:a.userId,title:'乐乐',brief:'示范',style:'watercolor',pageCount:4,status:'COMPLETED',pages:[{position:0,caption:'封面',imageUrl:'/picture-book-demos/lele-courage/01.webp',audioUrl:url}],characters:[],messages:[]}});
      const audio=Object.create(AudioService.prototype) as AudioService;Object.assign(audio,{prisma:db});
      const reader=new PictureBookService(undefined as never,audio,new MediaService(),reviews,undefined as never);
      const originalFetch=globalThis.fetch;let fetches=0;
      globalThis.fetch=async input=>{fetches++;assert.equal(new URL(String(input)).pathname,'/picture-book-demos/lele-courage/01.webp');return new Response(image,{headers:{'content-type':'image/png'}});};
      try {
        await assert.rejects(reader.pageImage({userId:b.userId,mode:'ACCOUNT'},demo.id,0),status(404));assert.equal(fetches,0);
        assert.ok((await reader.pageImage({userId:a.userId,mode:'ACCOUNT'},demo.id,0)).buffer.equals(image));
        assert.ok((await reader.pageAudio({userId:a.userId,mode:'ACCOUNT'},demo.id,0)).buffer.equals(audioBytes));
        await db.pictureBook.update({where:{id:demo.id},data:{pages:[{position:0,caption:'封面',imageUrl:'/picture-book-demos/../secret.png',audioUrl:`https://legacy.invalid${url}`}]}});
        await assert.rejects(reader.pageImage({userId:a.userId,mode:'ACCOUNT'},demo.id,0),status(400));
        assert.ok((await reader.pageAudio({userId:a.userId,mode:'ACCOUNT'},demo.id,0)).buffer.equals(audioBytes));
        assert.equal(fetches,1); // Legacy audio is a local lookup, never a URL fetch.
      } finally {globalThis.fetch=originalFetch;if(oldUploadDir===undefined)delete process.env.UPLOAD_DIR;else process.env.UPLOAD_DIR=oldUploadDir;}
    });
    await t.test('approved book survives edit, resubmit and reject; races; public JSON has no private refs or prompts',async()=>{
      const review=await service.submitBook(a,book.id,{expectedVersion:2});
      assert.equal((await service.submitBook(a,book.id,{expectedVersion:2})).id,review.id);
      const decisions=await Promise.allSettled([1,2].map(()=>submissions.decide(admin.id,review.id,review.updatedAt.toISOString(),'APPROVED')));
      assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);
      const original=await submissions.publicBook(book.id);
      const json=JSON.stringify(original);assert.ok(!json.includes('私人')&&!json.includes('私密')&&!json.includes('creator-assets'));
      assert.ok((await submissions.image(book.id,1)).buffer.equals(image));
      await service.saveBook(a,{...manifest('第三版'),expectedVersion:2});
      const pending=await service.submitBook(a,book.id,{expectedVersion:3});
      assert.equal((await submissions.publicBook(book.id)).title,original.title);
      await service.saveBook(a,{...manifest('第四版'),expectedVersion:3});
      assert.equal((await service.submitBook(a,book.id,{expectedVersion:3})).id,pending.id);
      await assert.rejects(service.submitBook(a,book.id,{expectedVersion:4}),status(409));
      await submissions.decide(admin.id,pending.id,pending.updatedAt.toISOString(),'REJECTED','需要修改');
      assert.equal((await submissions.publicBook(book.id)).title,original.title);
    });
    await t.test('album pins member snapshot and cover; review accepts frozen import after live book edit',async()=>{
      const albumInput={schemaVersion:1,externalId:'album',expectedVersion:0,title:'绘本专辑',summary:'四页绘本',coverAssetId:upload.id,items:[{bookId:book.id,expectedVersion:4,displayName:'绘本一'}]};
      const album=await service.saveAlbum(a,albumInput);
      assert.equal((await service.saveAlbum(a,albumInput)).id,album.id);
      await assert.rejects(service.getAlbum(b,album.id),status(404));
      const pending=await service.submitAlbum(a,album.id,{expectedVersion:1});
      assert.equal((await service.submitAlbum(a,album.id,{expectedVersion:1})).id,pending.id);
      await service.saveBook(a,{...manifest('第五版'),expectedVersion:4});
      const approved=await reviews.approve(admin.id,pending.id,pending.updatedAt.toISOString());
      assert.equal(approved.status,'APPROVED');
      const course=await db.course.findUniqueOrThrow({where:{id:album.id},include:{approvedRevision:{include:{items:true}}}});
      const item=course.approvedRevision!.items[0]; assert.equal((item.pinnedSnapshot as {title:string}).title,'第四版');
      const media=new CreatorMediaService(undefined as never);
      assert.equal((await media.play(item.id,{})).title,'第四版');
      assert.ok(!JSON.stringify(await media.play(item.id,{})).includes('creator-assets'));
      assert.ok((await media.page(item.id,1,'image',{})).buffer.equals(image));
      // Legacy demo assets remain readable after revision playback moves behind authorized routes.
      const demoSnapshot=structuredClone(item.pinnedSnapshot) as {pages:Array<{imageUrl:string}>};
      demoSnapshot.pages[1].imageUrl='/picture-book-demos/test/page.png';
      await db.courseRevisionItem.update({where:{id:item.id},data:{pinnedSnapshot:demoSnapshot}});
      const originalFetch=globalThis.fetch;
      globalThis.fetch=async input=>{assert.equal(new URL(String(input)).pathname,'/picture-book-demos/test/page.png');return new Response(image,{headers:{'content-type':'image/png'}});};
      try { assert.ok((await media.page(item.id,1,'image',{})).buffer.equals(image)); }
      finally {globalThis.fetch=originalFetch;await db.courseRevisionItem.update({where:{id:item.id},data:{pinnedSnapshot:item.pinnedSnapshot!}});}

      assert.ok((await media.cover(course.approvedRevisionId!,{})).buffer.length>0);
      assert.ok(JSON.stringify(await new CoursesService().getPublicCourse(album.id)).includes('creator-media'));
      await service.saveAlbum(a,{...albumInput,title:'专辑新版',expectedVersion:1,items:[{bookId:book.id,expectedVersion:5,displayName:'新版'}]});
      const next=await service.submitAlbum(a,album.id,{expectedVersion:2});
      await reviews.reject(admin.id,next.id,'需要修改',next.updatedAt.toISOString());
      assert.equal((await db.course.findUniqueOrThrow({where:{id:album.id}})).approvedRevisionId,course.approvedRevisionId);
      const beforeWeb=await db.course.findUniqueOrThrow({where:{id:album.id},include:{workingRevision:true}});
      await new CoursesService().saveCourse(a.userId,album.id,{name:'网页修改专辑',summary:'网页编辑',coverMediaId:beforeWeb.workingRevision!.coverMediaId,tags:[],items:[{materialType:'PICTURE_BOOK',materialId:book.id,displayName:'网页绘本'}]});
      assert.equal((await db.course.findUniqueOrThrow({where:{id:album.id}})).workingRevisionId,beforeWeb.workingRevisionId);
      assert.equal((await service.getAlbum(a,album.id)).version,3);
      await db.pictureBook.update({where:{id:book.id},data:{status:'EDITING'}});
      assert.equal((await service.validateAlbum(a,album.id)).valid,false);
      await db.pictureBook.update({where:{id:book.id},data:{status:'COMPLETED'}});
      assert.equal((await service.validateAlbum(a,album.id)).valid,true);
      await assert.rejects(service.saveAlbum(a,{...albumInput,expectedVersion:2}),status(409));
      const recovered=await service.saveAlbum(a,{...albumInput,expectedVersion:3,items:[{bookId:book.id,expectedVersion:5,displayName:'恢复同步'}]});
      assert.equal(recovered.version,4);
      const albumPending=await service.submitAlbum(a,album.id,{expectedVersion:4});
      const bookPending=await service.submitBook(a,book.id,{expectedVersion:5});
      const current=await submissions.review(await db.pictureBookSubmission.findUniqueOrThrow({where:{pictureBookId:book.id}}).then(x=>x.id));
      await submissions.unpublish(admin.id,current.id,current.publishedVersion);
      await assert.rejects(submissions.publicBook(book.id),status(404));
      assert.equal((await submissions.review(bookPending.id)).updatedAt.toISOString(),bookPending.updatedAt.toISOString());
      assert.equal((await submissions.review(bookPending.id)).status,'PENDING');
      await reviews.unpublish(admin.id,album.id,course.approvedRevisionId!);
      assert.equal((await db.course.findUniqueOrThrow({where:{id:album.id}})).publishedAt,null);
      assert.equal((await reviews.getReview(albumPending.id)).status,'PENDING');
      assert.equal(await db.adminOperationLog.count({where:{adminUserId:admin.id,action:{in:['UNPUBLISH_PICTURE_BOOK','UNPUBLISH_COURSE']}}}),2);
    });
  } finally {
    await db.course.deleteMany({where:{userId:{in:users.map(x=>x.id)}}});
    await db.courseMaterialPublication.deleteMany({where:{pictureBook:{userId:{in:users.map(x=>x.id)}}}});
    await db.mediaAsset.deleteMany({where:{createdByUserId:{in:users.map(x=>x.id)}}});
    await db.user.deleteMany({where:{id:{in:users.map(x=>x.id)}}});await db.adminOperationLog.deleteMany({where:{adminUserId:admin.id}});await db.adminUser.delete({where:{id:admin.id}});await db.creatorClient.delete({where:{id:client.id}});await rm(dir,{recursive:true,force:true});await db.$disconnect();
  }
});
