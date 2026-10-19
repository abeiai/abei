import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { books, seriesTitle, bookId, ownerId, sha256, buildBookRecord } from "./xuxiake-publication.mjs";
import { applyBundle, guardTarget, planSyncRow, readTarget, syncTables, validateApprovedBundle } from "./xuxiake-production-sync.mjs";

const root = resolve(import.meta.dirname, "../..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const at = arg.indexOf("="); return [arg.slice(0, at), arg.slice(at + 1)]; }));
const mode = args["--mode"], file = args["--file"];
if (!["export", "inspect", "apply", "verify"].includes(mode) || !file) throw Error("必须指定 --mode=export/inspect/apply/verify 和 --file");
if (mode === "export") {
  process.loadEnvFile(resolve(args["--env-file"] ?? resolve(root, ".env")));
  if (!process.env.POSTGRES_PASSWORD || !["http://localhost:3600", "http://127.0.0.1:3600"].includes(process.env.APP_BASE_URL)) throw Error("只能从本地 abei 导出");
  process.env.DATABASE_URL = `postgresql://abei:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:3604/abei?schema=public`;
} else if (process.env.APP_BASE_URL !== "https://new.abeiai.com" || process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, "") !== "https://r.abeiai.com") {
  throw Error("只能同步到 new.abeiai.com 与指定 R2 存储");
}

