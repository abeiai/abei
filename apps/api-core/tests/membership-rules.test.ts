import assert from "node:assert/strict";
import test from "node:test";
import { calculateMembershipPrice, membershipPeriodEnd } from "../src/membership/membership-rules.js";
test("prices round in cents, manual overrides and zero credits are explicit", () => {
  assert.deepEqual(calculateMembershipPrice({originalPriceCny:"19.99",discountPercent:85,credits:1000}), {amountCny:"16.99",pricePer100Credits:"1.70"});
  assert.deepEqual(calculateMembershipPrice({originalPriceCny:"19.99",discountPercent:85,salePriceCny:"10",credits:0}), {amountCny:"10.00",pricePer100Credits:null});
  for (const value of ["-1", "0", "1.001", "NaN", "100000000"]) assert.throws(()=>calculateMembershipPrice({originalPriceCny:value,credits:100}));
  assert.throws(()=>calculateMembershipPrice({originalPriceCny:"10",salePriceCny:"11",credits:100}));
  assert.throws(()=>calculateMembershipPrice({originalPriceCny:"10",discountPercent:0,credits:100}));
});
test("calendar periods clamp month end in Beijing and preserve local time", () => {
  assert.equal(membershipPeriodEnd(new Date("2024-01-31T17:00:00Z"),"MONTH").toISOString(),"2024-02-29T17:00:00.000Z");
  assert.equal(membershipPeriodEnd(new Date("2024-02-29T02:00:00Z"),"YEAR").toISOString(),"2025-02-28T02:00:00.000Z");
  assert.equal(membershipPeriodEnd(new Date("2024-01-31T02:00:00Z"),"QUARTER").toISOString(),"2024-04-30T02:00:00.000Z");
});
