import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";

const box = { id: "box", text: "新的图文文字", x: .1, y: .1, width: .6, height: .2, fontSize: 32, fontFamily: "sans", color: "#222222", bold: false, align: "left", lineHeight: 1.5, speak: true };
const layout = { enabled: true, versions: [{ language: "original", boxes: [box], audioUrl: null }] };
const pages = [0, 1].map(position => ({ position, caption: `原文${position}`, narration: `原文${position}`, imagePrompt: "画面", imageUrl: `https://r.abeiai.com/picture-books/p${position}.png`, imageTaskId: null, audioUrl: null, audioTaskId: null }));

test("已公开绘本修改图文编排自动产生可审核快照，审核前公开版不变，审核后显示文字层", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `layout-${randomUUID()}@test.invalid`, nickname: "图文审核测试", passwordHash: "unused" } });
  const admin = await prisma.adminUser.create({ data: { email: `layout-admin-${randomUUID()}@test.invalid`, name: "审核员", passwordHash: "unused" } });
  try {
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "测试绘本", brief: "", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages } });
    const approved = snapshotCourseMaterial("PICTURE_BOOK", book);
    const hash = hashCourseSnapshot(approved);
    const cover = "https://r.abeiai.com/picture-books/cover.png";
    const row = await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot: approved, snapshotHash: hash, publishedSnapshot: approved, publishedHash: hash, coverUrl: cover, publishedCoverUrl: cover, publishedAt: new Date(), publishedVersion: 1, sourceInfo: { name: "未通过的来源" }, publishedSourceInfo: { name: "已公开的来源" } } });
    const unpublishedPages = [pages[0]!, { ...pages[1]!, caption: "未公开的普通文字", textLayout: { ...layout, enabled: false, versions: [{ ...layout.versions[0]!, boxes: [{ ...box, text: "内页编排" }] }] } }];
    await prisma.pictureBook.update({ where: { id: book.id }, data: { title: "未公开的标题", pages: unpublishedPages } });
    const service = new PictureBookService({} as never, {} as never, {} as never, { recordMaterialChange: async () => null } as never, {} as never);
    const submissions = new PictureBookSubmissionService({} as never, {} as never);
    const changed = await service.updatePage(user.id, book.id, 0, { textLayout: layout, expectedTextLayout: "null" });
    const pending = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(pending.status, "PENDING");
    assert.deepEqual(pending.publishedSnapshot, approved);
    assert.equal((await submissions.publicBook(book.id)).pages[0]?.textLayout, undefined);
    assert.equal((await submissions.review(row.id)).book.pages[0]?.textLayout?.versions[0]?.boxes[0]?.text, box.text);
    assert.equal((await submissions.review(row.id)).book.pages[1]?.textLayout?.versions[0]?.boxes[0]?.text, "内页编排");
    assert.doesNotMatch(JSON.stringify(pending.snapshot), /未公开的标题|未公开的普通文字/);
    assert.equal(pending.coverUrl, cover);
    assert.deepEqual(pending.sourceInfo, { name: "已公开的来源" });
    await prisma.pictureBook.update({ where: { id: book.id }, data: { title: "测试绘本" } });
    await service.complete(user.id, book.id);
    assert.equal((await submissions.submit(user.id, book.id)).status, "PENDING");
    const changedPages = changed.pages as unknown as Array<{ textLayout?: unknown }>;
    const revised = { ...layout, versions: [{ ...layout.versions[0]!, boxes: [{ ...box, text: "更新的图文文字" }] }] };
    await service.updatePage(user.id, book.id, 0, { textLayout: revised, expectedTextLayout: JSON.stringify(changedPages[0]?.textLayout) });
    await assert.rejects(submissions.decide(admin.id, row.id, pending.updatedAt.toISOString(), "APPROVED", undefined, pending.snapshotHash), /变化|刷新/);
    const latest = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { id: row.id } });
    await submissions.decide(admin.id, row.id, latest.updatedAt.toISOString(), "APPROVED", undefined, latest.snapshotHash);
    const published = await submissions.publicBook(book.id);
    assert.equal(published.pages[0]?.textLayout?.versions[0]?.boxes[0]?.text, "更新的图文文字");
    assert.equal(published.pages[1]?.textLayout?.versions[0]?.boxes[0]?.text, "内页编排");
    assert.equal(published.title, "测试绘本");
    await prisma.pictureBook.update({ where: { id: book.id }, data: { title: "测试绘本" } });
    await service.complete(user.id, book.id);
    assert.equal((await submissions.submit(user.id, book.id)).status, "APPROVED");
    const current = await prisma.pictureBook.findUniqueOrThrow({ where: { id: book.id } });
    const currentPages = current.pages as unknown as Array<{ textLayout?: unknown }>;
    await service.updatePage(user.id, book.id, 0, { textLayout: { ...revised, enabled: false }, expectedTextLayout: JSON.stringify(currentPages[0]?.textLayout) });
    const disabled = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(disabled.status, "PENDING");
    assert.doesNotMatch(JSON.stringify(disabled.snapshot), /未公开的标题|未公开的普通文字/);
    assert.equal((await submissions.publicBook(book.id)).pages[0]?.textLayout?.enabled, true);
    await submissions.decide(admin.id, row.id, disabled.updatedAt.toISOString(), "APPROVED", undefined, disabled.snapshotHash);
    const afterDisable = await submissions.publicBook(book.id);
    assert.equal(afterDisable.pages[0]?.textLayout, undefined);
    assert.equal(afterDisable.pages[0]?.caption, "更新的图文文字");
    assert.equal(afterDisable.pages[1]?.caption, "内页编排");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.adminUser.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  }
});

