import { isDeepStrictEqual } from "node:util";
import {books,seriesTitle,seriesSummary,seriesTags,bookId,buildBookRecord,ownerId,approvalAdminId,approvalAdminIdentity,localSystemId,productionSystemId} from './our-homes-publication.mjs';
import {canonical,syncDigest,planCareerSyncRow} from './career-production-sync.mjs';
import {assertCareerReviewTarget} from './career-import.mjs';

export const syncTables = ["media_assets", "audio_assets", "picture_books", "picture_book_submissions", "course_material_publications", "courses", "course_revisions", "course_revision_items", "course_review_requests", "admin_operation_logs"];
const expectedCounts = [217, 0, 12, 12, 12, 1, 1, 12, 1, 13];
const imageKeys = ["resource", ...books.flatMap((book) => [
  ...Array.from({ length: 17 }, (_, position) => `image:${book.slug}:${position}`), `library:${book.slug}`,
])];
const audioKeys = [];
export const planSyncRow = planCareerSyncRow;
const idsFor = (bundle, table) => JSON.stringify(bundle.tables[table].map((row) => row.id));
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

export function validateApprovedBundle(bundle, domain) {
  if (bundle?.format !== "abei-our-homes-approved-sync-v1" || bundle.owner !== ownerId || bundle.series !== seriesTitle ||
      !bundle.courseId || bundle.adminId !== approvalAdminId || !isDeepStrictEqual(Object.keys(bundle.tables ?? {}).sort(), [...syncTables].sort())) throw Error("我们的家同步包身份或表范围错误");
  for (const [index, table] of syncTables.entries()) {
    const rows = bundle.tables[table];
    if (!Array.isArray(rows) || rows.length !== expectedCounts[index] || new Set(rows.map((row) => row.id)).size !== expectedCounts[index]) throw Error(`我们的家同步包 ${table} 数量或主键不符`);
  }
  if (!isDeepStrictEqual(Object.keys(bundle.assets ?? {}).sort(), [...imageKeys, ...audioKeys].sort())) throw Error("我们的家同步包缺少完整217份素材");
  const imageRows = new Map(bundle.tables.media_assets.map((row) => [row.id, row]));
  const audioRows = new Map(bundle.tables.audio_assets.map((row) => [row.id, row]));
  const seenHashes = new Set();
  for (const key of [...imageKeys, ...audioKeys]) {
    const asset = bundle.assets[key], isAudio = key.startsWith("audio:");
    const row = (isAudio ? audioRows : imageRows).get(asset?.id);
    if (asset?.status !== "READY" || !/^[a-f0-9]{64}$/.test(asset.sha256) || seenHashes.has(asset.sha256) ||
        typeof asset.url !== "string" || !/^https:\/\/r\.abeiai\.com\/[a-zA-Z0-9/_-]+\.(?:webp|png|mp3)$/.test(asset.url) ||
        row?.url !== asset.url || row.storageProvider !== "S3" ||
        (isAudio ? row.userId : row.createdByUserId) !== ownerId ||
        (isAudio ? row.type !== "TTS_OUTPUT" || row.sizeBytes !== asset.sizeBytes : row.mediaType !== "IMAGE" || row.size !== asset.sizeBytes)) throw Error(`我们的家同步包素材身份不符：${key}`);
    seenHashes.add(asset.sha256);
  }
  const course = bundle.tables.courses[0], revision = bundle.tables.course_revisions[0], review = bundle.tables.course_review_requests[0];
  if (course.id !== bundle.courseId || course.userId !== ownerId || course.reviewState !== "PUBLISHED" || course.approvedRevisionId !== revision.id ||
      course.workingRevisionId !== null || !course.publishedAt || revision.courseId !== course.id || revision.status !== "APPROVED" ||
      revision.name !== seriesTitle || revision.coverMediaId !== bundle.assets.resource.id ||
      review.materialPublicationId !== null || review.courseId !== course.id || review.courseRevisionId !== revision.id || review.scope !== "COURSE_REVISION" || review.status !== "APPROVED" ||
      review.submittedByUserId !== ownerId || review.reviewedByAdminId !== bundle.adminId || !review.reviewedAt ||
      revision.summary !== seriesSummary || !isDeepStrictEqual(revision.tags, seriesTags)) throw Error("我们的家系列缺少真实审核通过版本");
  const logIds = [review.id];
  const materials = [];
  for (const [index, book] of books.entries()) {
    const id = bookId(book.slug);
    for(const [position,selected] of book.images.entries()){
      const asset=bundle.assets[`image:${book.slug}:${position}`];
      if(asset.sha256!==selected.sha256||!isDeepStrictEqual(asset.dimensions,selected.dimensions))throw Error(`原图选稿哈希或尺寸不符：${book.slug}:${position}`);
    }
    const record = buildBookRecord(book,
      Array.from({ length: 17 }, (_, position) => bundle.assets[`image:${book.slug}:${position}`].url));
    const source = bundle.tables.picture_books.find((row) => row.id === id);
    if (!source || Object.keys(record).some((key) => !isDeepStrictEqual(canonical(source[key]), canonical(record[key])))) throw Error(`我们的家作品文稿不符：${book.slug}`);
    const snapshot = domain.snapshotCourseMaterial("PICTURE_BOOK", record), hash = domain.hashCourseSnapshot(snapshot);
    const publication = bundle.tables.course_material_publications.find((row) => row.pictureBookId === id);
    const submission = bundle.tables.picture_book_submissions.find((row) => row.pictureBookId === id);
    const item = bundle.tables.course_revision_items.find((row) => row.sortOrder === index);
    if (publication?.pictureBookId !== id || submission?.pictureBookId !== id || publication?.status !== "APPROVED" || publication.materialType !== "PICTURE_BOOK" || publication.approvedHash !== hash || publication.currentHash !== hash ||
        !isDeepStrictEqual(publication.approvedSnapshot, snapshot) || !isDeepStrictEqual(publication.currentSnapshot, snapshot) ||
        submission?.status !== "APPROVED" || submission.publishedHash !== hash || !isDeepStrictEqual(submission.publishedSnapshot,snapshot) || submission.publishedCoverUrl !== bundle.assets[`library:${book.slug}`].url || !submission.publishedAt || submission.publishedVersion !== 1 || submission.submittedVersion !== source.version || submission.snapshotHash !== hash || !isDeepStrictEqual(submission.snapshot, snapshot) ||
        submission.coverUrl !== bundle.assets[`library:${book.slug}`].url || submission.reviewedByAdminId !== bundle.adminId || !submission.reviewedAt ||
        item?.revisionId !== revision.id || item.publicationId !== publication.id || item.pictureBookId !== id || item.materialType !== "PICTURE_BOOK" ||
        item.displayName !== book.title || (item.pinnedVersion!==null && item.pinnedVersion!==source.version) || item.pinnedHash !== hash || !isDeepStrictEqual(item.pinnedSnapshot,snapshot)) throw Error(`我们的家课件或投稿审核快照不符：${book.slug}`);
    for(const row of [publication,item])for(const key of ['videoGuideLessonId','englishGuidedStudyMaterialId','learningFlashcardDeckId'])if(row[key]!=null)throw Error(`非绘本关联不为空：${key}`);
    materials.push({ publicationId: publication.id, pictureBookId: id, hash, snapshot,
      approvedHash: publication.approvedHash, approvedSnapshot: publication.approvedSnapshot });
    logIds.push(submission.id);
  }
  const input = { name: seriesTitle, summary: seriesSummary, coverMediaId: bundle.assets.resource.id,
    tags: seriesTags, items: books.map((book) => ({ materialType: "PICTURE_BOOK", materialId: bookId(book.slug), displayName: book.title })) };
  assertCareerReviewTarget({ ...review, status: "PENDING" }, input, materials,
    { courseId: course.id, revisionId: revision.id, userId: ownerId, coverUrl: bundle.assets.resource.url });
  if (!isDeepStrictEqual(bundle.tables.admin_operation_logs.map((row) => row.resourceId).sort(), logIds.sort()) ||
      bundle.tables.admin_operation_logs.some((row) => row.adminUserId !== bundle.adminId ||
        row.action !== (row.resourceId === review.id ? "APPROVE_COURSE_REVIEW" : "APPROVE_PICTURE_BOOK_SUBMISSION") ||
        row.resourceType !== (row.resourceId === review.id ? "COURSE_REVIEW_REQUEST" : "PICTURE_BOOK_SUBMISSION"))) throw Error("管理员审核日志不完整");
  return { books: 12, spreads: 192, images: 217, audio: 0, submissions: 12 };
}

