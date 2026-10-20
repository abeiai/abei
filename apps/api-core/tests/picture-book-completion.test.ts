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
    pictureBookSubmission: {
      findUnique: async () => null,
      upsert: async () => { submitted = true; return { id: "submission", status: "PENDING", reviewNote: null, submittedAt: new Date(), updatedAt: new Date() }; }
    }
  };
  Object.assign(submission, { prisma: { $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction) } });
  return { completion, submission, saved: () => saved, submitted: () => submitted };
}

test("无字绘本和本地上传图片无需提示词或语音即可保存并投稿", async () => {
  const book = fixture();
  const service = services(book);
  assert.equal((await service.completion.complete("owner", "book")).status, "COMPLETED");
  assert.equal((await service.submission.submit("owner", "book")).status, "PENDING");
  assert.ok(service.saved());
  assert.ok(service.submitted());
});

test("部分页面没有语音不影响投稿", async () => {
  const book = fixture();
  book.pages[1]!.audioUrl = "/uploads/page-1.mp3";
  const service = services(book);
  await service.completion.complete("owner", "book");
  assert.equal((await service.submission.submit("owner", "book")).status, "PENDING");
});

test("缺少封面或任一内页图片时不能保存或投稿", async () => {
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

test("缺页时仍然不能保存或投稿", async () => {
  const book = fixture();
  book.pages = book.pages.slice(0, 1);
  const service = services(book);
  await assert.rejects(service.completion.complete("owner", "book"), /图片/);
  book.status = "COMPLETED";
  await assert.rejects(service.submission.submit("owner", "book"), /图片/);
  assert.equal(service.saved(), false);
  assert.equal(service.submitted(), false);
});
