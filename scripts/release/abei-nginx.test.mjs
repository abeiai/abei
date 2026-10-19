import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import test from 'node:test';

test('real nginx routes only public protocol paths and refuses private paths', { timeout: 60_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'abei-nginx-'));
  const name = `abei-creator-nginx-${process.pid}`;
  const run = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  try {
    for (const host of ['new.abeiai.com','mcp.abeiai.com']) {
      const cert = join(dir,'certs/live',host); mkdirSync(cert,{recursive:true});
      execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(cert,'privkey.pem'),'-out',join(cert,'fullchain.pem'),'-days','1','-subj',`/CN=${host}`,'-addext',`subjectAltName=DNS:${host}${host === 'new.abeiai.com' ? ',DNS:abeiai.com' : ''}`],{stdio:'ignore'});
    }
    mkdirSync(join(dir,'conf'));
    writeFileSync(join(dir,'conf/default.conf'),readFileSync('deploy/abei/production.conf'));
    writeFileSync(join(dir,'conf/fixture.conf'),'server { listen 3602; location / { add_header X-Fixture-URI $request_uri; add_header X-Fixture-Proto $http_x_forwarded_proto; return 200 "upstream"; } }\nserver { listen 3601; location / { return 200 "main-web"; } }');
    const args = ['-p','127.0.0.1:3608:3600','-p','127.0.0.1:3609:3610','--add-host','api-core:127.0.0.1','--add-host','web:127.0.0.1','-v',`${dir}/conf:/etc/nginx/conf.d:ro`,'-v',`${dir}/certs:/etc/letsencrypt:ro`];
    run(['run','--rm',...args,'nginx:1.27-alpine','nginx','-t']);
    run(['run','-d','--name',name,...args,'nginx:1.27-alpine']);
    const request = (path,host='mcp.abeiai.com') => {
      const res = spawnSync('docker',['exec',name,'wget','--no-check-certificate','-S','-O','-','--header',`Host: ${host}`,`https://127.0.0.1:3610${path}`],{encoding:'utf8'});
      return `${res.stdout}${res.stderr}`;
    };
    for (const [path,mapped] of [ ['/mcp','/api/creator-mcp'], ['/.well-known/oauth-authorization-server','/api/creator-auth/metadata'], ['/.well-known/oauth-protected-resource','/api/creator-auth/resource-metadata?resource=mcp'], ['/.well-known/oauth-protected-resource/mcp','/api/creator-auth/resource-metadata?resource=mcp'], ['/.well-known/oauth-protected-resource/api/creator/v1','/api/creator-auth/resource-metadata?resource=api'], ['/oauth/authorize','/api/creator-auth/oauth/authorize'], ['/oauth/register','/api/creator-auth/oauth/register'], ['/oauth/token','/api/creator-auth/oauth/token'], ['/oauth/device','/api/creator-auth/oauth/device'], ['/oauth/revoke','/api/creator-auth/oauth/revoke'], ['/api/creator/v1/assets/id/chunks','/api/creator/v1/assets/id/chunks'], ['/api/creator/v1/books/id/submit','/api/creator/v1/books/id/submit'] ]) {
      const out = request(path); assert.match(out,/200 OK/,path); assert.ok(out.includes(`X-Fixture-URI: ${mapped}`),out); assert.match(out,/X-Fixture-Proto: https/); assert.match(out,/private, no-store/);
    }
    for (const path of ['/','/admin','/api/admin/users','/api/health','/uploads/test.png','/private-creator-assets/test','/api/creator-assets/id','/api/creator-auth/connections','/oauth/unknown','/mcp/extra','/api/creator/v1/books/id/delete']) assert.match(request(path),/404 Not Found/,path);
    const tls = (host, path, method = 'GET') => execFileSync('curl', ['-X',method,'--noproxy','*','--silent','--show-error','--max-time','5','--cacert',join(dir,'certs/live/new.abeiai.com/fullchain.pem'),'--resolve',`${host}:3609:127.0.0.1`,'-i',`https://${host}:3609${path}`], { encoding: 'utf8' });
    assert.match(tls('abeiai.com','/'), /200 OK[\s\S]*main-web/);
    const sensitiveRedirect = tls('new.abeiai.com','/creator/authorize?transaction=abei-sensitive-redirect-probe');
    assert.match(sensitiveRedirect, /308 Permanent Redirect/);
    assert.doesNotMatch(run(['logs', name]), /abei-sensitive-redirect-probe/);
    const oldPage = tls('new.abeiai.com','/creator?next=%2Fbooks');
    assert.match(oldPage, /308 Permanent Redirect/);
    assert.match(oldPage, /Location: https:\/\/abeiai\.com\/creator\?next=%2Fbooks/);
    for (const path of ['/api/health','/api/payment/wechat/notify','/api/auth/wechat/mp/events']) assert.match(tls('new.abeiai.com',path,'POST'), /200 OK[\s\S]*upstream/);
    assert.match(tls('new.abeiai.com','/uploads/missing.png'), /404 Not Found/);
    assert.match(tls('new.abeiai.com','/healthz'), /200 OK/);
    assert.match(tls('abeiai.com','/api/health'), /X-Fixture-Proto: https/);
    const http = execFileSync('curl',['--noproxy','*','--silent','--max-time','5','--resolve','abeiai.com:3608:127.0.0.1','-i','http://abeiai.com:3608/books?q=1'],{encoding:'utf8'});
    assert.match(http, /301 Moved Permanently/);
    assert.match(http, /Location: https:\/\/abeiai\.com\/books\?q=1/);
    assert.match(request('/private-creator-assets/test','abeiai.com'),/404 Not Found/);
  } finally { spawnSync('docker',['rm','-f',name],{stdio:'ignore'}); rmSync(dir,{recursive:true,force:true}); }
});
