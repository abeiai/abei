import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";
import { AdminPictureBookSubmissionsController, type SourceDto } from "../src/picture-books/picture-book-submission.controller.js";

test("公开播放只显示已发布版本的来源信息", async () => {
  const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  Object.assign(service, { prisma: { pictureBookSubmission: { findFirst: async () => ({
    pictureBookId: "book", publishedSnapshot: { title: "书", pages: [] },
    sourceInfo: { name: "待审核", url: "https://draft.example", iconUrl: "", statement: "草稿" },
    publishedSourceInfo: { name: "Book Dash", url: "https://bookdash.org/", iconUrl: "/api/media/files/logo.png", statement: "已发布声明" }
  }) }, pictureBookEdition: { findUnique: async () => null } } });
  const result = await service.publicBook("book");
  assert.deepEqual(result.source, { name: "Book Dash", url: "https://bookdash.org/", iconUrl: "/api/media/files/logo.png", statement: "已发布声明" });
});

test("来源更新接口拒绝未登录管理员", async () => {
  let modified = false;
  const service = { updateSource: async () => { modified = true; } };
  const controller = new AdminPictureBookSubmissionsController(service as never, { me: async () => { throw new Error("请先登录管理后台"); } } as never);
  await assert.rejects(() => controller.source({}, "id", {} as SourceDto), /登录管理后台/);
  assert.equal(modified, false);
});

test("来源网址不能使用脚本协议", async () => {
  const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  await assert.rejects(() => service.updateSource("id", "2026-01-01T00:00:00.000Z", {name:"来源", url:"javascript:alert(1)", iconUrl:"", statement:""}), /网址/);
});
