import assert from "node:assert/strict";
import test from "node:test";
import { membershipPricePreview, membershipProduct, membershipNextStart, membershipEndDate } from "../src/lib/membership";

test("会员价格按分四舍五入，手动价优先，零点数不产生单价", () => {
  assert.deepEqual(membershipPricePreview({ originalPriceCny: "99.99", discountPercent: 80, salePriceCny: null, credits: 300 }), { amountCny: "79.99", pricePer100Credits: "26.66" });
  assert.deepEqual(membershipPricePreview({ originalPriceCny: "100", discountPercent: 80, salePriceCny: "66", credits: 0 }), { amountCny: "66.00", pricePer100Credits: null });
});

test("季付商品包含唯一购买编码和整个周期清零提示", () => {
  const product = membershipProduct({ id: "vip", name: "高级会员", rank: 2, isEnabled: true, storageGb: 50, learnerLimit: 5, benefits: [], prices: [] }, { period: "QUARTER", originalPriceCny: "100", discountPercent: 100, salePriceCny: null, credits: 1000, isEnabled: true, amountCny: "100.00", pricePer100Credits: "10.00" });
  assert.equal(product.code, "membership:vip:QUARTER");
  assert.equal(product.billingMode, "SUBSCRIPTION");
  assert.match(product.description, /一次性.*周期结束清零/);
  assert.match(product.benefitsMarkdown, /5/);
});


test("续费开始时间取当前和待生效周期的最晚结束时间", () => {
  const now = new Date("2026-09-12T00:00:00Z");
  assert.equal(membershipNextStart({current:null,upcoming:[],membershipCredits:0}, now), null);
  const period = {id:"period",name:"会员",rank:1,storageGb:10,learnerLimit:3,credits:100,remainingCredits:100,benefits:[],startsAt:"2026-09-01T00:00:00Z",endsAt:"2026-10-01T00:00:00Z"};
  assert.equal(membershipNextStart({current:period,upcoming:[{...period, endsAt:"2026-12-01T00:00:00Z"}],membershipCredits:100},now), "2026-12-01T00:00:00Z");
  assert.equal(membershipNextStart({current:{...period, endsAt:"2026-09-11T00:00:00Z"},upcoming:[],membershipCredits:0},now), null);
});

test("会员到期预览按北京时间处理月末、季付和闰年", () => {
  assert.equal(membershipEndDate(new Date("2026-01-30T20:00:00Z"), "MONTH").toISOString(), "2026-02-27T20:00:00.000Z");
  assert.equal(membershipEndDate(new Date("2026-09-12T00:00:00Z"), "QUARTER").toISOString(), "2026-12-12T00:00:00.000Z");
  assert.equal(membershipEndDate(new Date("2024-02-29T00:00:00Z"), "YEAR").toISOString(), "2025-02-28T00:00:00.000Z");
});
