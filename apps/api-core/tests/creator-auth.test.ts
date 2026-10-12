import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { getPrismaClient } from '@xueleai/database';
import type { HeaderRequestLike } from '../src/security/request-types.js';
import { AuthService } from '../src/auth/auth.service.js';

const db = getPrismaClient();
const MCP = 'https://mcp.abeiai.com/mcp';
const API = 'https://mcp.abeiai.com/api/creator/v1';
const origin = 'https://new.abeiai.com';
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const error = (name: string) => (e: unknown) => e !== null && typeof e === 'object' && 'error' in e && e.error === name;
type TokenPair = { access_token: string; refresh_token: string };
type DeviceCode = { device_code: string; user_code: string };

test('Creator delegated authorization: real database lifecycle and security boundaries', async (t) => {
  assert.equal(new URL(process.env.DATABASE_URL!).port, '3668', '隔离数据库必需');
  const module = await import('../src/creator-auth/creator-auth.service.js').catch(() => null);
  assert.ok(module?.CreatorAuthService, 'CreatorAuthService must implement delegated authorization');
  const auth = new AuthService();
  const service = new module.CreatorAuthService(auth);
  const user = await db.user.create({ data: { email: `creator-${randomBytes(6).toString('hex')}@example.test`, nickname: '授权测试', passwordHash: 'unused' } });
  const cookies: Record<string, string> = {};
  await auth.startUserSession(user.id, { cookie(n, v) { cookies[n] = v; }, clearCookie(n) { delete cookies[n]; } });
  const browser: HeaderRequestLike = { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '), origin }, ip: `test-browser:${user.id}` };
  const client = await service.register({ client_name: '<外部客户端>', redirect_uris: ['http://127.0.0.1:3670/callback'], token_endpoint_auth_method: 'none' }, `test-client:${user.id}`);
  const foreign = await service.register({ client_name: '其他客户端', redirect_uris: ['https://foreign.test/cb'] }, `foreign:${user.id}`);
  const query = { client_id: client.client_id, response_type: 'code', redirect_uri: 'http://127.0.0.1:3670/callback', scope: 'creator:read creator:write creator:submit', resource: MCP, code_challenge: challenge, code_challenge_method: 'S256', state: 'state-123' };
  async function request(q = {}) { const url = new URL(await service.authorize({ ...query, ...q }, `test-authorize:${user.id}`)); return url.searchParams.get('transaction')!; }
  async function consent(id: string, approve = true) { const view = await service.readRequest(browser, id); return service.decide({ ...browser, headers: { ...browser.headers, 'x-creator-csrf': view.csrfToken } }, id, { approve }); }
  async function code(q = {}) { const result = await consent(await request(q)); const url = new URL(result.redirectUri); assert.equal(url.searchParams.get('state'), 'state-123'); return url.searchParams.get('code')!; }
  const exchange = (code: string, extra = {}) => service.token({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: query.redirect_uri, resource: MCP, code_verifier: verifier, ...extra });
  try {
    await t.test('registration rejects unsafe redirects, arbitrary metadata and escalation', async () => {
      for (const redirect of ['http://evil.test/cb', 'https://user:pw@safe.test/cb', 'https://safe.test/cb#fragment', 'file:///cb', 'workbuddy://workbuddy/mcp/connector%3Ax/oauth/callback']) await assert.rejects(service.register({ client_name: 'x', redirect_uris: [redirect] }, `invalid:${user.id}`), error('invalid_client_metadata'));
      await assert.rejects(service.register({ client_name: 'x', redirect_uris: ['https://safe.test/cb'], logo_uri: 'http://internal/' }, `invalid:${user.id}`), error('invalid_client_metadata'));
      await assert.rejects(request({ scope: 'creator:delete' }), error('invalid_scope'));
      await assert.rejects(request({ code_challenge_method: 'plain' }), error('invalid_request'));
      await assert.rejects(request({ resource: 'https://evil.test' }), error('invalid_target'));
      await assert.rejects(request({ redirect_uri: `${query.redirect_uri}/other` }), error('invalid_request'));
    });
    await t.test('consent requires account login, same origin and session-bound CSRF; GET never grants', async () => {
      const id = await request();
      await assert.rejects(service.readRequest({ headers: {} }, id));
      const view = await service.readRequest(browser, id);
      assert.equal(view.clientName, '<外部客户端>');
      assert.equal(await db.creatorGrant.count({ where: { userId: user.id } }), 0);
      await assert.rejects(service.decide(browser, id, { approve: true }));
      await assert.rejects(service.decide({ ...browser, headers: { ...browser.headers, origin: 'https://evil.test', 'x-creator-csrf': view.csrfToken } }, id, { approve: true }));
      const denied = await consent(id, false);
      assert.equal(new URL(denied.redirectUri).searchParams.get('error'), 'access_denied');
    });
    await t.test('authorization codes bind client, redirect, verifier and audience; consume once atomically', async () => {
      const c = await code();
      for (const extra of [{ client_id: foreign.client_id }, { redirect_uri: 'https://evil.test' }, { code_verifier: 'x'.repeat(64) }, { resource: API }]) await assert.rejects(exchange(c, extra));
      const results = await Promise.allSettled([exchange(c), exchange(c)]);
      assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
      const token = (results.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<TokenPair>).value;
      assert.equal(token.expires_in, 900);
      const principal = await service.authenticateBearer({ headers: { authorization: `Bearer ${token.access_token}` } }, MCP, ['creator:write']);
      assert.equal(principal.userId, user.id);
      await assert.rejects(service.authenticateBearer({ headers: { authorization: `Bearer ${token.access_token}` } }, API, []));
      const expired = await code();
      await db.creatorAuthRequest.updateMany({ where: { codeHash: hash(expired) }, data: { expiresAt: new Date(0) } });
      await assert.rejects(exchange(expired), error('invalid_grant'));
    });
    await t.test('refresh narrows scopes, rotates once; replay revokes the whole grant including access tokens', async () => {
      const first = await exchange(await code());
      const refresh = (r: string, extra = {}) => service.token({ grant_type: 'refresh_token', refresh_token: r, client_id: client.client_id, resource: MCP, ...extra });
      await assert.rejects(refresh(first.refresh_token, { client_id: foreign.client_id }), error('invalid_grant'));
      await assert.rejects(refresh(first.refresh_token, { resource: API }), error('invalid_target'));
      await assert.rejects(refresh(first.refresh_token, { scope: 'creator:delete' }), error('invalid_scope'));
      const next = await refresh(first.refresh_token, { scope: 'creator:read' });
      assert.equal(next.scope, 'creator:read');
      await assert.rejects(refresh(next.refresh_token, { scope: 'creator:write' }), error('invalid_scope'));
      await assert.rejects(refresh(first.refresh_token), error('invalid_grant'));
      await assert.rejects(service.authenticateBearer({ headers: { authorization: `Bearer ${next.access_token}` } }, MCP, []));
      await assert.rejects(refresh(next.refresh_token), error('invalid_grant'));
    });
    await t.test('device pending, slow_down, denial, expiry and atomic approval consumption', async () => {
      const start = () => service.device({ client_id: client.client_id, resource: API, scope: 'creator:read creator:write' }, `test-device:${user.id}`);
      const poll = (d: DeviceCode) => service.token({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code, client_id: client.client_id, resource: API });
      const decide = async (d: DeviceCode, approve: boolean) => { const view = await service.lookupDevice(browser, { user_code: d.user_code }); return service.decideDevice({ ...browser, headers: { ...browser.headers, 'x-creator-csrf': view.csrfToken } }, { transaction: view.id, approve }); };
      const pending = await start();
      assert.equal(pending.verification_uri, `${origin}/creator/device`);
      await assert.rejects(poll(pending), error('authorization_pending'));
      await assert.rejects(poll(pending), error('slow_down'));
      await decide(pending, false);
      await db.creatorAuthRequest.updateMany({ where: { codeHash: hash(pending.device_code) }, data: { nextPollAt: new Date(0) } });
      await assert.rejects(poll(pending), error('access_denied'));
      const expired = await start();
      await db.creatorAuthRequest.updateMany({ where: { codeHash: hash(expired.device_code) }, data: { expiresAt: new Date(0) } });
      await assert.rejects(poll(expired), error('expired_token'));
      const approved = await start(); await decide(approved, true);
      const result = await Promise.allSettled([poll(approved), poll(approved)]);
      assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
      const token = (result.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<TokenPair>).value;
      assert.equal((await service.authenticateBearer({ headers: { authorization: `Bearer ${token.access_token}` } }, API, ['creator:write'])).userId, user.id);
      await assert.rejects(service.authenticateBearer({ headers: { authorization: `Bearer ${token.access_token}` } }, API, ['creator:submit']));
    });
    await t.test('refresh/access expiry, concurrent rotation, device binding and stored hashes', async () => {
      const token = await exchange(await code());
      const stored = await db.creatorToken.findUniqueOrThrow({ where: { hash: hash(token.access_token) } });
      assert.notEqual(stored.hash, token.access_token);
      await db.creatorToken.update({ where: { id: stored.id }, data: { expiresAt: new Date(0) } });
      await assert.rejects(service.authenticateBearer({ headers: { authorization: `Bearer ${token.access_token}` } }, MCP, []));
      await db.creatorToken.updateMany({ where: { hash: hash(token.refresh_token) }, data: { expiresAt: new Date(0) } });
      await assert.rejects(service.token({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: client.client_id, resource: MCP }), error('invalid_grant'));
      const fresh = await exchange(await code());
      const rotate = () => service.token({ grant_type: 'refresh_token', refresh_token: fresh.refresh_token, client_id: client.client_id, resource: MCP });
      const rotations = await Promise.allSettled([rotate(), rotate()]);
      assert.equal(rotations.filter(x => x.status === 'fulfilled').length, 1);
      const rotated = (rotations.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<TokenPair>).value;
      await assert.rejects(service.authenticateBearer({ headers: { authorization: `Bearer ${rotated.access_token}` } }, MCP, []));
      const d = await service.device({ client_id: client.client_id, resource: MCP, scope: 'creator:read' }, `binding:${user.id}`);
      await assert.rejects(service.token({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: client.client_id, device_code: d.device_code, resource: API }), error('invalid_target'));
      await assert.rejects(service.token({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: foreign.client_id, device_code: d.device_code, resource: MCP }), error('invalid_grant'));
      const csrfView = await service.readRequest(browser, await request());
      const differentId = await request();
      await assert.rejects(service.decide({ ...browser, headers: { ...browser.headers, 'x-creator-csrf': csrfView.csrfToken } }, differentId, { approve: true }));
    });
    await t.test('parallel quota checks cannot exceed the allowance', async () => {
      const checks = await Promise.allSettled(Array.from({ length: 12 }, () => service.rateLimit(`concurrent:${user.id}`, 4)));
      assert.equal(checks.filter(r => r.status === 'fulfilled').length, 4);
      for (const rejected of checks.filter(r => r.status === 'rejected') as PromiseRejectedResult[]) assert.equal(rejected.reason.error, 'temporarily_unavailable');
    });
    await t.test('expired quota buckets renew concurrently without cross-bucket deadlocks', async () => {
      const keys = Array.from({ length: 12 }, (_, i) => `expired:${user.id}:${i}`);
      await db.creatorRateBucket.createMany({ data: keys.map(key => ({ key: hash(key), count: 5, expiresAt: new Date(0) })) });
      const renewed = await Promise.allSettled(keys.map(key => service.rateLimit(key, 2)));
      assert.deepEqual(renewed.map(result => result.status), keys.map(() => 'fulfilled'));
    });
    await t.test('persistent quotas stop registration and human-code guessing', async () => {
      const ip = `limited:${user.id}`;
      for (let i = 0; i < 10; i++) await assert.rejects(service.register({ client_name: 'bad', redirect_uris: ['workbuddy://bad'] }, ip), error('invalid_client_metadata'));
      await assert.rejects(service.register({ client_name: 'good', redirect_uris: ['https://safe.test/cb'] }, ip), error('temporarily_unavailable'));
      for (let i = 0; i < 10; i++) {
        try { await service.lookupDevice(browser, { user_code: '00000-00000' }); } catch { /* invalid or already limited */ }
      }
      await assert.rejects(service.lookupDevice(browser, { user_code: '00000-00000' }), error('temporarily_unavailable'));
    });
    await t.test('revocation checks grant ownership and client; inactive accounts cannot use tokens', async () => {
      const token = await exchange(await code());
      const bearer = { headers: { authorization: `Bearer ${token.access_token}` } };
      const principal = await service.authenticateBearer(bearer, MCP, []);
      await service.revoke({ client_id: 'foreign', token: token.refresh_token });
      await service.authenticateBearer(bearer, MCP, []);
      const other = await db.user.create({ data: { email: `${user.id}-other@example.test`, passwordHash: 'unused', nickname: 'other' } });
      const otherCookies: Record<string,string> = {};
      await auth.startUserSession(other.id, { cookie(n,v) { otherCookies[n]=v; }, clearCookie() {} });
      const otherBrowser: HeaderRequestLike = { headers: { origin, cookie: Object.entries(otherCookies).map(([k,v])=>`${k}=${v}`).join('; ') } };
      await assert.rejects(service.connections({ headers: { cookie: `xueleai_user_access=${cookies.xueleai_user_access}; xueleai_user_refresh=${otherCookies.xueleai_user_refresh}` } }));
      const view = await service.connections(otherBrowser);
      await assert.rejects(service.revokeConnection({ ...otherBrowser, headers: { ...otherBrowser.headers, 'x-creator-csrf': view.csrfToken } }, principal.grantId));
      await db.user.delete({ where: { id: other.id } });
      await db.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
      await assert.rejects(service.authenticateBearer(bearer, MCP, []));
      await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
      await service.revoke({ client_id: client.client_id, token: token.access_token });
      await assert.rejects(service.authenticateBearer(bearer, MCP, []));
    });
  } finally {
    await db.creatorClient.deleteMany({ where: { id: { in: [client.client_id, foreign.client_id] } } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
