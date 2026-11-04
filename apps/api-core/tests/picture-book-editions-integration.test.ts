import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";

test("语种关联仅返回当前绘本同组的公开版本，撤回后不再显示", async () => {
  const prisma = getPrismaClient();
  const key = randomUUID();
  const user = await prisma.user.create({ data: { email: `${key}@test.invalid`, nickname: "语种测试", passwordHash: "unused" } });
  try {
    const create = async (language: string, published: boolean) => {
      const book = await prisma.pictureBook.create({ data: { userId: user.id, title: language, brief: "", style: "", pageCount: 0, messages: [], characters: [], pages: [] } });
      const snapshot = { title: language, pages: [] };
      await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot, snapshotHash: "test", publishedSnapshot: snapshot, publishedCoverUrl: "/cover.png", publishedAt: published ? new Date() : null } });
      await prisma.pictureBookEdition.create({ data: { pictureBookId: book.id, groupKey: key, language } });
      return book;
    };
    const en = await create("en", true);
    const zh = await create("zh-CN", true);
    await create("fr", false);
    const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
    Object.assign(service, { prisma });
    assert.deepEqual((await service.publicBook(en.id)).editions.map(x => [x.id, x.language, x.current]), [[en.id, "en", true], [zh.id, "zh-CN", false]]);
    assert.deepEqual((await service.publicBook(zh.id)).editions.map(x => [x.id, x.current]), [[en.id, false], [zh.id, true]]);
    await prisma.pictureBookSubmission.update({ where: { pictureBookId: zh.id }, data: { publishedAt: null } });
    assert.deepEqual((await service.publicBook(en.id)).editions.map(x => x.id), [en.id]);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
