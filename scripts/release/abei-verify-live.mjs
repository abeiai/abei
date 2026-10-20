#!/usr/bin/env node
// Read-only HTTPS checks. Run only after deployment; no credentials or TLS bypass.
import assert from 'node:assert/strict';
const main='https://abeiai.com', issuer='https://mcp.abeiai.com';
async function get(url, expected=200) {
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30_000)});
  assert.equal(response.status,expected,`${url} HTTP status`);
  return response;
}
for (const path of ['/api/health','/api/health/db','/api/health/redis','/api/system-config/public']) {
  const body=await (await get(main+path)).json(); assert.equal(body.code,0,path);
}
const html=await (await get(main+'/creator')).text();
assert.ok(html.includes('阿贝绘本创作助手')); assert.ok(html.includes('/account/connections'));
const metadata=await (await get(issuer+'/.well-known/oauth-authorization-server')).json();
assert.equal(metadata.issuer,issuer); assert.equal(metadata.token_endpoint,issuer+'/oauth/token');
for(const [path,resource] of [['',issuer+'/mcp'],['/mcp',issuer+'/mcp'],['/api/creator/v1',issuer+'/api/creator/v1']]) {
  const response=await get(issuer+'/.well-known/oauth-protected-resource'+path);
  assert.match(response.headers.get('cache-control')??'',/no-store/);
  assert.equal((await response.json()).resource,resource);
}
const unauth=await get(issuer+'/mcp',401);
assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource\/mcp/);
for (const path of ['/api/admin/users','/api/health','/uploads/creator-test','/private-creator-assets/test','/api/creator-assets/test','/api/creator-auth/connections']) await get(issuer+path,404);
if (process.argv.includes('--artifacts')) {
  const base='https://github.com/abeiai/abei-creator/releases/download/v0.1.1/';
  const files=['codex','claude-code','claude-cowork','workbuddy','deepseek','doubao-work','source'].map(n=>`abei-creator-${n}-0.1.1.zip`);
  files.push('abei-creator-desktop-0.1.1.mcpb','abeiai-creator-0.1.1.tgz',...['darwin-arm64','darwin-x64','linux-arm64','linux-x64','windows-x64.exe'].map(n=>`abei-creator-${n}`),'SHA256SUMS');
  for(const file of files) {
    const response=await fetch(base+file,{method:'HEAD',signal:AbortSignal.timeout(30_000)});
    assert.equal(response.status,200,file); assert.ok(Number(response.headers.get('content-length'))>0,file);
  }
}
console.log('线上只读 API、协议与安装页检查通过。登录、私有预览、审核和客户端端到端体验仍需浏览器验收。');
