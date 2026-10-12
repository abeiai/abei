#!/usr/bin/env node
// Run inside the ingress network namespace. Only loopback bypasses maintenance.
// Normal CA/hostname verification remains enabled; no credentials are needed.
import assert from 'node:assert/strict';
import https from 'node:https';
async function request(host, path, expected=200) {
  const response=await new Promise((resolve,reject)=>{
    const req=https.get({hostname:'127.0.0.1',port:3610,servername:host,path,headers:{Host:host},timeout:5000},res=>{
      let body='';res.setEncoding('utf8');res.on('data',part=>{body+=part; if(body.length>2_000_000) req.destroy(new Error('入口响应过大'));});
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('timeout',()=>req.destroy(new Error('入口响应超时')));req.on('error',reject);
  });
  assert.equal(response.status,expected,`${host}${path}`);
  return response;
}
const main=await request('new.abeiai.com','/creator');
assert.ok(main.body.includes('阿贝绘本创作助手'),'新 Web 入口未提供创作助手页面');
const metadata=await request('mcp.abeiai.com','/.well-known/oauth-authorization-server');
assert.match(metadata.headers['cache-control']??'',/no-store/);
assert.equal(JSON.parse(metadata.body).issuer,'https://mcp.abeiai.com');
assert.equal(JSON.parse(metadata.body).token_endpoint,'https://mcp.abeiai.com/oauth/token');
for (const [path,resource] of [['','mcp'],['/mcp','mcp'],['/api/creator/v1','api/creator/v1']]) {
  const response=await request('mcp.abeiai.com','/.well-known/oauth-protected-resource'+path);
  assert.equal(JSON.parse(response.body).resource,'https://mcp.abeiai.com/'+resource);
}
const unauthorized=await request('mcp.abeiai.com','/mcp',401);
assert.match(unauthorized.headers['www-authenticate']??'',/oauth-protected-resource\/mcp/);
for(const path of ['/api/admin/users','/uploads/creator-probe','/private-creator-assets/probe']) await request('mcp.abeiai.com',path,404);
console.log('维护期间新入口 TLS、Web、协议映射及私有路径检查通过');
