import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertAbEiImportTarget, buildLeleBookRecord, validateLeleSeriesBooks } from "./lele-import.mjs";
import { assertNarrationSource, assertNarrationApproval, assertNarrationReviewState, narrationKey, planNarrationEntry, applyNarrationPages, leleNarrationVoice as voice } from "./lele-narration.mjs";

// 受信任的本地运营素材制作；服务商费用记录在清单中，不修改用户钱包或伪造付费任务。
const owner = "abei-lele-studio", courseId = "306f0ed1871f63b9ed7cbbd9";
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf("="); return [arg.slice(0, i), arg.slice(i + 1)]; }));
if (!args["--admin-id"] || !args["--data"] || !args["--output"] || !["generate", "publish"].includes(args["--mode"])) throw new Error("请指定 --admin-id、--data、--output 和 --mode=generate/publish");
const limit = args["--limit"] ? Number(args["--limit"]) : 156;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 156) throw new Error("生成数量须为1–156");
assertAbEiImportTarget(process.env.DATABASE_URL);
const definitions = JSON.parse(await readFile(args["--data"], "utf8"));
validateLeleSeriesBooks(definitions);
if (definitions.length !== 12) throw new Error("仅支持当前完整12集系列");
const expected = definitions.map(book => buildLeleBookRecord(book, owner));
const runtime = path => import(pathToFileURL(resolve(process.cwd(), path)).href);
createRequire(resolve(process.cwd(), "apps/api-core/package.json"))("reflect-metadata");
const [{ getPrismaClient }, { AudioService }, { MediaService }, { CourseReviewService }, { snapshotCourseMaterial, hashCourseSnapshot }, { writeAdminOperationLog }] = await Promise.all([
  runtime("packages/database/dist/index.js"), runtime("apps/api-core/dist/audio/audio.service.js"), runtime("apps/api-core/dist/media/media.service.js"),
  runtime("apps/api-core/dist/courses/course-review.service.js"), runtime("apps/api-core/dist/courses/course-domain.js"), runtime("apps/api-core/dist/security/admin-operation-log.js")
]);
const { Client } = createRequire(resolve(process.cwd(), "packages/database/package.json"))("pg");
const lock = new Client({ connectionString: process.env.DATABASE_URL });
const prisma = getPrismaClient(), audio = new AudioService(), media = new MediaService(), reviews = new CourseReviewService();
const output = resolve(args["--output"]), manifestFile = resolve(output, "manifest.json");
let manifest, writer = Promise.resolve();
const save = () => writer = writer.then(async () => { await writeFile(`${manifestFile}.tmp`, JSON.stringify(manifest, null, 2)); await rename(`${manifestFile}.tmp`, manifestFile); });
const entriesFor = book => Object.fromEntries(book.pages.map(page => [page.position, manifest.entries[narrationKey(book.id, page)]]));

async function verifyAudio(entry) {
  const asset = await prisma.audioAsset.findUnique({ where: { id: entry.assetId } });
  if (!asset || asset.userId !== owner || asset.url !== entry.url || asset.storageProvider !== "S3" || asset.type !== "TTS_OUTPUT") throw new Error("音频素材归属或地址不一致");
  const stored = await media.readPictureBookStoredAudio(entry.url);
  if (stored.buffer.length !== asset.sizeBytes || !stored.mimetype.startsWith("audio/")) throw new Error("对象存储音频大小或类型不一致");
}

