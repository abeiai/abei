// Run against `next start --hostname 127.0.0.1 --port 3665` after `pnpm build`.
import assert from 'node:assert/strict';
import test from 'node:test';
for (const [path, title] of [['/creator/authorize?transaction=invalid', '连接外部客户端'], ['/creator/device', '确认设备连接'], ['/account/connections', '已连接客户端']]) {
  test(`Creator page protects consent and renders Chinese UI: ${path}`, async () => {
    const response = await globalThis.fetch(`http://127.0.0.1:3665${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text();
    assert.ok(html.includes(title));
    assert.ok(!html.includes('access_token='));
    assert.ok(!html.includes('refresh_token='));
  });
}
