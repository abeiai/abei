import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getPrismaClient, hashPassword } from "../../packages/database/src/index.ts";
import { applyVoiceLibraryImport, prepareVoiceLibraryMedia, planVoiceLibraryImport, validateVoiceImportTarget } from "./voice-library-import.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const requireDatabase = createRequire(new URL("../../packages/database/package.json", import.meta.url));
requireDatabase("dotenv").config({ path: join(root, ".env"), quiet: true });
const sourceArgument = process.argv[process.argv.indexOf("--source-dir") + 1];
if (!process.argv.includes("--source-dir") || !sourceArgument) throw new Error("请指定 --source-dir 导出包目录");
const sourceDir = await realpath(resolve(root, sourceArgument));
if (!sourceDir.startsWith(`${join(root, "backups", "voice-library-import")}/`)) throw new Error("导出包必须位于已忽略的语音备份目录");
const source = JSON.parse(await readFile(join(sourceDir, "source-database.json"), "utf8"));
const runtime = process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : JSON.parse(await readFile(join(sourceDir, "target-runtime.json"), "utf8"));
const databaseUrl = new URL(runtime.DATABASE_URL);
if (databaseUrl.hostname === "postgres") databaseUrl.hostname = "127.0.0.1";
validateVoiceImportTarget(databaseUrl.toString());
process.env.DATABASE_URL = databaseUrl.toString();
const prisma = getPrismaClient();
try {
  const [providers, existingVoices, existingAssets] = await Promise.all([
    prisma.aiProviderInstance.findMany({ select: { id: true, name: true, providerPreset: { select: { providerKey: true } } } }),
    prisma.voiceAsset.findMany({ select: { id: true, isPlatform: true } }),
    prisma.audioAsset.findMany({ select: { id: true } })
  ]);
  const plan = planVoiceLibraryImport(source, { providers: providers.map(row => ({ ...row, providerKey: row.providerPreset.providerKey })), voices: existingVoices, audioAssetIds: existingAssets.map(row => row.id) });
  console.log(JSON.stringify({ stage: "preflight", voices: plan.voices.length, audioAssets: plan.audioAssets.length, systemConfigs: plan.systemConfigs.length }));
  const apply = process.argv.includes("--apply");
  const stageAudio = process.argv.includes("--stage-audio");
  if (apply || stageAudio) {
    const cacheDir = join(sourceDir, "audio");
    await mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const curl = promisify(execFile);
    for (let offset = 0; offset < plan.audioAssets.length; offset += 4) {
      const results = await Promise.allSettled(plan.audioAssets.slice(offset, offset + 4).map(async asset => {
        if (asset.storageProvider !== "LOCAL") throw new Error("此导出包要求本地试听资产迁移");
        const filename = basename(asset.objectKey), path = join(cacheDir, filename);
        let bytes = await readFile(path).catch(() => null);
        if (!bytes) {
          const url = new URL(asset.url);
          if (url.protocol !== "https:" || url.hostname !== "xueleai.com" || url.pathname !== `/api/audio/files/${encodeURIComponent(filename)}` || url.search || url.username || url.password) throw new Error("试听音频源地址不在允许范围");
          const downloaded = await curl("curl", ["--fail", "--silent", "--show-error", "--max-time", "45", "--retry", "2", url.toString()], { encoding: "buffer", maxBuffer: 30 * 1024 * 1024 });
          bytes = downloaded.stdout;
          await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
        }
        if (bytes.length !== asset.sizeBytes || !(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || bytes.subarray(0, 4).toString() === "RIFF")) throw new Error(`试听文件校验失败：${asset.id}`);
      }));
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
      console.log(JSON.stringify({ stage: "audio-staged", count: Math.min(offset + 4, plan.audioAssets.length) }));
    }
  }
  if (apply) {
    const backup = await readFile(join(sourceDir, "target-before.dump"));
    if (backup.subarray(0, 5).toString() !== "PGDMP") throw new Error("未找到有效的 abei 导入前备份");
    if (process.env.S3_BUCKET !== "abeiai") throw new Error("试听文件目标必须为 abeiai R2 桶");
    const endpoint = new URL(process.env.S3_ENDPOINT), publicBase = new URL(process.env.S3_PUBLIC_BASE_URL);
    if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".r2.cloudflarestorage.com") || publicBase.protocol !== "https:") throw new Error("R2 配置不正确");
    const { S3Client, PutObjectCommand, HeadObjectCommand } = requireDatabase("@aws-sdk/client-s3");
    const s3 = new S3Client({ endpoint: endpoint.toString(), region: process.env.S3_REGION || "auto", forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0", credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
    const assetUrls = new Map(), migratedAssets = [], uploadReport = [];
    for (const asset of plan.audioAssets) {
      const bytes = await readFile(join(sourceDir, "audio", basename(asset.objectKey)));
      const hash = createHash("sha256").update(bytes).digest("hex");
      const key = `audio/voice-library-import/${hash}-${basename(asset.objectKey)}`;
      const url = `${publicBase.toString().replace(/\/$/, "")}/${key}`;
      await s3.send(new PutObjectCommand({ Bucket: "abeiai", Key: key, Body: bytes, ContentType: asset.mimeType, Metadata: { sha256: hash }, IfNoneMatch: "*" })).catch(error => { if (error.$metadata?.httpStatusCode !== 412) throw error; });
      const stored = await s3.send(new HeadObjectCommand({ Bucket: "abeiai", Key: key }));
      if (stored.ContentLength !== bytes.length || stored.Metadata?.sha256 !== hash) throw new Error("R2 试听文件校验失败");
      assetUrls.set(asset.id, url);
      migratedAssets.push({ ...asset, storageProvider: "S3", objectKey: key, url });
      uploadReport.push({ id: asset.id, url, key, sha256: hash, sizeBytes: bytes.length });
      await writeFile(join(sourceDir, "uploaded-audio.json"), JSON.stringify(uploadReport, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ stage: "audio-uploaded", count: uploadReport.length }));
    }
    const unavailable = JSON.parse(await readFile(join(sourceDir, "source-media-fixes.json"), "utf8").catch(error => { if (error.code === "ENOENT") return '{"unavailablePreviewVoiceIds":[]}'; throw error; }));
    const migrated = { ...prepareVoiceLibraryMedia(source, assetUrls, unavailable.unavailablePreviewVoiceIds), audioAssets: migratedAssets };
    await writeFile(join(sourceDir, "migrated-database.json"), JSON.stringify(migrated, null, 2), { mode: 0o600 });
    const admin = await prisma.adminUser.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!admin) throw new Error("未找到本项目管理员");
    const imported = await applyVoiceLibraryImport(prisma, migrated, { adminId: admin.id, ownerPasswordHash: await hashPassword(randomBytes(32).toString("hex")) });
    await writeFile(join(sourceDir, "import-result.json"), JSON.stringify({ ...imported, importedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ stage: "database-imported", ...imported }));
    s3.destroy();
  }
} finally { await prisma.$disconnect(); }
