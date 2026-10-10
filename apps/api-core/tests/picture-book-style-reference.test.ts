import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PictureBookController } from "../src/picture-books/picture-book.controller.js";
import { MediaService } from "../src/media/media.service.js";

const userId = "owner";
const assetId = "cmur123456789abcdefghijklmn";
const image = { buffer: Buffer.from("reference bytes"), mimetype: "image/webp" };
const referenceUrl = "https://cdn.abei.example/reference.webp";
const subject = { userId, mode: "ACCOUNT" as const, learnerId: null };

function setup(style = "watercolor") {
  const book = { id: "book", userId, style, aspectRatio: "3:2", characters: [], pages: [{ position: 1, imagePrompt: "阿禾走在森林的小路上", imageUrl: null }] };
  const requests: Array<Record<string, unknown>> = [];
  const assetQueries: unknown[] = [];
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(service, {
    get: async () => book,
    mutate: async (_user: string, _id: string, change: (current: typeof book) => unknown) => change(book),
    localCharacterReferences: async () => [{ name: "阿禾.png", type: "image", mimeType: "image/png", size: 2, dataUrl: "data:image/png;base64,Q0g=" }],
    prisma: {
      mediaAsset: { findFirst: async (query: unknown) => { assetQueries.push(query); return null; } },
      systemConfig: { findUnique: async () => ({ value: JSON.stringify([{ id: "watercolor", name: "水彩", description: "不得作为图片生成提示词的风格描述", imageUrl: referenceUrl, enabled: true }]) }) },
      pictureBook: { create: async () => book }
    },
    systemConfigService: { pictureBookStyles: async () => [{ id: "watercolor", name: "水彩", description: "不得作为图片生成提示词的风格描述", imageUrl: referenceUrl, enabled: true }], assertPictureBookStyleImage: async () => undefined },
    mediaService: { assertPictureBookR2Ready: () => undefined, readPictureBookStoredImage: async () => image },
    aiService: { generatePictureBookImage: async (_subject: unknown, dto: Record<string, unknown>) => { requests.push(dto); return { id: "task", images: [{ url: "https://cdn.abei.example/result.webp" }] }; } }
  });
  return { service, book, requests, assetQueries };
}

test("官方画风必须传入第一张参考图，画风描述不再写进生图提示词", async () => {
  const { service, requests } = setup();
  await service.generateImage(subject, "book", 1, {});
  const references = requests[0].referenceImages as Array<{ name: string; dataUrl: string }>;
  assert.equal(references[0].name, "风格参考图.webp");
  assert.equal(references[0].dataUrl, "data:image/webp;base64,cmVmZXJlbmNlIGJ5dGVz");
  assert.equal(references[1].name, "阿禾.png");
  assert.match(String(requests[0].prompt), /第1张.*风格/);
  assert.doesNotMatch(String(requests[0].prompt), /不得作为图片生成提示词的风格描述|水彩/);
});

test("生成旧封面时也使用当前标题和封面设计要求，正文仍不生成文字", async () => {
  const { service, book, requests } = setup();
  Object.assign(book, { title: "阿奇和面条", theme: "耐心与协作", brief: "小狗学做面条" });
  book.pages = [{ position: 0, imagePrompt: "绘本封面插画，主题：耐心。突出故事主角与主要场景，留出标题空间，画面中不要生成文字。", imageUrl: null }];
  await service.generateImage(subject, "book", 0, {});
  const cover = String(requests[0].prompt);
  assert.match(cover, /标题「阿奇和面条」/);
  assert.match(cover, /标题排版.*\n.*封面构图.*\n.*整体设计/);
  assert.doesNotMatch(cover, /不要生成文字|不要出现文字/);
  book.pages = [{ position: 1, imagePrompt: "小狗揉面", imageUrl: null }];
  await service.generateImage(subject, "book", 1, {});
  assert.match(String(requests[1].prompt), /不要出现文字/);
  assert.doesNotMatch(String(requests[1].prompt), /标题排版/);
});

test("长角色描述不能截掉封面标题，标题生成期间更改时不覆盖封面", async () => {
  const { service, book, requests } = setup();
  Object.assign(book, { title: "月亮邮局", theme: "分享", characters: [{ name: "阿兔", description: "白兔".repeat(1000) }] });
  book.pages = [{ position: 0, imagePrompt: "月亮下的森林", imageUrl: null }];
  Object.assign(service, { mutate: async (_user: string, _id: string, change: (current: unknown) => unknown) => change({ ...book, title: "星星邮局" }) });
  await assert.rejects(service.generateImage(subject, "book", 0, {}), /标题.*修改/);
  assert.match(String(requests[0].prompt), /标题「月亮邮局」/);
  assert.equal(String(requests[0].prompt).length, 2000);
  assert.equal(book.pages[0]!.imageUrl, null);
});

