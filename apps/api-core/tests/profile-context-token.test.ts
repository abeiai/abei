import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  profileContextForUser,
  signProfileContextToken,
  verifyProfileContextToken
} from "../src/profiles/profile-context-token.js";
import { profileContextCookie, readCookie, userRefreshCookie } from "../src/security/cookies.js";

const now = new Date("2026-08-13T10:00:00Z");

test("身份 token 被篡改或跨用户复用时无效", () => {
  const token = signProfileContextToken(
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "LEARNER", learnerId: "learner-a" },
    "test-secret",
    600,
    now
  );

  assert.equal(verifyProfileContextToken(`${token}x`, "test-secret", new Date("2026-08-13T10:01:00Z")), null);
  assert.equal(profileContextForUser(token, "user-b", "test-secret", new Date("2026-08-13T10:01:00Z")), null);
});

test("身份 token 到期后无效", () => {
  const token = signProfileContextToken(
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "ACCOUNT", learnerId: null },
    "test-secret",
    60,
    now
  );

  assert.equal(verifyProfileContextToken(token, "test-secret", new Date("2026-08-13T10:01:01Z")), null);
});

test("身份 token 拒绝未知字段、错误身份组合和畸形编码", () => {
  const invalidPayloads = [
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "ACCOUNT", learnerId: null, extra: true },
    { userId: "", refreshTokenId: "refresh-a", mode: "ACCOUNT", learnerId: null },
    { userId: "user-a", refreshTokenId: "", mode: "ACCOUNT", learnerId: null },
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "ACCOUNT", learnerId: "learner-a" },
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "LEARNER", learnerId: null }
  ];

  for (const payload of invalidPayloads) {
    const encoded = Buffer.from(JSON.stringify({ ...payload, issuedAt: 1, expiresAt: 9_999_999_999 })).toString("base64url");
    const signature = createHmac("sha256", "test-secret").update(encoded).digest("base64url");
    assert.equal(verifyProfileContextToken(`${encoded}.${signature}`, "test-secret", now), null);
  }

  assert.equal(verifyProfileContextToken("not-base64.not-signature", "test-secret", now), null);
  assert.equal(verifyProfileContextToken("missing-separator", "test-secret", now), null);

  const malformedJson = Buffer.from("{invalid-json").toString("base64url");
  const malformedSignature = createHmac("sha256", "test-secret").update(malformedJson).digest("base64url");
  assert.equal(verifyProfileContextToken(`${malformedJson}.${malformedSignature}`, "test-secret", now), null);
});

function rawSignedToken(rawJson: string) {
  const encoded = Buffer.from(rawJson).toString("base64url");
  const signature = createHmac("sha256", "test-secret").update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

test("身份 token 拒绝空白或过长 id、不安全时间和未来签发时间", () => {
  const valid = {
    userId: "user-a",
    refreshTokenId: "refresh-a",
    mode: "ACCOUNT",
    learnerId: null,
    issuedAt: 1_786_612_400,
    expiresAt: 1_786_613_000
  };
  const invalidPayloads = [
    { ...valid, userId: "   " },
    { ...valid, refreshTokenId: "x".repeat(129) },
    { ...valid, issuedAt: -1 },
    { ...valid, issuedAt: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, issuedAt: valid.expiresAt + 1 },
    { ...valid, issuedAt: 1_786_616_001, expiresAt: 1_786_617_000 }
  ];

  for (const payload of invalidPayloads) {
    assert.equal(
      verifyProfileContextToken(rawSignedToken(JSON.stringify(payload)), "test-secret", new Date("2026-08-13T10:00:00Z")),
      null
    );
  }
});

test("身份 token 拒绝重复 JSON key 和非规范原始 JSON", () => {
  const duplicate =
    '{"userId":"user-a","userId":"user-b","refreshTokenId":"refresh-a","mode":"ACCOUNT","learnerId":null,"issuedAt":1786615000,"expiresAt":1786615800}';
  const whitespace =
    '{ "userId":"user-a","refreshTokenId":"refresh-a","mode":"ACCOUNT","learnerId":null,"issuedAt":1786615000,"expiresAt":1786615800}';

  assert.equal(verifyProfileContextToken(rawSignedToken(duplicate), "test-secret", now), null);
  assert.equal(verifyProfileContextToken(rawSignedToken(whitespace), "test-secret", now), null);
});

test("签发函数拒绝非正安全整数有效期", () => {
  const value = { userId: "user-a", refreshTokenId: "refresh-a", mode: "ACCOUNT" as const, learnerId: null };

  for (const expiresIn of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => signProfileContextToken(value, "test-secret", expiresIn, now), /有效期/);
  }
});

test("畸形百分号 Cookie 被视为缺失而不是抛出 URIError", () => {
  const request = {
    headers: {
      cookie: `${userRefreshCookie}=%E0%A4%A; ${profileContextCookie}=%ZZ`
    }
  };

  assert.equal(readCookie(request, userRefreshCookie), null);
  assert.equal(readCookie(request, profileContextCookie), null);
});
