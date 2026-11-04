import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "class-validator";
import { UpdatePictureBookDto } from "../src/picture-books/picture-book.dto.js";

test("英语分级支持缺省、清空和来源的 1–5；拒绝其他值", async () => {
  for (const value of [undefined, null, 1, 2, 3, 4, 5]) {
    const dto = Object.assign(new UpdatePictureBookDto(), { englishLevel: value });
    assert.equal((await validate(dto)).length, 0, String(value));
  }
  for (const value of [0, 6, 1.5, "2", true]) {
    const dto = Object.assign(new UpdatePictureBookDto(), { englishLevel: value });
    assert.ok((await validate(dto)).length > 0, String(value));
  }
});

test("批量发布只能审核预期的冻结版本", async () => {
  const { assertExpectedPictureBookSnapshot } = await import("../src/picture-books/picture-book-submission.service.js");
  assert.doesNotThrow(() => assertExpectedPictureBookSnapshot("expected", "expected"));
  assert.throws(() => assertExpectedPictureBookSnapshot("changed", "expected"));
  assert.doesNotThrow(() => assertExpectedPictureBookSnapshot("changed", undefined));
});

test("来源顺序与真实发布时间共同决定公开目录，搜索按字面匹配", async () => {
  const { getPrismaClient } = await import("@xueleai/database");
  const { PictureBookSubmissionService } = await import("../src/picture-books/picture-book-submission.service.js");
  const { randomUUID } = await import("node:crypto");
  const prisma = getPrismaClient(), service = new PictureBookSubmissionService({} as never, {} as never);
  const tag = `Order${randomUUID()}`;
  const user = await prisma.user.create({ data: { email: `${tag}@test.invalid`, nickname: "等级排序测试", passwordHash: "fixture" } });
  try {
    const now = Date.now();
    for (const [index, delta, sort] of [[1, 1000, 300], [2, 2000, 200], [3, 3000, 100]] as const) {
      const title = `${tag} ${index}`;
      const book = await prisma.pictureBook.create({ data: { userId: user.id, title, brief: title, style: "watercolor", pageCount: 1, messages: [], characters: [], pages: [] } });
      const snapshot = { type: "PICTURE_BOOK", title, pages: [] };
      await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot, snapshotHash: `fixture-${index}`, publishedSnapshot: snapshot, publishedAt: new Date(now + delta), publishedCoverUrl: "/cover.png", catalogSortAt: new Date(now + sort) } });
    }
    const result = await service.publicList(1, 20, tag);
    assert.deepEqual(result.items.map(item => item.title), [`${tag} 1`, `${tag} 2`, `${tag} 3`]);
    assert.equal(result.total, 3);
    assert.equal((await service.publicList(1, 20, `${tag}%`)).total, 0);
  } finally { await prisma.user.delete({ where: { id: user.id } }); }
});

test("专辑在读取绘本快照前锁定目标作品", async () => {
  const { CoursesService } = await import("../src/courses/courses.service.js");
  const service = new CoursesService();
  const calls: string[] = [];
  const tx = {
    $queryRaw: async (_parts: TemplateStringsArray, id: string) => { calls.push(`lock:${id}`); return []; },
    mediaAsset: { findUnique: async () => ({ createdByUserId: "owner", mediaType: "IMAGE" }) },
    videoGuideLesson: { findMany: async () => [] }, englishGuidedStudyMaterial: { findMany: async () => [] }, learningFlashcardDeck: { findMany: async () => [] },
    pictureBook: { findMany: async () => { calls.push("read"); return [{ id: "book", userId: "owner", status: "COMPLETED", title: "Book" }]; } }
  };
  await (service as unknown as { validateCourseInput: (tx: unknown, user: string, input: unknown) => Promise<unknown> }).validateCourseInput(tx, "owner", { coverMediaId: "cover", items: [{ materialType: "PICTURE_BOOK", materialId: "book", displayName: "Book" }], name: "album", summary: "summary", tags: [] });
  assert.deepEqual(calls, ["lock:book", "read"]);
});

test("并发创建专辑会等待绘本修改并读取新等级", async () => {
  const { getPrismaClient } = await import("@xueleai/database");
  const { CoursesService } = await import("../src/courses/courses.service.js");
  const { randomUUID } = await import("node:crypto");
  const prisma = getPrismaClient(), service = new CoursesService(), tag = randomUUID();
  const user = await prisma.user.create({ data: { email: `${tag}@test.invalid`, nickname: "并发测试", passwordHash: "fixture" } });
  try {
    const cover = await prisma.mediaAsset.create({ data: { createdByUserId: user.id, filename: `cover-${tag}.png`, originalName: "cover.png", mimeType: "image/png", size: 1, url: "/cover.png", mediaType: "IMAGE" } });
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "Book", brief: "Book", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages: [] } });
    let unlock!: () => void, acquired!: () => void;
    const holding = new Promise<void>(resolve => { unlock = resolve; }), locked = new Promise<void>(resolve => { acquired = resolve; });
    const writer = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "picture_books" WHERE "id" = ${book.id} FOR UPDATE`; await tx.pictureBook.update({ where: { id: book.id }, data: { englishLevel: 2 } }); acquired(); await holding; });
    await locked;
    let done = false;
    const reader = prisma.$transaction(async tx => {
      const input = { coverMediaId: cover.id, items: [{ materialType: "PICTURE_BOOK", materialId: book.id, displayName: "Book" }], name: "album", summary: "summary", tags: [] };
      const value = await (service as unknown as { validateCourseInput: (tx: unknown, user: string, input: unknown) => Promise<{ items: Array<{ snapshot: { englishLevel?: number } }> }> }).validateCourseInput(tx, user.id, input);
      done = true; return value;
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(done, false); unlock(); await writer;
    assert.equal((await reader).items[0]?.snapshot.englishLevel, 2);
  } finally { await prisma.user.delete({ where: { id: user.id } }); }
});
