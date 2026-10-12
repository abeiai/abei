#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
// Refuse env files before any framework/Prisma/dotenv code is loaded.
for (const dir of ['', 'apps/web', 'apps/api-core', 'packages/database']) {
  for (const name of readdirSync(resolve(root,dir))) {
    assert.ok(!/^\.env(?:\.|$)/.test(name) || /\.example$/.test(name), `请使用无真实环境文件的隔离工作树：${dir}/${name}`);
  }
}
const db = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
const redis = new URL(process.env.REDIS_URL ?? 'redis://invalid');
assert.ok(['127.0.0.1','localhost'].includes(db.hostname) && db.port === '3668' && db.pathname === '/abei_creator_clean', '必须显式指定隔离数据库 3668/abei_creator_clean');
assert.ok(['127.0.0.1','localhost'].includes(redis.hostname) && redis.port === '3669', '必须显式指定隔离 Redis 3669');
assert.equal(process.env.NODE_ENV,'test','必须设置 NODE_ENV=test');
for (const key of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','SECRET_ENCRYPTION_KEY']) assert.ok(process.env[key], `缺少测试配置 ${key}`);
const env = { ...process.env, API_BASE_URL: 'http://127.0.0.1:3665/api', APP_BASE_URL: 'http://127.0.0.1:3600', RATE_LIMIT_AUTH_LOGIN_MAX: '50', RATE_LIMIT_AUTH_REGISTER_MAX: '50', RATE_LIMIT_ADMIN_AUTH_LOGIN_MAX: '50', RATE_LIMIT_PAYMENT_ORDERS_MAX: '50', RATE_LIMIT_AI_TASKS_MAX: '50' };
function run(command,args,cwd=root) {
  const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.argv.includes('--preflight-only')) { console.log('阿贝隔离验证环境检查通过'); process.exit(0); }
run('pnpm',['--filter','@xueleai/database','db:generate']);
run('pnpm',['lint']);
run('pnpm',['typecheck']);
run('pnpm',['build']);
// Direct entry points deliberately bypass package wrappers that source root .env.
for (const [dir,subdir] of [['packages/database','prisma'],['apps/api-core','tests'],['apps/web','tests']]) {
  const files=readdirSync(resolve(root,dir,subdir)).filter(file=>file.endsWith('.test.ts')).sort().map(file=>`${subdir}/${file}`);
  run('pnpm',['exec','node','--import','tsx','--test','--test-concurrency=1',...files],resolve(root,dir));
}
run('pnpm',['--filter','@xueleai/ai-gateway','test']);
run('node',['--test','scripts/release/abei-production.test.mjs','scripts/release/abei-nginx.test.mjs','scripts/release/abei-release.test.mjs','scripts/release/abei-activation.test.mjs']);
run('pnpm',['--filter','@xueleai/database','exec','prisma','migrate','status','--schema','prisma/schema.prisma']);
console.log('阿贝隔离全量检查通过；线上发布和客户端验收仍需独立完成。');
