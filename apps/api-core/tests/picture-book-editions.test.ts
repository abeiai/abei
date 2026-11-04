import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";

test("公开绘本只列出同组已发布语种，并标记当前版本", async () => {
  const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  const editions = [
    { pictureBookId: "book-en", language: "en", groupKey: "group-a", published: true },
    { pictureBookId: "book-zh", language: "zh-CN", groupKey: "group-a", published: true },
    { pictureBookId: "book-draft", language: "fr", groupKey: "group-a", published: false },
    { pictureBookId: "other", language: "zh-CN", groupKey: "group-b", published: true }
  ];
  Object.assign(service, { prisma: {
    pictureBookSubmission: { findFirst: async () => ({ pictureBookId: "book-en", publishedSnapshot: { title: "Book", pages: [] }, publishedSourceInfo: {} }) },
    pictureBookEdition: {
      findUnique: async ({ where }: { where: { pictureBookId: string } }) => editions.find(item => item.pictureBookId === where.pictureBookId) ?? null,
      findMany: async ({ where }: { where: { groupKey: string; pictureBook: { submission: { is: { publishedAt: { not: null }; publishedCoverUrl: { not: null } } } } } }) => editions.filter(item => item.groupKey === where.groupKey && item.published && where.pictureBook.submission.is.publishedAt.not === null && where.pictureBook.submission.is.publishedCoverUrl.not === null)
    }
  } });
  const result = await service.publicBook("book-en");
  assert.deepEqual(result.editions, [
    { id: "book-en", language: "en", href: "/library/book-en", current: true },
    { id: "book-zh", language: "zh-CN", href: "/library/book-zh", current: false }
  ]);
});
