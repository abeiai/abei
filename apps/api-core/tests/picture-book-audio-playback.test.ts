import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { MediaService } from "../src/media/media.service.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PictureBookController } from "../src/picture-books/picture-book.controller.js";

test("绘本语音通过 R2 签名读取，拒绝外部地址和非音频响应", async () => {
  const keys = ["DATABASE_URL", "S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL", "S3_FORCE_PATH_STYLE"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { DATABASE_URL: "postgresql://test:test@localhost:3604/test", S3_BUCKET: "abeiai", S3_ENDPOINT: "https://test.r2.cloudflarestorage.com", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_PUBLIC_BASE_URL: "https://cdn.abei.example", S3_FORCE_PATH_STYLE: "1" });
  let mimeType = "audio/mpeg";
  const bytes = Buffer.from("ID3test-audio");
  globalThis.fetch = async (input, init) => {
    if (String(input) !== "https://test.r2.cloudflarestorage.com/abeiai/picture-books/audio/page.mp3" || !new Headers(init?.headers).get("authorization")?.startsWith("AWS4-HMAC-SHA256 ")) return new Response("旧站点", { status: 404 });
    return new Response(bytes, { headers: { "content-type": mimeType } });
  };
  try {
    const service = new MediaService();
    const audio = await service.readPictureBookStoredAudio("https://cdn.abei.example/picture-books/audio/page.mp3");
    assert.deepEqual(audio.buffer, bytes);
    assert.equal(audio.mimetype, "audio/mpeg");
    for (const url of ["https://attacker.example/a.mp3", "https://cdn.abei.example/audio/%2e%2e/a.mp3", "https://cdn.abei.example/audio/a.mp3?key=other", "https://cdn.abei.example/audio/a.png"]) await assert.rejects(service.readPictureBookStoredAudio(url));
    mimeType = "text/html";
    await assert.rejects(service.readPictureBookStoredAudio("https://cdn.abei.example/picture-books/audio/page.mp3"), /语音.*失败/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("绘本语音仅允许读取有权访问的页面和已审核快照", async () => {
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  let approved = false;
  let reads = 0;
  Object.assign(service, {
    prisma: { pictureBook: { findFirst: async () => null }, courseRevisionItem: { findFirst: async () => approved ? { publication: { approvedHash: "hash", approvedSnapshot: { pages: [{ position: 2, audioUrl: "https://cdn.abei.example/approved.mp3" }] } } } : null } },
    mediaService: { readPictureBookStoredAudio: async (url: string) => { assert.equal(url, "https://cdn.abei.example/approved.mp3"); reads++; return { buffer: Buffer.from("ID3approved"), mimetype: "audio/mpeg" }; } }
  });
  const subject = { userId: "reader", mode: "LEARNER" as const, learnerId: "learner" };
  await assert.rejects(service.pageAudio(subject, "book", 2), /尚未发布/);
  assert.equal(reads, 0);
  approved = true;
  await assert.rejects(service.pageAudio(subject, "book", 1), /语音不存在/);
  assert.equal((await service.pageAudio(subject, "book", 2)).buffer.toString(), "ID3approved");
});

test("旧绘本的服务商语音地址沿用既有下载白名单", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:3604/test";
  const bytes = Buffer.from("ID3test-audio");
  const providerUrl = "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/page.mp3";
  globalThis.fetch = async (input) => String(input) === providerUrl ? new Response(bytes, { headers: { "content-type": "audio/mpeg" } }) : new Response("not found", { status: 404 });
  try {
    const service = new MediaService();
    assert.deepEqual((await service.readPictureBookStoredAudio(providerUrl)).buffer, bytes);
    await assert.rejects(service.readPictureBookStoredAudio("http://localhost:3602/private.mp3"));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("绘本音频接口支持浏览器字节范围请求及越界反馈", async () => {
  const controller = new PictureBookController({ pageAudio: async () => ({ buffer: Buffer.from("0123456789"), mimetype: "audio/mpeg" }) } as never, { me: async () => ({ id: "user" }) } as never, { requireSelected: async () => ({ userId: "user", mode: "ACCOUNT" }) } as never);
  for (const [range, expectedStatus, expectedBody, contentRange] of [[undefined, 200, "0123456789", undefined], ["bytes=2-5", 206, "2345", "bytes 2-5/10"], ["bytes=8-", 206, "89", "bytes 8-9/10"], ["bytes=-3", 206, "789", "bytes 7-9/10"], ["bytes=10-", 416, "", "bytes */10"], ["bytes=2-1", 416, "", "bytes */10"], ["bytes=0-1,4-5", 416, "", "bytes */10"]] as const) {
    const headers: Record<string, string | number> = {};
    let status = 200;
    let body = Buffer.alloc(0);
    await controller.pageAudio({}, "book", "2", range, { setHeader: (name, value) => { headers[name] = value; }, status: (value) => { status = value; }, send: (value) => { body = value; } });
    assert.equal(status, expectedStatus);
    assert.equal(body.toString(), expectedBody);
    assert.equal(headers["Content-Range"], contentRange);
    assert.equal(headers["Content-Length"], body.length);
    assert.equal(headers["Cache-Control"], "private, no-store");
    assert.equal(headers["Accept-Ranges"], "bytes");
  }
});
