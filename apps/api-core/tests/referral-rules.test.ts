import assert from "node:assert/strict";
import test from "node:test";
import { referralRules } from "../src/referrals/referral-rules.js";

test("自定义名称至少四位字母，统一小写并禁止品牌及保留名称", () => {
  assert.equal(referralRules.normalizeAlias(" Eric "), "eric");
  for (const value of ["abc", "eric1", "eric-me", "学乐", "xuele", "myXueleAi", "admin", "official", "a".repeat(33)]) {
    assert.throws(() => referralRules.normalizeAlias(value));
  }
});
test("归因恰好72小时到期，未来时间无效", () => {
  const start = new Date("2026-09-12T00:00:00Z");
  assert.equal(referralRules.isActive(start, new Date(start.getTime() + 72 * 3600000 - 1)), true);
  assert.equal(referralRules.isActive(start, new Date(start.getTime() + 72 * 3600000)), false);
  assert.equal(referralRules.isActive(start, new Date(start.getTime() - 1)), false);
});
test("归因凭据使用随机值且仅保存哈希", () => {
  const tokens = Array.from({ length: 100 }, () => referralRules.newToken());
  assert.equal(new Set(tokens).size, 100);
  assert.match(tokens[0]!, /^[a-f0-9]{64}$/);
  assert.notEqual(referralRules.hashToken(tokens[0]!), tokens[0]);
  assert.equal(referralRules.hashToken(tokens[0]!), referralRules.hashToken(tokens[0]!));
});
