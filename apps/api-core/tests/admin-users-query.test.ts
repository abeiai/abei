import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { adminUserFilters } from "../src/operations/admin-user-query.js";
import { AdminUsersService } from "../src/operations/admin-users.service.js";
import { AdminUsersController } from "../src/operations/admin-users.controller.js";

test("用户搜索匹配 ID、邮箱、昵称，状态与注册日期同时生效", () => {
  const { where, page, pageSize } = adminUserFilters({ q: " Alice ", status: "DISABLED", startDate: "2026-10-01", endDate: "2026-10-10", page: "3", pageSize: "50" });
  assert.deepEqual(where.OR, [
    { id: { contains: "Alice", mode: "insensitive" } },
    { email: { contains: "Alice", mode: "insensitive" } },
    { nickname: { contains: "Alice", mode: "insensitive" } }
  ]);
  assert.equal(where.status, "DISABLED");
  assert.deepEqual(where.createdAt, { gte: new Date("2026-09-30T16:00:00Z"), lt: new Date("2026-10-10T16:00:00Z") });
  assert.equal(page, 3);
  assert.equal(pageSize, 50);
});

test("默认每页 20 条，搜索中的百分号和下划线按普通字符处理", () => {
  assert.deepEqual(adminUserFilters({}), { where: {}, page: 1, pageSize: 20 });
  assert.deepEqual(adminUserFilters({ q: "a_%" }).where.OR?.[0], { id: { contains: "a\\_\\%", mode: "insensitive" } });
  assert.deepEqual(adminUserFilters({ endDate: "2024-02-29" }).where.createdAt, { gte: undefined, lt: new Date("2024-02-29T16:00:00Z") });
});

test("无效页码、日期、状态和重复查询值返回中文参数错误", () => {
  const invalidQueries = [
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "1e2" }, { page: "9007199254740992" },
    { pageSize: "1000" }, { pageSize: "2e1" }, { status: "DELETED" }, { q: "x".repeat(101) },
    { startDate: "2026-02-30" }, { endDate: "2026-13-01" }, { startDate: "0000-01-01" },
    { startDate: "2026-10-10", endDate: "2026-10-01" }, { q: ["a", "b"] }, { status: { invalid: true } }
  ];
  for (const query of invalidQueries) assert.throws(() => adminUserFilters(query), error => {
    const exception = error as { code: number; message: string; getStatus(): number };
    return exception.code === 40001 && exception.getStatus() === 400 && /[\u4e00-\u9fff]/.test(exception.message);
  });
});

function fixture(total: number) {
  const calls: Array<Record<string, unknown>> = [];
  const service = Object.assign(Object.create(AdminUsersService.prototype) as AdminUsersService, {
    prisma: { $transaction: async (run: (tx: unknown) => unknown) => run({ user: {
      count: async (query: Record<string, unknown>) => { calls.push(query); return total; },
      findMany: async (query: Record<string, unknown>) => {
        calls.push(query);
        return Array.from({ length: Math.min(Number(query.take), Math.max(0, total - Number(query.skip))) }, (_, index) => ({
          id: `user-${Number(query.skip) + index}`, email: "user@example.test", nickname: "测试用户", status: "ACTIVE",
          createdAt: new Date("2026-10-01"), lastLoginAt: null, wallet: null
        }));
      }
    } }) }
  });
  return { service, calls };
}

test("第 6 页可以查询超过原 100 条上限的用户，总数与数据使用相同筛选条件", async () => {
  const { service, calls } = fixture(125);
  const result = await service.listUsersPage({ q: "测试", status: "ACTIVE", page: "6" });
  assert.equal(result.total, 125);
  assert.equal(result.totalPages, 7);
  assert.equal(result.page, 6);
  assert.equal(result.items.length, 20);
  assert.equal(result.items[0]?.id, "user-100");
  assert.equal(result.items[0]?.availableCredits, 0);
  assert.deepEqual(calls[0]?.where, calls[1]?.where);
  assert.deepEqual(calls[1]?.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("超出总页数定位到末页，空结果仍返回第 1 页", async () => {
  const last = await fixture(125).service.listUsersPage({ page: "999999" });
  assert.equal(last.page, 7);
  assert.equal(last.items.length, 5);
  const empty = await fixture(0).service.listUsersPage({ page: "999999" });
  assert.deepEqual(empty, { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
});

test("查询接口先验证管理员，未登录时不读取用户数据", async () => {
  let queried = false;
  const denied = new AdminUsersController({ listUsersPage: async () => { queried = true; } } as never, { me: async () => { throw new Error("请先登录管理员账号"); } } as never);
  await assert.rejects(denied.search({}, { page: "1" }), /请先登录管理员账号/);
  assert.equal(queried, false);
  const query = { q: "test", page: "2" };
  const allowed = new AdminUsersController({ listUsersPage: async (received: unknown) => { assert.deepEqual(received, query); return { items: [], total: 0 }; } } as never, { me: async () => ({ id: "admin" }) } as never);
  assert.deepEqual(await allowed.search({}, query), { code: 0, message: "成功", data: { items: [], total: 0 } });
});

test("原用户列表继续返回最近 100 位用户数组，供后台概览使用", async () => {
  const result = await fixture(125).service.listUsers();
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 100);
});
