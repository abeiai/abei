import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { PictureBookGuideService } from "../src/picture-book-guide/picture-book-guide.service.js";
import { guidePdfFixture } from "./fixtures/picture-book-guide-fixture.js";

test("直接导入图片超过总量限制时删除临时目录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-guide-limit-"));
  const oldDirectory = process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR;
  process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = directory;
  try {
    const service = new PictureBookGuideService({} as never, {} as never);
    await assert.rejects(service.importBook("user", { title: "测试", audience: "幼儿园", pages: [{ sourceText: "", imageUrl: "/test" }] }, async () => ({ buffer: Buffer.alloc(200 * 1024 * 1024 + 1), mimetype: "image/png" }), async () => {}), /200MB/);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    if (oldDirectory === undefined) delete process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR; else process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = oldDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF 分析逐页保存并确认封面和广告筛选后，使用整本上下文生成导读", async () => {
  const prisma = getPrismaClient();
  const directory = await mkdtemp(join(tmpdir(), "abei-guide-analysis-"));
  const oldDirectory = process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR;
  process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = directory;
  const user = await prisma.user.create({ data: { email: `guide-analysis-${randomUUID()}@test.invalid`, passwordHash: "fixture-hash", nickname: "分析测试" } });
  const calls: Array<{ input: string; attachments: Array<{ dataUrl: string }> }> = [];
  let failSecond = true;
  const ai = { createTaskStream: async (_subject: unknown, input: { input: string; attachments: Array<{ dataUrl: string }> }) => {
    calls.push(input);
    if (input.input.includes("绘本页面识别助手")) {
      const pageNumber = Number(/"pageNumber":(\d+)/.exec(input.input)?.[1]);
      if (pageNumber === 2 && failSecond) { failSecond = false; return { status: "FAILED", errorMessage: "识别暂时失败", output: null }; }
      return { status: "SUCCEEDED", output: JSON.stringify({ pageNumber, kind: pageNumber === 1 ? "ADVERTISEMENT" : pageNumber === 2 ? "COVER" : "CONTENT", description: `第${pageNumber}页画面`, text: `第${pageNumber}页文字` }) };
    }
    if (input.input.includes("按页序理解整本绘本")) return { status: "SUCCEEDED", output: JSON.stringify({ title: "森林故事", summary: "小熊来到森林，遇到了朋友。" }) };
    if (input.input.includes("按顺序综合绘本各部分")) return { status: "SUCCEEDED", output: JSON.stringify({ title: "森林故事", summary: "小熊来到森林，遇到了朋友。" }) };
    return { status: "SUCCEEDED", output: JSON.stringify({ pageNumber: 1, script: "一起打开森林故事吧。" }) };
  } };
  const service = new PictureBookGuideService(ai as never, {} as never);
  const subject = { userId: user.id, mode: "ACCOUNT" as const, learnerId: null };
  try {
    const buffer = await guidePdfFixture();
    let guide = await service.upload(user.id, { originalname: "故事.pdf", mimetype: "application/pdf", size: buffer.length, buffer }, { preparePdfAnalysis: true });
    await assert.rejects(service.generateScript(subject, guide.id, 1, guide.version), /先完成绘本分析/);
    await assert.rejects(service.finishPdfAnalysis(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] }), /全部页面分析/);
    const originalCover = (await service.file(user.id, guide.id, "image", 2)).buffer;
    guide = await service.analyzePdfPage(subject, guide.id, 1, guide.version);
    await assert.rejects(service.analyzePdfPage(subject, guide.id, 2, guide.version), /识别暂时失败/);
    guide = await service.get(user.id, guide.id);
    assert.equal(guide.pages[0]!.pdfAnalysis?.kind, "ADVERTISEMENT");
    assert.equal(guide.pages[1]!.pdfAnalysis, undefined);
    for (const number of [2, 3]) guide = await service.analyzePdfPage(subject, guide.id, number, guide.version);
    assert.equal(guide.pages[0]!.pdfAnalysis?.kind, "ADVERTISEMENT");
    const saved = await prisma.pictureBookGuide.findUniqueOrThrow({ where: { id: guide.id } });
    const longPages = saved.pages as unknown as Array<{ sourceText: string }>;
    longPages[1]!.sourceText = "长".repeat(11000) + "尾页线索";
    longPages[2]!.sourceText = "文".repeat(11000);
    await prisma.pictureBookGuide.update({ where: { id: guide.id }, data: { pages: longPages as unknown as Prisma.InputJsonValue } });
    guide = await service.get(user.id, guide.id);
    await assert.rejects(service.finishPdfAnalysis(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] }), /整本绘本分析/);
    guide = await service.summarizePdfBatch(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] });
    assert.equal(guide.pages[0]!.pdfOverviewCache?.levels[0]!.length, 2);
    await assert.rejects(service.finishPdfAnalysis(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] }), /整本绘本分析/);
    guide = await service.summarizePdfBatch(subject, guide.id, { version: guide.version, pageNumbers: [3] });
    assert.deepEqual(guide.pages[0]!.pdfOverviewCache?.selection, [3]);
    guide = await service.summarizePdfBatch(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] });
    assert.deepEqual(guide.pages[0]!.pdfOverviewCache?.selection, [2, 3]);
    guide = await service.get(user.id, guide.id);
    guide = await service.summarizePdfBatch(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] });
    guide = await service.summarizePdfBatch(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] });
    const callsAfterBatch = calls.length;
    guide = await service.summarizePdfBatch(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] });
    assert.equal(calls.length, callsAfterBatch);
    await assert.rejects(service.finishPdfAnalysis(subject, guide.id, { version: guide.version, pageNumbers: [3, 2] }), /整本绘本分析/);
    guide = await service.finishPdfAnalysis(subject, guide.id, { version: guide.version, pageNumbers: [2, 3] });
    assert.equal(guide.title, "森林故事"); assert.equal(guide.pageCount, 2);
    assert.deepEqual((await service.file(user.id, guide.id, "image", 1)).buffer, originalCover);
    const overview = calls.find(call => call.input.includes("按页序理解整本绘本"))!;
    assert.match(overview.input, /第2页画面/); assert.match(overview.input, /尾页线索/); assert.doesNotMatch(overview.input, /第1页画面/);
    guide = await service.generateScript(subject, guide.id, 1, guide.version);
    assert.equal(guide.pages[0]!.script, "一起打开森林故事吧。");
    const scriptRequest = calls.at(-1)!;
    assert.match(scriptRequest.input, /小熊来到森林，遇到了朋友/); assert.match(scriptRequest.input, /简短自然的导语/);
    assert.ok(scriptRequest.attachments[0]!.dataUrl.startsWith("data:image/png;base64,"));
    await assert.rejects(service.analyzePdfPage(subject, guide.id, 1, guide.version), /无法重新整理/);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await rm(directory, { recursive: true, force: true });
    if (oldDirectory === undefined) delete process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR; else process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = oldDirectory;
    await prisma.$disconnect();
  }
});

