import assert from "node:assert/strict";
import test from "node:test";

import {
  forgotPasswordLoginHref,
  passwordConfirmationError
} from "../src/lib/email-auth.js";

test("忘记密码成功后跳转到登录页并保留安全 next 参数", () => {
  assert.equal(forgotPasswordLoginHref(), "/login?reset=1");
  assert.equal(
    forgotPasswordLoginHref("/dashboard/billing"),
    "/login?next=%2Fdashboard%2Fbilling&reset=1"
  );
  assert.equal(forgotPasswordLoginHref("//evil.example.com"), "/login?reset=1");
  assert.equal(forgotPasswordLoginHref("/admin"), "/login?reset=1");
});

test("重置密码会校验两次输入的新密码", () => {
  assert.equal(passwordConfirmationError("NewUnit123456", "NewUnit123456"), null);
  assert.equal(passwordConfirmationError("NewUnit123456", "WrongUnit123456"), "两次输入的密码不一致");
  assert.equal(passwordConfirmationError("short", "short"), "密码至少 8 位");
  assert.equal(passwordConfirmationError("12345", "12345", 6), "密码至少 6 位");
  assert.equal(passwordConfirmationError("123456", "123456", 6), null);
});
