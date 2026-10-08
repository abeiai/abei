import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { AppException } from "../common/app-exception.js";

const unavailable = () => new AppException(40401, "历史素材尚不可用", 404);
const mimeTypes: Record<string, string[]> = {
  IMAGE: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  AUDIO: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/aac"],
  VIDEO: ["video/mp4", "video/webm", "video/ogg"],
};

export async function legacyLogFile(asset: { status: string; mediaType: string; mimeType: string | null; storageKey: string | null; filename: string | null }, range?: string) {
  if (asset.status !== "AVAILABLE" || !asset.storageKey || !asset.mimeType || !mimeTypes[asset.mediaType]?.includes(asset.mimeType)) throw unavailable();
  if (!/^[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif|mp3|wav|ogg|m4a|aac|mp4|webm)$/.test(asset.storageKey)) throw unavailable();
  const configured = resolve(process.env.LEGACY_AI_LOG_ASSET_DIR || resolve(process.cwd(), "private/legacy-ai-logs"));
  const uploads = resolve(process.env.UPLOAD_DIR || resolve(process.cwd(), "uploads"));
  if (configured === uploads || configured.startsWith(uploads + sep)) throw unavailable();
  let filepath: string, size: number;
  try {
    const root = await realpath(configured);
    const candidate = resolve(root, asset.storageKey);
    const info = await lstat(candidate);
    filepath = await realpath(candidate);
    if (!info.isFile() || info.isSymbolicLink() || !filepath.startsWith(root + sep) || info.size < 1) throw unavailable();
    size = info.size;
  } catch { throw unavailable(); }
  let start = 0, end = size - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) throw new AppException(40001, "素材范围不正确", 416);
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix < 1) throw new AppException(40001, "素材范围不正确", 416);
      start = Math.max(0, size - suffix);
    } else {
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw new AppException(40001, "素材范围不正确", 416);
    status = 206;
  }
  const headers: Record<string, string> = {
    "Content-Type": asset.mimeType,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.filename || "历史素材")}`,
  };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  try {
    const handle = await open(filepath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== size) { await handle.close(); throw unavailable(); }
    return { status, headers, stream: handle.createReadStream({ start, end, autoClose: true }) };
  } catch { throw unavailable(); }
}
