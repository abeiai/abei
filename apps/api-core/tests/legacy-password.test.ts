import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { verifyPassword, hashPassword } from "@xueleai/database";
import { AuthService } from "../src/auth/auth.service.js";
import { MediaService } from "../src/media/media.service.js";

const password = "旧版测试密码-123";
const legacyHash = `pbkdf2_sha256$260000$syntheticSalt$${pbkdf2Sync(password, "syntheticSalt", 260000, 32, "sha256").toString("base64")}`;

test("迁移内部邮箱无法进入发送验证码和找回流程", async () => {
  const service = new AuthService();
  await assert.rejects(() => service.sendEmailCode({ email: "fixture@legacy.abei.invalid", purpose: "RESET_PASSWORD" }), /真实邮箱/);
  await assert.rejects(() => service.verifyPasswordResetCode({ email: "fixture@legacy.abei.invalid", code: "123456", method: "EMAIL" } as never), /真实邮箱/);
});

test("清理课程封面和头像保留共享历史 R2 原件", async () => {
  const service = new MediaService() as unknown as { deleteMediaObject(asset: { filename: string; url: string; storageProvider: string }, label: string): Promise<void> };
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("unexpected cloud deletion"); }) as typeof fetch;
  try {
    const asset = { filename: `legacy-sync/abeiai-v1/${"a".repeat(64)}.png`, url: "https://fixture.invalid/image.png", storageProvider: "S3" };
    await service.deleteMediaObject(asset, "课程封面");
    await service.deleteMediaObject(asset, "头像");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test("旧版 Django PBKDF2 密码保持有效，错误密码和越界参数拒绝", async () => {
  assert.equal(await verifyPassword(password, legacyHash), true);
  assert.equal(await verifyPassword("wrong", legacyHash), false);
  for (const hash of [legacyHash.replace("260000", "2000001"), legacyHash.replace("260000", "0"), legacyHash + "$extra", "pbkdf2_sha256$1$salt$bad"])
    assert.equal(await verifyPassword(password, hash), false);
  const current = await hashPassword(password);
  assert.equal(await verifyPassword(password, current), true);
});

test("旧哈希升级使用原值和账号状态 CAS，密码重置竞争时拒绝登录", async () => {
  type LegacyUser = { id: string; passwordHash: string; status: string; passwordLoginEnabled: boolean };
  type Query = { where: LegacyUser; data: { passwordHash: string } };
  const service = new AuthService() as unknown as { prisma: unknown; upgradeLegacyPassword(user: LegacyUser, password: string): Promise<LegacyUser> };
  const user = { id: "fixture", passwordHash: legacyHash, status: "ACTIVE", passwordLoginEnabled: true };
  let received: Query | undefined;
  let resetWon = false;
  service.prisma = { user: {
    updateMany: async (query: Query) => { received = query; return { count: resetWon ? 0 : 1 }; },
  } };
  const upgraded = await service.upgradeLegacyPassword(user, password);
  assert.ok(received);
  assert.deepEqual(received.where, { id: user.id, passwordHash: legacyHash, status: "ACTIVE", passwordLoginEnabled: true });
  assert.ok(upgraded.passwordHash.startsWith("scrypt$"));
  assert.equal(await verifyPassword(password, upgraded.passwordHash), true);
  resetWon = true;
  await assert.rejects(() => service.upgradeLegacyPassword(user, password), /账号信息已更新/);
});
