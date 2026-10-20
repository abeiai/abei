import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { getPrismaClient } from '@xueleai/database';
import { createHash, randomBytes } from 'node:crypto';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { RequestLoggingInterceptor } from '../src/security/request-logging.interceptor.js';
import { RateLimitInterceptor } from '../src/security/rate-limit.interceptor.js';

test('compiled Nest HTTP OAuth wire format, no-store, browser consent and account boundaries', async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).port, '3668');
  const loaded = await import('../dist/creator-auth/creator-auth.module.js').catch(() => null);
  assert.ok(loaded?.CreatorAuthModule, 'compiled CreatorAuthModule must expose native OAuth routes');
  const { AuthService } = await import('../dist/auth/auth.service.js');
  @Module({ imports: [loaded.CreatorAuthModule], providers: [{ provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }, { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor }] })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(3667, '127.0.0.1');
  const base = 'http://127.0.0.1:3667/api/creator-auth';
  const db = getPrismaClient();
  let clientId: string | undefined, userId: string | undefined;
  const json = async (path: string, body: unknown, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'manual' });
  try {
    const meta = await fetch(`${base}/metadata`); assert.equal((await meta.json()).issuer, 'https://mcp.abeiai.com');
    const invalid = await json('/oauth/token', { grant_type: 'password' });
    assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('cache-control'), 'no-store');
    const err = await invalid.json(); assert.equal(err.error, 'invalid_request'); assert.equal(err.code, undefined);
    const badMedia = await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal((await badMedia.json()).error, 'invalid_request');
    const register = await json('/oauth/register', { client_name: '客户端', redirect_uris: ['http://localhost:3670/callback'] });
    assert.equal(register.status, 201); const client = await register.json(); clientId = client.client_id;
    assert.deepEqual(client.redirect_uris, ['http://localhost:3670/callback']);
    const verifier = 'p'.repeat(64);
    const params = new URLSearchParams({ response_type: 'code', client_id: clientId!, redirect_uri: client.redirect_uris[0], code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), resource: 'https://mcp.abeiai.com/mcp', scope: 'creator:read' });
    const authorize = await fetch(`${base}/oauth/authorize?${params}`, { redirect: 'manual' });
    assert.equal(authorize.status, 302);
    const location = new URL(authorize.headers.get('location')!); assert.equal(location.origin, 'https://abeiai.com');
    assert.deepEqual([...location.searchParams.keys()], ['transaction']);
    const id = location.searchParams.get('transaction')!;
    const unauthenticated = await fetch(`${base}/requests/${id}`); assert.equal(unauthenticated.status, 401);
    const user = await db.user.create({ data: { email: `${randomBytes(8).toString('hex')}@creator-http.test`, nickname: '授权用户', passwordHash: 'unused' } }); userId = user.id;
    const cookies: Record<string,string> = {};
    await app.get(AuthService).startUserSession(user.id, { cookie(n: string,v: string) { cookies[n]=v; }, clearCookie() {} });
    const cookie = Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ');
    const read = await fetch(`${base}/requests/${id}`, { headers: { cookie } });
    assert.equal(read.status, 200); const view = (await read.json()).data;
    assert.deepEqual(view.scopes, ['creator:read']);
    const origin = 'https://abeiai.com';
    const missingCsrf = await json(`/requests/${id}`, { approve: true }, { cookie, origin }); assert.equal(missingCsrf.status, 403);
    const wrongOrigin = await json(`/requests/${id}`, { approve: true }, { cookie, origin: 'https://evil.test', 'x-creator-csrf': view.csrfToken }); assert.equal(wrongOrigin.status, 403);
    const approve = await json(`/requests/${id}`, { approve: true }, { cookie, origin, 'x-creator-csrf': view.csrfToken });
    assert.equal(approve.status, 200); const callback = new URL((await approve.json()).data.redirectUri);
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: callback.searchParams.get('code')!, client_id: clientId!, redirect_uri: client.redirect_uris[0], code_verifier: verifier, resource: 'https://mcp.abeiai.com/mcp' });
    const exchanged = await fetch(`${base}/oauth/token`, { method: 'POST', body: form }); assert.equal(exchanged.status, 200);
    const tokens = await exchanged.json(); assert.ok(tokens.access_token); assert.equal(tokens.data, undefined);
    const connected = await fetch(`${base}/connections`, { headers: { cookie } }); const connections = (await connected.json()).data;
    assert.equal(connections.connections.length, 1);
    const revoked = await fetch(`${base}/connections/${connections.connections[0].id}`, { method: 'DELETE', headers: { cookie, origin, 'x-creator-csrf': connections.csrfToken } }); assert.equal(revoked.status, 200);
    const session = await db.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    await db.refreshToken.update({ where: { id: session.id }, data: { profileMode: 'LEARNER', profileLearnerId: (await db.learner.create({ data: { userId: user.id, accountNumber: 100, nickname: '学习者', grade: 'GRADE_1' } })).id } });
    const learner = await fetch(`${base}/connections`, { headers: { cookie } }); assert.equal(learner.status, 403);
  } finally {
    if (clientId) await db.creatorClient.delete({ where: { id: clientId } });
    if (userId) { await db.refreshToken.deleteMany({ where: { userId } }); await db.learner.deleteMany({ where: { userId } }); await db.user.delete({ where: { id: userId } }); }
    await app.close(); await db.$disconnect();
  }
});
