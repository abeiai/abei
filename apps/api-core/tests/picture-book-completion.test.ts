import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";

function fixture() {
  return {
    id: "book", userId: "owner", title: "无字绘本", pageCount: 2, version: 0, status: "EDITING",
    pages: [0, 1, 2].map(position => ({ position, caption: "", imagePrompt: "", narration: "",
      imageUrl: `/uploads/page-${position}.png`, audioUrl: null as string | null }))
  };
}

function services(book: ReturnType<typeof fixture>) {
  let saved = false, submitted = false;
  let submittedSnapshot: unknown;
  const completion = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(completion, {
    get: async () => book,
    prisma: { pictureBook: { updateMany: async ({ data }: { data: { status: string } }) => {
      book.status = data.status; saved = true; return { count: 1 };
    } } },
    courseReviewService: { recordMaterialChange: async () => undefined }
  });
  const submission = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  const transaction = {
    $queryRaw: async () => [],
    pictureBook: { findFirst: async () => book },
    creatorWork: { findFirst: async () => null },
    courseRevisionItem: { findFirst: async () => null },
    pictureBookSubmission: {
      findUnique: async () => null,
      upsert: async (input: { create: { snapshot: unknown } }) => { submitted = true; submittedSnapshot = input.create.snapshot; return { id: "submission", status: "PENDING", reviewNote: null, submittedAt: new Date(), updatedAt: new Date() }; }
    }
  };
  Object.assign(submission, { prisma: { $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction) } });
  return { completion, submission, saved: () => saved, submitted: () => submitted, snapshot: () => submittedSnapshot };
}

test("无字绘本和本地上传图片无需提示词或语音即可保存并公开分享", async () => {
  const book = fixture();
  const service = services(book);
  assert.equal((await service.completion.complete("owner", "book")).status, "COMPLETED");
  assert.equal((await service.submission.submit("owner", "book")).status, "PENDING");
  assert.ok(service.saved());
  assert.ok(service.submitted());
});

test("部分页面没有语音不影响公开分享", async () => {
  const book = fixture();
  book.pages[1]!.audioUrl = "/uploads/page-1.mp3";
  const service = services(book);
  await service.completion.complete("owner", "book");
  assert.equal((await service.submission.submit("owner", "book")).status, "PENDING");
});

test("缺少封面或任一内页图片时不能保存或公开分享", async () => {
  for (const position of [0, 1, 2]) {
    for (const imageUrl of [null, "", "   "]) {
      const book = fixture();
      Object.assign(book.pages[position]!, { caption: "有文字", imagePrompt: "有提示词", imageUrl });
      const service = services(book);
      await assert.rejects(service.completion.complete("owner", "book"), /图片/);
      assert.equal(service.saved(), false);
      book.status = "COMPLETED";
      await assert.rejects(service.submission.submit("owner", "book"), /图片/);
      assert.equal(service.submitted(), false);
    }
  }
});

test("缺页时仍然不能保存或公开分享", async () => {
  const book = fixture();
  book.pages = book.pages.slice(0, 1);
  const service = services(book);
  await assert.rejects(service.completion.complete("owner", "book"), /图片/);
  book.status = "COMPLETED";
  await assert.rejects(service.submission.submit("owner", "book"), /页数或页码/);
  assert.equal(service.saved(), false);
  assert.equal(service.submitted(), false);
});

test("旧版封面计入总页数且从1编号的17页绘本可公开分享，原稿页码保持不变", async () => {
  const book = fixture();
  book.pageCount = 17;
  book.pages = Array.from({ length: 17 }, (_, index) => ({ ...book.pages[0]!, position: index + 1, imageUrl: `/uploads/legacy-${index + 1}.png` }));
  const original = structuredClone(book.pages);
  const service = services(book);
  await service.completion.complete("owner", "book");
  assert.equal((await service.submission.submit("owner", "book")).status, "PENDING");
  const snapshot = service.snapshot() as { pages: typeof book.pages };
  assert.deepEqual(snapshot.pages.map(page => page.position), Array.from({ length: 17 }, (_, index) => index));
  assert.equal(snapshot.pages[0]?.imageUrl, original[0]?.imageUrl);
  assert.equal(snapshot.pages.at(-1)?.imageUrl, original.at(-1)?.imageUrl);
  assert.equal(snapshot.pages[0]?.narration, "");
  assert.deepEqual(book.pages, original);
});

test("旧版绘本缺图、缺页、重复页码或页码断档时仍拒绝公开分享", async () => {
  for (const kind of ["image", "missing", "duplicate", "gap"] as const) {
    const book = fixture();
    book.pageCount = 3;
    book.status = "COMPLETED";
    book.pages = book.pages.map((page, index) => ({ ...page, position: index + 1 }));
    if (kind === "image") book.pages[1]!.imageUrl = "";
    if (kind === "missing") book.pages.pop();
    if (kind === "duplicate") book.pages[1]!.position = 1;
    if (kind === "gap") book.pages[1]!.position = 4;
    const service = services(book);
    await assert.rejects(service.submission.submit("owner", "book"));
    assert.equal(service.submitted(), false);
  }
});