const runtime = (path) => import(pathToFileURL(resolve(root, path)).href);
createRequire(resolve(root, "apps/api-core/package.json"))("reflect-metadata");
const [{ Client }, domain] = await Promise.all([
  Promise.resolve(createRequire(resolve(root, "packages/database/package.json"))("pg")),
  runtime("apps/api-core/dist/courses/course-domain.js"),
]);
const client = new Client({ connectionString: process.env.DATABASE_URL });
const privateWrite = async (path, value) => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
};
const select = async (table, ids) => (await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id`, [JSON.stringify(ids)])).rows.map((entry) => entry.row);
const verifyR2Assets = async (assets) => {
  const { MediaService } = await runtime("apps/api-core/dist/media/media.service.js");
  const media = new MediaService(); media.assertPictureBookR2Ready();
  const pending=Object.entries(assets);let next=0,completed=0;
  const results=await Promise.allSettled(Array.from({length:4},async()=>{
    while(next<pending.length){
      const [key,asset]=pending[next++];
      const stored=key.startsWith("audio:")?await media.readPictureBookStoredAudio(asset.url):await media.readPictureBookStoredImage(asset.url);
      if(sha256(stored.buffer)!==asset.sha256||stored.buffer.length!==asset.sizeBytes)throw Error(`线上R2素材字节不符：${key}`);
      completed++;
      if(completed%40===0)console.log(JSON.stringify({verifiedAssets:completed,total:pending.length}));
    }
  }));
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
};
let bundle;
try {
  await client.connect();
  if (mode === "export") {
    if (!args["--checkpoint"]) throw Error("导出需要本地 --checkpoint");
    const checkpoint = JSON.parse(await readFile(args["--checkpoint"]));
    if (checkpoint.series !== seriesTitle || checkpoint.owner !== ownerId || !checkpoint.courseId || !checkpoint.courseReviewId || Object.keys(checkpoint.submissions ?? {}).length !== 16) throw Error("本地系列尚未完整通过审核");
    bundle = { format: "abei-xuxiake-approved-sync-v1", owner: ownerId, series: seriesTitle,
      adminId: args["--admin-id"], courseId: checkpoint.courseId, assets: checkpoint.assets, tables: {} };
    if (!bundle.adminId) throw Error("导出需要 --admin-id");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await guardTarget(client, bundle, "local");
    bundle.tables.media_assets = await select("media_assets", Object.entries(checkpoint.assets).filter(([key]) => !key.startsWith("audio:")).map(([, value]) => value.id));
    bundle.tables.audio_assets = await select("audio_assets", Object.entries(checkpoint.assets).filter(([key]) => key.startsWith("audio:")).map(([, value]) => value.id));
    bundle.tables.picture_books = await select("picture_books", books.map((book) => bookId(book.slug)));
    bundle.tables.picture_book_submissions = await select("picture_book_submissions", Object.values(checkpoint.submissions));
    bundle.tables.courses = await select("courses", [checkpoint.courseId]);
    bundle.tables.course_revisions = await select("course_revisions", [bundle.tables.courses[0]?.approvedRevisionId]);
    bundle.tables.course_revision_items = (await client.query("SELECT to_jsonb(t) AS row FROM course_revision_items t WHERE \"revisionId\"=$1 ORDER BY \"sortOrder\"", [bundle.tables.course_revisions[0]?.id])).rows.map((entry) => entry.row);
    bundle.tables.course_material_publications = await select("course_material_publications", bundle.tables.course_revision_items.map((item) => item.publicationId));
    bundle.tables.course_review_requests = await select("course_review_requests", [checkpoint.courseReviewId]);
    const approvalIds = [checkpoint.courseReviewId, ...Object.values(checkpoint.submissions)];
    bundle.tables.admin_operation_logs = (await client.query("SELECT to_jsonb(t) AS row FROM admin_operation_logs t WHERE \"resourceId\"=ANY($1::text[]) AND action=ANY($2::text[]) ORDER BY id", [approvalIds, ["APPROVE_COURSE_REVIEW", "APPROVE_PICTURE_BOOK_SUBMISSION"]])).rows.map((entry) => entry.row);
    validateApprovedBundle(bundle, domain);
    await client.query("COMMIT");
    await privateWrite(file, bundle);
    console.log(JSON.stringify({ mode, series: seriesTitle, books: 16, assets: 561, sha256: sha256(await readFile(file)) }));
  } else {
    const raw = await readFile(file);
    if (!/^[a-f0-9]{64}$/.test(args["--sha256"] ?? "") || sha256(raw) !== args["--sha256"]) throw Error("私有同步包 SHA-256 不符");
    bundle = JSON.parse(raw);
    validateApprovedBundle(bundle, domain);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await guardTarget(client, bundle, "production");
    const before = await readTarget(client, bundle);
    for (const table of syncTables) for (const row of bundle.tables[table]) planSyncRow(before.selected[table].find((old) => old.id === row.id), row);
    await client.query("COMMIT");
    if (mode === "inspect") {
      console.log(JSON.stringify({ mode, sourceCounts: Object.fromEntries(syncTables.map((table) => [table, bundle.tables[table].length])), existingTargetCounts: Object.fromEntries(syncTables.map((table) => [table, before.selected[table].length])), tableCounts: before.counts, sha256: args["--sha256"] }));
    } else if (mode === "apply") {
      const backup = join(dirname(file), `target-before-${Date.now()}.json`);
      await privateWrite(backup, before);
      await verifyR2Assets(bundle.assets);
      const result = await applyBundle(client, bundle, domain);
      await privateWrite(join(dirname(file), "sync-result.json"), { ...result, backup, bundleSha256: args["--sha256"] });
      console.log(JSON.stringify({ mode, verifiedR2Assets: 561, backup, ...result }));
    } else {
      for (const table of syncTables) for (const row of bundle.tables[table]) if (planSyncRow(before.selected[table].find((old) => old.id === row.id), row) !== "REUSE") throw Error(`线上业务记录缺失：${table}`);
      await verifyR2Assets(bundle.assets);
      const [{ CoursesService }, { PictureBookSubmissionService }, { MediaService }] = await Promise.all([
        runtime("apps/api-core/dist/courses/courses.service.js"), runtime("apps/api-core/dist/picture-books/picture-book-submission.service.js"), runtime("apps/api-core/dist/media/media.service.js"),
      ]);
      const course = await new CoursesService().getPublicCourse(bundle.courseId);
      if (course.items.length !== 16 || course.items.some((item) => !item.launchHref)) throw Error("线上系列目录不完整");
      const submissions = new PictureBookSubmissionService(null, new MediaService());
      for (const book of books) {
        const playable = await submissions.publicBook(bookId(book.slug));
        const record=buildBookRecord(book,Array.from({length:17},(_,position)=>bundle.assets[`image:${book.slug}:${position}`].url),Array.from({length:17},(_,position)=>bundle.assets[`audio:${book.slug}:${position}`].url));
        if (playable.pages.length !== 17 || playable.isSpread || playable.aspectRatio!=="5:4" || playable.pages.some((page,i) => page.position!==i || page.imageUrl!==record.pages[i].imageUrl || page.caption!==record.pages[i].caption || page.textInImage===true || page.audioUrl!==record.pages[i].audioUrl)) throw Error(`线上绘本馆不完整：${book.slug}`);
      }
      const report = { mode, courseId: bundle.courseId, href: `https://new.abeiai.com/c/${bundle.courseId}`, books: 16, readerFrames: 272, audioFrames: 272, submissions: 16, approved: true, bundleSha256: args["--sha256"] };
      await privateWrite(join(dirname(file), "verification.json"), report);
      console.log(JSON.stringify(report));
    }
  }
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  throw error;
} finally {
  await client.end();
  if (mode !== "export") { const { getPrismaClient } = await runtime("packages/database/dist/index.js"); await getPrismaClient().$disconnect(); }
}
