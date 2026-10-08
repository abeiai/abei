import "reflect-metadata";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import test from "node:test";
import { AudioService } from "../src/audio/audio.service.js";
import { persistGuideAudio } from "../src/picture-book-guide/picture-book-guide-audio.js";

test("导读音频直接私有保存且拒绝非法数据及路径", async () => {
  const directory = await mkdtemp(join(tmpdir(),"abei-guide-audio-"));
  try {
    const saved = await persistGuideAudio({audioBase64:Buffer.from("ID3private").toString("base64"),audioMimeType:"audio/mpeg"},directory,"task-1","/api/picture-book-guide/guide-1/pages/1/audio?v=task-1");
    assert.equal(saved.storageProvider,"LOCAL");
    assert.equal(saved.url,"/api/picture-book-guide/guide-1/pages/1/audio?v=task-1");
    assert.equal((await readFile(join(directory,"task-1.audio"))).toString(),"ID3private");
    await assert.rejects(persistGuideAudio({audioBase64:"!!"},directory,"task-2","/api/private"),/语音/);
    await assert.rejects(persistGuideAudio({audioBase64:"SUQz"},directory,"../escape","/api/private"),/语音/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("私有持久化在 TTS 结算之前完成，不上传公开音频且任务不残留公开地址", async () => {
  process.env.DATABASE_URL ??= "postgresql://fixture:fixture@localhost:3604/fixture";
  const priorGateway = process.env.AI_GATEWAY_BASE_URL;
  const gateway = createServer((_request,response)=>{response.setHeader("Content-Type","application/json");response.end(JSON.stringify({audioBase64:"SUQz",audioUrl:"https://public.example.test/file.mp3",output:{audio:{url:"https://public.example.test/file.mp3"}},usage:{inputTokens:1,outputTokens:2}}));});
  await new Promise<void>(resolve=>gateway.listen(3617,"127.0.0.1",resolve));
  process.env.AI_GATEWAY_BASE_URL="http://127.0.0.1:3617";
  const events: string[]=[];
  let settledPayload: Record<string,unknown>={};
  const service=Object.create(AudioService.prototype) as {executeTtsTask:(...args:unknown[])=>Promise<{status:string}>};
  Object.assign(service,{
    prisma:{audioTask:{update:async()=>undefined}},resolveProviderApiKey:()=>"fixture",
    persistTtsAudioToS3:async()=>{throw new Error("不得上传公开音频");},
    settleSuccessfulAudioTask:async(_id:string,payload:Record<string,unknown>)=>{events.push("settle");settledPayload=payload;return{status:"SUCCEEDED"};},
    releaseFailedAudioTask:async()=>({status:"FAILED"})
  });
  try {
    const result=await service.executeTtsTask("task-1",{},"voice","正文",{},1000,{persistOutput:async()=>{events.push("persist");return{url:"/api/private/audio",objectKey:"private/task-1",mimeType:"audio/mpeg",sizeBytes:3,storageProvider:"LOCAL"};}});
    assert.equal(result.status,"SUCCEEDED");
    assert.deepEqual(events,["persist","settle"]);
    assert.ok(!JSON.stringify(settledPayload).includes("public.example"));
    assert.ok(!JSON.stringify(settledPayload).includes("audioBase64"));
    assert.deepEqual(settledPayload.usage,{inputTokens:1,outputTokens:2});
    events.length=0;
    const failed=await service.executeTtsTask("task-2",{},"voice","正文",{},1000,{persistOutput:async()=>{throw new Error("保存失败");}});
    assert.equal(failed.status,"FAILED");
    assert.deepEqual(events,[]);
  } finally {await new Promise<void>(resolve=>gateway.close(()=>resolve()));if(priorGateway===undefined) delete process.env.AI_GATEWAY_BASE_URL; else process.env.AI_GATEWAY_BASE_URL=priorGateway;}
});
