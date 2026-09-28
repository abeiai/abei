import assert from "node:assert/strict";
import test from "node:test";
import { AuthController } from "../src/auth/auth.controller.js";
import { ReferralController } from "../src/referrals/referral.controller.js";

test("邮箱及手机注册控制器传递推荐Cookie，普通登录不使用它", async () => {
  const token = "a".repeat(64);
  const received: unknown[] = [];
  const service = {
    register: async (_dto: unknown, _response: unknown, referral: unknown) => { received.push(referral); return {}; },
    loginByPhone: async (_dto: unknown, _response: unknown, referral: unknown) => { received.push(referral); return {}; }
  };
  const controller = new AuthController(service as never, {} as never, {} as never);
  const response = { cookie() {}, clearCookie() {} };
  const request = { headers: { cookie: `xueleai_referral=${token}` } };
  await controller.register({} as never, response, request);
  await controller.phoneLogin({} as never, response, request);
  assert.deepEqual(received, [token, token]);
});

test("学习者会话不能绑定主账号名称或读取主账号推荐统计", async () => {
  let accessed = false;
  const controller = new ReferralController({ bindAlias: async () => { accessed = true; }, me: async () => { accessed = true; } } as never,
    { me: async () => ({ id: "account" }) } as never,
    { requireAccount: async () => { throw new Error("请切换到主账号身份后操作"); } } as never);
  await assert.rejects(controller.alias({}, { name: "eric" }), /主账号/);
  await assert.rejects(controller.me({}), /主账号/);
  assert.equal(accessed, false);
});