export async function guardTarget(client, bundle, mode, lockActors = false, testing = false) {
  if(!['production','local'].includes(mode))throw Error('未知数据库模式');
  const identity = (await client.query("SELECT current_database() AS db,current_setting('port') AS port,system_identifier::text AS system FROM pg_control_system()" )).rows[0];
  if(testing){if(identity.db!=="abei_our_homes_sync_test"||identity.port!=="3607"||client.host!=="127.0.0.1")throw Error("只允许独立测试实例");}
  else if (identity.db !== "abei" || identity.port !== "3604" || identity.system !== (mode === "production" ? productionSystemId : localSystemId)) throw Error("数据库实例身份不符");
  const user = (await client.query("SELECT email,nickname,status FROM users WHERE id=$1" + (lockActors ? " FOR SHARE" : ""), [ownerId])).rows[0];
  const admin = (await client.query("SELECT id,role,status,md5(email || '|' || name) AS digest FROM admin_users WHERE id=$1" + (lockActors ? " FOR SHARE" : ""), [bundle.adminId])).rows[0];
  if (user?.email !== "lele-studio@abei.example" || user.nickname !== "乐乐绘本工作室" || user.status !== "ACTIVE" ||
      admin?.role !== "SUPER_ADMIN" || admin.status !== "ACTIVE" || (!testing && admin.digest !== approvalAdminIdentity)) throw Error("作者或审核管理员身份不符");
  const otherSeries = (await client.query("SELECT DISTINCT c.id FROM courses c JOIN course_revisions r ON r.\"courseId\"=c.id WHERE r.name=$1 AND c.id<>$2", [seriesTitle, bundle.courseId])).rows;
  const otherBooks = (await client.query("SELECT id FROM picture_books WHERE title = ANY($1::text[]) AND id <> ALL($2::text[])", [books.map((book) => book.title), books.map((book) => bookId(book.slug))])).rows;
  if (otherSeries.length || otherBooks.length) throw Error("目标已有不同 ID 的同名作品或系列");
  const conflicting=(await client.query(`SELECT r.status FROM course_material_publications p JOIN LATERAL (SELECT status FROM course_review_requests WHERE "materialPublicationId"=p.id AND scope='MATERIAL_CHANGE' ORDER BY "submittedAt" DESC LIMIT 1) r ON true WHERE p."pictureBookId"=ANY($1::text[]) AND r.status<>'APPROVED'`,[books.map(b=>bookId(b.slug))])).rows;
  if(conflicting.length)throw Error('课件审核存在待审或拒绝');
}

