import { getPrismaClient, type Prisma } from '@xueleai/database';
import { AppException } from '../common/app-exception.js';
import type { CreatorPrincipal, CreatorScope } from '../creator-auth/creator-auth.service.js';
export type Tx = Prisma.TransactionClient;
export function fail(message: string, status = 400): never {
    throw new AppException(status * 100 + 1, message, status);
}
export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail('请求参数错误');
    return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]) {
    if (Object.keys(value).some(k => !keys.includes(k)))
        fail('包含不支持的字段');
}
export function str(value: unknown, max: number, min = 1): string {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max)
        fail('文字参数长度错误');
    return value.trim();
}
export function integer(value: unknown, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max)
        fail('数字参数格式错误');
    return Number(value);
}
export function versioned(value: Record<string, unknown>) {
    if (value.schemaVersion !== 1)
        fail('仅支持 schemaVersion 1');
    integer(value.expectedVersion, 0, 2147483647);
    str(value.externalId, 120);
}
export async function lock(tx: Tx, key: string) {
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
export async function requirePrincipal(p: CreatorPrincipal, scope: CreatorScope, transaction?: Tx) {
    const tx = transaction ?? getPrismaClient();
    if (transaction)
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`creator:grant:${p.grantId}`}, 0))`;
    const grant = await tx.creatorGrant.findUnique({ where: { id: p.grantId }, include: { user: { select: { status: true } } } });
    if (!grant || grant.userId !== p.userId || grant.clientId !== p.clientId || grant.audience !== p.audience || grant.revokedAt || grant.expiresAt <= new Date() || grant.user.status !== 'ACTIVE')
        fail('授权已失效，请重新授权', 401);
    if (!p.scopes.includes(scope) || !grant.scopes.includes(scope))
        fail('客户端未获此操作授权', 403);
    return grant;
}
