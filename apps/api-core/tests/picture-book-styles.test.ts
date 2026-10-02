import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { SystemConfigController } from "../src/system-config/system-config.controller.js";
import { SystemConfigService } from "../src/system-config/system-config.service.js";
import { MediaService } from "../src/media/media.service.js";

const stylesModule = await import("../src/picture-books/picture-book-styles.js").catch(() => null);
const names = ["平面插画", "三维动画", "水彩", "水粉", "彩铅", "蜡笔", "拼贴", "剪纸", "钢笔淡彩", "纯线素描", "木刻版画", "黏土定格"];

test("绘画风格包含十二种默认风格、示意图及用于生成的描述", () => {
  assert.ok(stylesModule, "缺少可管理的绘画风格目录");
  const styles = stylesModule.parsePictureBookStyles(null);
  assert.deepEqual(stylesModule.parsePictureBookStyles(JSON.stringify(styles)), styles);
  assert.deepEqual(styles.map(item => item.name), names);
  assert.ok(styles.every(item => item.description && item.imageUrl && item.enabled));
  assert.match(stylesModule.pictureBookStylePrompt("温暖水彩", styles), /水彩.*晕染/);
  const renamed = styles.map(item => item.id === "watercolor" ? { ...item, name: "新水彩名称" } : item);
  for (const value of ["watercolor", "温暖水彩", "水彩"]) assert.match(stylesModule.pictureBookStylePrompt(value, renamed), /新水彩名称.*晕染/);
  const conflicting = renamed.map(item => item.id === "flat" ? { ...item, name: "watercolor" } : item);
  assert.match(stylesModule.pictureBookStylePrompt("watercolor", conflicting), /新水彩名称.*晕染/);
  assert.equal(stylesModule.pictureBookStylePrompt("已有自定义画风", styles), "已有自定义画风");
});

test("风格目录拒绝重名、空描述、不安全图片地址及全部停用", () => {
  assert.ok(stylesModule);
  const style = { id: "test", name: "测试风格", description: "温暖水彩", imageUrl: "/picture-book-styles/watercolor.webp", enabled: true };
  const parse = (items: unknown) => stylesModule.parsePictureBookStyles(JSON.stringify(items));
  assert.equal(parse([{ ...style, name: " 测试风格 " }])[0]?.name, "测试风格");
  assert.throws(() => parse([style, { ...style, id: "other" }]), /重复/);
  assert.throws(() => parse([{ ...style, description: "" }]), /描述/);
  assert.throws(() => parse([{ ...style, imageUrl: "javascript:alert(1)" }]), /图片/);
  assert.throws(() => parse([{ ...style, imageUrl: "/picture-book-styles/../secret.png" }]), /图片/);
  assert.throws(() => parse([{ ...style, enabled: false }]), /至少启用/);
  assert.throws(() => stylesModule.parsePictureBookStyles("{}"), /目录/);
});

test("后台风格修改必须先通过管理员校验", async () => {
  let wrote = false;
  const controller = new SystemConfigController({ updateConfigs: async () => { wrote = true; } } as never,
    { me: async () => { throw new Error("请先登录管理员账号"); } } as never, {} as never);
  await assert.rejects(controller.updateConfigs({}, { pictureBookStyles: "[]" }), /管理员/);
  assert.equal(wrote, false);
});

test("示意图读取只允许目录中的风格，不接受用户提供的图片地址", async () => {
  let read = false;
  const controller = new SystemConfigController({ pictureBookStyles: async () => [
    { id: "disabled", name: "停用", enabled: false, imageUrl: "https://r2.example/style.webp" }
  ] } as never, {} as never, { readPictureBookStoredImage: async () => { read = true; } } as never);
  await assert.rejects(controller.pictureBookStyleImage("missing", {} as never), /风格/);
  assert.equal(read, false);
});

test("参考图必须来自本站 R2 且为管理员素材，不能公开用户的私有生成图", async () => {
  const previous = process.env.S3_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "https://r2.example/abeiai";
  try {
    const service = Object.create(SystemConfigService.prototype) as SystemConfigService;
    let found = false; let query: unknown;
    Object.assign(service, { prisma: { mediaAsset: { findFirst: async (input: unknown) => { query = input; return found ? { id: "admin-asset" } : null; } } } });
    const style = { id: "test", name: "测试", description: "水彩", imageUrl: "https://r2.example/abeiai/image.webp", enabled: true };
    await assert.rejects(service.assertPictureBookStyleImage({ ...style, imageUrl: "https://other.example/image.webp" }), /R2/);
    assert.equal(query, undefined);
    await assert.rejects(service.assertPictureBookStyleImage(style), /管理员/);
    assert.deepEqual(query, { where: { url: style.imageUrl, mediaType: "IMAGE", storageProvider: "S3", createdByAdminId: { not: null } } });
    found = true; await service.assertPictureBookStyleImage(style);
  } finally { if (previous === undefined) delete process.env.S3_PUBLIC_BASE_URL; else process.env.S3_PUBLIC_BASE_URL = previous; }
});

test("风格参考图上传强制使用 R2，即使通用素材上传默认使用本地存储", async () => {
  const service = Object.create(MediaService.prototype) as MediaService;
  let saved: { storageProvider?: string; createdByAdminId?: string } | null = null;
  Object.assign(service, {
    assertAllowedFile: async () => "IMAGE", assertPictureBookR2Ready: () => undefined,
    persistFile: async (input: { storageProvider?: string; createdByAdminId?: string }) => { saved = input; return input; }
  });
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
  const file = { originalname: "style.png", mimetype: "image/png", size: buffer.length, buffer };
  await service.uploadFile("admin", file, "SYSTEM", "PICTURE_BOOK_STYLE");
  assert.equal((saved as { storageProvider?: string } | null)?.storageProvider, "S3");
  assert.equal((saved as { createdByAdminId?: string } | null)?.createdByAdminId, "admin");
  await assert.rejects(service.uploadFile("admin", { ...file, buffer: Buffer.from("not an image") }, "SYSTEM", "PICTURE_BOOK_STYLE"), /有效/);
});
