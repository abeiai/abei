import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const request = (method, path, body = Buffer.alloc(0), headers = {}) => new Promise((resolve, reject) => {
  const req = https.request({ hostname: '127.0.0.1', port: 3606, method, path,
    rejectUnauthorized: false, headers: { Host: 'abeiai.com', ...headers } }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.setTimeout(5000, () => req.destroy(new Error('代理请求超时')));
  req.on('error', reject);
  req.end(body);
});

// Catches redirects, method/body rewrites, URI normalization and response interception.
test('common 代理保留所有方法、原始 URI、请求体及上游响应', { timeout: 60000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'abei-common-proxy-'));
  const network = `abei-common-proxy-${process.pid}`;
  const container = `${network}-nginx`;
  let upstream;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=long-api.abeiai.com', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
    upstream = https.createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      if (req.url.startsWith('/open/v5/common/error')) {
        res.writeHead(422, { 'Content-Type': 'application/octet-stream', 'X-Upstream': 'unchanged' });
        return res.end(Buffer.from([0, 255, 13, 10]));
      }
      if (req.url.startsWith('/open/v5/common/redirect')) {
        res.writeHead(307, { Location: 'https://long-api.abeiai.com/open/v5/common/next?raw=%2f' });
        return res.end('upstream redirect');
      }
      if (req.url.startsWith('/open/v5/common/teapot')) {
        res.writeHead(418);
        return res.end('upstream 418');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, servername: req.socket.servername, body: Buffer.concat(chunks).toString('base64') }));
    });
    upstream.listen(3607, '0.0.0.0');
    await once(upstream, 'listening');
    docker('network', 'create', '--subnet', '192.0.2.0/28', network);
    for (const file of ['production.conf', 'nginx.conf']) {
      let config = readFileSync(resolve('deploy/abei', file), 'utf8')
        .replaceAll('https://long-api.abeiai.com', 'https://host.docker.internal:3607')
        .replace(/\/etc\/letsencrypt\/live\/[^/]+\/fullchain\.pem/g, '/fixture/cert.pem')
        .replace(/\/etc\/letsencrypt\/live\/[^/]+\/privkey\.pem/g, '/fixture/key.pem')
        .replaceAll('/etc/ssl/cert.pem', '/fixture/cert.pem');
      if (file === 'nginx.conf') config = config.replace('listen 3600;', 'listen 3610 ssl;\n  ssl_certificate /fixture/cert.pem;\n  ssl_certificate_key /fixture/key.pem;');
      writeFileSync(join(dir, file), config);
      docker('run', '-d', '--name', container, '--network', network,
        '--add-host', 'web:127.0.0.1', '--add-host', 'api-core:127.0.0.1', '--add-host', 'ai-gateway:127.0.0.1',
        '-p', '127.0.0.1:3606:3610', '-v', `${dir}:/fixture:ro`,
        '-v', `${join(dir, file)}:/etc/nginx/conf.d/default.conf:ro`, 'nginx:1.27-alpine');
      try {
        docker('exec', container, 'nginx', '-t');
        for (let i = 0; ; i++) {
          try { if ((await request('GET', '/healthz')).status === 200) break; } catch {}
          if (i === 30) throw new Error(docker('logs', container));
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
          await t.test(`${file} ${method} 不跳转且保留签名参数和二进制 body`, async () => {
            const path = '/open/v5/common/a%2Fb//c?x=1&x=2&empty=&q=a+b%20c&sig=%2f%2B%3D';
            const body = Buffer.from([0, 255, 13, 10, 123, 32, 125]);
            const result = await request(method, path, body, { 'Content-Length': body.length,
              'Content-Type': 'application/octet-stream', Authorization: 'Bearer synthetic-token', Cookie: 'fixture=unchanged' });
            assert.equal(result.status, 200, result.body.toString());
            const echo = JSON.parse(result.body);
            assert.equal(echo.method, method);
            assert.equal(echo.url, path);
            assert.equal(echo.body, body.toString('base64'));
            assert.equal(echo.headers.authorization, 'Bearer synthetic-token');
            assert.equal(echo.headers.cookie, 'fixture=unchanged');
            assert.equal(echo.headers['content-type'], 'application/octet-stream');
            assert.equal(echo.headers.host, 'long-api.abeiai.com');
            assert.equal(echo.servername, 'long-api.abeiai.com');
          });
        }
        await t.test(`${file} 根路径、有无尾斜杠、表单和 JSON 原样透传`, async () => {
          for (const path of ['/open/v5/common/', '/open/v5/common']) {
            for (const [type, value] of [['application/json', '{ "中文": "测试", "n": 1 }\n'], ['application/x-www-form-urlencoded', 'x=1&x=2&q=a+b%20c']]) {
              const body = Buffer.from(value);
              const result = await request('POST', path, body, { 'Content-Type': type, 'Content-Length': body.length });
              assert.equal(result.status, 200, result.body.toString());
              const echo = JSON.parse(result.body);
              assert.equal(echo.url, path);
              assert.equal(echo.body, body.toString('base64'));
              assert.equal(echo.headers['content-type'], type);
            }
          }
        });
        await t.test(`${file} multipart 和分块上传保持 body 字节`, async () => {
          const body = Buffer.concat([Buffer.from('--fixture\r\nContent-Disposition: form-data; name="file"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'), Buffer.from([0, 255, 13, 10]), Buffer.from('\r\n--fixture--\r\n')]);
          const result = await request('POST', '/open/v5/common/upload?raw=%2f', body, {
            'Content-Type': 'multipart/form-data; boundary=fixture', 'Transfer-Encoding': 'chunked' });
          assert.equal(result.status, 200, result.body.toString());
          assert.equal(JSON.parse(result.body).body, body.toString('base64'));
        });
        await t.test(`${file} 原始 common 前缀下的 dot-segment 不落回 Web`, async () => {
          for (const path of ['/open/v5/common/../x?sig=%2f', '/open/v5/common/%2e%2e/x?sig=%2f']) {
            const result = await request('POST', path, Buffer.from('raw'), { 'Content-Length': 3 });
            assert.equal(result.status, 200, result.body.toString());
            const echo = JSON.parse(result.body);
            assert.equal(echo.method, 'POST');
            assert.equal(echo.url, path);
            assert.equal(echo.body, 'cmF3');
          }
        });
        await t.test(`${file} HEAD 及错误响应不改写`, async () => {
          assert.equal((await request('HEAD', '/open/v5/common/')).status, 200);
          const result = await request('GET', '/open/v5/common/error');
          assert.equal(result.status, 422);
          assert.equal(result.headers['x-upstream'], 'unchanged');
          assert.deepEqual(result.body, Buffer.from([0, 255, 13, 10]));
          const redirect = await request('POST', '/open/v5/common/redirect');
          assert.equal(redirect.status, 307);
          assert.equal(redirect.headers.location, 'https://long-api.abeiai.com/open/v5/common/next?raw=%2f');
          assert.equal(redirect.body.toString(), 'upstream redirect');
          const teapot = await request('GET', '/open/v5/common/teapot');
          assert.equal(teapot.status, 418);
          assert.equal(teapot.body.toString(), 'upstream 418');
          assert.notEqual((await request('GET', '/open/v5/common-other/')).status, 200);
        });
      } finally { docker('rm', '-f', container); }
    }
  } finally {
    if (upstream) await new Promise(resolve => upstream.close(resolve));
    try { docker('network', 'rm', network); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
