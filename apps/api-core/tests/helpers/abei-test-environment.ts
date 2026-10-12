import assert from 'node:assert/strict';
export function assertCreatorTestDatabase(value = process.env.DATABASE_URL) {
  const url = new URL(value ?? 'postgresql://invalid');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === '3668' && url.pathname === '/abei_creator_clean', '仅允许隔离测试数据库 localhost:3668/abei_creator_clean');
}
export function creatorTestHttpPort(value = process.env.ABEI_TEST_HTTP_PORT ?? '3664') {
  const port = Number(value);
  assert.ok(Number.isInteger(port) && port >= 3600 && port <= 3680 && ![3604,3605,3668,3669].includes(port), '测试 HTTP 端口必须在阿贝允许范围且不得占用数据库端口');
  return port;
}
