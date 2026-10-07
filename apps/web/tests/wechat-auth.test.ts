import assert from "node:assert/strict";
import test from "node:test";
import { publicAccountLabel, publicEmailLabel } from "../src/lib/user-identity.js";

test("微信占位邮箱不会显示给用户", () => {
  assert.equal(
    publicEmailLabel("wechat-hash@users.xueleai.local"),
    "未绑定邮箱"
  );
  assert.equal(publicEmailLabel("user@example.com"), "user@example.com");
  assert.equal(
    publicAccountLabel({
      nickname: "微信用户",
      phone: null,
      email: "wechat-hash@users.xueleai.local"
    }),
    "微信用户"
  );
  assert.equal(
    publicAccountLabel({
      nickname: "微信用户",
      phone: "13800138000",
      email: "wechat-hash@users.xueleai.local"
    }),
    "138****8000"
  );
  assert.equal(
    publicAccountLabel({
      nickname: "邮箱用户",
      phone: null,
      email: "user@example.com"
    }),
    "user@example.com"
  );
});
