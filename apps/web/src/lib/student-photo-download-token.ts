import { createHmac, timingSafeEqual } from "node:crypto";

type DownloadClaim = { userId: string; url: string; index: number; widthMm: number; heightMm: number; expiresAt: number };

function secret() {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error("图片下载服务尚未配置");
  return value;
}

export function signStudentPhotoDownload(claim: Omit<DownloadClaim, "expiresAt">) {
  const payload = Buffer.from(JSON.stringify({ ...claim, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyStudentPhotoDownload(token: string, userId: string): DownloadClaim | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); }
  catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DownloadClaim;
    return claim.userId === userId && claim.expiresAt > Date.now() && [1, 2].includes(claim.index) &&
      claim.widthMm >= 15 && claim.widthMm <= 100 && claim.heightMm >= 15 && claim.heightMm <= 100 ? claim : null;
  } catch { return null; }
}
