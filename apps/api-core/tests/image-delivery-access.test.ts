import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { displayImage } from "../src/media/image-variants.js";

test("私有绘本衍生图缩小且每次请求重新检查访问权限", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-image-access-"));
  try {
    const source = { buffer: await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "green" } }).png().toBuffer(), mimetype: "image/png" };
    const service = Object.create(PictureBookService.prototype) as PictureBookService;
    let allowed = true, checks = 0, reads = 0;
    Object.assign(service, {
      playback: async () => { checks++; if (!allowed) throw new Error("没有权限"); return { pages: [{ position: 1, imageUrl: "https://r.abeiai.com/page.png" }] }; },
      mediaService: { readPictureBookStoredImage: (url: string, width?: number) => displayImage(url, width, async () => { reads++; return source; }, directory) }
    });
    const subject = { userId: "owner", mode: "ACCOUNT" } as const;
    const first = await service.pageImage(subject, "book", 1, 320);
    assert.equal((await sharp(first.buffer).metadata()).width, 320);
    await service.pageImage(subject, "book", 1, 320);
    assert.equal(reads, 1);
    allowed = false;
    await assert.rejects(service.pageImage(subject, "book", 1, 320), /没有权限/);
    assert.equal(checks, 3);
    assert.equal(reads, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
