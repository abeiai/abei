import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";
import { hashCourseSnapshot } from "../src/courses/course-domain.js";

test("已发布来源立即更新，待审核来源不覆盖公开版本且过期版本不能保存", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@test.invalid`, nickname: "来源测试", passwordHash: "unused" } });
  try {
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "测试", brief: "", style: "", pageCount: 0, messages: [], characters: [], pages: [] } });
    const snapshot = { type: "PICTURE_BOOK", title: "测试", pages: [] };
    const row = await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot, snapshotHash: hashCourseSnapshot(snapshot), coverUrl: "/cover.png", publishedSnapshot: snapshot, publishedCoverUrl: "/cover.png", publishedAt: new Date() } });
    const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
    Object.assign(service, { prisma });
    const first = { name: "Book Dash", iconUrl: "", url: "https://bookdash.org/", statement: "公开声明" };
    const updated = await service.updateSource(row.id, row.updatedAt.toISOString(), first);
    assert.deepEqual(updated.source, first);
    assert.deepEqual((await service.publicBook(book.id)).source, first);
    await assert.rejects(() => service.updateSource(row.id, row.updatedAt.toISOString(), first), /状态已变化/);
    const pending = await prisma.pictureBookSubmission.update({ where: { id: row.id }, data: { status: "PENDING" } });
    const draft = { ...first, name: "新来源", statement: "待审声明" };
    await service.updateSource(row.id, pending.updatedAt.toISOString(), draft);
    assert.deepEqual((await service.review(row.id)).source, draft);
    assert.deepEqual((await service.publicBook(book.id)).source, first);
    const admin = await prisma.adminUser.create({ data: { email: `${randomUUID()}@test.invalid`, name: "来源测试", passwordHash: "unused" } });
    try {
      const latest = await service.review(row.id);
      await service.decide(admin.id, row.id, latest.updatedAt.toISOString(), "APPROVED");
      assert.deepEqual((await service.publicBook(book.id)).source, draft);
    } finally { await prisma.adminUser.delete({ where: { id: admin.id } }); }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
