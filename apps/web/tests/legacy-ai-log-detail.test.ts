import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LegacyLogDetail } from "../src/components/admin/legacy-log-detail.js";
import type { LegacyAiLogDetail } from "../src/lib/legacy-ai-logs-api.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const fixture: LegacyAiLogDetail = {
  id: "old-log", sourceSystem: "legacy-abei", sourceTable: "app_ai_drawmessage", sourcePk: "123", sourceUserId: null, sourceStatus: "2",
  kind: "IMAGE", status: "SUCCEEDED", application: null, providerName: null, modelName: null, versionName: null,
  inputPreview: null, outputPreview: null, requestedAt: "2026-10-01T00:00:00Z", respondedAt: null, user: null,
  sourceMsgId: null, sourceTaskId: null, voiceName: null, inputText: "<script>alert('private')</script>", outputText: null, systemPrompt: null,
  parameters: null, errorMessage: null, inputTokens: null, outputTokens: null, totalTokens: null, textLength: null,
  durationRaw: null, durationUnit: null, usageVerified: false, sessions: [],
  assets: [{ id: "old-asset", position: 0, role: "OUTPUT", fieldPath: "results.0", mediaType: "IMAGE", status: "AVAILABLE", filename: "结果图片", url: "https://old.invalid/private-image?token=do-not-send" }],
};

test("历史素材只使用当前后台受保护路径，不能把旧来源 URL 交给浏览器", () => {
  const html = renderToStaticMarkup(React.createElement(LegacyLogDetail, { log: fixture }));
  assert.match(html, /src="\/api\/admin\/legacy-ai-logs\/old-log\/assets\/old-asset\/file"/);
  assert.doesNotMatch(html, /old\.invalid|do-not-send/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("缺失素材显示反馈，不把成功日志误改成失败或渲染空图片", () => {
  const log = { ...fixture, assets: [{ ...fixture.assets[0]!, status: "MISSING" as const, url: null }] };
  const html = renderToStaticMarkup(React.createElement(LegacyLogDetail, { log }));
  assert.match(html, /素材已失效或缺失/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /成功/);
});

test("会话独有的系统提示词仍可查看，长会话有继续查看的入口", () => {
  const log = { ...fixture, assets: [], sessions: [{ id: "session", title: "旧会话", systemPrompt: "只保存在会话中的系统提示词", page: 1, pageSize: 50, total: 55, items: [] }] };
  const html = renderToStaticMarkup(React.createElement(LegacyLogDetail, { log }));
  assert.match(html, /只保存在会话中的系统提示词/);
  assert.match(html, /sessionPage=2/);
});
