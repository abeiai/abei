import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import sharp from "sharp";
import { MediaController } from "../src/media/media.controller.js";
import { MediaService } from "../src/media/media.service.js";
import { PictureBookController } from "../src/picture-books/picture-book.controller.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import { AdminAuthService } from "../src/admin-auth/admin-auth.service.js";
import { ProfileContextService } from "../src/profiles/profile-context.service.js";
import { HttpExceptionFilter } from "../src/common/http-exception.filter.js";
import { AppException } from "../src/common/app-exception.js";
import { displayImage } from "../src/media/image-variants.js";

test("HTTP 图片接口返回真实小图、保留原文件，私有缓存不能绕过登录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-image-http-"));
  const previousCache = process.env.IMAGE_VARIANT_CACHE_DIR;
  process.env.IMAGE_VARIANT_CACHE_DIR = join(directory, "cache");
  const buffer = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "orange" } }).png().toBuffer();
  const filepath = join(directory, "original.png");
  await writeFile(filepath, buffer);
  const source = { buffer, mimetype: "image/png" };
  const bookService = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(bookService, {
    playback: async () => ({ pages: [{ position: 1, imageUrl: "http-test-page" }] }),
    mediaService: { readPictureBookStoredImage: (url: string, width?: number) => displayImage(url, width, async () => source) }
  });
  class FixtureModule {}
  Module({ controllers: [MediaController, PictureBookController], providers: [
    { provide: MediaService, useValue: { getLocalFile: async (filename: string) => ({ filepath, url: filename, mimeType: filename.endsWith(".mp4") ? "video/mp4" : "image/png", size: buffer.length }) } },
    { provide: PictureBookService, useValue: bookService },
    { provide: AuthService, useValue: { me: async (request: { headers: Record<string, string> }) => { if (request.headers.cookie !== "test=owner") throw new AppException(40101, "请先登录", 401); return { id: "owner" }; } } },
    { provide: ProfileContextService, useValue: { requireSelected: async () => ({ userId: "owner", mode: "ACCOUNT" }) } },
    { provide: AdminAuthService, useValue: {} }
  ] })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  try {
    await app.listen(3670, "127.0.0.1");
    const base = "http://127.0.0.1:3670/api";
    const small = await fetch(`${base}/media/files/original.png?w=320`);
    assert.equal(small.status, 200);
    assert.equal(small.headers.get("content-type"), "image/webp");
    assert.equal((await sharp(Buffer.from(await small.arrayBuffer())).metadata()).width, 320);
    const original = await fetch(`${base}/media/files/original.png`);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), buffer);
    assert.equal((await fetch(`${base}/media/files/clip.mp4?w=320`)).status, 400);
    assert.equal((await fetch(`${base}/media/files/original.png?w=320&w=640`)).status, 400);
    const url = `${base}/picture-books/book/pages/1/image?w=640`;
    assert.equal((await fetch(url)).status, 401);
    const privateImage = await fetch(url, { headers: { Cookie: "test=owner" } });
    assert.equal(privateImage.status, 200);
    assert.equal(privateImage.headers.get("cache-control"), "private, no-store");
    assert.equal((await sharp(Buffer.from(await privateImage.arrayBuffer())).metadata()).width, 640);
    assert.equal((await fetch(url)).status, 401);
    assert.deepEqual(await readFile(filepath), buffer);
  } finally {
    await app.close();
    if (previousCache === undefined) delete process.env.IMAGE_VARIANT_CACHE_DIR;
    else process.env.IMAGE_VARIANT_CACHE_DIR = previousCache;
    await rm(directory, { recursive: true, force: true });
  }
});
