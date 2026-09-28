import { createHmac, timingSafeEqual } from "node:crypto";

interface JwtPayload {
  sub: string;
  type: "USER" | "ADMIN" | "PASSWORD_RESET";
  email: string;
  exp: number;
  sessionScope?: "LEARNER";
  passwordHashFingerprint?: string;
  resetMethod?: "EMAIL" | "PHONE";
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(input: string) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  return Buffer.from(padded, "base64");
}

function signContent(content: string, secret: string) {
  return toBase64Url(createHmac("sha256", secret).update(content).digest());
}

export function signJwt(payload: Omit<JwtPayload, "exp">, secret: string, expiresInSeconds: number) {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds
    })
  );
  const content = `${header}.${body}`;
  const signature = signContent(content, secret);

  return `${content}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const [header, body, signature] = token.split(".");

  if (!header || !body || !signature) {
    return null;
  }

  const content = `${header}.${body}`;
  const expectedSignature = signContent(content, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body).toString("utf8")) as JwtPayload;

    if (!payload.sub || !payload.email || !payload.type || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function parseExpiresIn(value: string | undefined, fallbackSeconds: number) {
  if (!value) {
    return fallbackSeconds;
  }

  const match = /^(\d+)([smhd])?$/.exec(value.trim());

  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const multiplier =
    unit === "m"
      ? 60
      : unit === "h"
        ? 60 * 60
        : unit === "d"
          ? 24 * 60 * 60
          : 1;

  return amount * multiplier;
}
