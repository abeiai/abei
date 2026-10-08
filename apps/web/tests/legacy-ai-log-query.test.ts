import assert from "node:assert/strict";
import test from "node:test";
import { legacyLogListHref, normalizeLegacyLogSearch } from "../src/lib/legacy-ai-log-query.js";

test("切页保留日志来源、类型、用户和日期，不回到任务清单", () => {
  const query = normalizeLegacyLogSearch({ source: "LEGACY", kind: "AUDIO", user: "旧用户 123", startDate: "2026-10-01", endDate: "2026-10-08", page: "2" });
  const url = new URL(legacyLogListHref(query, 3), "http://localhost:3600");
  assert.equal(url.pathname, "/admin/ai-logs");
  assert.equal(url.searchParams.get("source"), "LEGACY");
  assert.equal(url.searchParams.get("kind"), "AUDIO");
  assert.equal(url.searchParams.get("user"), "旧用户 123");
  assert.equal(url.searchParams.get("startDate"), "2026-10-01");
  assert.equal(url.searchParams.get("endDate"), "2026-10-08");
  assert.equal(url.searchParams.get("page"), "3");
});

test("重复查询参数和非法页码给出可处理的中文错误", () => {
  assert.throws(() => normalizeLegacyLogSearch({ user: ["one", "two"] }), /查询参数/);
  for (const page of ["-1", "0", "NaN", "1.5", "10001"]) {
    assert.throws(() => normalizeLegacyLogSearch({ source: "LEGACY", page }), /页码/);
  }
});

test("空查询保持默认来源，重置页码不会丢失模型和状态", () => {
  const query = normalizeLegacyLogSearch({ source: "LEGACY", model: "旧模型", status: "FAILED", page: "5" });
  const url = new URL(legacyLogListHref(query, 1), "http://localhost:3600");
  assert.equal(url.searchParams.get("page"), "1");
  assert.equal(url.searchParams.get("model"), "旧模型");
  assert.equal(url.searchParams.get("status"), "FAILED");
  assert.equal(normalizeLegacyLogSearch({}).source, "NEW");
});
