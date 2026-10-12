import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rm, chmod } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { getPrismaClient, type Prisma } from '@xueleai/database';
import type { CreatorPrincipal } from '../creator-auth/creator-auth.service.js';
import { exact, fail, integer, lock, object, requirePrincipal, str, versioned, type Tx } from './creator-common.js';
import { hashCourseSnapshot } from '../courses/course-domain.js';
type CreatorAsset = Prisma.CreatorAssetGetPayload<Record<string, never>>;
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const execute = promisify(execFile);
export const CREATOR_ASSET_PREFIX = '/api/creator-assets/';
export function creatorAssetId(url: string) {
    const m = /^\/api\/creator-assets\/([a-z0-9]+)$/.exec(url);
    return m?.[1] ?? null;
}
export function creatorAssetUrl(id: string) {
    return `${CREATOR_ASSET_PREFIX}${id}`;
}
export function creatorAssetRoot() {
    const root = resolve(process.env.CREATOR_ASSET_DIR || 'private-data/creator-assets');
    if (root.split(sep).includes('uploads') || root.split(sep).includes('public'))
        fail('创作素材目录必须为私有目录', 500);
    return root;
}
function filePath(id: string, cover = false) {
    if (!/^[a-z0-9]+$/.test(id))
        fail('素材不存在', 404);
    return join(creatorAssetRoot(), `${id}${cover ? '.cover' : '.data'}`);
}
/** Internal only: caller must first authorize the exact containing book/revision snapshot. */
export async function readCreatorAssetReference(url: string, cover = false) {
    const id = creatorAssetId(url);
    if (!id)
        fail('素材地址无效');
    const row = await getPrismaClient().creatorAsset.findUnique({ where: { id } });
    if (!row || row.status !== 'COMPLETED')
        fail('素材不存在', 404);
    const buffer = await readFile(filePath(id));
    return { buffer: cover ? await sharp(buffer, { limitInputPixels: 40000000 }).rotate().resize(1536, 1152, { fit: 'contain', background: '#faf8f4' }).png().toBuffer() : buffer, mimetype: cover ? 'image/png' : row.mimeType };
}
@Injectable()
export class CreatorAssetsService {
    private readonly db = getPrismaClient();
    limits() {
        return { imageBytes: 10 * 1024 * 1024, audioBytes: 25 * 1024 * 1024, quotaBytes: this.quota(), assetCount: 1000, chunkBytes: 1024 * 1024, uploadExpiresSeconds: 86400, capabilityExpiresSeconds: 900 };
    }
    private quota() {
        const value = Number(process.env.CREATOR_ASSET_QUOTA_BYTES ?? 1073741824);
        return Number.isSafeInteger(value) && value > 0 ? value : 1073741824;
    }
    private summary(row: CreatorAsset) {
        return { id: row.id, externalId: row.externalId, status: row.status, version: row.status === 'COMPLETED' ? 1 : 0, offset: row.offset, size: row.size, sha256: row.sha256, kind: row.kind, mimeType: row.mimeType, expiresAt: row.expiresAt };
    }
    async createUpload(p: CreatorPrincipal, input: unknown) {
        const b = object(input);
        exact(b, ['schemaVersion', 'externalId', 'expectedVersion', 'kind', 'mimeType', 'size', 'sha256']);
        versioned(b);
        if (b.expectedVersion !== 0 || !['IMAGE', 'AUDIO'].includes(String(b.kind)))
            fail('素材创建参数错误');
        const kind = String(b.kind), mimeType = str(b.mimeType, 40), externalId = str(b.externalId, 120);
        if (!(kind === 'IMAGE' ? ['image/png', 'image/jpeg', 'image/webp'] : ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg']).includes(mimeType))
            fail('素材格式不支持');
        const size = integer(b.size, 1, kind === 'IMAGE' ? 10 * 1024 * 1024 : 25 * 1024 * 1024), sha256 = str(b.sha256, 64);
        if (!/^[a-f0-9]{64}$/.test(sha256))
            fail('SHA256 格式错误');
        const requestHash = hashCourseSnapshot({ kind, mimeType, size, sha256 });
        return this.db.$transaction(async (tx) => {
            await requirePrincipal(p, 'creator:write', tx);
            await lock(tx, `creator-assets:${p.userId}`);
            const expired = await tx.creatorAsset.findMany({ where: { userId: p.userId, status: 'UPLOADING', expiresAt: { lte: new Date() } } });
            for (const row of expired) {
                await rm(filePath(row.id), { force: true });
                await rm(filePath(row.id, true), { force: true });
            }
            await tx.creatorAsset.deleteMany({ where: { id: { in: expired.map(a => a.id) } } });
            const prior = await tx.creatorAsset.findUnique({ where: { userId_externalId: { userId: p.userId, externalId } } });
            if (prior && prior.requestHash !== requestHash)
                fail('同一素材标识已用于不同内容', 409);
            if (!prior) {
                const used = await tx.creatorAsset.aggregate({ where: { userId: p.userId }, _sum: { size: true }, _count: true });
                if (used._count >= 1000 || (used._sum.size ?? 0) + size > this.quota())
                    fail('素材存储配额不足', 409);
            }
            const capability = randomBytes(32).toString('base64url'), capabilityExpiresAt = new Date(Date.now() + 900000);
            const row = prior ? await tx.creatorAsset.update({ where: { id: prior.id }, data: { grantId: p.grantId, capabilityHash: hash(capability), capabilityExpiresAt } }) : await tx.creatorAsset.create({ data: { userId: p.userId, externalId, grantId: p.grantId, kind, mimeType, size, sha256, requestHash, capabilityHash: hash(capability), capabilityExpiresAt, expiresAt: new Date(Date.now() + 86400000) } });
            return { ...this.summary(row), uploadCapability: capability, capabilityExpiresAt };
        });
    }
    async statusWithCapability(id: string, secret: string) {
        return this.db.$transaction(async (tx) => {
            const p = await this.capability(tx, id, secret);
            return this.summary(await this.owned(tx, p, id));
        });
    }
    async uploadStatus(p: CreatorPrincipal, id: string) {
        await requirePrincipal(p, 'creator:read');
        return this.summary(await this.owned(this.db, p, id));
    }
    async readOwn(p: CreatorPrincipal, id: string) {
        await requirePrincipal(p, 'creator:read');
        const row = await this.owned(this.db, p, id);
        return readCreatorAssetReference(creatorAssetUrl(row.id));
    }
    private async owned(tx: Tx, p: CreatorPrincipal, id: string) {
        const row = await tx.creatorAsset.findFirst({ where: { id, userId: p.userId } });
        if (!row)
            fail('素材不存在', 404);
        return row;
    }
    private async capability(tx: Tx, id: string, secret: string): Promise<CreatorPrincipal> {
        if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret))
            fail('上传凭证无效', 401);
        const row = await tx.creatorAsset.findUnique({ where: { id } });
        if (!row || row.capabilityHash !== hash(secret) || !row.capabilityExpiresAt || row.capabilityExpiresAt <= new Date())
            fail('上传凭证无效或已过期', 401);
        const grant = await tx.creatorGrant.findUnique({ where: { id: row.grantId } });
        if (!grant)
            fail('授权已失效', 401);
        const p = { userId: row.userId, grantId: grant.id, clientId: grant.clientId, audience: grant.audience, scopes: grant.scopes as CreatorPrincipal['scopes'] };
        await requirePrincipal(p, 'creator:write', tx);
        return p;
    }
    chunk(p: CreatorPrincipal, id: string, offset: number, bytes: Buffer) {
        return this.mutate(p, id, offset, bytes);
    }
    chunkWithCapability(id: string, capability: string, offset: number, bytes: Buffer) {
        return this.mutate(capability, id, offset, bytes);
    }
    complete(p: CreatorPrincipal, id: string) {
        return this.mutate(p, id);
    }
    completeWithCapability(id: string, capability: string) {
        return this.mutate(capability, id);
    }
    private async mutate(identity: CreatorPrincipal | string, id: string, offset?: number, bytes?: Buffer) {
        return this.db.$transaction(async (tx) => {
            // Same user lock as quota/expiry cleanup: files cannot be removed during upload.
            const hint = await tx.creatorAsset.findUnique({ where: { id }, select: { userId: true } });
            if (!hint)
                fail('素材不存在', 404);
            const p = typeof identity === 'string' ? await this.capability(tx, id, identity) : identity;
            await requirePrincipal(p, 'creator:write', tx);
            await lock(tx, `creator-assets:${hint.userId}`);
            if (typeof identity === 'string') await this.capability(tx, id, identity);
            const row = await this.owned(tx, p, id);
            if (bytes) {
                integer(offset, 0, row.size);
                if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 1024 * 1024 || offset! + bytes.length > row.size)
                    fail('上传分块大小错误');
                if (row.status === 'COMPLETED' || row.expiresAt <= new Date())
                    fail('上传会话已结束', 409);
                await mkdir(creatorAssetRoot(), { recursive: true, mode: 0o700 });
                await chmod(creatorAssetRoot(), 0o700);
                if (offset! < row.offset) {
                    const existing = await readFile(filePath(id));
                    if (offset! + bytes.length > row.offset || !existing.subarray(offset, offset! + bytes.length).equals(bytes))
                        fail('上传偏移或内容冲突', 409);
                    return this.summary(row);
                }
                if (offset !== row.offset)
                    fail('上传偏移冲突', 409);
                const file = await open(filePath(id), row.offset === 0 ? 'w' : 'r+', 0o600);
                try {
                    await file.write(bytes, 0, bytes.length, offset);
                    await file.truncate(offset + bytes.length);
                    await file.sync();
                }
                finally {
                    await file.close();
                }
                return this.summary(await tx.creatorAsset.update({ where: { id }, data: { offset: offset + bytes.length } }));
            }
            if (row.status === 'COMPLETED')
                return this.summary(row);
            if (row.expiresAt <= new Date() || row.offset !== row.size)
                fail('素材尚未上传完整或已过期', 409);
            const buffer = await readFile(filePath(id));
            if (buffer.length !== row.size || hash(buffer) !== row.sha256)
                fail('素材大小或 SHA256 校验失败');
            await this.inspect(row, buffer);
            return this.summary(await tx.creatorAsset.update({ where: { id }, data: { status: 'COMPLETED' } }));
        }, { timeout: 30000 });
    }
    private async inspect(row: CreatorAsset, buffer: Buffer) {
        try {
            if (row.kind === 'IMAGE') {
                const image = sharp(buffer, { limitInputPixels: 40000000, failOn: 'warning' }), meta = await image.metadata();
                const actual = ({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[meta.format ?? ''];
                if (actual !== row.mimeType || (meta.pages ?? 1) !== 1)
                    fail('图片格式与声明不一致');
                await image.clone().raw().toBuffer(); // decode all pixels, not just header
            }
            else {
                const { stdout } = await execute('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mp3,wav,mov,ogg', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name', '-of', 'json', filePath(row.id)], { timeout: 10000, maxBuffer: 65536 });
                const info = JSON.parse(stdout) as {
                    format: {
                        format_name: string;
                        duration: string;
                    };
                    streams: {
                        codec_type: string;
                        codec_name: string;
                    }[];
                };
                const format = info.format.format_name;
                const matches = row.mimeType === 'audio/mpeg' ? format === 'mp3' : row.mimeType === 'audio/wav' ? format === 'wav' : row.mimeType === 'audio/ogg' ? format === 'ogg' : format.split(',').includes('mp4');
                if (!matches || !Number.isFinite(Number(info.format.duration)) || Number(info.format.duration) <= 0 || info.streams.length !== 1 || info.streams[0].codec_type !== 'audio')
                    fail('音频格式与声明不一致');
                await execute('ffmpeg', ['-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mp3,wav,mov,ogg', '-i', filePath(row.id), '-f', 'null', '-'], { timeout: 20000, maxBuffer: 65536 });
            }
        }
        catch {
            fail('素材内容校验失败，请检查格式和文件完整性');
        }
    }
}
