import assert from "node:assert/strict";
import test from "node:test";
import { isMembershipExpiryEntry, isPointConsumeEntry, membershipExpiryDescription } from "../src/lib/membership-ledger";

test("会员到期及跨期解冻归还清零保留说明，均不计入实际消耗", () => {
  for (const idempotencyKey of ["membership:period-1:expire", "membership-release-expired:operation-1"]) {
    const entry = {type:"ADMIN_ADJUST",amount:-20,idempotencyKey,note:"季度会员周期结束，剩余赠点清零"};
    assert.equal(isMembershipExpiryEntry(entry), true);
    assert.equal(isPointConsumeEntry(entry), false);
    assert.equal(membershipExpiryDescription(entry), entry.note);
  }
  assert.equal(isPointConsumeEntry({type:"CONSUME"}), true);
  assert.equal(isMembershipExpiryEntry({type:"ADMIN_ADJUST",amount:20,idempotencyKey:"membership:grant"}), false);
  assert.equal(isMembershipExpiryEntry({type:"ADMIN_ADJUST",amount:-20,idempotencyKey:"admin:adjust"}), false);
});
