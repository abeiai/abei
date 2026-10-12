import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { getPrismaClient } from '@xueleai/database';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
test('MCP SDK transport authenticates every request, validates schemas and preserves protocol boundaries',async()=>{
 assert.equal(new URL(process.env.DATABASE_URL!).port,'3668');
 const loaded=await import('../dist/creator-mcp/creator-mcp.module.js').catch(()=>null); assert.ok(loaded?.CreatorMcpModule,'compiled MCP module required');
 const parser=await import('../dist/creator-mcp/creator-mcp.middleware.js');
 @Module({imports:[loaded.CreatorMcpModule]}) class TestModule {}
 const app=await NestFactory.create(TestModule,{logger:false,bodyParser:false});
 parser.installCreatorMcpParser(app);app.useBodyParser('json',{limit:'12mb'});app.setGlobalPrefix('api');app.useGlobalFilters(new HttpExceptionFilter());await app.listen(3667,'127.0.0.1');
 const db=getPrismaClient();const user=await db.user.create({data:{email:`mcp-${randomUUID()}@example.test`,nickname:'MCP创作者',passwordHash:'unused'}});
 const registered=await db.creatorClient.create({data:{name:'MCP集成',redirectUris:['https://example.test/cb']}});
 async function token(audience:string,scopes=['creator:read','creator:write','creator:submit']){const g=await db.creatorGrant.create({data:{userId:user.id,clientId:registered.id,audience,scopes,expiresAt:new Date(Date.now()+3600000)}});const secret=randomBytes(32).toString('base64url');await db.creatorToken.create({data:{grantId:g.id,kind:'ACCESS',hash:createHash('sha256').update(secret).digest('hex'),scopes,expiresAt:new Date(Date.now()+900000)}});return {secret,g};}
 const mcp=await token('https://mcp.abeiai.com/mcp'),api=await token('https://mcp.abeiai.com/api/creator/v1'),reader=await token('https://mcp.abeiai.com/mcp',['creator:read']);
 const url=new URL('http://127.0.0.1:3667/api/creator-mcp');
 const raw=(body:string,secret=mcp.secret,method='POST',extra={})=>fetch(url,{method,headers:{authorization:`Bearer ${secret}`,'content-type':'application/json',accept:'application/json, text/event-stream',...extra},...(method==='POST'?{body}:{})});
 const client=new Client({name:'test',version:'1'});const readClient=new Client({name:'read',version:'1'});
 try{
  const unauthorized=await raw('{}',api.secret);assert.equal(unauthorized.status,401);assert.match(unauthorized.headers.get('www-authenticate')!,/oauth-protected-resource\/mcp/);assert.equal((await unauthorized.json()).jsonrpc,'2.0');
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:`Bearer ${mcp.secret}`}}}));
  const tools=await client.listTools();assert.equal(tools.tools.length,15);assert.ok(tools.tools.every(t=>t.name.startsWith('creator_')));assert.equal(tools.tools.find(t=>t.name==='creator_books_list')?.annotations?.readOnlyHint,true);
  const account=await client.callTool({name:'creator_account',arguments:{}});assert.match(JSON.stringify(account),/MCP创作者/);
  assert.equal((await client.callTool({name:'creator_book_save',arguments:{title:'missing fields'}})).isError,true);
  const draft={schemaVersion:1,externalId:'sdk-book',expectedVersion:0,title:'小树',style:'水彩',pageCount:4,pages:[]};
  const saved=await client.callTool({name:'creator_book_save',arguments:draft});assert.equal(saved.isError,undefined);const book=(saved.structuredContent as any).result;assert.equal(book.version,1);
  const conflict=await client.callTool({name:'creator_book_save',arguments:{...draft,title:'不同标题'}});assert.equal(conflict.isError,true);assert.match(JSON.stringify(conflict),/409/);
  await readClient.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:`Bearer ${reader.secret}`}}}));assert.equal((await readClient.listTools()).tools.length,10);assert.equal((await readClient.callTool({name:'creator_book_save',arguments:draft})).isError,true);
  assert.equal((await raw('{}',mcp.secret,'GET')).status,405);assert.equal((await raw('{}',mcp.secret,'DELETE')).status,405);
  assert.equal((await raw('{}',mcp.secret,'POST',{origin:'https://evil.test'})).status,403);
  for(const [body,status] of [['{',400],[JSON.stringify({x:'x'.repeat(300000)}),413]] as const){const r=await raw(body);assert.equal(r.status,status);const b=await r.json();assert.equal(b.jsonrpc,'2.0');assert.equal(b.data,undefined);assert.match(r.headers.get('cache-control')!,/no-store/);}
  const notification=await raw(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}));assert.equal(notification.status,202);
  await db.creatorGrant.update({where:{id:mcp.g.id},data:{revokedAt:new Date()}});await assert.rejects(client.listTools());
 }finally{await client.close();await readClient.close();await app.close();await db.user.delete({where:{id:user.id}});await db.creatorClient.delete({where:{id:registered.id}});await db.$disconnect();}
});
