import { randomBytes, scrypt as scryptCallback, pbkdf2 as pbkdf2Callback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const pbkdf2 = promisify(pbkdf2Callback);
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (passwordHash.startsWith("pbkdf2_sha256$")) {
    const parts = passwordHash.split("$");
    if (parts.length !== 4 || !/^[1-9]\d{0,6}$/.test(parts[1]!) || Number(parts[1]) > 2_000_000 || !parts[2] || parts[2].length > 128 || !/^[A-Za-z0-9+/]{43}=$/.test(parts[3]!)) return false;
    const stored = Buffer.from(parts[3]!, "base64");
    if (stored.length !== 32 || stored.toString("base64") !== parts[3]) return false;
    const derived = await pbkdf2(password, parts[2]!, Number(parts[1]), 32, "sha256");
    return timingSafeEqual(stored, derived);
  }
  const [algorithm, salt, storedKey] = passwordHash.split("$");

  if (algorithm !== "scrypt" || !salt || !storedKey || passwordHash.split("$").length !== 3 || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(storedKey)) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  const storedBuffer = Buffer.from(storedKey, "hex");

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedKey);
}
