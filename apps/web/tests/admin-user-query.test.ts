import assert from "node:assert/strict";
import test from "node:test";
import { adminUserPageHref, adminUserQuery, readAdminUserFilters } from "../src/lib/admin-user-query";

test("翻页保留搜索、状态、日期和每页条数，并替换当前页码", () => {
  const filters = { q: "张三+test@example.com", status: "ACTIVE", startDate: "2026-10-01", endDate: "2026-10-10", pageSize: "50", page: "2" };
  const url = new URL(adminUserPageHref(filters, 5), "http://localhost:3600");
  assert.equal(url.pathname, "/admin/users");
  assert.deepEqual(Object.fromEntries(url.searchParams), { ...filters, page: "5" });
  assert.equal(url.searchParams.getAll("page").length, 1);
});

test("只接收用户列表查询字段，重复参数取第一项并清理空白", () => {
  const filters = readAdminUserFilters({ q: [" 张三 ", "另一个用户"], status: "", page: "3", ignored: "value" });
  assert.equal(filters.q, "张三");
  assert.equal(filters.page, "3");
  assert.equal("ignored" in filters, false);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(adminUserQuery(filters))), { q: "张三", page: "3" });
  assert.equal(adminUserQuery({}), "");
});