test("仅改变未公开音色时，不因其他图片待审而阻止保存或覆盖待审稿", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `layout-voice-${randomUUID()}@test.invalid`, nickname: "测试", passwordHash: "unused" } });
  try {
    const activePages = pages.map(page => ({ ...page, textLayout: layout }));
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "绘本", brief: "", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages: activePages } });
    const approved = snapshotCourseMaterial("PICTURE_BOOK", book), hash = hashCourseSnapshot(approved);
    const changedPages = [{ ...activePages[0]!, imageUrl: "https://r.abeiai.com/picture-books/private.png" }, activePages[1]!];
    const manualPending = snapshotCourseMaterial("PICTURE_BOOK", { ...book, pages: changedPages });
    await prisma.pictureBook.update({ where: { id: book.id }, data: { pages: changedPages } });
    await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "PENDING", snapshot: manualPending, snapshotHash: hashCourseSnapshot(manualPending), publishedSnapshot: approved, publishedHash: hash, publishedCoverUrl: "https://r.abeiai.com/picture-books/cover.png", publishedAt: new Date() } });
    const service = new PictureBookService({} as never, {} as never, {} as never, { recordMaterialChange: async () => null } as never, {} as never);
    const voiceChange = { ...layout, versions: [{ ...layout.versions[0]!, voiceKey: "voice:new" }] };
    const current = await service.get(user.id, book.id);
    const baselinePages = current.pages as unknown as Array<{ textLayout?: unknown }>;
    await service.updatePage(user.id, book.id, 0, { textLayout: voiceChange, expectedTextLayout: JSON.stringify(baselinePages[0]?.textLayout) });
    const row = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { pictureBookId: book.id } });
    assert.equal(row.status, "PENDING");
    assert.deepEqual(row.snapshot, manualPending);
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); }
});

test("已有其他待审核稿时不会覆盖审核稿，也不会部分保存全书开关", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `layout-pending-${randomUUID()}@test.invalid`, nickname: "测试", passwordHash: "unused" } });
  try {
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "绘本", brief: "", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages } });
    const approved = snapshotCourseMaterial("PICTURE_BOOK", book), hash = hashCourseSnapshot(approved);
    const pending = { ...approved, title: "已提交的其他修改" };
    await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "PENDING", snapshot: pending, snapshotHash: hashCourseSnapshot(pending), publishedSnapshot: approved, publishedHash: hash, publishedCoverUrl: "https://r.abeiai.com/picture-books/cover.png", publishedAt: new Date() } });
    const service = new PictureBookService({} as never, {} as never, {} as never, { recordMaterialChange: async () => null } as never, {} as never);
    await assert.rejects(service.updatePage(user.id, book.id, 0, { textLayout: layout, expectedTextLayout: "null" }), /已有其他内容正在审核/);
    assert.deepEqual((await prisma.pictureBook.findUniqueOrThrow({ where: { id: book.id } })).pages, pages);
    assert.deepEqual((await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { pictureBookId: book.id } })).snapshot, pending);
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); }
});