export async function readTarget(client, bundle) {
  const selected = {}, counts = {}, outside = {};
  const auditId = `abei-our-homes-sync-${syncDigest(bundle).slice(0, 24)}`;
  for (const table of syncTables) {
    selected[table] = (await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY id`, [idsFor(bundle, table)])).rows.map((row) => row.row);
    counts[table] = Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
    const rest = (await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id NOT IN (SELECT jsonb_array_elements_text($1::jsonb)) AND id<>$2 ORDER BY id`, [idsFor(bundle, table), auditId])).rows.map((row) => row.row);
    outside[table] = syncDigest(rest);
  }
  const author = (await client.query("SELECT to_jsonb(t) AS row FROM users t WHERE id=$1", [ownerId])).rows[0]?.row;
  const wallet = (await client.query("SELECT to_jsonb(t) AS row FROM wallets t WHERE \"userId\"=$1", [ownerId])).rows[0]?.row ?? null;
  return { selected, counts, outside, authorHash: syncDigest(author), walletHash: syncDigest(wallet), auditId };
}

export async function applyBundle(client, bundle, domain, {testing=false}={}) {
  validateApprovedBundle(bundle, domain);
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('abei-our-homes-production-sync'))");
    await guardTarget(client, bundle, "production", true, testing);
    const before = await readTarget(client, bundle), inserted = Object.fromEntries(syncTables.map((table) => [table, 0]));
    if (before.selected.courses.length && syncTables.some((table) => bundle.tables[table].some((row) => !before.selected[table].some((old) => old.id === row.id)))) throw Error("线上已有不完整同名系列，停止自动修复");
    for (const table of syncTables) {
      const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table])).rows.map((row) => row.column_name).sort();
      for (const row of bundle.tables[table]) {
        if (!isDeepStrictEqual(Object.keys(row).sort(), columns)) throw Error(`生产和本地表字段不一致：${table}`);
        const existing = before.selected[table].find((old) => old.id === row.id);
        if (planSyncRow(existing, row) === "REUSE") continue;
        const data = table === "courses" ? { ...row, approvedRevisionId: null, workingRevisionId: null, reviewState: "DRAFT", publishedAt: null } : row;
        const names = Object.keys(data).map(quote).join(",");
        await client.query(`INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_populate_record(NULL::${table},$1::jsonb)`, [JSON.stringify(data)]);
        inserted[table]++;
      }
    }
    if (inserted.courses) {
      const row = bundle.tables.courses[0], names = Object.keys(row).map(quote).join(",");
      await client.query(`UPDATE courses SET (${names})=(SELECT ${names} FROM jsonb_populate_record(NULL::courses,$1::jsonb)) WHERE id=$2`, [JSON.stringify(row), row.id]);
    }
    let changed = Object.values(inserted).reduce((sum, count) => sum + count, 0);
    if (changed) {
      await client.query("INSERT INTO admin_operation_logs(id,\"adminUserId\",action,\"resourceType\",\"resourceId\",description) VALUES($1,$2,$3,$4,$5,$6)",
        [before.auditId, bundle.adminId, "SYNC_APPROVED_OUR_HOMES_SERIES", "COURSE", bundle.courseId, `同步《${seriesTitle}》十二册、204张原作图片及十二本已审核投稿；同步包摘要 ${syncDigest(bundle)}`]);
      inserted.admin_operation_logs++; changed++;
    }
    const after = await readTarget(client, bundle);
    for (const table of syncTables) {
      for (const row of bundle.tables[table]) if (planSyncRow(after.selected[table].find((old) => old.id === row.id), row) !== "REUSE") throw Error(`写入后数据缺失：${table}`);
      if (after.counts[table] !== before.counts[table] + inserted[table] || after.outside[table] !== before.outside[table]) throw Error(`表计数或范围外数据变化：${table}`);
    }
    if (after.authorHash !== before.authorHash || after.walletHash !== before.walletHash) throw Error("作者或钱包发生变化");
    await client.query("COMMIT");
    return { changed, inserted, beforeCounts: before.counts, afterCounts: after.counts, outsideUnchanged: true, authorAndWalletUnchanged: true };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}
