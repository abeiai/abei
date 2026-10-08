import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { verifyPassword, hashPassword } from "@xueleai/database";
import { AuthService } from "../src/auth/auth.service.js";

const password = "旧版测试密码-123";
const legacyHash = `pbkdf2_sha256$260000$syntheticSalt$${pbkdf2Sync(password, "syntheticSalt", 260000, 32, "sha256").toString("base64")}`;

test("旧版 Django PBKDF2 密码保持有效，错误密码和越界参数拒绝", async () => {
  assert.equal(await verifyPassword(password, legacyHash), true);
  assert.equal(await verifyPassword("wrong", legacyHash), false);
  for (const hash of [legacyHash.replace("260000", "2000001"), legacyHash.replace("260000", "0"), legacyHash + "$extra", "pbkdf2_sha256$1$salt$bad"])
    assert.equal(await verifyPassword(password, hash), false);
  const current = await hashPassword(password);
  assert.equal(await verifyPassword(password, current), true);
});

test("旧哈希升级使用原值和账号状态 CAS，密码重置竞争时拒绝登录", async () => {
  const service = new AuthService() as unknown as Record<string, any>;
  const user = { id: "fixture", passwordHash: legacyHash, status: "ACTIVE", passwordLoginEnabled: true };
  let received: any;
  let resetWon = false;
  service.prisma = { user: {
    updateMany: async (query: any) => { received = query; return { count: resetWon ? 0 : 1 }; },
    findUnique: async () => ({ ...user, passwordHash: received.data.passwordHash }),
  } };
  const upgraded = await service.upgradeLegacyPassword(user, password);
  assert.deepEqual(received.where, { id: user.id, passwordHash: legacyHash, status: "ACTIVE", passwordLoginEnabled: true });
  assert.ok(upgraded.passwordHash.startsWith("scrypt$"));
  assert.equal(await verifyPassword(password, upgraded.passwordHash), true);
  resetWon = true;
  await assert.rejects(() => service.upgradeLegacyPassword(user, password), /账号信息已更新/);
});