test("导读闭环：所有页文稿先完成，音频按页保存，编辑清除旧音频，并隔离账号", async () => {
  const prisma = getPrismaClient();
  const directory = await mkdtemp(join(tmpdir(), "abei-guide-service-"));
  const oldDirectory = process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR;
  process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = directory;
  const users = await Promise.all(["a", "b"].map(value => prisma.user.create({data:{email:`guide-${value}-${randomUUID()}@test.invalid`,passwordHash:"fixture-hash",nickname:"导读测试"}})));
  let failScript = false;
  let aiCalls = 0;
  let finishAi: (() => void) | null = null;
  let startedAi: (() => void) | null = null;
  const fullScript = "让我们一起看看小熊。".repeat(140);
  const generateText = async (_subject: unknown, input: {input:string;attachments:Array<{dataUrl:string}>}) => {
    aiCalls++;
    assert.ok(input.attachments[0]!.dataUrl.startsWith("data:image/png;base64,"));
    if (finishAi) { startedAi?.(); await new Promise<void>(resolve => { finishAi = resolve; }); }
    if (failScript) return {status:"FAILED",errorMessage:"测试生成失败",output:null};
    const pageNumber = Number(/第(\d+)页/.exec(input.input)?.[1]);
    return {status:"SUCCEEDED", output:JSON.stringify({pageNumber,script:`第${pageNumber}页，${fullScript}`})};
  };
  const ai = {
    createTask: async (...args: Parameters<typeof generateText>) => { const result = await generateText(...args); return {...result,output:result.output?.slice(0,1000)}; },
    createTaskStream: async (subject: unknown,input:Parameters<typeof generateText>[1],onEvent:(event:Record<string,unknown>)=>void) => {
      const result = await generateText(subject,input);
      if(result.output) { onEvent({type:"delta",text:result.output.slice(0,100)}); onEvent({type:"delta",text:result.output.slice(100)}); }
      return {...result,output:result.output?.slice(0,1000)};
    }
  };
  let audioCalls=0;
  const audio = {createTtsTask: async (_subject: unknown, dto: {text:string;speed:number}, options: {onCreated:(id:string)=>Promise<void>;persistOutput:(id:string,payload:Record<string,unknown>)=>Promise<{url:string;mimeType:string}>}) => {
    audioCalls++;
    assert.match(dto.text,/小熊/); assert.equal(dto.speed,0.85);
    const id=randomUUID();
    await options.onCreated(id);
    const output=await options.persistOutput(id,{audioBase64:Buffer.from("ID3guide-page").toString("base64"),audioMimeType:"audio/mpeg"});
    return {id,status:"SUCCEEDED",outputAudioAsset:output};
  }};
  const service = new PictureBookGuideService(ai as never,audio as never);
  const subject = {userId:users[0]!.id,mode:"ACCOUNT" as const,learnerId:null};
  try {
    const buffer = await guidePdfFixture();
    let guide = await service.upload(subject.userId,{originalname:"小熊.pdf",mimetype:"application/pdf",size:buffer.length,buffer});
    assert.equal(guide.pages.length,3);
    assert.equal(guide.title,"小熊");
    assert.equal((await service.list(users[1]!.id)).length,0);
    for(const read of [()=>service.get(users[1]!.id,guide.id),()=>service.file(users[1]!.id,guide.id,"pdf"),()=>service.file(users[1]!.id,guide.id,"image",1),()=>service.remove(users[1]!.id,guide.id)]) await assert.rejects(read,/不存在/);
    await assert.rejects(service.settings(subject.userId,guide.id,{audience:"陌生年龄",style:"interactive",version:guide.version}),/人群|参数/);
    await assert.rejects(service.generateAudio(subject,guide.id,1,{version:guide.version}),/文稿/);
    guide = await service.settings(subject.userId,guide.id,{audience:"幼儿园",style:"nurturing",version:guide.version});
    failScript=true;
    await assert.rejects(service.generateScript(subject,guide.id,1),/生成失败/);
    failScript=false;
    guide = await service.generateScript(subject,guide.id,1);
    assert.equal(guide.pages[0]!.script,`第1页，${fullScript}`);
    await assert.rejects(service.generateAudio(subject,guide.id,1,{version:guide.version}),/全部|每页/);
    guide = await service.generateScript(subject,guide.id,2);
    guide = await service.generateScript(subject,guide.id,3);
    guide = await service.generateAudio(subject,guide.id,2,{version:guide.version,speed:0.85,voice:"test"});
    assert.equal(guide.audioCount,1);
    assert.ok(guide.pages[1]!.audioUrl);
    assert.equal(guide.pages[0]!.audioUrl,null);
    assert.equal((await service.file(subject.userId,guide.id,"audio",2)).buffer.toString(),"ID3guide-page");
    const recoveredId=guide.pages[1]!.audioTaskId!;
    const asset=await prisma.audioAsset.create({data:{userId:subject.userId,type:"TTS_OUTPUT",storageProvider:"LOCAL",url:guide.pages[1]!.audioUrl!,objectKey:`picture-book-guide/${recoveredId}`,mimeType:"audio/mpeg",sizeBytes:13}});
    await prisma.audioTask.create({data:{id:recoveredId,userId:subject.userId,type:"TTS",provider:"fixture",model:"fixture",status:"SUCCEEDED",estimatedCredits:0,outputAudioAssetId:asset.id}});
    await prisma.pictureBookGuide.update({where:{id:guide.id},data:{pages:guide.pages.map(item=>({...item,...(item.pageNumber===2?{audioMimeType:null}:{})}))}});
    guide=await service.get(subject.userId,guide.id);
    const callsBeforeRecovery=audioCalls;
    guide=await service.generateAudio(subject,guide.id,2,{version:guide.version,speed:0.85,voice:"test"});
    assert.equal(audioCalls,callsBeforeRecovery);
    assert.equal(guide.audioCount,1);
    assert.equal(guide.pages[1]!.audioTaskId,recoveredId);
    await assert.rejects(service.updatePage(subject.userId,guide.id,2,{script:"旧版本编辑",version:guide.version-1}),/更新|修改/);
    guide = await service.updatePage(subject.userId,guide.id,2,{script:"小熊拿好背包了。",version:guide.version});
    assert.equal(guide.pages[1]!.audioUrl,null);
    await assert.rejects(service.file(subject.userId,guide.id,"audio",2),/不存在/);
    guide = await service.settings(subject.userId,guide.id,{audience:"一二年级",style:"interactive",version:guide.version});
    assert.equal(guide.scriptCount,0); assert.equal(guide.audioCount,0);
    // Hold the external AI request while exercising the real database generation lease.
    finishAi=()=>undefined;
    const started = new Promise<void>(resolve=>{startedAi=resolve;});
    const first = service.generateScript(subject,guide.id,1);
    await started;
    const callsBefore = aiCalls;
    await assert.rejects(service.generateScript(subject,guide.id,1),/生成中/);
    await assert.rejects(service.remove(subject.userId,guide.id),/生成中/);
    assert.equal(aiCalls,callsBefore);
    finishAi!();
    guide = await first;
    finishAi=()=>undefined;
    const lateStarted = new Promise<void>(resolve=>{startedAi=resolve;});
    const lateGeneration = service.generateScript(subject,guide.id,2);
    await lateStarted;
    await prisma.pictureBookGuide.update({where:{id:guide.id},data:{operationExpiresAt:new Date(Date.now()-1000)}});
    const expired = await service.get(subject.userId,guide.id);
    guide = await service.settings(subject.userId,guide.id,{audience:"三四年级",style:"inquiry",version:expired.version});
    finishAi!();
    await assert.rejects(lateGeneration,/更新|过期/);
    guide = await service.get(subject.userId,guide.id);
    assert.equal(guide.audience,"三四年级");
    assert.equal(guide.scriptCount,0);
    await service.remove(subject.userId,guide.id);
    assert.equal((await service.list(subject.userId)).length,0);
  } finally {
    await prisma.user.deleteMany({where:{id:{in:users.map(user=>user.id)}}});
    await rm(directory,{recursive:true,force:true});
    if(oldDirectory===undefined) delete process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR; else process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR=oldDirectory;
    await prisma.$disconnect();
  }
});
