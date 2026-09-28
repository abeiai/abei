import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { AiService } from "../src/ai/ai.service.js";
import { legacyStudentPhotoUrls, parseStudentPhotoOutput } from "../src/ai/student-photo-history.js";

test("证照历史读取已归档的两张图片", () => {
  const output = JSON.stringify({ kind: "STUDENT_PHOTO", images: [
    "student-photos/task/1-0123456789abcdef0123456789abcdef.jpg",
    "student-photos/task/2-0123456789abcdef0123456789abcdef.jpg"
  ], widthMm: 25, heightMm: 35 });
  assert.equal(parseStudentPhotoOutput(output)?.images.length, 2);
  assert.equal(parseStudentPhotoOutput(output)?.widthMm, 25);
});

test("证照历史读取新生成的一张图片", () => {
  const output = JSON.stringify({ kind: "STUDENT_PHOTO", images: [
    "student-photos/task/1-0123456789abcdef0123456789abcdef.jpg"
  ], widthMm: 26, heightMm: 32 });
  assert.equal(parseStudentPhotoOutput(output)?.images.length, 1);
  assert.equal(parseStudentPhotoOutput(output)?.widthMm, 26);
});

test("旧记录提取两张服务商图片，不把提示词当作图片", () => {
  const output = "提示词 https://other.example/a.png\n![生成图片 1](https://dashscope-0484.oss-accelerate.aliyuncs.com/a?Expires=1)\n![生成图片 2](https://dashscope-0484.oss-accelerate.aliyuncs.com/b?Expires=1)";
  assert.equal(legacyStudentPhotoUrls(output).length, 2);
  assert.equal(parseStudentPhotoOutput(output), null);
});

test("证照历史按时间倒序分页，并限定当前用户", async () => {
  const queries: Array<Record<string, unknown>> = [];
  const rows = Array.from({ length: 21 }, (_, index) => ({
    id: `task${21 - index}`, createdAt: new Date(`2026-09-${String(24 - index).padStart(2, "0")}T00:00:00Z`),
    output: JSON.stringify({ kind: "STUDENT_PHOTO", images: ["student-photos/x/1-a.jpg", "student-photos/x/2-b.jpg"] })
  }));
  const service = Object.assign(Object.create(AiService.prototype) as AiService, {
    prisma: { aiTask: { findMany: async (query: Record<string, unknown>) => { queries.push(query); return rows; } } }
  });
  const page = await service.listStudentPhotoHistory({ userId: "owner", mode: "ACCOUNT", learnerId: null });
  assert.equal(page.items.length, 20);
  assert.equal(page.items[0].id, "task21");
  assert.ok(page.nextCursor);
  assert.deepEqual((queries[0].where as Record<string, unknown>).userId, "owner");
  assert.deepEqual(queries[0].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(queries[0].take, 21);
  await service.listStudentPhotoHistory({ userId: "owner", mode: "ACCOUNT", learnerId: null }, page.nextCursor!);
  assert.ok((queries[1].where as Record<string, unknown>).OR);
});

test("读取证照图片时按当前学习者身份查找任务", async () => {
  let where: Record<string, unknown> | null = null;
  const service = Object.assign(Object.create(AiService.prototype) as AiService, {
    prisma: { aiTask: { findFirst: async (query: { where: Record<string, unknown> }) => {
      where = query.where;
      return null;
    } } }
  });
  await assert.rejects(service.getStudentPhotoImage({ userId: "owner", mode: "LEARNER", learnerId: "child" }, "task", 1),
    { message: "证照图片不存在" });
  assert.equal(where?.["userId"], "owner");
  assert.equal(where?.["learnerId"], "child");
});

test("证照提交状态按当前学习者查询，完成后返回可继续裁剪的图片", async () => {
  let where: Record<string, unknown> | null = null;
  const now = new Date();
  const service = Object.assign(Object.create(AiService.prototype) as AiService, {
    prisma: { aiTask: { findMany: async (query: { where: Record<string, unknown> }) => {
      where = query.where;
      return [{ id: "task1", status: "SUCCEEDED", createdAt: now, updatedAt: now,
        output: JSON.stringify({ kind: "STUDENT_PHOTO", images: ["student-photos/task1/1-a.jpg"], widthMm: 26, heightMm: 32 }) }];
    } } }
  });
  const status = await service.getStudentPhotoRequestStatus({ userId: "owner", mode: "LEARNER", learnerId: "child" },
    "c156aa65-32e6-4c3f-a4cb-9a841530437e");
  assert.equal(status.status, "SUCCEEDED");
  assert.equal(status.item?.images[0]?.url, "/api/ai/image/student-photo/history/task1/images/1");
  assert.equal(where?.["userId"], "owner");
  assert.equal(where?.["learnerId"], "child");
  assert.deepEqual((where?.["AND"] as Array<unknown>)[1],
    { input: { path: ["variables", "clientRequestId"], equals: "c156aa65-32e6-4c3f-a4cb-9a841530437e" } });
});

test("备用模型启动前，首次失败任务仍显示处理中", async () => {
  const service = Object.assign(Object.create(AiService.prototype) as AiService, {
    prisma: { aiTask: { findMany: async () => [{ id: "task1", status: "FAILED", createdAt: new Date(), updatedAt: new Date(), output: null }] } }
  });
  const status = await service.getStudentPhotoRequestStatus({ userId: "owner", mode: "ACCOUNT", learnerId: null },
    "c156aa65-32e6-4c3f-a4cb-9a841530437e");
  assert.equal(status.status, "PENDING");
});
