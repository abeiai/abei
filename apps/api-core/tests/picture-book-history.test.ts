import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PictureBookGuideService } from "../src/picture-book-guide/picture-book-guide.service.js";
import { parseHistoryQuery } from "../src/common/history-query.js";

test("绘本历史按当前用户搜索、分页，并返回未截断的总数", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const database = { pictureBook: {
    count: async (args: Record<string, unknown>) => { calls.push(args); return 67; },
    findMany: async (args: Record<string, unknown>) => { calls.push(args); return [{ id: "book-1", title: "月球", theme: "探险", audience: "幼儿园", style: "watercolor", status: "EDITING", pageCount: 8, pages: [], createdAt: new Date(), updatedAt: new Date(), submission: null, revisionItems: [], version: 1 }]; }
  }, creatorWork: { findMany: async () => [] } };
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(service, { prisma: database });
  const result = await service.history("user-a", { q: " 月球 ", page: "2", pageSize: "10" });
  assert.equal(result.total, 67);
  assert.equal(result.items[0]?.title, "月球");
  assert.equal(result.page, 2);
  assert.deepEqual(calls[0]?.where, { userId: "user-a", OR: [{ title: { contains: "月球", mode: "insensitive" } }, { theme: { contains: "月球", mode: "insensitive" } }] });
  assert.equal(calls[1]?.skip, 10);
  assert.equal(calls[1]?.take, 10);
});

test("导读历史搜索标题或 PDF 名，保留用户范围与分页", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const database = { pictureBookGuide: {
    count: async (args: Record<string, unknown>) => { calls.push(args); return 63; },
    findMany: async (args: Record<string, unknown>) => { calls.push(args); return []; }
  } };
  const service = Object.create(PictureBookGuideService.prototype) as PictureBookGuideService;
  Object.assign(service, { prisma: database });
  const result = await service.history("user-b", { q: "故事", page: "3", pageSize: "20" });
  assert.deepEqual(result, { items: [], total: 63, page: 3, pageSize: 20 });
  assert.deepEqual(calls[0]?.where, { userId: "user-b", OR: [{ title: { contains: "故事", mode: "insensitive" } }, { pdfName: { contains: "故事", mode: "insensitive" } }] });
  assert.equal(calls[1]?.skip, 40);
  assert.equal(calls[1]?.take, 20);
});

test("历史检索拒绝无效或过大的查询参数", () => {
  assert.throws(() => parseHistoryQuery({ q: ["甲", "乙"] as never }), /历史记录查询参数无效/);
  assert.throws(() => parseHistoryQuery({ page: "999999999999999" }), /历史记录查询参数无效/);
  assert.throws(() => parseHistoryQuery({ pageSize: "51" }), /历史记录查询参数无效/);
});
