import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { PrismaClient } from "../../packages/database/src/index.ts";
import { applyVoiceLibraryImport, validateVoiceImportTarget } from "./voice-library-import.mjs";

const requireDatabase = createRequire(new URL("../../packages/database/package.json", import.meta.url));
const { Client } = requireDatabase("pg");
const { PrismaPg } = requireDatabase("@prisma/adapter-pg");

test("真实数据库导入保持关联；写入异常时整批回滚", { skip: !process.env.VOICE_IMPORT_TEST_RUNTIME_FILE || !process.env.VOICE_IMPORT_TEST_SCHEMA_SQL }, async () => {
  const runtime = JSON.parse(await readFile(process.env.VOICE_IMPORT_TEST_RUNTIME_FILE, "utf8"));
  const url = new URL(runtime.DATABASE_URL); url.hostname = "127.0.0.1";
  validateVoiceImportTarget(url.toString());
  const schema = `voice_import_test_${randomBytes(6).toString("hex")}`;
  const connection = new Client({ connectionString: url.toString() });
  await connection.connect();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET search_path TO "${schema}"`);
    const ddl = await readFile(process.env.VOICE_IMPORT_TEST_SCHEMA_SQL, "utf8");
    await connection.query(ddl.replaceAll('"public"', `"${schema}"`));
    const presetRow = await connection.query(`SELECT row_to_json(p) AS record FROM public.ai_provider_presets p WHERE "providerKey"='aliyun_dashscope_audio'`);
    for (const [key, value] of Object.entries(presetRow.rows[0].record)) if (key.endsWith("At") && value) presetRow.rows[0].record[key] = new Date(`${value}Z`);
    await prisma.aiProviderPreset.create({ data: presetRow.rows[0].record });
    const instanceRows = await connection.query(`SELECT row_to_json(p) AS record FROM public.ai_provider_instances p WHERE "providerPresetId"=$1`, [presetRow.rows[0].record.id]);
    for (const row of instanceRows.rows) {
      for (const [key, value] of Object.entries(row.record)) if (key.endsWith("At") && value) row.record[key] = new Date(`${value}Z`);
      await prisma.aiProviderInstance.create({ data: row.record });
    }
    const provider = await prisma.aiProviderInstance.findFirst();
    const admin = await prisma.adminUser.create({ data: { email: "voice-import-test@abei.invalid", passwordHash: "invalid-test-only", name: "导入测试" } });
    const source = { version: 1, source: "xueleai-local", voices: [{ id: "voice-test", isPlatform: true, provider: "aliyun_dashscope_audio", providerKey: "aliyun_dashscope_audio", providerInstanceName: provider.name, providerVoiceId: "speaker-test", name: "小雨", type: "DESIGNED", targetModel: "cosyvoice-v3.5-plus", status: "DISABLED", visibility: "PUBLIC", previewAudioAssetId: "audio-test", disabledReason: "暂停使用", createdAt: "2026-09-01T00:00:00Z", updatedAt: "invalid-date" }], audioAssets: [{ id: "audio-test", type: "PREVIEW", storageProvider: "S3", objectKey: "audio/preview.mp3", url: "https://r.abeiai.com/audio/preview.mp3", mimeType: "audio/mpeg", sizeBytes: 100 }], systemConfigs: [] };
    await assert.rejects(applyVoiceLibraryImport(prisma, source, { ownerPasswordHash: "invalid-test-only", adminId: admin.id }));
    assert.equal(await prisma.user.count(), 0);
    assert.equal(await prisma.audioAsset.count(), 0);
    assert.equal(await prisma.voiceAsset.count(), 0);
    source.voices[0].updatedAt = "2026-09-02T00:00:00Z";
    const result = await applyVoiceLibraryImport(prisma, source, { ownerPasswordHash: "invalid-test-only", adminId: admin.id });
    assert.deepEqual(result, { voices: 1, audioAssets: 1, systemConfigs: 0 });
    const voice = await prisma.voiceAsset.findUnique({ where: { id: "voice-test" }, include: { previewAudioAsset: true } });
    assert.equal(voice.status, "DISABLED");
    assert.equal(voice.providerInstanceId, provider.id);
    assert.equal(voice.userId, voice.previewAudioAsset.userId);
    assert.equal(voice.previewAudioAsset.storageProvider, "S3");
    await assert.rejects(applyVoiceLibraryImport(prisma, source, { ownerPasswordHash: "invalid-test-only", adminId: admin.id }), /平台音色/);
    assert.equal(await prisma.voiceAsset.count(), 1);
  } finally {
    await prisma.$disconnect();
    await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await connection.end();
  }
});
