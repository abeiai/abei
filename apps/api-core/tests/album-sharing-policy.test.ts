import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";
import { CreatorService } from "../src/creator/creator.service.js";

const message = "本作品已经通过专辑分享，请不要重复分享";
function fixture(inAlbum = true) {
  let writes = 0;
  const queries: unknown[] = [];
  const tx = {
    $queryRaw: async (...args: unknown[]) => { queries.push(args); return []; },
    $executeRaw: async () => 0,
    pictureBook: { findFirst: async () => ({ id: "book", userId: "owner" }) },
    courseRevisionItem: { findFirst: async (query: unknown) => { queries.push(query); return inAlbum ? { id: "member" } : null; } },
    creatorGrant: { findUnique: async () => ({ userId: "owner", clientId: "client", audience: "audience", scopes: ["creator:submit"], expiresAt: new Date(Date.now() + 60000), user: { status: "ACTIVE" } }) },
    creatorWork: { findFirst: async () => ({ userId: "owner", kind: "BOOK", resourceId: "book" }) },
    pictureBookSubmission: {
      findUnique: async () => ({ id: "share", pictureBookId: "book", status: "PENDING", snapshot: {}, snapshotHash: "hash" }),
      updateMany: async () => { writes++; return { count: 1 }; },
      upsert: async () => { writes++; return {}; }
    }
  };
  const db = { $transaction: async (run: (context: typeof tx) => unknown) => run(tx) };
  const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  Object.assign(service, { prisma: db });
  const creator = Object.create(CreatorService.prototype) as CreatorService;
  Object.assign(creator, { db, work: async () => ({ resourceId: "book", userId: "owner" }) });
  return { service, creator, tx, queries, writes: () => writes };
}

test("网页单独分享入口拒绝已由当前公开且审核通过的专辑分享的作品", async () => {
  const f = fixture();
  await assert.rejects(f.service.submit("owner", "book"), error => error instanceof Error && error.message === message);
  assert.equal(f.writes(), 0);
  const query = f.queries.find(q => q && typeof q === "object" && "where" in q) as { where: unknown };
  assert.deepEqual(query.where, { materialType: "PICTURE_BOOK", pictureBookId: "book", revision: { status: "APPROVED", approvedFor: { is: { publishedAt: { not: null } } } } });
});

test("审核通过单独分享前再次检查专辑，避免等待审核期间重复发布", async () => {
  const f = fixture();
  await assert.rejects(f.service.decide("admin", "share", new Date().toISOString(), "APPROVED"), error => error instanceof Error && error.message === message);
  assert.equal(f.writes(), 0);
});

test("创作助手单独分享入口同样拒绝，不能通过客户端绕过网页规则", async () => {
  const f = fixture();
  const principal = { userId: "owner", clientId: "client", audience: "audience", grantId: "grant", scopes: ["creator:submit"] };
  await assert.rejects(f.creator.submitBook(principal as never, "book", { expectedVersion: 1 }), error => error instanceof Error && error.message === message);
  assert.equal(f.writes(), 0);
});

test("只撤销单独公开入口，保留审核历史、专辑课件版本和原稿", async () => {
  const { withdrawStandaloneBookShares, pictureBookSharingState } = await import("../src/courses/album-sharing.js");
  let saved: unknown;
  const tx = { pictureBookSubmission: { updateMany: async (input: unknown) => { saved = input; return { count: 2 }; } } };
  await withdrawStandaloneBookShares(tx as never, ["a", "b", "a"]);
  assert.deepEqual(saved, { where: { pictureBookId: { in: ["a", "b"] }, publishedAt: { not: null } }, data: { publishedAt: null, publishedVersion: { increment: 1 } } });
  const prior = { status: "APPROVED", publishedAt: new Date() };
  assert.deepEqual(pictureBookSharingState({ submission: prior, revisionItems: [{ id: "member" }] }), { sharedViaAlbum: true, submission: null });
  assert.deepEqual(pictureBookSharingState({ submission: { ...prior, publishedAt: null } }), { sharedViaAlbum: false, submission: null });
  assert.equal(pictureBookSharingState({ submission: prior }).submission, prior);
});
