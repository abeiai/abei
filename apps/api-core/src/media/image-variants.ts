import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { AppException } from "../common/app-exception.js";

const widths = [64, 128, 160, 320, 640, 960, 1280, 1920];
type ImageFile = { buffer: Buffer; mimetype: string };
const pending = new Map<string, Promise<ImageFile>>();
const waiting: (() => void)[] = [];
let active = 0;
let lastPrune = 0;

export function parseImageWidth(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value) || !widths.includes(Number(value))) {
    throw new AppException(40001, "图片尺寸不支持", 400);
  }
  return Number(value);
}

export function imageVariantDirectory() {
  return resolve(process.env.IMAGE_VARIANT_CACHE_DIR || join(process.cwd(), ".cache/image-variants"));
}

// Call only after the owning resource's access check. This cache never grants access.
export async function displayImage(sourceKey: string, width: number | undefined, load: () => Promise<ImageFile>, directory = imageVariantDirectory()): Promise<ImageFile> {
  if (width === undefined) return load();
  parseImageWidth(String(width));
  const key = createHash("sha256").update(`v1:${width}:${sourceKey}`).digest("hex");
  const file = join(directory, `${key}.img`);
  try {
    const cached = await readFile(file);
    const separator = cached.indexOf(10);
    const mimetype = cached.subarray(0, separator).toString();
    if (separator > 0 && separator < 40 && mimetype === "image/webp" && cached.length > separator + 1) {
      return { buffer: cached.subarray(separator + 1), mimetype };
    }
  } catch { /* A missing/unavailable cache must not prevent reading the original. */ }
  const running = pending.get(file);
  if (running) return running;
  // Keep decoding memory and queued work bounded, including uploads and cache misses.
  if (active >= 2 && waiting.length >= 32) return load();
  const operation = (async () => {
    if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {
      const original = await load();
      if (!/^image\/(png|jpeg|webp|gif)$/.test(original.mimetype) || original.buffer.length > 20 * 1024 * 1024) return original;
      let buffer: Buffer;
      try {
        const image = sharp(original.buffer, { limitInputPixels: 40_000_000, animated: true });
        const metadata = await image.metadata();
        if ((metadata.pages ?? 1) > 1) return original;
        buffer = await image.rotate().toColourspace("srgb").resize({ width, withoutEnlargement: true })
          .webp({ quality: width <= 640 ? 82 : 90, effort: 4 }).toBuffer();
        if (buffer.length >= original.buffer.length && (metadata.width ?? Infinity) <= width && !metadata.orientation && !metadata.exif) return original;
      } catch { return original; }
      const result = { buffer, mimetype: "image/webp" };
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, Buffer.concat([Buffer.from("image/webp\n"), buffer]), { mode: 0o600 });
        await rename(temporary, file);
        if (Date.now() - lastPrune > 60_000) {
          lastPrune = Date.now();
          await pruneImageVariants(directory);
        }
      } catch { /* Delivery still works when the disk cache is unavailable. */ }
      finally { await rm(temporary, { force: true }).catch(() => undefined); }
      return result;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  })();
  pending.set(file, operation);
  try { return await operation; }
  finally { pending.delete(file); }
}

export async function warmImageVariants(sourceKey: string, original: ImageFile) {
  await Promise.all([320, 640].map(width => displayImage(sourceKey, width, async () => original)));
}

export async function pruneImageVariants(directory = imageVariantDirectory(), maxBytes = 1024 * 1024 * 1024) {
  const names = await readdir(directory).catch(() => [] as string[]);
  const files = (await Promise.all(names.filter(name => /^[a-f0-9]{64}\.img$/.test(name)).map(async name => {
    const path = join(directory, name);
    const info = await stat(path).catch(() => null);
    return info ? { path, size: info.size, time: info.mtimeMs } : null;
  }))).filter(file => file !== null).sort((a, b) => a.time - b.time);
  let total = files.reduce((size, file) => size + file.size, 0);
  for (const file of files) {
    if (total <= maxBytes && file.time > Date.now() - 30 * 86400_000) continue;
    await rm(file.path, { force: true });
    total -= file.size;
  }
}
