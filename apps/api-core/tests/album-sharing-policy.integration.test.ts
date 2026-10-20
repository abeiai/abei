import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";
import { createCourseId, hashCourseSnapshot, snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { withdrawStandaloneBookShares } from "../src/courses/album-sharing.js";

const enabled = process.env.ABEI_SHARING_INTEGRATION === "1";
test("真实数据库：仅当前公开专辑阻止重复分享，并发专辑发布撤销旧入口且保留阅读快照", { skip: !enabled, timeout: 15000 }, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/abei_sharing_test");
  const db = getPrismaClient();
  const user = await db.user.create({ data: { email: `share-${randomUUID()}@test.invalid`, nickname: "分享测试", passwordHash: "unused" } });
  let courseId: string | undefined;
  try {
    const book = await db.pictureBook.create({ data: { userId: user.id, title: "测试绘本", brief: "原稿", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages: [0, 1].map(position => ({ position, imageUrl: "https://r.example/page.png" })) } });
    const snapshot = snapshotCourseMaterial("PICTURE_BOOK", book), hash = hashCourseSnapshot(snapshot);
    const media = await db.mediaAsset.create({ data: { filename: `test-${randomUUID()}.png`, originalName: "封面", mimeType: "image/png", size: 1, url: "/test.png", mediaType: "IMAGE", sourceType: "USER_UPLOAD", storageProvider: "LOCAL", createdByUserId: user.id } });
    const album = await db.course.create({ data: { id: createCourseId(), userId: user.id, publishedAt: new Date() } }); courseId = album.id;
    const old = await db.courseRevision.create({ data: { courseId: album.id, coverMediaId: media.id, name: "旧版", summary: "测试", status: "APPROVED" } });
    const current = await db.courseRevision.create({ data: { courseId: album.id, coverMediaId: media.id, name: "当前版", summary: "测试", status: "APPROVED" } });
    const publication = await db.courseMaterialPublication.create({ data: { materialType: "PICTURE_BOOK", pictureBookId: book.id, currentHash: hash, approvedHash: hash, currentSnapshot: snapshot, approvedSnapshot: snapshot, status: "APPROVED" } });
    await db.courseRevisionItem.create({ data: { revisionId: old.id, publicationId: publication.id, materialType: "PICTURE_BOOK", pictureBookId: book.id, displayName: book.title, sortOrder: 0, pinnedHash: hash, pinnedSnapshot: snapshot } });
    await db.course.update({ where: { id: album.id }, data: { approvedRevisionId: current.id } });
    const service = new PictureBookSubmissionService(undefined as never, undefined as never);
    // A former approved version is not the current public album.
    const share = await service.submit(user.id, book.id); assert.equal(share.status, "PENDING");
    await db.course.update({ where: { id: album.id }, data: { approvedRevisionId: old.id, publishedAt: null } });
    assert.equal((await service.submit(user.id, book.id)).id, share.id);
    await db.pictureBookSubmission.update({ where: { id: share.id }, data: { status: "APPROVED", publishedAt: new Date(), publishedSnapshot: snapshot, publishedHash: hash, publishedCoverUrl: "/cover.png" } });
    let unlock!: () => void, locked!: () => void, reached!: () => void;
    const hold = new Promise<void>(r => { unlock = r; }), ready = new Promise<void>(r => { locked = r; }), observed = new Promise<void>(r => { reached = r; });
    const publisher = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`course-material:PICTURE_BOOK:${book.id}`}))`;
      locked(); await hold;
      await tx.course.update({ where: { id: album.id }, data: { publishedAt: new Date() } });
      await withdrawStandaloneBookShares(tx, [book.id]);
    });
    await ready;
    Object.assign(service, { prisma: { $transaction: (callback: (tx: unknown) => unknown) => db.$transaction(async tx => callback(new Proxy(tx, { get(target, prop) {
      if (prop === "$queryRaw") return async (...args: unknown[]) => { if (args.includes(`course-material:PICTURE_BOOK:${book.id}`)) reached(); return (target.$queryRaw as Function)(...args); };
      return Reflect.get(target, prop);
    } }))) } });
    const attempt = service.submit(user.id, book.id);
    const rejected = assert.rejects(attempt, /本作品已经通过专辑分享，请不要重复分享/);
    await observed; unlock(); await publisher; await rejected;
    const after = await db.pictureBookSubmission.findUniqueOrThrow({ where: { id: share.id } });
    assert.equal(after.publishedAt, null); assert.equal(after.status, "APPROVED"); assert.equal(after.snapshotHash, hash); assert.equal(after.publishedHash, hash);
    assert.equal((await db.courseMaterialPublication.findUniqueOrThrow({ where: { id: publication.id } })).status, "APPROVED");
    assert.deepEqual((await db.pictureBook.findUniqueOrThrow({ where: { id: book.id } })).pages, book.pages);
  } finally {
    if (courseId) { await db.course.update({ where: { id: courseId }, data: { approvedRevisionId: null, workingRevisionId: null } }); await db.course.delete({ where: { id: courseId } }); }
    await db.courseMaterialPublication.deleteMany({ where: { pictureBook: { userId: user.id } } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
