import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { getPrismaClient } from '@xueleai/database';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
test('Creator HTTP uses exact API audience and narrow upload capability; private/public boundaries',async()=>{
  assert.equal(new URL(process.env.DATABASE_URL!).port,'3668');
  const loaded=await import('../dist/creator/creator.module.js').catch(()=>null);assert.ok(loaded?.CreatorModule,'compiled Creator HTTP module required');
  @Module({imports:[loaded.CreatorModule]}) class TestModule {}
  const app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalFilters(new HttpExceptionFilter());await app.listen(3666,'127.0.0.1');
  const dir=await mkdtemp(`${tmpdir()}/abei-http-assets-`);process.env.CREATOR_ASSET_DIR=dir;
  const db=getPrismaClient();
  const client=await db.creatorClient.create({data:{name:'HTTP测试',redirectUris:['https://example.test/cb']}});
  const user=await db.user.create({data:{email:`http-${randomUUID()}@example.test`,nickname:'创作者',passwordHash:'unused'}});
  async function token(audience:string){const g=await db.creatorGrant.create({data:{clientId:client.id,userId:user.id,audience,scopes:['creator:read','creator:write','creator:submit'],expiresAt:new Date(Date.now()+3600000)}});const secret=randomBytes(32).toString('base64url');await db.creatorToken.create({data:{grantId:g.id,kind:'ACCESS',hash:hash(secret),scopes:g.scopes,expiresAt:new Date(Date.now()+900000)}});return {secret,grant:g};}
  const api=await token('https://mcp.abeiai.com/api/creator/v1'),mcp=await token('https://mcp.abeiai.com/mcp');
  const call=(path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(`http://127.0.0.1:3666/api${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const bearer={authorization:`Bearer ${api.secret}`};
  try {
    const denied=await call('/creator/v1/account','GET',undefined,{authorization:`Bearer ${mcp.secret}`});assert.equal(denied.status,401);assert.equal((await denied.json()).code,40101);assert.match(denied.headers.get('www-authenticate')!,/api\/creator\/v1/);
    const account=await call('/creator/v1/account','GET',undefined,bearer);assert.equal(account.status,200);assert.equal((await account.json()).data.nickname,'创作者');assert.match(account.headers.get('cache-control')!,/no-store/);
    const bytes=await sharp({create:{width:8,height:8,channels:3,background:'blue'}}).png().toBuffer();
    const started=await call('/creator/v1/assets','POST',{schemaVersion:1,externalId:'img',expectedVersion:0,kind:'IMAGE',mimeType:'image/png',sha256:hash(bytes),size:bytes.length},bearer);assert.equal(started.status,201);const upload=(await started.json()).data;
    const cap={'x-creator-upload-capability':upload.uploadCapability};
    const sent=await call(`/creator/v1/assets/${upload.id}/chunks`,'POST',{offset:0,data:bytes.toString('base64')},cap);assert.equal(sent.status,201);
    const progress=await call(`/creator/v1/assets/${upload.id}`,'GET',undefined,cap);assert.equal((await progress.json()).data.offset,bytes.length);
    assert.equal((await call(`/creator/v1/assets/${upload.id}/data`,'GET',undefined,cap)).status,401);
    assert.equal((await call('/creator/v1/books','GET',undefined,cap)).status,401);
    assert.equal((await call(`/creator/v1/assets/${upload.id}/complete`,'POST',{},cap)).status,201);
    assert.equal((await call(`/creator-assets/${upload.id}`)).status,401);
    assert.equal((await call(`/uploads/${upload.id}.data`)).status,404);
    const download=await call(`/creator/v1/assets/${upload.id}/data`,'GET',undefined,bearer);assert.equal(download.status,200);assert.ok(Buffer.from(await download.arrayBuffer()).equals(bytes));
    await db.creatorGrant.update({where:{id:api.grant.id},data:{revokedAt:new Date()}});
    assert.equal((await call(`/creator/v1/assets/${upload.id}`,'GET',undefined,cap)).status,401);
    assert.equal((await call('/creator/v1/books','GET',undefined,bearer)).status,401);
  }finally{await app.close();await db.user.delete({where:{id:user.id}});await db.creatorClient.delete({where:{id:client.id}});await rm(dir,{recursive:true,force:true});await db.$disconnect();}
});