test("自定义参考图不存在或属于其他用户时先拒绝，不能调用生成模型", async () => {
  const { service, requests, assetQueries } = setup(`custom:${assetId}`);
  await assert.rejects(service.generateImage(subject, "book", 1, {}), /参考图/);
  assert.equal(requests.length, 0);
  assert.deepEqual(assetQueries[0], { where: { id: assetId, createdByUserId: userId, createdByAdminId: null, mediaType: "IMAGE", sourceType: "USER_UPLOAD", storageProvider: "S3" } });
});

test("自定义参考图必须通过所有权校验才能读取或保存到绘本", async () => {
  const { service, assetQueries } = setup();
  await assert.rejects(service.customStyleImage(userId, assetId), /参考图/);
  await assert.rejects(service.create(userId, { brief: "森林故事", style: `custom:${assetId}`, pageCount: 4 }), /参考图/);
  await assert.rejects(service.update(userId, "book", { style: `custom:${assetId}` }), /参考图/);
  assert.equal(assetQueries.length, 3);
});

test("自定义风格上传只接收有效图片并强制归档 R2", async () => {
  const { service } = setup();
  let stored: unknown[] = [];
  Object.assign(service, { mediaService: { uploadUserPictureBookImage: async (...args: unknown[]) => { stored = args; return { id: assetId }; } } });
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
  const uploaded = await service.uploadStyleReference(userId, { originalname: "style.png", mimetype: "image/png", size: buffer.length, buffer });
  assert.deepEqual(uploaded, { style: `custom:${assetId}` });
  assert.equal(stored[0], userId);
  assert.equal(stored[2], true);
  await assert.rejects(service.uploadStyleReference(userId, { originalname: "fake.png", mimetype: "image/png", size: 4, buffer: Buffer.from("fake") }), /有效/);
});

test("自定义参考图接口需要账号身份，学习者或未登录请求不能上传或读取", async () => {
  let accessed = false;
  const controller = new PictureBookController({ uploadStyleReference: async () => { accessed = true; }, customStyleImage: async () => { accessed = true; } } as never,
    { me: async () => ({ id: userId }) } as never,
    { requireAccount: async () => { throw new Error("请切换到账号身份"); } } as never);
  await assert.rejects(controller.uploadStyleReference({}), /账号身份/);
  await assert.rejects(controller.customStyleImage({}, assetId, {} as never), /账号身份/);
  assert.equal(accessed, false);
});

test("风格上传强制 R2，不受通用素材本地存储设置影响", async () => {
  const service = Object.create(MediaService.prototype) as MediaService;
  let stored: Record<string, unknown> = {};
  Object.assign(service, { assertPictureBookR2Ready: () => undefined, persistFile: async (input: Record<string, unknown>) => { stored = input; return input; } });
  await service.uploadUserPictureBookImage(userId, { originalname: "style.webp", mimetype: "image/webp", size: 4, buffer: Buffer.from("test") }, true);
  assert.equal(stored.storageProvider, "S3");
  assert.equal(stored.createdByUserId, userId);
});

test("生成中更换画风时不能把旧画风结果覆盖到绘本", async () => {
  const { service, book } = setup();
  Object.assign(service, { mutate: async (_user: string, _id: string, change: (current: typeof book) => unknown) => change({ ...book, style: "gouache" }) });
  await assert.rejects(service.generateImage(subject, "book", 1, {}), /画风.*修改/);
});

test("绘本可以保留九个角色，为默认模型预留一张风格参考图", async () => {
  const { service } = setup();
  const characters = Array.from({ length: 9 }, (_, index) => ({ name: `角色${index}`, description: "黄色连衣裙" }));
  const updated = await service.update(userId, "book", { characters });
  assert.equal((updated as unknown as {characters:unknown[]}).characters.length, 9);
});

