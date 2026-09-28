import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const version = "v1";

export function encryptSecret(plainText: string, keySource = process.env.SECRET_ENCRYPTION_KEY) {
  const value = plainText.trim();

  if (!value) {
    throw new Error("待加密密钥不能为空");
  }

  const key = deriveEncryptionKey(keySource);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

export function decryptSecret(encryptedText: string, keySource = process.env.SECRET_ENCRYPTION_KEY) {
  const parts = encryptedText.split(":");

  if (parts.length !== 4 || parts[0] !== version) {
    throw new Error("密钥密文格式不正确");
  }

  const [, iv, authTag, encrypted] = parts;
  const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(keySource), Buffer.from(iv, "base64"));

  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function maskSecret(value: string) {
  const trimmed = value.trim();

  if (trimmed.length <= 8) {
    return "****";
  }

  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

function deriveEncryptionKey(keySource?: string) {
  const value = keySource?.trim();

  if (!value) {
    throw new Error("SECRET_ENCRYPTION_KEY 未配置");
  }

  if (value.length < 32) {
    throw new Error("SECRET_ENCRYPTION_KEY 长度至少需要 32 个字符");
  }

  return createHash("sha256").update(value).digest();
}
