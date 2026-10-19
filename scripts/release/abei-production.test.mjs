import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('abei 生产部署隔离数据库和私有素材，只开放网站入口', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'abei-compose-'));
  let config;
  try {
    writeFileSync(join(fixture, 'env'), 'POSTGRES_PASSWORD=synthetic-compose-fixture\n');
    config = JSON.parse(execFileSync('docker', ['compose', '--env-file', join(fixture, 'env'), '-f', 'docker-compose.abei-prod.yml', 'config', '--no-env-resolution', '--format', 'json'], { encoding: 'utf8' }));
  } finally { rmSync(fixture, { recursive: true, force: true }); }
  assert.equal(config.name, 'abei-prod');
  assert.deepEqual(config.services.abei.ports.map(p => [p.published, p.target]), [['80', 3600], ['443', 3610]]);
  for (const service of ['web', 'api-core', 'ai-gateway', 'redis']) assert.equal(config.services[service].ports, undefined);
  assert.equal(config.services.postgres.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services['api-core'].environment.APP_BASE_URL, 'https://abeiai.com');
  const publicVolumes = config.services.abei.volumes.map(v => v.source);
  assert.ok(!publicVolumes.includes('picture_book_guides'));
  assert.ok(!publicVolumes.includes('creator_assets'));
  assert.ok(config.services['api-core'].volumes.some(v => v.source === 'creator_assets' && v.target === '/app/private-creator-assets'));
  for (const [name, service] of Object.entries(config.services)) if (name !== 'api-core') assert.ok(!(service.volumes ?? []).some(v => v.source === 'creator_assets'));
  assert.equal(config.services['api-core'].environment.CREATOR_MAIN_ORIGIN, 'https://abeiai.com');
  assert.equal(config.services.web.build.args.API_BASE_URL, 'http://127.0.0.1:3602/api');
  assert.ok(!publicVolumes.includes('legacy_ai_log_assets'));
  for (const volume of Object.values(config.volumes)) assert.ok(volume.name.startsWith('abei-prod_'));
});

test('abei HTTPS 入口保留可信协议、隐藏私有素材并支持证书续期', () => {
  const nginx = readFileSync('deploy/abei/production.conf', 'utf8');
  assert.match(nginx, /server_name abeiai\.com new\.abeiai\.com/);
  assert.match(nginx, /listen 3610 ssl/);
  assert.match(nginx, /return 301 https:\/\/abeiai\.com\$request_uri/);
  assert.match(nginx, /location \^~ \/\.well-known\/acme-challenge\//);
  assert.match(nginx, /X-Forwarded-Proto \$scheme/);
  assert.doesNotMatch(nginx, /alias[^;]*(?:private|legacy)/);
  assert.match(nginx, /maintenance\.enabled/);
  assert.match(nginx, /location \^~ \/ai-api\/ \{ return 404; \}/);
});

test('MCP host has explicit mappings and private data never enters build context', () => {
  const nginx = readFileSync('deploy/abei/production.conf', 'utf8');
  assert.match(nginx, /server_name mcp\.abeiai\.com/);
  assert.match(nginx, /location = \/mcp/);
  assert.match(nginx, /oauth-protected-resource\/api\/creator\/v1/);
  assert.match(nginx, /proxy_buffering off/);
  assert.match(nginx, /client_max_body_size 2m/);
  for (const path of ['.gitignore', '.dockerignore']) assert.match(readFileSync(path, 'utf8'), /private-creator-assets/);
});
