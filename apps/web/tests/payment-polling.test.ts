import assert from "node:assert/strict";
import test from "node:test";

import {
  isPendingPaymentStatus,
  isPaidPaymentSyncPayload,
  paymentSyncPath
} from "../src/lib/payment-polling.js";

test("支付轮询使用用户订单同步接口", () => {
  assert.equal(paymentSyncPath("order-1"), "/api/payment/orders/order-1/sync");
  assert.equal(paymentSyncPath("order/with/slash"), "/api/payment/orders/order%2Fwith%2Fslash/sync");
});

test("支付轮询只在同步结果确认已支付时跳转", () => {
  assert.equal(
    isPaidPaymentSyncPayload({
      code: 0,
      message: "成功",
      data: {
        channelStatus: "PAID",
        order: {
          status: "PAID"
        }
      }
    }),
    true
  );
  assert.equal(
    isPaidPaymentSyncPayload({
      code: 0,
      message: "成功",
      data: {
        channelStatus: "UNPAID",
        order: {
          status: "PAYING"
        }
      }
    }),
    false
  );
});

test("支付轮询只对待处理订单继续查单", () => {
  assert.equal(isPendingPaymentStatus("CREATED"), true);
  assert.equal(isPendingPaymentStatus("PAYING"), true);
  assert.equal(isPendingPaymentStatus("PAID"), false);
  assert.equal(isPendingPaymentStatus("CLOSED"), false);
  assert.equal(isPendingPaymentStatus("FAILED"), false);
  assert.equal(isPendingPaymentStatus(null), false);
});