test("合法自定义风格用本人 R2 素材作为首张参考图", async () => {
  const { service, requests } = setup(`custom:${assetId}`);
  Object.assign(service, { prisma: { mediaAsset: { findFirst: async () => ({ id: assetId, url: referenceUrl }) } } });
  const read = await service.customStyleImage(userId, assetId);
  assert.equal(read.mimetype, "image/webp");
  await service.generateImage(subject, "book", 1, {});
  assert.equal((requests[0].referenceImages as Array<{name:string}>)[0].name, "风格参考图.webp");
});

test("新环境的官方风格也从随项目提供的参考图读取", async () => {
  const { service, requests } = setup();
  Object.assign(service, { systemConfigService: { pictureBookStyles: async () => [{ id: "watercolor", name: "水彩", description: "仅展示说明", imageUrl: "/picture-book-styles/watercolor.webp", enabled: true }], assertPictureBookStyleImage: async () => undefined } });
  await service.generateImage(subject, "book", 1, {});
  const reference = (requests[0].referenceImages as Array<{size:number;dataUrl:string}>)[0];
  assert.ok(reference.size > 1000);
  assert.ok(reference.dataUrl.startsWith("data:image/webp;base64,"));
});


test("跨页内页生成和费用预估采用相同双宽尺寸，封面保留单页尺寸", async () => {
  const { service, book, requests } = setup();
  Object.assign(book, { isSpread: true });
  book.pages.push({ position: 0, imagePrompt: "封面", imageUrl: null });
  Object.assign(service, { aiService: {
    generatePictureBookImage: async (_subject: unknown, dto: Record<string, unknown>) => { requests.push(dto); return { id: "task", images: [{ url: "https://cdn.abei.example/result.webp" }] }; },
    quotePictureBookImage: async (input: Record<string, unknown>) => input
  } });
  await service.generateImage(subject, "book", 1, {});
  assert.equal(requests[0].width, 3072);
  assert.equal(requests[0].height, 1024);
  assert.match(String(requests[0].prompt), /横向.*左右两页.*宽度.*两倍/);
  assert.deepEqual(await service.generationCost(userId, "book", { kind: "image", position: 1 }), { width: 3072, height: 1024, referenceImageCount: 1 });
  await service.generateImage(subject, "book", 0, {});
  assert.equal(requests[1].width, 1536);
  assert.equal(requests[1].height, 1024);
  assert.deepEqual(await service.generationCost(userId, "book", { kind: "image", position: 0 }), { width: 1536, height: 1024, referenceImageCount: 1 });
});

test("图片生成期间调整比例或跨页设置时，不写回旧尺寸结果", async () => {
  for (const patch of [{ aspectRatio: "1:1" }, { isSpread: true }]) {
    const { service, book } = setup();
    Object.assign(service, { mutate: async (_user: string, _id: string, change: (current: typeof book) => unknown) => change({ ...book, ...patch }) });
    await assert.rejects(service.generateImage(subject, "book", 1, {}), /比例|跨页/);
  }
});

test("新建作品默认不跨页，并可保存跨页开关", async () => {
  const { service } = setup();
  Object.assign(service, { resolveCharacters: async () => [], prisma: { pictureBook: { create: async (input: { data: unknown }) => input.data } } });
  const dto = { brief: "森林冒险", style: "watercolor", pageCount: 8 };
  assert.equal((await service.create(userId, dto)).isSpread, false);
  assert.equal((await service.create(userId, { ...dto, isSpread: true })).isSpread, true);
  assert.equal((await service.update(userId, "book", { isSpread: true })).isSpread, true);
  assert.equal((await service.update(userId, "book", { isSpread: false })).isSpread, false);
});

test("分镜生成期间调整比例或跨页设置时，不保存旧构图分镜", async () => {
  for (const patch of [{ aspectRatio: "1:1" }, { isSpread: true }]) {
    const { service, book } = setup();
    Object.assign(book, { brief: "森林冒险", audience: "幼儿园", pageCount: 1, messages: [], isSpread: false });
    Object.assign(service, {
      runTextTask: async (_subject: unknown, kind: string) => kind === "picture-book-outline"
        ? JSON.stringify({ title: "森林冒险", theme: "友情", plot: "阿禾走进森林", pages: [{ caption: "阿禾走进森林。", imagePrompt: "阿禾走进森林" }] })
        : JSON.stringify({ ageAppropriate: true, healthy: true, issues: [] }),
      mutate: async (_user: string, _id: string, change: (current: typeof book) => unknown) => change({ ...book, ...patch })
    });
    await assert.rejects(service.outline(subject, "book"), /比例|跨页/);
  }
});