try {
  await lock.connect();
  if (!(await lock.query("SELECT pg_try_advisory_lock(hashtext('abei-lele-series-import')) AS locked")).rows[0].locked) throw new Error("系列正在修改，请稍后重试");
  const admin = await prisma.adminUser.findUnique({ where: { id: args["--admin-id"] } });
  if (!admin || admin.status !== "ACTIVE" || admin.role !== "SUPER_ADMIN") throw new Error("必须指定有效超级管理员");
  const user = await prisma.user.findUnique({ where: { id: owner }, select: { email: true, status: true } });
  if (!user || user.email !== "lele-studio@abei.example" || user.status !== "ACTIVE") throw new Error("目标工作室账号不一致");
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { approvedRevision: { include: { items: { orderBy: { sortOrder: "asc" } } } } } });
  if (!course || course.userId !== owner || course.reviewState !== "PUBLISHED" || !isDeepStrictEqual(course.approvedRevision?.items.map(item => item.pictureBookId), expected.map(book => book.id))) throw new Error("系列公开状态或目录已改变");
  for (const record of expected) assertNarrationSource(await prisma.pictureBook.findUnique({ where: { id: record.id } }), record);
  media.assertPictureBookR2Ready();
  const voiceInfo = (await audio.listVoiceAssets(owner)).systemVoices.find(item => item.name === "叶知晴" && item.providerVoiceId === voice);
  if (voiceInfo?.status !== "READY") throw new Error("叶知晴音色不可用");
  const plan = await audio.prepareDialogueTts({ userId: owner, learnerId: null }, { text: expected[0].pages[0].narration, voiceValue: `system:${voice}`, speed: 1 });
  const model = await audio.getAudioModelById(plan.modelInstanceId, "TTS");
  if (model.modelName !== "qwen-audio-3.1-tts-flash") throw new Error("叶知晴模型不匹配");
  await mkdir(output, { recursive: true });
  try { manifest = JSON.parse(await readFile(manifestFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; manifest = { courseId, owner, voice, voiceName: "叶知晴", model: model.modelName, speed: 1, createdAt: new Date().toISOString(), entries: {} }; }
  if (manifest.courseId !== courseId || manifest.owner !== owner || manifest.voice !== voice || manifest.model !== model.modelName || manifest.speed !== 1) throw new Error("生成清单目标不一致");
  await save();
  if (args["--mode"] === "generate") {
    const gateway = new URL(process.env.AI_GATEWAY_BASE_URL || "http://ai-gateway:3603");
    if (gateway.protocol !== "http:" || gateway.port !== "3603" || !["ai-gateway", "localhost", "127.0.0.1"].includes(gateway.hostname)) throw new Error("仅允许使用abei的3603语音网关");
    const apiKey = audio.resolveProviderApiKey(model);
    const queue = expected.flatMap(book => book.pages.map(page => ({ book, page, key: narrationKey(book.id, page) }))).filter(({ book, page, key }) => planNarrationEntry(manifest.entries[key], book.id, page) !== "REUSE").slice(0, limit);
    let stopped = false;
    const worker = async () => {
      while (queue.length && !stopped) {
        const { book, page, key } = queue.shift();
        try {
          let entry = manifest.entries[key];
          const payloadFile = resolve(output, `${key}.json`);
          if (planNarrationEntry(entry, book.id, page) === "GENERATE") {
            entry = manifest.entries[key] = { key, bookId: book.id, position: page.position, text: page.narration, voice, status: "REQUESTING", attempts: (entry?.attempts ?? 0) + 1, failures: entry?.failures ?? [] };
            await save();
            const response = await fetch(`${gateway.origin}/audio/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
              baseUrl: model.baseUrl, webSocketUrl: model.webSocketUrl, apiKey, region: model.region, providerKey: model.providerKey, adapterType: model.adapterType,
              model: model.modelName, voice, text: page.narration, format: "mp3", sampleRate: 24000, speed: 1, timeoutMs: 90000
            }), signal: AbortSignal.timeout(100000) });
            const payload = await response.json();
            if (!response.ok) {
              entry.status = "FAILED_RESPONSE"; entry.failure = { httpStatus: response.status, code: payload.detail?.errorCode, message: payload.detail?.errorMessage };
              entry.failures.push(entry.failure); await save();
              throw new Error(`语音服务请求失败：HTTP ${response.status}`);
            }
            if (!payload.audioUrl && !payload.audioBase64) throw new Error("语音服务未返回音频，结果须人工核对");
            await writeFile(payloadFile, JSON.stringify(payload));
            Object.assign(entry, { status: "GENERATED", payloadFile: `${key}.json`, requestId: payload.requestId, usage: payload.usage });
            await save();
          }
          const payload = JSON.parse(await readFile(payloadFile, "utf8"));
          if (payload.voice !== voice || payload.model !== model.modelName) throw new Error("生成结果音色或模型不一致");
          // 先保存R2地址，再登记素材，恢复上传时不再次请求服务商。
          if (!entry.storage) { entry.storage = await audio.persistTtsAudioToS3(payload); await save(); }
          let asset = await prisma.audioAsset.findFirst({ where: { userId: owner, url: entry.storage.url, type: "TTS_OUTPUT" } });
          if (!asset) asset = await audio.createAudioAsset(owner, { type: "TTS_OUTPUT", storageProvider: "S3", ...entry.storage });
          Object.assign(entry, { status: "READY", url: asset.url, assetId: asset.id, sizeBytes: asset.sizeBytes });
          await verifyAudio(entry); await save();
          console.log(JSON.stringify({ ready: Object.values(manifest.entries).filter(item => item.status === "READY").length, total: 156, book: book.title, page: page.position }));
        } catch (error) { stopped = true; throw error; }
      }
    };
    const results = await Promise.allSettled(Array.from({ length: 3 }, worker));
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
  } else {
    // 只有全部156段都可读取，才更新作品和正式审核快照。
    for (const record of expected) {
      applyNarrationPages(record, entriesFor(record));
      for (const entry of Object.values(entriesFor(record))) await verifyAudio(entry);
    }
    for (const record of expected) {
      const target = snapshotCourseMaterial("PICTURE_BOOK", { ...record, pages: applyNarrationPages(record, entriesFor(record)) });
      const targetHash = hashCourseSnapshot(target);
      let publication = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
      let latest = await prisma.courseReviewRequest.findFirst({ where: { materialPublicationId: publication.id, scope: "MATERIAL_CHANGE" }, orderBy: { submittedAt: "desc" } });
      assertNarrationReviewState(publication, latest, target);
      const current = await prisma.pictureBook.findUnique({ where: { id: record.id } });
      assertNarrationSource(current, record);
      const pages = applyNarrationPages(current, entriesFor(record));
      if (!isDeepStrictEqual(current.pages, pages)) {
        const changed = await prisma.pictureBook.updateMany({ where: { id: record.id, userId: owner, version: current.version }, data: { pages, version: { increment: 1 } } });
        if (changed.count !== 1) throw new Error("作品被同时编辑，请核对后恢复");
      }
      publication = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
      latest = await prisma.courseReviewRequest.findFirst({ where: { materialPublicationId: publication.id, scope: "MATERIAL_CHANGE" }, orderBy: { submittedAt: "desc" } });
      assertNarrationReviewState(publication, latest, target);
      // 已有目标待审版本时直接使用其CAS，不能重新提交覆盖并发拒绝。
      if (latest?.status !== "PENDING" && publication.approvedHash !== targetHash) await reviews.recordMaterialChange("PICTURE_BOOK", record.id);
      publication = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
      const final = await prisma.pictureBook.findUnique({ where: { id: record.id } });
      if (hashCourseSnapshot(snapshotCourseMaterial("PICTURE_BOOK", final)) !== targetHash) throw new Error("作品已被同时修改，不能自动审核");
      if (publication.approvedHash !== targetHash) {
        const review = await prisma.courseReviewRequest.findFirst({ where: { materialPublicationId: publication.id, scope: "MATERIAL_CHANGE", status: "PENDING" } });
        if (!review) throw new Error("缺少课件变更审核");
        assertNarrationApproval(target, snapshotCourseMaterial("PICTURE_BOOK", final), review.afterSnapshot);
        await reviews.approve(admin.id, review.id, review.updatedAt.toISOString());
      }
      const approval = await prisma.courseReviewRequest.findFirst({ where: { materialPublicationId: publication.id, scope: "MATERIAL_CHANGE", status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
      const log = { action: "APPROVE_COURSE_REVIEW", resourceType: "COURSE_REVIEW_REQUEST", resourceId: approval.id };
      if (!await prisma.adminOperationLog.findFirst({ where: log })) await writeAdminOperationLog({ ...log, adminUserId: approval.reviewedByAdminId, description: `经授权为《${record.title}》封面及12页正文发布叶知晴配音，共13段；站内示范素材制作。` });
      if (!await prisma.adminOperationLog.findFirst({ where: log })) throw new Error("审核日志写入失败");
      const verified = await prisma.courseMaterialPublication.findUnique({ where: { pictureBookId: record.id } });
      if (verified.status !== "APPROVED" || verified.approvedHash !== targetHash) throw new Error("公开音频快照不一致");
      console.log(JSON.stringify({ published: record.title, clips: 13 }));
    }
    await audio.setDefaultVoice(owner, { systemVoiceId: voice });
    manifest.publishedAt = new Date().toISOString(); await save();
  }
  console.log(JSON.stringify({ mode: args["--mode"], ready: Object.values(manifest.entries).filter(entry => entry.status === "READY").length, courseId, voice: "叶知晴" }));
} finally { try { await writer; } finally { try { await lock.end(); } finally { await prisma.$disconnect(); } } }
