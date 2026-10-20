import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AuthService } from "../src/auth/auth.service.js";
import { HttpExceptionFilter } from "../src/common/http-exception.filter.js";
import { createValidationPipe } from "../src/common/validation.js";
import { MediaService } from "../src/media/media.service.js";
import { PictureBookGuideModule } from "../src/picture-book-guide/picture-book-guide.module.js";

test("本站绘本仅列出本人作品和已发布审核版本，选择后私有保存页序及配文", { timeout: 60000 }, async () => {
  const prisma = getPrismaClient();
  const fixtureTag = `library-${randomUUID()}`;
  const directory = await mkdtemp(join(tmpdir(), "abei-guide-library-"));
  const oldDirectory = process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR;
  const oldWebBase = process.env.PICTURE_BOOK_GUIDE_WEB_BASE_URL;
  process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = directory;
  process.env.PICTURE_BOOK_GUIDE_WEB_BASE_URL = "http://127.0.0.1:3620";
  process.env.JWT_ACCESS_SECRET ??= `fixture-${randomUUID()}`;
  process.env.JWT_REFRESH_SECRET ??= `fixture-${randomUUID()}`;
  const image = await readFile(new URL("../../web/public/picture-book-demos/lele-bear/01.webp", import.meta.url));
  const web = createServer((_req, response) => { response.writeHead(200, { "Content-Type": "image/webp" }); response.end(image); });
  await new Promise<void>(resolve => web.listen(3620, "127.0.0.1", resolve));
  const app = await NestFactory.create(PictureBookGuideModule, { logger: false });
  app.setGlobalPrefix("api"); app.useGlobalFilters(new HttpExceptionFilter()); app.useGlobalPipes(createValidationPipe());
  const media = app.get(MediaService);
  Object.assign(media, { downloadPictureBookImage: async () => ({ buffer: image, mimetype: "image/webp", originalname: "page.webp", size: image.length }) });
  await app.listen(3619, "127.0.0.1");
  const base = "http://127.0.0.1:3619/api/picture-book-guide";
  const users: string[] = [], courses: string[] = [], publications: string[] = [];
  let coverId = "";
  async function session() {
    const email = `guide-library-${randomUUID()}@test.invalid`;
    const user = await prisma.user.create({ data: { email, nickname: "本站绘本测试", passwordHash: await hashPassword("Fixture-guide-987!") } }); users.push(user.id);
    const jar: Record<string, string> = {};
    await app.get(AuthService).login({ email, password: "Fixture-guide-987!" }, { cookie: (name, value) => { jar[name] = value; }, clearCookie: name => { delete jar[name]; } });
    const cookie = () => Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
    assert.equal((await fetch(`${base}/books?scope=MINE`, { headers: { Cookie: cookie() } })).status, 403);
    const selected = await fetch("http://127.0.0.1:3619/api/profiles/select", { method: "POST", headers: { Cookie: cookie(), "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ACCOUNT" }) });
    for (const line of selected.headers.getSetCookie()) { const [name, ...value] = line.split(";")[0]!.split("="); jar[name!] = value.join("="); }
    return { id: user.id, cookie: cookie() };
  }
  const pages = (caption: string) => [{ position: 0, caption: "绘本封面", narration: "", imageUrl: "/picture-book-demos/lele-bear/cover.webp" }, { position: 1, caption, narration: caption, imageUrl: "/picture-book-demos/lele-bear/01.webp" }];
  async function book(owner: string, title: string, caption: string, status = "EDITING") {
    return prisma.pictureBook.create({ data: { userId: owner, title, brief: "私密创作沟通", audience: "一二年级", style: "watercolor", status, pageCount: 1, messages: [], characters: [], pages: pages(caption) } });
  }
  async function published(source: Awaited<ReturnType<typeof book>>, status: "APPROVED" | "PENDING" | "REJECTED", isPublished = true) {
    const snapshot = { type: "PICTURE_BOOK", title: `审核版${source.title} ${fixtureTag}`, aspectRatio: "1:1", pages: pages("已审核配文") };
    const publication = await prisma.courseMaterialPublication.create({ data: { materialType: "PICTURE_BOOK", pictureBookId: source.id, status, approvedHash: "approved-fixture", currentHash: "new-private-version", approvedSnapshot: snapshot, currentSnapshot: { ...snapshot, title: "待审核私密版本" } } }); publications.push(publication.id);
    const course = await prisma.course.create({ data: { id: randomUUID(), userId: source.userId, reviewState: "PUBLISHED", publishedAt: isPublished ? new Date() : null } }); courses.push(course.id);
    const revision = await prisma.courseRevision.create({ data: { courseId: course.id, coverMediaId: coverId, name: "测试课程", summary: "测试", status: "APPROVED" } });
    await prisma.courseRevisionItem.create({ data: { revisionId: revision.id, publicationId: publication.id, materialType: "PICTURE_BOOK", pictureBookId: source.id, displayName: source.title } });
    await prisma.course.update({ where: { id: course.id }, data: { approvedRevisionId: revision.id } });
    return publication;
  }
  try {
    assert.equal((await fetch(`${base}/books?scope=MINE`)).status, 401);
    assert.equal((await fetch(`${base}/books`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "PUBLIC", bookId: "unknown" }) })).status, 401);
    const owner = await session(), other = await session();
    coverId = (await prisma.mediaAsset.create({ data: { filename: "cover.png", originalName: "cover.png", mimeType: "image/png", size: 1, url: "/picture-book-demos/lele-bear/cover.webp" } })).id;
    const own = await book(owner.id, "我的未公开分享作品", "本人当前配文");
    const approved = await book(other.id, "公开绘本", "未审核的当前配文", "COMPLETED");
    const goodPublication = await published(approved, "APPROVED");
    await published(await book(other.id, "待审核作品", "秘密"), "PENDING");
    await published(await book(other.id, "被拒绝作品", "秘密"), "REJECTED");
    await published(await book(other.id, "撤下作品", "秘密"), "APPROVED", false);
    const get = (suffix: string) => fetch(`${base}${suffix}`, { headers: { Cookie: owner.cookie } });
    const importBook = (bookId: string, scope: string) => fetch(`${base}/books`, { method: "POST", headers: { Cookie: owner.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ bookId, scope }) });
    const mine = await get("/books?scope=MINE"); assert.equal(mine.status, 200);
    const mineData = (await mine.json()).data;
    assert.equal(mineData.total, 1); assert.equal(mineData.items[0].title, "我的未公开分享作品");
    assert.equal("brief" in mineData.items[0], false); assert.equal("pages" in mineData.items[0], false);
    const publicData = (await (await get(`/books?scope=PUBLIC&search=${fixtureTag}`)).json()).data;
    assert.equal(publicData.total, 1); assert.deepEqual(publicData.items.map((item: { title: string }) => item.title), [`审核版公开绘本 ${fixtureTag}`]);
    assert.equal((await (await get("/books?scope=PUBLIC&search=不存在")).json()).data.total, 0);
    assert.equal((await get("/books?scope=PUBLIC&page=0")).status, 400);
    assert.equal((await get("/books?scope=OTHER")).status, 400);
    assert.equal((await importBook(approved.id, "MINE")).status, 404);
    assert.equal((await importBook(own.id, "PUBLIC")).status, 404);
    const importedOwn = await importBook(own.id, "MINE"); assert.equal(importedOwn.status, 201);
    const ownGuide = (await importedOwn.json()).data;
    assert.equal(ownGuide.title, "我的未公开分享作品"); assert.equal(ownGuide.audience, "一二年级"); assert.equal(ownGuide.pageCount, 2);
    assert.deepEqual(ownGuide.pages.map((page: { pageNumber: number }) => page.pageNumber), [1, 2]);
    assert.match(ownGuide.pages[1].sourceText, /本人当前配文/); assert.equal(ownGuide.scriptCount, 0); assert.equal(ownGuide.audioCount, 0);
    const multiline = await book(owner.id, "多行配文", Array.from({ length: 10 }, (_, index) => `第${index + 1}段配文需要完整保留`).join("\n"));
    const multilineResponse = await importBook(multiline.id, "MINE"); assert.equal(multilineResponse.status, 201);
    const multilineGuide = (await multilineResponse.json()).data;
    assert.match(multilineGuide.pages[1].sourceText, /第10段配文需要完整保留/);
    const importedPublic = await importBook(approved.id, "PUBLIC"); assert.equal(importedPublic.status, 201);
    const publicGuide = (await importedPublic.json()).data;
    assert.equal(publicGuide.title, `审核版公开绘本 ${fixtureTag}`); assert.match(publicGuide.pages[1].sourceText, /已审核配文/);
    assert.doesNotMatch(JSON.stringify(publicGuide), /未审核的当前配文|待审核私密版本|私密创作沟通/);
    const preview = await get(`/${publicGuide.id}/pages/2/image`); assert.equal(preview.status, 200); assert.equal(preview.headers.get("content-type"), "image/png");
    assert.ok((await preview.arrayBuffer()).byteLength > 1000);
    assert.equal((await fetch(`${base}/${publicGuide.id}/pdf`, { headers: { Cookie: other.cookie } })).status, 404);
    await prisma.course.update({ where: { id: courses[0]! }, data: { publishedAt: null } });
    assert.equal((await importBook(approved.id, "PUBLIC")).status, 404);
    assert.equal((await get(`/${publicGuide.id}`)).status, 200);
    await prisma.course.update({ where: { id: courses[0]! }, data: { publishedAt: new Date() } });
    await prisma.courseMaterialPublication.update({ where: { id: goodPublication.id }, data: { status: "PENDING" } });
    assert.equal((await importBook(approved.id, "PUBLIC")).status, 404);
    const empty = await prisma.pictureBook.create({ data: { userId: owner.id, title: "尚无页面", brief: "测试", style: "watercolor", pageCount: 1, pages: [], characters: [], messages: [] } });
    assert.equal((await importBook(empty.id, "MINE")).status, 400);
    const unsafe = await book(owner.id, "非法图片路径", "测试");
    await prisma.pictureBook.update({ where: { id: unsafe.id }, data: { pages: [{ position: 0, caption: "封面", imageUrl: "/picture-book-demos/../private/secret.png" }] } });
    const beforeUnsafe = await prisma.pictureBookGuide.count({ where: { userId: owner.id } });
    assert.equal((await importBook(unsafe.id, "MINE")).status, 400);
    assert.equal(await prisma.pictureBookGuide.count({ where: { userId: owner.id } }), beforeUnsafe);
  } finally {
    await app.close(); await new Promise<void>((resolve, reject) => web.close(error => error ? reject(error) : resolve()));
    await prisma.course.deleteMany({ where: { id: { in: courses } } });
    await prisma.courseMaterialPublication.deleteMany({ where: { id: { in: publications } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (coverId) await prisma.mediaAsset.delete({ where: { id: coverId } });
    await rm(directory, { recursive: true, force: true });
    if (oldDirectory === undefined) delete process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR; else process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR = oldDirectory;
    if (oldWebBase === undefined) delete process.env.PICTURE_BOOK_GUIDE_WEB_BASE_URL; else process.env.PICTURE_BOOK_GUIDE_WEB_BASE_URL = oldWebBase;
    await prisma.$disconnect();
  }
});
