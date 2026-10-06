import assert from "node:assert/strict";
import test from "node:test";
import { prepareVoiceLibraryMedia, planVoiceLibraryImport, validateVoiceImportTarget } from "./voice-library-import.mjs";

function fixture() {
  return { version: 1, source: "xueleai-local", voices: [{ id: "source-voice", isPlatform: true, provider: "aliyun_dashscope_audio", providerKey: "aliyun_dashscope_audio", providerInstanceName: "百炼", providerVoiceId: "speaker-a", name: "小雨", type: "DESIGNED", targetModel: "cosyvoice-v3.5-plus", status: "DISABLED", visibility: "PUBLIC", previewAudioAssetId: "preview", sourceAudioAssetId: null, consentId: null, disabledReason: "暂停使用", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z" }], audioAssets: [{ id: "preview", type: "PREVIEW", storageProvider: "LOCAL", objectKey: "sample.mp3", url: "https://xueleai.com/api/audio/files/sample.mp3", mimeType: "audio/mpeg", sizeBytes: 100, createdAt: "2026-09-01T00:00:00Z" }], systemConfigs: [{ key: "cosyVoiceSystemVoiceOverrides", value: '{"speaker-a":{"name":"小雨"}}' }] };
}
const providers = [{ id: "abei-provider", name: "百炼", providerKey: "aliyun_dashscope_audio" }];
const target = () => ({ providers, voices: [], audioAssetIds: [] });

test("导入只能连接 abei 独立数据库", () => {
  assert.doesNotThrow(() => validateVoiceImportTarget("postgresql://user:password@127.0.0.1:3604/abei"));
  assert.doesNotThrow(() => validateVoiceImportTarget("postgresql://user:password@127.0.0.1:3604/abei?schema=public"));
  for (const value of ["postgresql://user:password@localhost:3324/xueleai", "postgresql://user:password@remote.example:3604/abei", "postgresql://user:password@localhost:3604/xueleai", "postgresql://user:password@127.0.0.1:3604/abei?host=remote.example&port=3324", "postgresql://user:password@127.0.0.1:3604/abei?port=3324", "postgresql://user:password@127.0.0.1:3604/abei?options=-csearch_path%3Dother", "postgresql://user:password@127.0.0.1:3604/abei?schema=other"]) {
    assert.throws(() => validateVoiceImportTarget(value), /abei/);
  }
});

test("角色保持源音色标识和禁用状态，服务商映射到目标实例", () => {
  const plan = planVoiceLibraryImport(fixture(), target());
  assert.equal(plan.voices.length, 1);
  assert.equal(plan.voices[0].providerInstanceId, "abei-provider");
  assert.equal(plan.voices[0].providerVoiceId, "speaker-a");
  assert.equal(plan.voices[0].status, "DISABLED");
  assert.equal(plan.voices[0].disabledReason, "暂停使用");
  assert.equal(plan.audioAssets[0].id, "preview");
});

test("已有私人角色被保留，ID冲突或已有平台库会在写入前拒绝", () => {
  const own = { id: "private", isPlatform: false };
  assert.equal(planVoiceLibraryImport(fixture(), { ...target(), voices: [own] }).voices.length, 1);
  assert.throws(() => planVoiceLibraryImport(fixture(), { ...target(), voices: [{ ...own, id: "source-voice" }] }), /冲突/);
  assert.throws(() => planVoiceLibraryImport(fixture(), { ...target(), voices: [{ id: "existing", isPlatform: true }] }), /平台音色/);
  assert.throws(() => planVoiceLibraryImport(fixture(), { ...target(), audioAssetIds: ["preview"] }), /冲突/);
});

test("缺少服务商或关联音频时拒绝整批导入", () => {
  assert.throws(() => planVoiceLibraryImport(fixture(), { ...target(), providers: [] }), /服务商/);
  const source = fixture(); source.audioAssets = [];
  assert.throws(() => planVoiceLibraryImport(source, target()), /音频/);
});

test("不接受重复音色、私人音色、音频路径穿越或权限配置混入", () => {
  const duplicate = fixture(); duplicate.voices.push({ ...duplicate.voices[0], id: "another" });
  assert.throws(() => planVoiceLibraryImport(duplicate, target()), /重复/);
  const privateSource = fixture(); privateSource.voices[0].isPlatform = false;
  assert.throws(() => planVoiceLibraryImport(privateSource, target()), /平台/);
  const traversal = fixture(); traversal.audioAssets[0].objectKey = "../sample.mp3";
  assert.throws(() => planVoiceLibraryImport(traversal, target()), /路径/);
  const unsafe = fixture(); unsafe.systemConfigs.push({ key: "audioUserPublicVoiceEnabled", value: "true" });
  assert.throws(() => planVoiceLibraryImport(unsafe, target()), /配置/);
});

test("试听关联改用迁移地址，已确认失效的无资产预览清空但保留角色", () => {
  const source = fixture();
  const migrated = prepareVoiceLibraryMedia(source, new Map([["preview", "https://r.abeiai.com/audio/preview.mp3"]]), []);
  assert.equal(migrated.voices[0].previewAudioUrl, "https://r.abeiai.com/audio/preview.mp3");
  assert.equal(migrated.voices[0].status, "DISABLED");
  assert.throws(() => prepareVoiceLibraryMedia(source, new Map(), []), /试听/);
  source.voices[0].previewAudioAssetId = null;
  source.voices[0].previewAudioUrl = "https://invalid.example/preview.mp3";
  const fixed = prepareVoiceLibraryMedia(source, new Map(), ["source-voice"]);
  assert.equal(fixed.voices.length, 1);
  assert.equal(fixed.voices[0].id, "source-voice");
  assert.equal(fixed.voices[0].previewAudioUrl, null);
  assert.equal(source.voices[0].previewAudioUrl, "https://invalid.example/preview.mp3");
  assert.throws(() => prepareVoiceLibraryMedia(source, new Map(), ["not-in-source"]), /角色/);
});
