import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { getPrismaClient } from '@xueleai/database';
import { readCreatorAssetReference } from '../src/creator/creator-assets.service.js';
import { assertCreatorTestDatabase } from './helpers/abei-test-environment.js';

test('Creator variants separate cover from source and validate status before cached reads', async () => {
  assertCreatorTestDatabase();
  const db = getPrismaClient();
  const directory = await mkdtemp(join(tmpdir(), 'abei-creator-variants-'));
  process.env.CREATOR_ASSET_DIR = directory;
  process.env.IMAGE_VARIANT_CACHE_DIR = join(directory, 'cache');
  const user = await db.user.create({ data: { email: `variants-${randomUUID()}@example.test`, nickname: '图片测试', passwordHash: 'unused' } });
  const buffer = await sharp({ create: { width: 800, height: 400, channels: 3, background: 'red' } }).png().toBuffer();
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const asset = await db.creatorAsset.create({ data: { userId: user.id, externalId: 'image', grantId: 'unused', kind: 'IMAGE', mimeType: 'image/png', size: buffer.length, sha256, requestHash: sha256, status: 'COMPLETED', expiresAt: new Date(Date.now() + 60000) } });
  const url = `/api/creator-assets/${asset.id}`;
  try {
    await writeFile(join(directory, `${asset.id}.data`), buffer);
    const cover = await readCreatorAssetReference(url, true, 320);
    const source = await readCreatorAssetReference(url, false, 320);
    const a = await sharp(cover.buffer).metadata(), b = await sharp(source.buffer).metadata();
    assert.deepEqual([a.width, a.height, b.width, b.height], [320, 240, 320, 160]);
    assert.deepEqual((await readCreatorAssetReference(url)).buffer, buffer);
    await db.creatorAsset.update({ where: { id: asset.id }, data: { status: 'DELETED' } });
    await assert.rejects(readCreatorAssetReference(url, true, 320), (error: unknown) => (error as { getStatus(): number }).getStatus() === 404);
  } finally {
    await db.creatorAsset.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
