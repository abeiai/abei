import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";

test("本地真实HTTP邮箱注册完成双向500点奖励", { skip: process.env.RUN_REFERRAL_HTTP !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "localhost"); assert.equal(url.port, "3324"); assert.equal(url.pathname, "/xueleai");
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const email = `referral-http-${nonce}@example.invalid`;
  const ids: string[] = [];
  try {
    const inviter = await prisma.user.create({ data: { email: `referrer-http-${nonce}@example.invalid`, nickname: "推荐HTTP测试", passwordHash: "unusable", wallet: { create: {} } } }); ids.push(inviter.id);
    const code = await prisma.referralHandle.findUniqueOrThrow({ where: { userId_kind: { userId: inviter.id, kind: "RANDOM" } } });
    const capture = await fetch(`http://localhost:3322/api/referrals/visit/${code.handle}`, { method: "POST" });
    assert.equal(capture.status, 201);
    const visit = await capture.json() as { data: { token: string } };
    const emailCode = "438721";
    const codeHash = createHmac("sha256", process.env.JWT_REFRESH_SECRET!).update(`${email}:REGISTER:${emailCode}`).digest("hex");
    await prisma.emailVerificationCode.create({ data: { email, purpose: "REGISTER", codeHash, expiresAt: new Date(Date.now() + 60000) } });
    const response = await fetch("http://localhost:3322/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: `xueleai_referral=${visit.data.token}` },
      body: JSON.stringify({ email, emailCode, nickname: "推荐HTTP新用户", password: `Test-${nonce}` })
    });
    assert.equal(response.status, 201);
    const invitee = await prisma.user.findUniqueOrThrow({ where: { email } }); ids.push(invitee.id);
    for (const userId of ids) assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).availableCredits, 500);
    assert.equal(await prisma.referralReward.count({ where: { inviteeId: invitee.id } }), 1);
    assert.equal(await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: `referral:${invitee.id}:` } } }), 2);
  } finally {
    const invitee = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (invitee && !ids.includes(invitee.id)) ids.push(invitee.id);
    await prisma.referralReward.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.referralVisit.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
});