test("撤销自动待审编排时保留原公开版本并移除旧待审快照", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `layout-revert-${randomUUID()}@test.invalid`, nickname: "测试", passwordHash: "unused" } });
  try {
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "绘本", brief: "", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages } });
    const approved = snapshotCourseMaterial("PICTURE_BOOK", book), hash = hashCourseSnapshot(approved);
    await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot: approved, snapshotHash: hash, publishedSnapshot: approved, publishedHash: hash, publishedCoverUrl: "https://r.abeiai.com/picture-books/cover.png", publishedAt: new Date() } });
    const service = new PictureBookService({} as never, {} as never, {} as never, { recordMaterialChange: async () => null } as never, {} as never);
    const enabled = await service.updatePage(user.id, book.id, 0, { textLayout: layout, expectedTextLayout: "null" });
    const enabledPages = enabled.pages as unknown as Array<{ textLayout?: typeof layout }>;
    assert.ok(enabledPages.every(page => page.textLayout?.enabled));
    await service.updatePage(user.id, book.id, 0, { textLayout: { ...layout, enabled: false }, expectedTextLayout: JSON.stringify(enabledPages[0]?.textLayout) });
    const row = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { pictureBookId: book.id } });
    assert.equal(row.status, "APPROVED");
    assert.deepEqual(row.snapshot, approved);
    assert.deepEqual(row.publishedSnapshot, approved);
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); }
});

test("公开图片已变化时不会把未审核图片或文字夹带进自动审核稿", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `layout-image-${randomUUID()}@test.invalid`, nickname: "测试", passwordHash: "unused" } });
  try {
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "绘本", brief: "", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages } });
    const approved = snapshotCourseMaterial("PICTURE_BOOK", book), hash = hashCourseSnapshot(approved);
    await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot: approved, snapshotHash: hash, publishedSnapshot: approved, publishedHash: hash, publishedCoverUrl: "https://r.abeiai.com/picture-books/cover.png", publishedAt: new Date() } });
    const changedPages = [{ ...pages[0]!, imageUrl: "https://r.abeiai.com/picture-books/private.png" }, pages[1]!];
    await prisma.pictureBook.update({ where: { id: book.id }, data: { pages: changedPages } });
    const service = new PictureBookService({} as never, {} as never, {} as never, { recordMaterialChange: async () => null } as never, {} as never);
    await assert.rejects(service.updatePage(user.id, book.id, 0, { textLayout: layout, expectedTextLayout: "null" }), /图片或页数与公开版本不同/);
    assert.deepEqual((await prisma.pictureBook.findUniqueOrThrow({ where: { id: book.id } })).pages, changedPages);
    assert.equal((await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { pictureBookId: book.id } })).status, "APPROVED");
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); }
});

test("图文配音完成后更新同一待审稿，公开语音仍以已审核版本为准", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: { email: `layout-audio-${randomUUID()}@test.invalid`, nickname: "测试", passwordHash: "unused" } });
  try {
    const book = await prisma.pictureBook.create({ data: { userId: user.id, title: "绘本", brief: "", style: "watercolor", pageCount: 1, status: "COMPLETED", messages: [], characters: [], pages } });
    const approved = snapshotCourseMaterial("PICTURE_BOOK", book), hash = hashCourseSnapshot(approved);
    await prisma.pictureBookSubmission.create({ data: { pictureBookId: book.id, status: "APPROVED", snapshot: approved, snapshotHash: hash, publishedSnapshot: approved, publishedHash: hash, publishedCoverUrl: "https://r.abeiai.com/picture-books/cover.png", publishedAt: new Date() } });
    const audio = { listVoiceAssets: async () => ({ defaultVoice: { voiceAssetId: null, systemVoiceId: "voice" }, systemVoices: [] }), createTtsTask: async () => ({ id: "task", status: "SUCCEEDED", outputAudioAsset: { url: "https://r.abeiai.com/picture-books/new.mp3" } }) };
    const service = new PictureBookService({} as never, audio as never, { assertPictureBookR2Ready: () => undefined } as never, { recordMaterialChange: async () => null } as never, {} as never);
    await service.updatePage(user.id, book.id, 0, { textLayout: layout, expectedTextLayout: "null" });
    const first = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { pictureBookId: book.id } });
    await service.generateAudio({ userId: user.id, mode: "ACCOUNT" } as never, book.id, 0, { textLayout: true, expectedLayoutNarration: box.text });
    const next = await prisma.pictureBookSubmission.findUniqueOrThrow({ where: { pictureBookId: book.id } });
    assert.equal(next.id, first.id);
    assert.notEqual(next.snapshotHash, first.snapshotHash);
    assert.equal((await new PictureBookSubmissionService({} as never, {} as never).review(next.id)).book.pages[0]?.textLayout?.versions[0]?.audioUrl, "https://r.abeiai.com/picture-books/new.mp3");
    assert.equal((await new PictureBookSubmissionService({} as never, {} as never).publicBook(book.id)).pages[0]?.textLayout, undefined);
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); }
});
