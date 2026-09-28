import { createPrivateKey, createPublicKey, createSign, createVerify } from "node:crypto";

export function normalizePem(value: string) {
  const trimmed = value.trim().replace(/\\n/g, "\n");

  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }

  return [
    "-----BEGIN PRIVATE KEY-----",
    trimmed,
    "-----END PRIVATE KEY-----"
  ].join("\n");
}

function normalizeRsaPrivateKey(value: string) {
  const trimmed = value.trim().replace(/\\n/g, "\n");

  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }

  return [
    "-----BEGIN RSA PRIVATE KEY-----",
    trimmed,
    "-----END RSA PRIVATE KEY-----"
  ].join("\n");
}

export function normalizePublicKey(value: string) {
  const trimmed = value.trim().replace(/\\n/g, "\n");

  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }

  return [
    "-----BEGIN PUBLIC KEY-----",
    trimmed,
    "-----END PUBLIC KEY-----"
  ].join("\n");
}

function normalizeRsaPublicKey(value: string) {
  const trimmed = value.trim().replace(/\\n/g, "\n");

  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }

  return [
    "-----BEGIN RSA PUBLIC KEY-----",
    trimmed,
    "-----END RSA PUBLIC KEY-----"
  ].join("\n");
}

function privateKeyCandidates(value: string) {
  return [normalizePem(value), normalizeRsaPrivateKey(value)];
}

function publicKeyCandidates(value: string) {
  return [normalizePublicKey(value), normalizeRsaPublicKey(value)];
}

export function signRsaSha256(content: string, privateKey: string) {
  let lastError: unknown;

  for (const candidate of privateKeyCandidates(privateKey)) {
    try {
      return createSign("RSA-SHA256").update(content, "utf8").sign(candidate, "base64");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export function verifyRsaSha256(content: string, signature: string, publicKey: string) {
  let lastError: unknown;

  for (const candidate of publicKeyCandidates(publicKey)) {
    try {
      return createVerify("RSA-SHA256")
        .update(content, "utf8")
        .verify(candidate, signature, "base64");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export function isValidRsaPrivateKey(value: string) {
  if (!value.trim()) {
    return false;
  }

  return privateKeyCandidates(value).some((candidate) => {
    try {
      createPrivateKey(candidate);

      return true;
    } catch {
      return false;
    }
  });
}

export function isValidRsaPublicKey(value: string) {
  if (!value.trim()) {
    return false;
  }

  return publicKeyCandidates(value).some((candidate) => {
    try {
      createPublicKey(candidate);

      return true;
    } catch {
      return false;
    }
  });
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function toInputJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
