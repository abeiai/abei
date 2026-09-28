import assert from "node:assert/strict";
import test from "node:test";
import { AdminReferralController, referralRecordQuery } from "../src/referrals/admin-referral.controller.js";

test("推荐记录在查询数据前要求管理员身份", async () => {
  let accessed = false;
  const controller = new AdminReferralController({ me: async () => { throw new Error("请先登录管理员账号"); } } as never, { records: async () => { accessed = true; } } as never);
  await assert.rejects(controller.records({}, {}), /管理员/);
  assert.equal(accessed, false);
});
test("推荐人精确筛选及分页参数规范化", () => {
  const query = referralRecordQuery({ referrerId: " user-id ", q: " Eric ", page: "2" });
  assert.equal(query.page, 2);
  assert.equal(query.where.referrerId, "user-id");
  assert.ok(query.where.referrer);
  assert.equal(referralRecordQuery({ page: "-1" }).page, 1);
  assert.equal(referralRecordQuery({ page: "1.5" }).page, 1);
  assert.throws(() => referralRecordQuery({ q: "x".repeat(101) }), /筛选/);
});
test("用户关键字仅匹配推荐人，不匹配被推荐人", () => {
  const query = referralRecordQuery({ q: "eric" });
  assert.equal("invitee" in query.where, false);
  const filter = JSON.stringify(query.where);
  assert.match(filter, /nickname/); assert.match(filter, /email/); assert.match(filter, /referralHandles/);
  assert.deepEqual(referralRecordQuery({}).where, {});
});
