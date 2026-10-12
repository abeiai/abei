import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
test('installation offers versioned real bundles and truthful client-specific status', async () => {
  const module = await import('../src/components/creator/installation').catch(() => null);
  assert.ok(module?.CreatorInstallation, 'installation component required');
  const html = renderToStaticMarkup(React.createElement(module.CreatorInstallation));
  for (const label of ['Codex','Claude Code','Claude Desktop','Claude Cowork','豆包工作电脑版','WorkBuddy','DeepSeek Harness','尚未发布','/account/connections','/storybook','/dashboard/courses']) assert.ok(html.includes(label),label);
  for (const name of ['codex','claude-code','claude-cowork','workbuddy','deepseek','doubao-work']) assert.ok(html.includes(`abei-creator-${name}-0.1.0.zip`));
  assert.ok(html.includes('abei-creator-desktop-0.1.0.mcpb'));
  assert.ok(html.includes('/releases/download/v0.1.0/'));
});
test('connection dates distinguish unused and metadata never fabricates a client name', async () => {
  const auth = await import('../src/components/creator/authorization-panel');
  assert.ok(auth.ConnectionTimes, 'connection times component required');
  const html = renderToStaticMarkup(React.createElement(auth.ConnectionTimes, {createdAt:'2026-10-12T00:00:00Z',lastUsedAt:null,expiresAt:'2027-10-12T00:00:00Z'}));
  assert.ok(html.includes('授权时间')); assert.ok(html.includes('最近使用')); assert.ok(html.includes('尚未使用'));
  const meta = await import('../src/components/creator/work-metadata');
  assert.equal(renderToStaticMarkup(React.createElement(meta.CreatorWorkMetadata, {sync:null})), '');
  const work = renderToStaticMarkup(React.createElement(meta.CreatorWorkMetadata, {sync:{source:'EXTERNAL_CLIENT',version:3}}));
  assert.ok(work.includes('外部客户端同步')); assert.ok(work.includes('版本 3')); assert.ok(!work.includes('Codex'));
});
