import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  adminVoiceAccentsByLanguage,
  normalizeAdminVoiceLanguage
} from "../src/lib/voice-classification.js";

const root = new URL("../", import.meta.url);

test("后台系统音色和平台音色编辑页都展示四项分类字段", async () => {
  const [component, systemPage, platformPage] = await Promise.all([
    source("src/components/audio/admin-voice-classification-fields.tsx"),
    source("src/app/admin/audio/voices/system/[voice]/edit/page.tsx"),
    source("src/app/admin/audio/voices/[id]/page.tsx")
  ]);

  for (const field of ["language", "accent", "gender", "ageCategory"]) {
    assert.match(component, new RegExp(`name=["']${field}["']`));
  }
  assert.match(systemPage, /AdminVoiceClassificationFields/);
  assert.match(platformPage, /AdminVoiceClassificationFields/);
});

test("后台音色语种与口音选项保持联动", async () => {
  const component = await source("src/components/audio/admin-voice-classification-fields.tsx");

  assert.ok(adminVoiceAccentsByLanguage.中文.includes("普通话"));
  assert.ok(adminVoiceAccentsByLanguage.中文.includes("粤语"));
  assert.ok(adminVoiceAccentsByLanguage.中文.includes("闽南语"));
  assert.ok(adminVoiceAccentsByLanguage.英语.includes("美式英语"));
  assert.ok(adminVoiceAccentsByLanguage.英语.includes("英式英语"));
  assert.deepEqual(adminVoiceAccentsByLanguage.日语, ["标准日语"]);
  assert.match(component, /nextAccents\.includes\(current\)/);
});

test("后台音色兼容旧语言名称和地区代码", () => {
  assert.equal(normalizeAdminVoiceLanguage("日文"), "日语");
  assert.equal(normalizeAdminVoiceLanguage("韩文"), "韩语");
  assert.equal(normalizeAdminVoiceLanguage("法文"), "法语");
  assert.equal(normalizeAdminVoiceLanguage("西班牙文"), "西班牙语");
  assert.equal(normalizeAdminVoiceLanguage("en-US"), "英语");
  assert.equal(normalizeAdminVoiceLanguage("ja-JP"), "日语");
  assert.equal(normalizeAdminVoiceLanguage("未收录语种"), "未收录语种");
});

test("后台音色保存动作提交四项分类信息", async () => {
  const actions = await source("src/lib/audio-admin-api.ts");
  const platformAction = functionSource(actions, "updateAdminPlatformVoiceAction");
  const systemAction = functionSource(actions, "updateAdminSystemVoiceAction");

  for (const field of ["language", "accent", "gender", "ageCategory"]) {
    assert.match(platformAction, new RegExp(`${field}:\\s*text\\(formData, ["']${field}["']\\)`));
    assert.match(systemAction, new RegExp(`${field}:\\s*text\\(formData, ["']${field}["']\\)`));
  }
});

test("后台音色列表按语种和口音联动筛选全部音色", async () => {
  const [filters, page, api] = await Promise.all([
    source("src/components/audio/admin-voice-list-filters.tsx"),
    source("src/app/admin/audio/voices/page.tsx"),
    source("src/lib/audio-admin-api.ts")
  ]);

  assert.match(filters, /name=["']language["']/);
  assert.match(filters, /name=["']accent["']/);
  assert.match(filters, /adminVoiceAccentsByLanguage/);
  assert.match(filters, /nextAccents\.includes\(current\)/);
  assert.match(page, /accent\?: string/);
  assert.match(page, /<AdminVoiceListFilters query=\{query\}/);
  assert.match(page, /getAdminVoiceAssets\(voiceFilters\)/);
  assert.match(page, /getAdminSystemVoiceAssets\(voiceFilters\)/);

  const voiceAssetsRequest = functionSource(api, "getAdminVoiceAssets");
  const systemVoicesRequest = functionSource(api, "getAdminSystemVoiceAssets");
  assert.match(voiceAssetsRequest, /accent\?: string/);
  assert.match(voiceAssetsRequest, /buildQuery\(filters\)/);
  assert.match(systemVoicesRequest, /accent\?: string/);
});

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

function functionSource(contents: string, name: string) {
  const start = contents.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `缺少 ${name}`);
  const next = contents.indexOf("\nexport async function ", start + 1);
  return contents.slice(start, next === -1 ? contents.length : next);
}
