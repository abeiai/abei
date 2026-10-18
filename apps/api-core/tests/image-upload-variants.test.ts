import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { MediaService } from "../src/media/media.service.js";
import { displayImage } from "../src/media/image-variants.js";

test("新图片上传保留原始字节，320/640展示图已预生成且不放在公开上传目录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-upload-images-"));
  const env = { UPLOAD_DRIVER: "local", UPLOAD_DIR: join(directory, "uploads"), IMAGE_VARIANT_CACHE_DIR: join(directory, "private-cache"), PUBLIC_API_BASE_URL: "/api" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    const buffer = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "orange" } }).png().toBuffer();
    const service = Object.create(MediaService.prototype) as unknown as { persistFile(input: unknown): Promise<{ filename: string; url: string; size: number }> };
    Object.assign(service, { prisma: { mediaAsset: { create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "upload-test", createdByAdmin: null, createdAt: new Date() }) } } });
    const asset = await service.persistFile({ file: { buffer, size: buffer.length, mimetype: "image/png", originalname: "原始图片.png" }, mediaType: "IMAGE", sourceType: "USER_UPLOAD" });
    assert.equal(asset.size, buffer.length);
    assert.deepEqual(await readFile(join(env.UPLOAD_DIR, asset.filename)), buffer);
    assert.deepEqual(await readdir(env.UPLOAD_DIR), [asset.filename]);
    for (const width of [320, 640]) {
      const cached = await displayImage(asset.url, width, async () => { throw new Error("预热后不应读取原图"); });
      assert.equal((await sharp(cached.buffer).metadata()).width, width);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});
