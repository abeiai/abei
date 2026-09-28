import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProfileContextTokenPayload } from "./profile-context.types.js";

type UnsignedProfileContextToken = Omit<ProfileContextTokenPayload, "issuedAt" | "expiresAt">;

const payloadKeys = [
  "expiresAt",
  "issuedAt",
  "learnerId",
  "mode",
  "refreshTokenId",
  "userId"
] as const;
const maxProfileIdLength = 128;

export function getProfileContextSecret() {
  const configured = process.env.PROFILE_CONTEXT_SECRET?.trim();

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    const fallback = process.env.JWT_ACCESS_SECRET?.trim();

    if (fallback) {
      return fallback;
    }
  }

  throw new Error("身份上下文密钥未配置");
}

export function signProfileContextToken(
  value: UnsignedProfileContextToken,
  secret: string,
  expiresInSeconds: number,
  now = new Date()
) {
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("身份 token 有效期必须为正安全整数");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + expiresInSeconds;

  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0 || !Number.isSafeInteger(expiresAt)) {
    throw new Error("身份 token 有效期不正确");
  }

  const payload: ProfileContextTokenPayload = {
    ...value,
    issuedAt,
    expiresAt
  };

  if (!isProfileContextPayload(payload)) {
    throw new Error("身份 token 内容不正确");
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signatureFor(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyProfileContextToken(
  token: string,
  secret: string,
  now = new Date()
): ProfileContextTokenPayload | null {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload = "", encodedSignature = ""] = parts;

  if (!isCanonicalBase64Url(encodedPayload) || !isCanonicalBase64Url(encodedSignature)) {
    return null;
  }

  const expected = Buffer.from(signatureFor(encodedPayload, secret), "base64url");
  const actual = Buffer.from(encodedSignature, "base64url");

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isProfileContextPayload(parsed)) {
    return null;
  }

  if (Buffer.from(JSON.stringify(parsed)).toString("base64url") !== encodedPayload) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  return parsed.issuedAt <= nowSeconds && parsed.expiresAt > nowSeconds ? parsed : null;
}

export function profileContextForUser(
  token: string,
  userId: string,
  secret: string,
  now = new Date()
) {
  const payload = verifyProfileContextToken(token, secret, now);

  return payload?.userId === userId ? payload : null;
}

function signatureFor(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function isCanonicalBase64Url(value: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }

  try {
    return Buffer.from(value, "base64url").toString("base64url") === value;
  } catch {
    return false;
  }
}

function isProfileContextPayload(value: unknown): value is ProfileContextTokenPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (keys.length !== payloadKeys.length || keys.some((key, index) => key !== payloadKeys[index])) {
    return false;
  }

  if (
    !isBoundedIdentifier(record.userId) ||
    !isBoundedIdentifier(record.refreshTokenId) ||
    !Number.isSafeInteger(record.issuedAt) ||
    (record.issuedAt as number) < 0 ||
    !Number.isSafeInteger(record.expiresAt) ||
    (record.expiresAt as number) < (record.issuedAt as number) ||
    (record.mode !== "ACCOUNT" && record.mode !== "LEARNER")
  ) {
    return false;
  }

  return record.mode === "ACCOUNT"
    ? record.learnerId === null
    : isBoundedIdentifier(record.learnerId);
}

function isBoundedIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxProfileIdLength &&
    value.trim().length > 0 &&
    value === value.trim()
  );
}
