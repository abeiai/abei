import assert from "node:assert/strict";
import test from "node:test";

import {
  wechatLoginErrorMessage,
  wechatLoginHref
} from "../src/lib/wechat-auth.js";
import {
  publicAccountLabel,
  publicEmailLabel
} from "../src/lib/user-identity.js";

test("微信登录地址只保留安全 next", () => {
  assert.equal(wechatLoginHref(), "/api/auth/wechat/authorize");
  assert.equal(
    wechatLoginHref("/dashboard/billing"),
    "/api/auth/wechat/authorize?next=%2Fdashboard%2Fbilling"
  );
  assert.equal(wechatLoginHref("//evil.example"), "/api/auth/wechat/authorize");
  assert.equal(wechatLoginHref("/admin/users"), "/api/auth/wechat/authorize");
  assert.equal(wechatLoginHref("https://evil.example"), "/api/auth/wechat/authorize");
});

test("微信错误枚举映射为固定中文提示", () => {
  assert.equal(
    wechatLoginErrorMessage("state"),
    "微信登录状态已失效，请重新尝试"
  );
  assert.equal(
    wechatLoginErrorMessage("identity_conflict"),
    "微信账号关联异常，请联系客服处理"
  );
  assert.equal(
    wechatLoginErrorMessage("mobile_browser"),
    "请在微信中打开本页面，或在电脑上扫码登录"
  );
  assert.equal(wechatLoginErrorMessage("raw-provider-message"), null);
});

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
