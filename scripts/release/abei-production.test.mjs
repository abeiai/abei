import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('abei 生产部署隔离数据库和私有素材，只开放网站入口', () => {
  const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', '.env', '-f', 'docker-compose.abei-prod.yml', 'config', '--format', 'json'], { encoding: 'utf8' }));
  assert.equal(config.name, 'abei-prod');
  assert.deepEqual(config.services.abei.ports.map(p => [p.published, p.target]), [['80', 3600], ['443', 3610]]);
  for (const service of ['web', 'api-core', 'ai-gateway', 'redis']) assert.equal(config.services[service].ports, undefined);
  assert.equal(config.services.postgres.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services['api-core'].environment.APP_BASE_URL, 'https://new.abeiai.com');
  const publicVolumes = config.services.abei.volumes.map(v => v.source);
  assert.ok(!publicVolumes.includes('picture_book_guides'));
  assert.ok(!publicVolumes.includes('legacy_ai_log_assets'));
  for (const volume of Object.values(config.volumes)) assert.ok(volume.name.startsWith('abei-prod_'));
});

test('abei HTTPS 入口保留可信协议、隐藏私有素材并支持证书续期', () => {
  const nginx = readFileSync('deploy/abei/production.conf', 'utf8');
  assert.match(nginx, /server_name new\.abeiai\.com/);
  assert.match(nginx, /listen 3610 ssl/);
  assert.match(nginx, /return 301 https:\/\/new\.abeiai\.com\$request_uri/);
  assert.match(nginx, /location \^~ \/\.well-known\/acme-challenge\//);
  assert.match(nginx, /X-Forwarded-Proto \$scheme/);
  assert.doesNotMatch(nginx, /alias[^;]*(?:private|legacy)/);
  assert.match(nginx, /maintenance\.enabled/);
  assert.match(nginx, /location \^~ \/ai-api\/ \{ return 404; \}/);
});
