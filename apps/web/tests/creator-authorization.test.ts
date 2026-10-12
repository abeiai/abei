import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

test('consent shows untrusted client as text and clearly names approved capabilities', async () => {
  const module = await import('../src/components/creator/authorization-panel').catch(() => null);
  assert.ok(module?.ConsentDetails, 'ConsentDetails must show scopes before approval');
  const html = renderToStaticMarkup(React.createElement(module.ConsentDetails, { clientName: '<script>alert(1)</script>', scopes: ['creator:read', 'creator:write', 'creator:submit'], audience: 'https://mcp.abeiai.com/mcp' }));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  for (const label of ['读取我的创作内容', '创建和修改我的草稿', '提交我的作品审核']) assert.ok(html.includes(label));
});

test('existing login and account selection preserve the opaque transaction and device destination', async () => {
  const { profileLoginHref, selectorLoginContinuation, profileSelectionHref, selectionDestination } = await import('../src/lib/profile-routing');
  for (const next of ['/creator/authorize?transaction=opaque-transaction', '/creator/device', '/account/connections']) {
    const login = new URL(profileLoginHref(next), 'https://new.abeiai.com');
    assert.equal(login.pathname, '/login');
    assert.equal(login.searchParams.get('next'), next);
    assert.equal(selectorLoginContinuation(profileSelectionHref(next)), next);
    assert.equal(selectionDestination('ACCOUNT', next, []), next);
  }
});
