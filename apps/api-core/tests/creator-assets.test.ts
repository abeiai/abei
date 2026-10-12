import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { getPrismaClient } from '@xueleai/database';
import type { CreatorPrincipal } from '../src/creator-auth/creator-auth.service.js';
const db = getPrismaClient();
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const status = (n: number) => (e: unknown) => (e as {getStatus():number}).getStatus() === n;
test('Creator private uploads: real DB, resumability, isolation, content validation, quotas and revocation', async t => {
  assert.equal(new URL(process.env.DATABASE_URL!).port, '3668');
  const module = await import('../src/creator/creator-assets.service.js').catch(() => null);
  assert.ok(module?.CreatorAssetsService, 'private asset service required');
  const dir = await mkdtemp(`${tmpdir()}/abei-assets-`); process.env.CREATOR_ASSET_DIR = dir;
  const client = await db.creatorClient.create({data:{name:'asset test',redirectUris:['https://test.invalid/cb']}});
  const users = await Promise.all([1,2].map(i => db.user.create({data:{email:`asset-${randomUUID()}@example.test`, nickname:`素材测试${i}`,passwordHash:'unused'}})));
  const principals = await Promise.all(users.map(async user => {const grant = await db.creatorGrant.create({data:{userId:user.id,clientId:client.id,audience:'https://mcp.abeiai.com/mcp',scopes:['creator:read','creator:write','creator:submit'],expiresAt:new Date(Date.now()+3600000)}}); return {userId:user.id,grantId:grant.id,clientId:client.id,audience:grant.audience,scopes:grant.scopes} as CreatorPrincipal;}));
  const [a,b] = principals; const service = new module.CreatorAssetsService();
  const bytes = await sharp({create:{width:20,height:20,channels:3,background:'#abcdef'}}).png().toBuffer();
  const input = (externalId: string, buffer = bytes) => ({schemaVersion:1,externalId,expectedVersion:0,kind:'IMAGE',mimeType:'image/png',size:buffer.length,sha256:sha(buffer)});
  try {
    await t.test('foreign IDs denied; repeated chunks and finalize are idempotent across service restart', async () => {
      const u = await service.createUpload(a,input('image'));
      assert.equal(u.offset,0); assert.ok(u.uploadCapability);
      await assert.rejects(service.uploadStatus(b,u.id),status(404));
      await assert.rejects(service.chunk(b,u.id,0,bytes),status(404));
      await assert.rejects(service.complete(a,u.id),status(409));
      const half = Math.floor(bytes.length/2);
      await service.chunk(a,u.id,0,bytes.subarray(0,half));
      await service.chunk(a,u.id,0,bytes.subarray(0,half));
      await assert.rejects(service.chunk(a,u.id,0,Buffer.alloc(half)),status(409));
      const resumed = new module.CreatorAssetsService();
      assert.equal((await resumed.uploadStatus(a,u.id)).offset,half);
      assert.equal((await resumed.statusWithCapability(u.id,u.uploadCapability)).offset,half);
      await resumed.chunkWithCapability(u.id,u.uploadCapability,half,bytes.subarray(half));
      const asset = await resumed.completeWithCapability(u.id,u.uploadCapability);
      assert.equal(asset.status,'COMPLETED');
      assert.equal((await service.complete(a,u.id)).id,asset.id);
      assert.deepEqual((await service.readOwn(a,u.id)).buffer,bytes);
      await assert.rejects(service.readOwn(b,u.id),status(404));
      assert.equal((await service.createUpload(a,input('image'))).id,u.id);
      await assert.rejects(service.createUpload(a,{...input('image'),sha256:'0'.repeat(64)}),status(409));
    });
    await t.test('hash, actual MIME and malformed media rejected before completion', async () => {
      const bad = await service.createUpload(a,{...input('wronghash'),sha256:'0'.repeat(64)});
      await service.chunk(a,bad.id,0,bytes); await assert.rejects(service.complete(a,bad.id),status(400));
      const fake = Buffer.from('<svg onload="bad"></svg>');
      const invalid = await service.createUpload(a,input('fake',fake)); await service.chunk(a,invalid.id,0,fake); await assert.rejects(service.complete(a,invalid.id),status(400));
      const mismatch = await service.createUpload(a,{...input('mismatch'),mimeType:'image/jpeg'}); await service.chunk(a,mismatch.id,0,bytes); await assert.rejects(service.complete(a,mismatch.id),status(400));
      await assert.rejects(service.createUpload(a,{...input('huge'),size:11*1024*1024}),status(400));
    });
    await t.test('audio validates real decoded WAV content and rejects mislabeled containers', async () => {
      const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
      const u=await service.createUpload(a,{...input('narration',wav),kind:'AUDIO',mimeType:'audio/wav'});
      await service.chunk(a,u.id,0,wav);assert.equal((await service.complete(a,u.id)).status,'COMPLETED');
      const wrong=await service.createUpload(a,{...input('wrong-audio',wav),kind:'AUDIO',mimeType:'audio/mpeg'});
      await service.chunk(a,wrong.id,0,wav);await assert.rejects(service.complete(a,wrong.id),status(400));
    });
    await t.test('concurrent reservations cannot exceed quota; expiry releases reservation', async () => {
      process.env.CREATOR_ASSET_QUOTA_BYTES=String(bytes.length);
      const results = await Promise.allSettled(['q1','q2'].map(id=>service.createUpload(b,input(id))));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const used = results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{id:string}>;
      await db.creatorAsset.update({where:{id:used.value.id},data:{expiresAt:new Date(0)}});
      assert.equal((await service.createUpload(b,input('afterexpiry'))).offset,0);
      delete process.env.CREATOR_ASSET_QUOTA_BYTES;
    });
    await t.test('revocation invalidates both saved principal and narrow upload capability', async () => {
      const u = await service.createUpload(b,input('revoked'));
      await db.creatorGrant.update({where:{id:b.grantId},data:{revokedAt:new Date()}});
      await assert.rejects(service.uploadStatus(b,u.id),status(401));
      await assert.rejects(service.chunkWithCapability(u.id,u.uploadCapability,0,bytes),status(401));
      await assert.rejects(service.completeWithCapability(u.id,u.uploadCapability),status(401));
    });
  } finally {delete process.env.CREATOR_ASSET_QUOTA_BYTES; await db.creatorAsset.deleteMany({where:{userId:{in:users.map(u=>u.id)}}}); await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}}); await db.creatorClient.delete({where:{id:client.id}}); await rm(dir,{recursive:true,force:true});await db.$disconnect();}
});
