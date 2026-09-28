#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.LIVE_BASE_URL ?? "https://xueleai.com");
const pagePath = normalizePath(process.env.VERIFY_PAGE_PATH ?? "/");
const requiredSnippets = parseSnippetList(process.env.VERIFY_CONTAINS);
const forbiddenSnippets = parseSnippetList(process.env.VERIFY_NOT_CONTAINS);
const expectedVersion = process.env.EXPECTED_VERSION?.trim() ?? "";
const expectedReleaseSha = process.env.EXPECTED_RELEASE_SHA?.trim() ?? "";
const failures = [];

console.log(`线上地址：${baseUrl}`);
console.log(`页面路径：${pagePath}`);

const health = await getJson("/api/health", "API 健康检查");
const publicConfig = await getJson("/api/system-config/public", "公开系统配置");
const pageHtml = await getText(pagePath, "页面 HTML");

if (health?.code !== 0) {
  failures.push("API 健康检查未返回 code=0。");
}

if (expectedVersion && health?.data?.version !== expectedVersion) {
  failures.push(`API 运行版本不一致：预期 ${expectedVersion}，实际 ${health?.data?.version ?? "未知"}。`);
}

if (expectedReleaseSha && health?.data?.revision !== expectedReleaseSha) {
  failures.push(`API 运行提交不一致：预期 ${expectedReleaseSha}，实际 ${health?.data?.revision ?? "未知"}。`);
}

if (publicConfig?.code !== 0) {
  failures.push("公开系统配置未返回 code=0。");
}

for (const snippet of requiredSnippets) {
  if (!pageHtml.includes(snippet)) {
    failures.push(`页面 HTML 缺少预期片段：${snippet}`);
  }
}

for (const snippet of forbiddenSnippets) {
  if (pageHtml.includes(snippet)) {
    failures.push(`页面 HTML 仍包含禁止片段：${snippet}`);
  }
}

if (expectedVersion && !pageHtml.includes(`data-app-version="${expectedVersion}"`)) {
  failures.push(`页面 HTML 缺少运行版本标识：${expectedVersion}`);
}

if (expectedReleaseSha && !pageHtml.includes(`data-release="${expectedReleaseSha}"`)) {
  failures.push(`页面 HTML 缺少发布提交标识：${expectedReleaseSha}`);
}

if (failures.length > 0) {
  console.error("\n线上复验失败：");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("线上复验通过。");

async function getJson(path, label) {
  const text = await getText(path, label);

  try {
    return JSON.parse(text);
  } catch {
    failures.push(`${label} 返回的不是合法 JSON。`);
    return null;
  }
}

async function getText(path, label) {
  const url = `${baseUrl}${normalizePath(path)}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "xueleai-release-verify/1.0"
    }
  });
  const body = await response.text();

  console.log(`${label}：HTTP ${response.status}`);

  if (!response.ok) {
    failures.push(`${label} 请求失败：HTTP ${response.status}`);
  }

  return body;
}

function normalizeBaseUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error(`LIVE_BASE_URL 必须以 http:// 或 https:// 开头：${value}`);
  }

  return trimmed;
}

function normalizePath(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function parseSnippetList(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
