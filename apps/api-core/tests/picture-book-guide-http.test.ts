import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AiService } from "../src/ai/ai.service.js";
import { AudioService, type PrivateTtsPersistence } from "../src/audio/audio.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import { HttpExceptionFilter } from "../src/common/http-exception.filter.js";
import { createValidationPipe } from "../src/common/validation.js";
import { PictureBookGuideModule } from "../src/picture-book-guide/picture-book-guide.module.js";
import type { PictureBookGuideService } from "../src/picture-book-guide/picture-book-guide.service.js";
import { guidePdfFixture } from "./fixtures/picture-book-guide-fixture.js";

type Guide = Awaited<ReturnType<PictureBookGuideService["get"]>>;
test("HTTP 导读：登录身份校验、PDF 上传、文稿与语音分页、私有预览及 Range", {timeout:30000}, async () => {
  const prisma=getPrismaClient();
  const directory=await mkdtemp(join(tmpdir(),"abei-guide-http-"));
  const previousDirectory=process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR;
  process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR=directory;
  process.env.JWT_ACCESS_SECRET ??= `fixture-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET ??= `fixture-${randomUUID()}`;
  process.env.CMS_SCHEDULED_PUBLISHER_ENABLED="0";
  const app=await NestFactory.create(PictureBookGuideModule,{logger:false});
  app.setGlobalPrefix("api");app.useGlobalFilters(new HttpExceptionFilter());app.useGlobalPipes(createValidationPipe());
  Object.assign(app.get(AiService),{createTaskStream:async(_subject:unknown,dto:{input:string},onEvent:(event:Record<string,unknown>)=>void)=>{
    const pageNumber=Number(/第(\d+)页/.exec(dto.input)?.[1]);
    const output=JSON.stringify({pageNumber,script:`第${pageNumber}页，看看小熊的背包。`});onEvent({type:"delta",text:output});return{status:"SUCCEEDED",output};
  }});
  let audioCalls=0;
  Object.assign(app.get(AudioService),{createTtsTask:async(subject:{userId:string},_dto:unknown,options:PrivateTtsPersistence)=>{
    const id=randomUUID();await options.onCreated?.(id);const output=await options.persistOutput(id,{audioBase64:Buffer.from(`ID3private-http${++audioCalls}`).toString("base64"),audioMimeType:"audio/mpeg"});
    const outputAudioAsset=await prisma.audioAsset.create({data:{...output,userId:subject.userId,type:"TTS_OUTPUT",storageProvider:"LOCAL"}});
    await prisma.audioTask.create({data:{id,userId:subject.userId,type:"TTS",provider:"fixture",model:"fixture",status:"SUCCEEDED",estimatedCredits:0,outputAudioAssetId:outputAudioAsset.id}});
    return{id,status:"SUCCEEDED",outputAudioAsset};
  }});
  await app.listen(3618,"127.0.0.1");
  const base="http://127.0.0.1:3618/api";
  const userIds:string[]=[];
  async function session() {
    const email=`guide-http-${randomUUID()}@test.invalid`;
    const user=await prisma.user.create({data:{email,passwordHash:await hashPassword("Guide-fixture-987!"),nickname:"导读接口测试"}});userIds.push(user.id);
    const jar:Record<string,string>={};
    await app.get(AuthService).login({email,password:"Guide-fixture-987!"},{cookie:(name,value)=>{jar[name]=value;},clearCookie:(name)=>{delete jar[name];}});
    const cookie=()=>Object.entries(jar).map(([name,value])=>`${name}=${value}`).join("; ");
    assert.equal((await fetch(`${base}/picture-book-guide`,{headers:{Cookie:cookie()}})).status,403);
    const selected=await fetch(`${base}/profiles/select`,{method:"POST",headers:{Cookie:cookie(),"Content-Type":"application/json"},body:JSON.stringify({mode:"ACCOUNT"})});
    assert.equal(selected.status,201);
    for(const line of selected.headers.getSetCookie()){const [name,...value]=line.split(";")[0]!.split("=");jar[name!]=value.join("=");}
    return cookie();
  }
  try {
    assert.equal((await fetch(`${base}/picture-book-guide`)).status,401);
    const cookie=await session();const other=await session();
    const opts=await (await fetch(`${base}/picture-book-guide/options`,{headers:{Cookie:cookie}})).json();
    assert.equal(opts.data.audiences.length,8);assert.equal(opts.data.styles.length,5);
    const form=new FormData();form.set("file",new Blob([new Uint8Array(await guidePdfFixture())],{type:"application/pdf"}),"小熊绘本.pdf");
    const uploaded=await fetch(`${base}/picture-book-guide`,{method:"POST",headers:{Cookie:cookie},body:form});
    assert.equal(uploaded.status,201);
    let guide=(await uploaded.json()).data as Guide;
    assert.equal(guide.title,"小熊绘本");assert.equal(guide.pageCount,3);
    assert.equal("storageKey" in guide,false);
    const path=`${base}/picture-book-guide/${guide.id}`;
    assert.equal((await fetch(`${path}/pdf`,{headers:{Cookie:other}})).status,404);
    const preview=await fetch(`${path}/pages/2/image`,{headers:{Cookie:cookie}});
    assert.equal(preview.status,200);assert.equal(preview.headers.get("cache-control"),"private, no-store");assert.equal(preview.headers.get("content-type"),"image/png");
    assert.equal((await fetch(`${path}/pages/no/image`,{headers:{Cookie:cookie}})).status,400);
    const post=async (suffix:string,body:unknown)=>fetch(`${path}${suffix}`,{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify(body)});
    assert.equal((await post("/pages/1/audio",{version:guide.version})).status,400);
    for(let page=1;page<=3;page++){const response=await post(`/pages/${page}/script`,{version:guide.version});assert.equal(response.status,201);guide=(await response.json()).data;}
    const spoken=await post("/pages/2/audio",{version:guide.version});assert.equal(spoken.status,201);guide=(await spoken.json()).data;
    assert.equal(guide.audioCount,1);assert.equal(guide.pages[0]!.audioUrl,null);
    assert.equal((await fetch(`${path}/pages/2/audio`,{headers:{Cookie:other}})).status,404);
    const partial=await fetch(`${path}/pages/2/audio`,{headers:{Cookie:cookie,Range:"bytes=0-2"}});
    assert.equal(partial.status,206);assert.equal(await partial.text(),"ID3");assert.equal(partial.headers.get("content-range"),"bytes 0-2/16");
    assert.equal((await fetch(`${path}/pages/2/audio`,{headers:{Cookie:cookie,Range:"bytes=-0"}})).status,416);
    const firstAudioUrl=`http://127.0.0.1:3618${guide.pages[1]!.audioUrl}`;
    const regenerated=await post("/pages/2/audio",{version:guide.version});assert.equal(regenerated.status,201);guide=(await regenerated.json()).data;
    assert.equal(await (await fetch(firstAudioUrl,{headers:{Cookie:cookie}})).text(),"ID3private-http1");
    assert.equal(await (await fetch(`http://127.0.0.1:3618${guide.pages[1]!.audioUrl}`,{headers:{Cookie:cookie}})).text(),"ID3private-http2");
    assert.equal((await fetch(firstAudioUrl.replace("/pages/2/","/pages/1/"),{headers:{Cookie:cookie}})).status,404);
    assert.equal((await fetch(firstAudioUrl,{headers:{Cookie:other}})).status,404);
    const edited=await fetch(`${path}/pages/2`,{method:"PATCH",headers:{Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify({script:"新的小熊带读。",version:guide.version})});
    assert.equal(edited.status,200);assert.equal((await edited.json()).data.pages[1].audioUrl,null);
    assert.equal((await fetch(`${path}/pages/2/audio`,{headers:{Cookie:cookie}})).status,404);
    assert.equal(await (await fetch(firstAudioUrl,{headers:{Cookie:cookie}})).text(),"ID3private-http1");
    assert.equal((await fetch(path,{method:"DELETE",headers:{Cookie:cookie}})).status,200);
  } finally {
    await app.close();await prisma.user.deleteMany({where:{id:{in:userIds}}});await rm(directory,{recursive:true,force:true});
    if(previousDirectory===undefined) delete process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR; else process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR=previousDirectory;
    await prisma.$disconnect();
  }
});
