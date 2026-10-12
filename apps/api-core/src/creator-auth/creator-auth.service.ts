import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@xueleai/database';
import { AuthService } from '../auth/auth.service.js';
import { AppException } from '../common/app-exception.js';
import type { HeaderRequestLike } from '../security/request-types.js';
import { CREATOR_API_AUDIENCE, CREATOR_MCP_AUDIENCE, CREATOR_SCOPES, CreatorOAuthError, creatorMainOrigin, type CreatorPrincipal, type CreatorScope } from './creator-auth.protocol.js';

export type { CreatorPrincipal, CreatorScope } from './creator-auth.protocol.js';

type DB = ReturnType<typeof getPrismaClient>;
type Tx = Parameters<Parameters<DB['$transaction']>[0]>[0];
type Grant = NonNullable<Awaited<ReturnType<DB['creatorGrant']['findUnique']>>>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const after = (seconds: number) => new Date(Date.now() + seconds * 1000);
const fail = (error: string, message?: string): never => { throw new CreatorOAuthError(error, message); };
const input = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid_request');
  return value as Record<string, unknown>;
};
const str = (obj: Record<string, unknown>, key: string, max = 2048): string => {
  const value = obj[key];
  if (typeof value !== 'string' || !value || value.length > max) return fail('invalid_request');
  return value;
};
const target = (value: unknown): string => {
  if (value !== CREATOR_MCP_AUDIENCE && value !== CREATOR_API_AUDIENCE) return fail('invalid_target');
  return value;
};
const scopes = (value: unknown): CreatorScope[] => {
  if (typeof value !== 'string' || value.length > 200) return fail('invalid_scope');
  const result = [...new Set(value.split(' '))];
  if (!result.length || result.some(s => !(CREATOR_SCOPES as readonly string[]).includes(s))) return fail('invalid_scope');
  return result as CreatorScope[];
};
async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`creator:${key}`}, 0))`;
}

@Injectable()
export class CreatorAuthService {
  private readonly db = getPrismaClient();
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** Persistent counters serialize across workers and do not trust forwarded headers. */
  async rateLimit(key: string, maximum: number, seconds = 60) {
    // Expired-row cleanup must not hold one bucket lock while deleting other buckets.
    await this.db.creatorRateBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const allowed = await this.db.$transaction(async tx => {
      const digest = hash(key);
      await lock(tx, `rate:${digest}`);
      const old = await tx.creatorRateBucket.findUnique({ where: { key: digest } });
      if (!old || old.expiresAt <= new Date()) {
        await tx.creatorRateBucket.upsert({ where: { key: digest }, create: { key: digest, count: 1, expiresAt: after(seconds) }, update: { count: 1, expiresAt: after(seconds) } });
        return true;
      }
      if (old.count >= maximum) return false;
      await tx.creatorRateBucket.update({ where: { key: digest }, data: { count: { increment: 1 } } });
      return true;
    });
    if (!allowed) throw new CreatorOAuthError('temporarily_unavailable', '请求过于频繁，请稍后重试', 429);
  }

  async register(body: unknown, ip: string) {
    await this.rateLimit(`register:${ip}`, 10, 3600);
    await this.rateLimit('register:global', 1000, 86400);
    const b = input(body);
    const allowed = ['client_name', 'redirect_uris', 'token_endpoint_auth_method', 'grant_types', 'response_types', 'scope'];
    if (Object.keys(b).some(k => !allowed.includes(k))) return fail('invalid_client_metadata', '客户端资料不受支持');
    if (typeof b.client_name !== 'string' || !b.client_name.trim() || b.client_name.length > 80 || [...b.client_name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return fail('invalid_client_metadata');
    if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== 'none') return fail('invalid_client_metadata');
    if (b.grant_types !== undefined && (!Array.isArray(b.grant_types) || !b.grant_types.length || b.grant_types.some(v => !['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'].includes(String(v))))) return fail('invalid_client_metadata');
    if (b.response_types !== undefined && (!Array.isArray(b.response_types) || b.response_types.length !== 1 || b.response_types[0] !== 'code')) return fail('invalid_client_metadata');
    if (b.scope !== undefined) scopes(b.scope);
    if (!Array.isArray(b.redirect_uris) || b.redirect_uris.length > 10 || !b.redirect_uris.length) return fail('invalid_client_metadata');
    const redirects = b.redirect_uris.map(value => {
      if (typeof value !== 'string' || value.length > 2048) return fail('invalid_client_metadata');
      let url: URL;
      try { url = new URL(value); } catch { return fail('invalid_client_metadata'); }
      if (url.username || url.password || url.hash || value.includes('#') || url.href !== value || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) return fail('invalid_client_metadata');
      if (['code', 'state', 'error', 'error_description'].some(k => url.searchParams.has(k))) return fail('invalid_client_metadata');
      return value;
    });
    const client = await this.db.$transaction(async tx => {
      await lock(tx, 'client-quota');
      if (await tx.creatorClient.count() >= 10000) return fail('temporarily_unavailable');
      return tx.creatorClient.create({ data: { name: b.client_name as string, redirectUris: [...new Set(redirects)] } });
    });
    return { client_id: client.id, client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000), client_name: client.name, redirect_uris: client.redirectUris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'], response_types: ['code'] };
  }

  async authorize(query: unknown, ip: string) {
    await this.rateLimit(`authorize:${ip}`, 60);
    const q = input(query);
    const client = await this.client(str(q, 'client_id', 128));
    const redirectUri = str(q, 'redirect_uri');
    if (!client.redirectUris.includes(redirectUri)) return fail('invalid_request', '回调地址不匹配');
    if (q.response_type !== 'code' || q.code_challenge_method !== 'S256' || typeof q.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge)) return fail('invalid_request', '需要 S256 PKCE');
    const state = q.state === undefined ? null : str(q, 'state', 1024);
    const request = await this.db.creatorAuthRequest.create({ data: { kind: 'CODE', clientId: client.id, audience: target(q.resource), scopes: scopes(q.scope), redirectUri, state, challenge: q.code_challenge, expiresAt: after(600) } });
    return `${creatorMainOrigin()}/creator/authorize?transaction=${request.id}`;
  }

  async device(body: unknown, ip: string) {
    await this.rateLimit(`device:${ip}`, 20);
    const b = input(body);
    const client = await this.client(str(b, 'client_id', 128));
    await this.rateLimit(`device-client:${client.id}`, 100);
    const code = secret();
    // 40 random bits; checked against per-IP and per-account brute-force limits.
    const human = randomBytes(5).toString('hex').toUpperCase();
    await this.db.creatorAuthRequest.create({ data: { kind: 'DEVICE', clientId: client.id, audience: target(b.resource), scopes: scopes(b.scope), codeHash: hash(code), userCodeHash: hash(human), expiresAt: after(600) } });
    return { device_code: code, user_code: `${human.slice(0, 5)}-${human.slice(5)}`, verification_uri: `${creatorMainOrigin()}/creator/device`, expires_in: 600, interval: 5 };
  }

  private async account(request: HeaderRequestLike) {
    const user = await this.auth.me(request);
    const session = await this.auth.requireUserRefreshSession(request, user.id);
    if (session.profileMode === 'LEARNER') throw new AppException(40301, '请切换到主账号后授权', 403);
    return { userId: user.id, sessionId: session.id, account: { accountId: user.accountId, nickname: user.nickname } };
  }
  private origin(request: HeaderRequestLike) {
    if (request.headers.origin !== creatorMainOrigin() || request.headers['sec-fetch-site'] === 'cross-site') throw new AppException(40301, '请求来源无效', 403);
  }
  private csrf(identity: { userId: string; sessionId: string }, action: string, supplied?: unknown) {
    const key = process.env.JWT_REFRESH_SECRET;
    if (!key) throw new AppException(50001, '授权服务配置缺失', 500);
    const prefix = typeof supplied === 'string' ? supplied.split('.').slice(0, 2).join('.') : `${Date.now() + 600000}.${secret()}`;
    const expected = `${prefix}.${createHmac('sha256', key).update(`${identity.userId}:${identity.sessionId}:${action}:${prefix}`).digest('base64url')}`;
    if (supplied !== undefined) {
      if (typeof supplied !== 'string' || supplied.length !== expected.length || !/^\d{13}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(supplied) || Number(prefix.split('.')[0]) < Date.now() || Number(prefix.split('.')[0]) > Date.now() + 600000 || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new AppException(40301, '授权确认已失效，请刷新页面', 403);
    }
    return expected;
  }
  private checkCsrf(request: HeaderRequestLike, identity: { userId: string; sessionId: string }, action: string) {
    this.origin(request);
    this.csrf(identity, action, request.headers['x-creator-csrf'] ?? '');
  }
  private async view(request: HeaderRequestLike, id: string, kind: string) {
    const identity = await this.account(request);
    const row = await this.db.creatorAuthRequest.findUnique({ where: { id }, include: { client: true } });
    if (!row || row.kind !== kind || row.status !== 'PENDING' || row.expiresAt <= new Date()) throw new AppException(40001, '授权请求已失效', 400);
    return { id: row.id, clientName: row.client.name, account: identity.account, scopes: row.scopes, audience: row.audience, expiresAt: row.expiresAt, csrfToken: this.csrf(identity, id) };
  }
  readRequest(request: HeaderRequestLike, id: string) { return this.view(request, id, 'CODE'); }
  async lookupDevice(request: HeaderRequestLike, body: unknown) {
    this.origin(request);
    const identity = await this.account(request);
    await this.rateLimit(`lookup-user:${identity.userId}`, 10, 600);
    await this.rateLimit(`lookup-ip:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`, 20, 600);
    const value = str(input(body), 'user_code', 32).replace(/[- ]/g, '').toUpperCase();
    const row = /^[A-F0-9]{10}$/.test(value) ? await this.db.creatorAuthRequest.findUnique({ where: { userCodeHash: hash(value) } }) : null;
    if (!row) throw new AppException(40001, '设备码无效或已过期', 400);
    return this.view(request, row.id, 'DEVICE');
  }
  decide(request: HeaderRequestLike, id: string, body: unknown) { return this.decision(request, id, body, 'CODE'); }
  decideDevice(request: HeaderRequestLike, body: unknown) { const b = input(body); return this.decision(request, str(b, 'transaction', 128), b, 'DEVICE'); }
  private async decision(request: HeaderRequestLike, id: string, body: unknown, kind: string) {
    const identity = await this.account(request);
    this.checkCsrf(request, identity, id);
    const b = input(body);
    if (typeof b.approve !== 'boolean') return fail('invalid_request');
    return this.db.$transaction(async tx => {
      await lock(tx, `request:${id}`);
      const row = await tx.creatorAuthRequest.findUnique({ where: { id } });
      if (!row || row.kind !== kind || row.status !== 'PENDING' || row.expiresAt <= new Date()) throw new AppException(40001, '授权请求已失效', 400);
      if ((await tx.user.findUnique({ where: { id: identity.userId } }))?.status !== 'ACTIVE') throw new AppException(40301, '账号已被禁用', 403);
      const grant = b.approve ? await tx.creatorGrant.create({ data: { userId: identity.userId, clientId: row.clientId, audience: row.audience, scopes: row.scopes, expiresAt: after(30 * 86400) } }) : null;
      const code = kind === 'CODE' && b.approve ? secret() : null;
      await tx.creatorAuthRequest.update({ where: { id }, data: { status: b.approve ? 'APPROVED' : 'DENIED', grantId: grant?.id, ...(code ? { codeHash: hash(code), expiresAt: after(60) } : {}) } });
      if (kind === 'DEVICE') return { approved: b.approve };
      const redirect = new URL(row.redirectUri!);
      if (row.state !== null) redirect.searchParams.set('state', row.state);
      redirect.searchParams.set(code ? 'code' : 'error', code ?? 'access_denied');
      return { redirectUri: redirect.toString() };
    });
  }

  async token(body: unknown) {
    const b = input(body);
    const clientId = str(b, 'client_id', 128);
    await this.client(clientId);
    await this.rateLimit(`token-client:${clientId}`, 240);
    if (b.grant_type === 'refresh_token') return this.refresh(b, clientId);
    const device = b.grant_type === 'urn:ietf:params:oauth:grant-type:device_code';
    if (!device && b.grant_type !== 'authorization_code') return fail('unsupported_grant_type');
    const value = str(b, device ? 'device_code' : 'code', 256);
    const initial = await this.db.creatorAuthRequest.findUnique({ where: { codeHash: hash(value) } });
    if (!initial) return fail('invalid_grant');
    // Errors with persistent effects (poll timing/replay revocation) are returned,
    // then thrown AFTER commit, so an exception cannot roll back the protection.
    const result = await this.db.$transaction(async tx => {
      await lock(tx, `request:${initial.id}`);
      const row = (await tx.creatorAuthRequest.findUnique({ where: { id: initial.id } }))!;
      if (row.clientId !== clientId || row.kind !== (device ? 'DEVICE' : 'CODE')) return new CreatorOAuthError('invalid_grant');
      if (row.audience !== target(b.resource)) return new CreatorOAuthError('invalid_target');
      if (row.expiresAt <= new Date()) return new CreatorOAuthError(device ? 'expired_token' : 'invalid_grant');
      if (row.status === 'CONSUMED') return new CreatorOAuthError('invalid_grant');
      if (device) {
        const early = row.nextPollAt && row.nextPollAt > new Date();
        const interval = row.pollInterval + (early ? 5 : 0);
        await tx.creatorAuthRequest.update({ where: { id: row.id }, data: { nextPollAt: after(interval), pollInterval: interval } });
        if (early) return new CreatorOAuthError('slow_down');
        if (row.status === 'PENDING') return new CreatorOAuthError('authorization_pending');
        if (row.status === 'DENIED') return new CreatorOAuthError('access_denied');
      } else {
        if (b.redirect_uri !== row.redirectUri || typeof b.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier) || createHash('sha256').update(b.code_verifier).digest('base64url') !== row.challenge) return new CreatorOAuthError('invalid_grant');
      }
      if (!row.grantId || row.status !== 'APPROVED') return new CreatorOAuthError('invalid_grant');
      await lock(tx, `grant:${row.grantId}`);
      const grant = await tx.creatorGrant.findUnique({ where: { id: row.grantId }, include: { user: true } });
      if (!grant || grant.revokedAt || grant.expiresAt <= new Date() || grant.user.status !== 'ACTIVE') return new CreatorOAuthError('invalid_grant');
      await tx.creatorAuthRequest.update({ where: { id: row.id }, data: { status: 'CONSUMED' } });
      return this.issue(tx, grant, row.scopes);
    });
    if (result instanceof CreatorOAuthError) throw result;
    return result;
  }

  private async refresh(b: Record<string, unknown>, clientId: string) {
    const value = str(b, 'refresh_token', 256);
    const initial = await this.db.creatorToken.findUnique({ where: { hash: hash(value) } });
    if (!initial || initial.kind !== 'REFRESH') return fail('invalid_grant');
    const result = await this.db.$transaction(async tx => {
      await lock(tx, `grant:${initial.grantId}`);
      const token = (await tx.creatorToken.findUnique({ where: { id: initial.id }, include: { grant: { include: { user: true } } } }))!;
      const grant = token.grant;
      if (grant.clientId !== clientId) return new CreatorOAuthError('invalid_grant');
      if (target(b.resource) !== grant.audience) return new CreatorOAuthError('invalid_target');
      if (token.consumedAt) {
        await tx.creatorGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
        return new CreatorOAuthError('invalid_grant', '刷新凭证已使用，请重新授权');
      }
      if (token.expiresAt <= new Date() || grant.expiresAt <= new Date() || grant.revokedAt || grant.user.status !== 'ACTIVE') return new CreatorOAuthError('invalid_grant');
      const requested = b.scope === undefined ? token.scopes : scopes(b.scope);
      if (requested.some(s => !token.scopes.includes(s) || !grant.scopes.includes(s))) return new CreatorOAuthError('invalid_scope');
      await tx.creatorToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
      return this.issue(tx, grant, requested);
    });
    if (result instanceof CreatorOAuthError) throw result;
    return result;
  }
  private async issue(tx: Tx, grant: Grant, allowed: string[]) {
    const access = secret(), refresh = secret();
    await tx.creatorToken.createMany({ data: [
      { hash: hash(access), kind: 'ACCESS', grantId: grant.id, scopes: allowed, expiresAt: new Date(Math.min(after(900).getTime(), grant.expiresAt.getTime())) },
      { hash: hash(refresh), kind: 'REFRESH', grantId: grant.id, scopes: allowed, expiresAt: grant.expiresAt }
    ] });
    return { access_token: access, token_type: 'Bearer', expires_in: Math.min(900, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000)), refresh_token: refresh, scope: allowed.join(' '), resource: grant.audience };
  }
  async authenticateBearer(request: HeaderRequestLike, audience: string, requiredScopes: readonly string[]): Promise<CreatorPrincipal> {
    target(audience);
    const bearer = request.headers.authorization;
    if (typeof bearer !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/i.test(bearer)) throw new CreatorOAuthError('invalid_token', '请先授权登录', 401);
    const token = await this.db.creatorToken.findUnique({ where: { hash: hash(bearer.slice(7)) }, include: { grant: { include: { user: true } } } });
    if (!token || token.kind !== 'ACCESS' || token.expiresAt <= new Date() || token.grant.revokedAt || token.grant.expiresAt <= new Date() || token.grant.audience !== audience || token.grant.user.status !== 'ACTIVE') throw new CreatorOAuthError('invalid_token', '授权已失效，请重新授权', 401);
    if (requiredScopes.some(s => !token.scopes.includes(s) || !token.grant.scopes.includes(s))) throw new CreatorOAuthError('insufficient_scope', '当前授权范围不足', 403);
    const now = new Date();
    // Conditional update bounds writes across workers and concurrent requests.
    if (!token.grant.lastUsedAt || now.getTime() - token.grant.lastUsedAt.getTime() >= 300_000) {
      await this.db.creatorGrant.updateMany({
        where: { id: token.grantId, revokedAt: null, expiresAt: { gt: now }, user: { status: 'ACTIVE' }, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: new Date(now.getTime() - 300_000) } }] },
        data: { lastUsedAt: now }
      });
    }
    return { userId: token.grant.userId, grantId: token.grantId, clientId: token.grant.clientId, scopes: token.scopes as CreatorScope[], audience };
  }
  async revoke(body: unknown) {
    const b = input(body);
    const clientId = str(b, 'client_id', 128);
    const token = await this.db.creatorToken.findUnique({ where: { hash: hash(str(b, 'token', 256)) }, include: { grant: true } });
    if (token?.grant.clientId === clientId) await this.db.$transaction(async tx => {
      await lock(tx, `grant:${token.grantId}`);
      await tx.creatorGrant.update({ where: { id: token.grantId }, data: { revokedAt: new Date() } });
    });
    return {};
  }
  async connections(request: HeaderRequestLike) {
    const identity = await this.account(request);
    const grants = await this.db.creatorGrant.findMany({ where: { userId: identity.userId, revokedAt: null, expiresAt: { gt: new Date() } }, include: { client: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { connections: grants.map(g => ({ id: g.id, clientName: g.client.name, audience: g.audience, scopes: g.scopes, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt, expiresAt: g.expiresAt })), csrfToken: this.csrf(identity, 'connections') };
  }
  async revokeConnection(request: HeaderRequestLike, id: string) {
    const identity = await this.account(request);
    this.checkCsrf(request, identity, 'connections');
    return this.db.$transaction(async tx => {
      await lock(tx, `grant:${id}`);
      const row = await tx.creatorGrant.findUnique({ where: { id } });
      if (!row || row.userId !== identity.userId) throw new AppException(40401, '授权记录不存在', 404);
      await tx.creatorGrant.update({ where: { id }, data: { revokedAt: new Date() } });
      return { revoked: true };
    });
  }
  private async client(id: string) { const client = await this.db.creatorClient.findUnique({ where: { id } }); if (!client) return fail('invalid_client'); return client; }
}
