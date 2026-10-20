import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { AuthService } from "../src/auth/auth.service.js";
import { WalletService } from "../src/wallet/wallet.service.js";
import { getPersonalWallet, consumePersonalCredits } from "../src/wallet/personal-credits.js";
import { referralRules } from "../src/referrals/referral-rules.js";

// Run only against a disposable abei database; never the application database.
const enabled = process.env.RUN_REGISTRATION_CREDITS_TEST === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.port, "3604");
  assert.match(url.pathname, /^\/abei_registration_test_/);
}
const response = { cookie() {}, clearCookie() {} };

test("新注册账号获得100点永久余额、可消费并显示注册赠点流水", { skip: !enabled }, async () => {
  const prisma = getPrismaClient();
  const auth = new AuthService();
  const email = `signup-${randomUUID()}@example.invalid`;
  try {
    await prisma.emailVerificationCode.create({ data: {
      email, purpose: "REGISTER", codeHash: createHmac("sha256", process.env.JWT_REFRESH_SECRET!)
        .update(`${email}:REGISTER:123456`).digest("hex"), expiresAt: new Date(Date.now() + 60_000)
    } });
    await auth.register({ email, emailCode: "123456", password: "Test-password-123" }, response);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const wallet = await prisma.$transaction(tx => getPersonalWallet(tx, user.id, new Date("2099-01-01")));
    assert.equal(wallet.availableCredits, 100);
    assert.equal(wallet.membershipCredits, 0);
    assert.equal(wallet.totalTopUpCredits, 0);
    const entries = await new WalletService().listLedger(user.id, { view: "source" });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.typeName, "注册赠点");
    assert.equal(entries[0]!.amount, 100);
    assert.equal(entries[0]!.balanceAfter, 100);
    assert.match(entries[0]!.note ?? "", /永不过期/);
    await assert.rejects(auth.register({ email, emailCode: "123456", password: "Test-password-123" }, response), /已注册/);
    const consumed = await prisma.$transaction(tx => consumePersonalCredits(tx, user.id, `signup-test:${user.id}`, 25));
    assert.equal(consumed.availableCredits, 75);
    assert.equal(await prisma.ledgerEntry.count({ where: { userId: user.id } }), 1);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
});

test("手机首次登录赠100点，再次登录不重复发放", { skip: !enabled }, async () => {
  const prisma = getPrismaClient();
  const auth = new AuthService();
  const phone = `139${String(Date.now()).slice(-8)}`;
  const code = "123456";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await prisma.smsVerificationCode.create({ data: {
        phone, purpose: "LOGIN", sendProvider: "ALIYUN_SMS", codeHash: createHmac("sha256", process.env.JWT_REFRESH_SECRET!)
          .update(`${phone}:LOGIN:${code}`).digest("hex"), expiresAt: new Date(Date.now() + 60_000)
      } });
      await auth.loginByPhone({ phone, code }, response);
      const wallet = await prisma.wallet.findFirstOrThrow({ where: { user: { phone } } });
      assert.equal(wallet.availableCredits, 100);
      assert.equal(await prisma.ledgerEntry.count({ where: { userId: wallet.userId } }), 1);
    }
  } finally {
    await prisma.user.deleteMany({ where: { phone } });
    await prisma.smsVerificationCode.deleteMany({ where: { phone } });
    await prisma.loginFailure.deleteMany({ where: { subject: `USER:phone:${phone}` } });
    await prisma.$disconnect();
  }
});

test("注册赠点与推荐奖励叠加，后续入账失败会回滚账号和赠点", { skip: !enabled }, async () => {
  const prisma = getPrismaClient();
  const auth = new AuthService();
  const suffix = randomUUID();
  const email = `referral-signup-${suffix}@example.invalid`;
  const inviterEmail = `inviter-${suffix}@example.invalid`;
  try {
    const inviter = await prisma.user.create({ data: { email: inviterEmail, passwordHash: "unusable", nickname: "推荐人" } });
    const token = referralRules.newToken();
    await prisma.referralVisit.create({ data: { tokenHash: referralRules.hashToken(token), referrerId: inviter.id, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.emailVerificationCode.create({ data: {
      email, purpose: "REGISTER", codeHash: createHmac("sha256", process.env.JWT_REFRESH_SECRET!)
        .update(`${email}:REGISTER:123456`).digest("hex"), expiresAt: new Date(Date.now() + 60_000)
    } });
    const dto = { email, emailCode: "123456", password: "Test-password-123" };
    Object.assign(auth, { prisma: new Proxy(prisma, { get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return (operation: (tx: unknown) => Promise<unknown>) => target.$transaction(async tx => {
        await operation(tx);
        throw new Error("模拟事务提交前失败");
      });
    } }) });
    await assert.rejects(auth.register(dto, response, token), /模拟事务提交前失败/);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    assert.equal(await prisma.ledgerEntry.count({ where: { userId: inviter.id } }), 0);
    await prisma.emailVerificationCode.updateMany({ where: { email }, data: { consumedAt: null } });
    await new AuthService().register(dto, response, token);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).availableCredits, 600);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: inviter.id } })).availableCredits, 500);
    assert.equal(await prisma.ledgerEntry.count({ where: { userId: user.id } }), 2);
  } finally {
    const inviter = await prisma.user.findUnique({ where: { email: inviterEmail } });
    if (inviter) {
      await prisma.referralReward.deleteMany({ where: { referrerId: inviter.id } });
      await prisma.referralVisit.deleteMany({ where: { referrerId: inviter.id } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [email, inviterEmail] } } });
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
});
