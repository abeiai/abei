import assert from "node:assert/strict";
import test from "node:test";
import * as cast from "../src/picture-books/picture-book-characters.js";
import { officialCharacterImageUrls } from "../src/picture-books/picture-book-character-assets.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";

test("讨论提取角色，保留用户已经选择的形象和名称", () => {
  const result = cast.parseCharacterDiscussion('{"reply":"一起寻找星星吧。","characters":[{"name":"乐乐","description":"勇敢的小女孩","kind":"girl","definedAppearance":false}]}');
  const selected = { id: "own-girl", name: "乐乐", description: "棕色长发，绿裙子", imageUrl: "selected" };
  assert.deepEqual(cast.mergeDiscussedCharacters([selected], result.characters), [selected]);
  const added = cast.mergeDiscussedCharacters([], result.characters);
  assert.equal(added[0]?.name, "乐乐");
  assert.equal(added[0]?.id, undefined);
  assert.equal(added[0]?.description, "勇敢的小女孩");
});

test("沟通先提取多个角色名字，未选择形象时不自动绑定默认图片", () => {
  const output = { reply: "已记录三位朋友", characters: ["小明", "张华", "Tom"].map(name => ({ name, description: "外貌待确定", kind: "boy", definedAppearance: false })) };
  const roles = cast.mergeDiscussedCharacters([], cast.parseCharacterDiscussion(JSON.stringify(output)).characters);
  assert.deepEqual(roles.map(item => item.name), ["小明", "张华", "Tom"]);
  assert.ok(roles.every(item => !item.id && !item.imageUrl));
});

test("同一参考形象可供多个角色使用，风格切换始终保留故事名称并返回形象名称", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  Object.assign(service, { prisma: { pictureBookCharacter: { findMany: async () => [] } } });
  const selected = ["小明", "张华", "Tom"].map(name => ({ id: "preset:boy", name, description: "外貌待确定" }));
  for (const style of ["watercolor", "clay-stop-motion"]) {
    const resolved = await service.resolveCharacters("owner", selected, style);
    assert.deepEqual(resolved.map((item: any) => item.name), ["小明", "张华", "Tom"]);
    assert.ok(resolved.every((item: any) => item.referenceName === "小男孩" && item.imageUrl === cast.officialCharacter("preset:boy", style)?.imageUrl));
  }
});

test("用户指定的外貌不会被默认男孩女孩覆盖，模型非法数据不进入角色库", () => {
  const result = cast.parseCharacterDiscussion('```json\n{"reply":"好的","characters":[{"name":"亮亮","description":"金发蓝眼睛，绿色衬衫","kind":"boy","definedAppearance":true}]}\n```');
  const added = cast.mergeDiscussedCharacters([], result.characters);
  assert.equal(added[0]?.id, undefined);
  assert.equal(added[0]?.description, "金发蓝眼睛，绿色衬衫");
  assert.throws(() => cast.parseCharacterDiscussion('{"reply":"好的","characters":[{"name":"坏角色"}]}'), /角色/);
});

test("先选择通用男孩女孩，再讨论角色名字时匹配已有形象而不重复添加", () => {
  const selected = [{ ...cast.officialCharacters[0]!, imageUrl: "boy" }, { ...cast.officialCharacters[1]!, imageUrl: "girl" }];
  const roles = cast.parseCharacterDiscussion('{"reply":"好的","characters":[{"name":"阿明","previousName":"小男孩","description":"好奇的小男孩","kind":"boy","definedAppearance":false},{"name":"小红","previousName":"小女孩","description":"勇敢的小女孩","kind":"girl","definedAppearance":false}]}').characters;
  const merged = cast.mergeDiscussedCharacters(selected, roles);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(item => [item.name, item.id]), [["阿明", "preset:boy"], ["小红", "preset:girl"]]);
});

test("用户在下一轮明确修改角色外貌时，自动匹配的默认形象会解除", () => {
  const initial = cast.parseCharacterDiscussion('{"reply":"好的","characters":[{"name":"乐乐","description":"小男孩","kind":"boy","definedAppearance":false}]}');
  const selected = cast.mergeDiscussedCharacters([], initial.characters);
  const changed = cast.parseCharacterDiscussion('{"reply":"已改为金发红衣","characters":[{"name":"乐乐","description":"金色短发，红色上衣","kind":"boy","definedAppearance":true,"replaceAppearance":true}]}');
  const next = cast.mergeDiscussedCharacters(selected, changed.characters);
  assert.equal(next[0]?.id, undefined);
  assert.equal(next[0]?.description, "金色短发，红色上衣");
});

test("模型重复输出通用名和新名字时，仍只保留对应的两个角色形象", () => {
  const selected = cast.officialCharacters.map(item => ({ ...item, imageUrl: "selected" }));
  const output = { reply: "已命名", characters: [
    { name: "阿明", previousName: "小男孩", description: selected[0]!.description, kind: "boy", definedAppearance: true },
    { name: "小红", previousName: "小女孩", description: selected[1]!.description, kind: "girl", definedAppearance: true },
    { name: "小男孩", description: selected[0]!.description, kind: "boy", definedAppearance: true },
    { name: "小女孩", description: selected[1]!.description, kind: "girl", definedAppearance: true }
  ] };
  const merged = cast.mergeDiscussedCharacters(selected, cast.parseCharacterDiscussion(JSON.stringify(output)).characters);
  assert.deepEqual(merged.map(item => [item.name, item.id]), [["阿明", "preset:boy"], ["小红", "preset:girl"]]);
});

test("新增同类角色不根据性别或参考形象名字改名已有角色", () => {
  const original = { ...cast.officialCharacters[0]!, imageUrl: "selected" };
  const output = { reply: "新增Tom", characters: [{ name: original.name, description: original.description, kind: "boy", definedAppearance: false }, { name: "Tom", description: "外貌待确定", kind: "boy", definedAppearance: false }] };
  const merged = cast.mergeDiscussedCharacters([original], cast.parseCharacterDiscussion(JSON.stringify(output)).characters);
  assert.deepEqual(merged.map(item => [item.name, item.id]), [["小男孩", "preset:boy"], ["Tom", undefined]]);
});

test("最新讨论返回完整角色列表，更正后不再保留被排除的旧名字", () => {
  const current = ["阿奇", "小明", "大明"].map(name => ({ name, description: "外貌待确定", imageUrl: null }));
  const output = { reply: "是大明", characters: ["阿奇", "大明"].map(name => ({ name, description: "外貌待确定", kind: "other", definedAppearance: false })) };
  assert.deepEqual(cast.mergeDiscussedCharacters(current, cast.parseCharacterDiscussion(JSON.stringify(output)).characters).map(item => item.name), ["阿奇", "大明"]);
});

test("删除或换掉角色时同步移除旧角色，替换角色不继承旧形象", () => {
  const current = [{ name: "阿奇", description: "小狗", imageUrl: null }, { id: "preset:boy", name: "大明", description: "蓝衣", imageUrl: "blue" }];
  const output = { reply: "改为小红陪伴", characters: [{ name: "阿奇", description: "小狗", kind: "other", definedAppearance: false }, { name: "小红", description: "外貌待确定", kind: "girl", definedAppearance: false }] };
  const next = cast.mergeDiscussedCharacters(current, cast.parseCharacterDiscussion(JSON.stringify(output)).characters);
  assert.deepEqual(next.map(item => [item.name, item.id]), [["阿奇", undefined], ["小红", undefined]]);
  assert.deepEqual(cast.mergeDiscussedCharacters(current, []), []);
});

test("改名后已有无形象的重复记录合并，保留原角色参考图和快照", () => {
  const selected = { id: "own", name: "小明", description: "蓝衣", imageUrl: "blue", referenceName: "男孩形象", legacyImageUrl: "blue", legacyStyle: "watercolor" };
  const current = [selected, { name: "大明", description: "外貌待确定", imageUrl: null }];
  const output = { reply: "更正为大明", characters: [{ name: "大明", previousName: "小明", description: "外貌待确定", kind: "boy", definedAppearance: false }] };
  assert.deepEqual(cast.mergeDiscussedCharacters(current, cast.parseCharacterDiscussion(JSON.stringify(output)).characters), [{ ...selected, name: "大明" }]);
});

test("沟通为已选角色改名时保留形象，明确同时改外貌则解除旧形象", () => {
  const current = [{ id: "own", name: "小男孩", description: "绿衣", imageUrl: "green" }];
  const renamed = cast.parseCharacterDiscussion('{"reply":"已改名","characters":[{"name":"阿明","previousName":"小男孩","description":"绿衣","kind":"boy","definedAppearance":false}]}');
  assert.deepEqual(cast.mergeDiscussedCharacters(current, renamed.characters).map(item => [item.name, item.id]), [["阿明", "own"]]);
  const changed = cast.parseCharacterDiscussion('{"reply":"已修改","characters":[{"name":"阿明","previousName":"小男孩","description":"金发红衣","kind":"boy","definedAppearance":true,"replaceAppearance":true}]}');
  assert.equal(cast.mergeDiscussedCharacters(current, changed.characters)[0]?.id, undefined);
});

test("改名不能占用另一出场角色的名字，源角色优先按原名定位", () => {
  const current = [{ id: "own-a", name: "阿明", description: "蓝衣", imageUrl: "blue" }, { id: "own-b", name: "乐乐", description: "绿衣", imageUrl: "green" }];
  const renamed = cast.parseCharacterDiscussion('{"reply":"已改名","characters":[{"name":"乐乐","previousName":"阿明","description":"蓝衣","kind":"boy","definedAppearance":false}]}');
  assert.throws(() => cast.mergeDiscussedCharacters(current, renamed.characters), /名称.*占用/);
  assert.deepEqual(current.map(item => item.name), ["阿明", "乐乐"]);
});

test("角色图提交事务同步更新引用绘本版本，避免页图提交绕过角色变化", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  let revision = 0;
  let inTransaction = false;
  const row = { id: "own", imageUrl: "identity", styleImages: {}, updatedAt: new Date() };
  Object.assign(service, { prisma: { pictureBookCharacter: { findFirst: async () => row, updateMany: async () => { assert.equal(inTransaction, true); return { count: 1 }; } }, pictureBook: { updateMany: async ({ where, data }: any) => { assert.equal(inTransaction, true); assert.equal(where.userId, "owner"); assert.deepEqual(where.characters.array_contains, [{ id: "own" }]); revision += data.version.increment; return { count: 1 }; } }, $transaction: async (operation: any) => { inTransaction = true; try { return await operation(service.prisma); } finally { inTransaction = false; } } } });
  await service.saveCharacterStyle("owner", "own", "identity", "watercolor", "water", null);
  assert.equal(revision, 1);
});

test("讨论生成期间用户改选角色形象，旧讨论不能覆盖新选择", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  let current = { id: "book", brief: "小男孩乐乐", audience: "3岁", messages: [], characters: [{ id: "preset:boy", name: "乐乐", description: "蓝衣", imageUrl: "blue" }] };
  Object.assign(service, { get: async () => current, mutate: async (_user: string, _id: string, change: any) => { current = { ...current, ...change(current) }; return current; }, runTextTask: async () => { current = { ...current, characters: [{ id: "own-green", name: "乐乐", description: "绿衣", imageUrl: "green" }] }; return '{"reply":"改为红衣","characters":[{"name":"乐乐","description":"红衣","kind":"boy","definedAppearance":true,"replaceAppearance":true}]}'; } });
  await assert.rejects(service.discuss({ userId: "owner", mode: "ACCOUNT" }, "book", { message: "改为红衣" }), /角色.*修改/);
  assert.equal(current.characters[0]?.id, "own-green");
});

test("同一角色按风格解析；缺少变体时不显示其他风格图片", () => {
  assert.equal(cast.characterStyleKey("水彩"), "watercolor");
  assert.equal(cast.characterImageForStyle({ imageUrl: "old", styleImages: { watercolor: "water", flat: "flat" } }, "水彩"), "water");
  assert.equal(cast.characterImageForStyle({ imageUrl: "old", styleImages: { flat: "flat" } }, "watercolor"), null);
  assert.equal(cast.characterImageForStyle({ styleImages: { "水彩": "legacy-water" } }, "watercolor"), "legacy-water");
  assert.equal(cast.officialCharacter("preset:girl", "watercolor")?.imageUrl, officialCharacterImageUrls["girl/watercolor"]);
  assert.equal(cast.officialCharacter("preset:girl", "custom:abcdefghijklmnopqrst")?.imageUrl, null);
});

test("选择任意角色 URL 不可绕过所属用户的角色图片", async () => {
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(service, { prisma: {
    pictureBookCharacter: { findMany: async () => [] },
    mediaAsset: { findFirst: async () => { throw new Error("不应读取非本人图片"); } }
  } });
  const references = await (service as any).localCharacterReferences("owner", [{ id: "foreign", name: "他人的角色", description: "外貌", imageUrl: "https://external.example/evil" }], "watercolor");
  assert.deepEqual(references, []);
});

test("图片参考采用当前风格变体，不读取旧的主图片", async () => {
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(service, { prisma: {
    pictureBookCharacter: { findMany: async () => [{ id: "own", name: "乐乐", imageUrl: "old", styleImages: { watercolor: "water" } }] },
    mediaAsset: { findFirst: async ({ where }: any) => { assert.equal(where.url, "water"); assert.equal(where.createdByUserId, "owner"); return { url: "water", storageProvider: "S3" }; } }
  }, mediaService: { readPictureBookStoredImage: async () => ({ buffer: Buffer.from("current-style-bytes"), mimetype: "image/webp" }) } });
  const references = await (service as any).localCharacterReferences("owner", [{ id: "own", name: "乐乐", description: "外貌" }], "watercolor");
  assert.equal(Buffer.from(references[0].dataUrl.split(",")[1], "base64").toString(), "current-style-bytes");
});

test("旧绘本的同风格角色图片快照保留，换风格才采用角色库变体", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  Object.assign(service, { prisma: { pictureBookCharacter: { findMany: async () => [{ id: "own", name: "乐乐", description: "蓝衣", styleImages: { watercolor: "latest-water", flat: "flat" } }] } } });
  const snapshot = { id: "own", name: "乐乐", description: "蓝衣", imageUrl: "book-old-water", legacyImageUrl: "book-old-water", legacyStyle: "水彩" };
  assert.equal((await service.resolveCharacters("owner", [snapshot], "watercolor"))[0].imageUrl, "book-old-water");
  const flat = (await service.resolveCharacters("owner", [snapshot], "flat"))[0];
  assert.equal(flat.imageUrl, "flat");
  assert.equal(flat.legacyImageUrl, "book-old-water");
});

test("角色生成始终携带第1张风格图和第2张身份图，新增风格不覆盖其他变体", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  let row = { id: "own", userId: "owner", name: "乐乐", description: "黑短发蓝衣", imageUrl: "source", styleImages: { flat: "flat" }, updatedAt: new Date() };
  Object.assign(service, {
    prisma: { pictureBookCharacter: { findFirst: async () => row, updateMany: async ({ data }: any) => { row = { ...row, ...data }; return { count: 1 }; } }, mediaAsset: { findFirst: async () => ({ url: "source", storageProvider: "S3" }) } },
    mediaService: { assertPictureBookR2Ready() {}, readPictureBookStoredImage: async () => ({ buffer: Buffer.from("identity"), mimetype: "image/webp" }) },
    styleReference: async () => ({ buffer: Buffer.from("style"), mimetype: "image/webp" }),
    aiService: { generatePictureBookImage: async (_subject: unknown, input: any) => { assert.equal(input.referenceImages.length, 2); assert.equal(Buffer.from(input.referenceImages[0].dataUrl.split(",")[1], "base64").toString(), "style"); assert.equal(Buffer.from(input.referenceImages[1].dataUrl.split(",")[1], "base64").toString(), "identity"); return { images: [{ url: "water" }] }; } }
  });
  service.prisma.$transaction = async (operation: any) => operation(service.prisma);
  service.prisma.pictureBook = { updateMany: async () => ({ count: 0 }) };
  const updated = await service.generateCharacterImage({ userId: "owner", mode: "ACCOUNT" }, "own", undefined, "watercolor");
  assert.equal(updated.imageUrl, "water");
  assert.deepEqual(row.styleImages, { flat: "flat", watercolor: "water" });
  assert.equal(row.imageUrl, "source");
});

test("生成期间用户替换身份图，旧任务不得覆盖新角色", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  const original = { id: "own", userId: "owner", name: "乐乐", description: "蓝衣", imageUrl: "source", styleImages: {}, updatedAt: new Date() };
  let row = original;
  Object.assign(service, { prisma: { pictureBookCharacter: { findFirst: async () => row }, mediaAsset: { findFirst: async () => null } }, mediaService: { assertPictureBookR2Ready() {} }, styleReference: async () => ({ buffer: Buffer.from("style"), mimetype: "image/webp" }), aiService: { generatePictureBookImage: async () => { row = { ...original, imageUrl: "new-upload" }; return { images: [{ url: "stale" }] }; } } });
  await assert.rejects(service.generateCharacterImage({ userId: "owner", mode: "ACCOUNT" }, "own", undefined, "watercolor"), /角色.*修改|形象.*修改/);
});

test("上传当前风格图片保留其他风格，并强制保存到R2", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  let row = { id: "own", userId: "owner", name: "乐乐", description: "黑短发", imageUrl: "identity", styleImages: { flat: "flat" }, updatedAt: new Date() };
  Object.assign(service, { prisma: { pictureBookCharacter: { findFirst: async () => row, updateMany: async ({ data }: any) => { row = { ...row, ...data }; return { count: 1 }; } } },
    mediaService: { uploadUserPictureBookImage: async (_user: string, _file: unknown, r2: boolean) => { assert.equal(r2, true); return { url: "water" }; } }, validateCustomStyle: async () => {} });
  service.prisma.$transaction = async (operation: any) => operation(service.prisma);
  service.prisma.pictureBook = { updateMany: async () => ({ count: 0 }) };
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
  await service.uploadCharacterImage("owner", "own", { originalname: "role.png", mimetype: "image/png", size: buffer.length, buffer }, "watercolor");
  assert.deepEqual(row.styleImages, { flat: "flat", watercolor: "water" });
  assert.equal(row.imageUrl, "water");
});

test("编辑其他出场角色，不会清除未修改角色的旧绘本图片快照", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  const old = { id: "own", name: "乐乐", description: "蓝衣", imageUrl: "old", legacyImageUrl: "old", legacyStyle: "watercolor" };
  const current = { style: "watercolor", pageCount: 4, pages: [], characters: [old] };
  Object.assign(service, { resolveCharacters: async () => [], mutate: async (_user: string, _id: string, change: any) => change(current) });
  const unchanged = await service.update("owner", "book", { characters: [old, { id: "preset:girl", name: "小红", description: "红裙", imageUrl: "girl" }] });
  assert.equal(unchanged.characters[0].legacyImageUrl, "old");
  const reselected = await service.update("owner", "book", { characters: [{ ...old, imageUrl: "latest" }] });
  assert.equal(reselected.characters[0].legacyImageUrl, undefined);
});

test("当前风格已经上传新图时，较早的生成结果不能覆盖", async () => {
  const service = Object.create(PictureBookService.prototype) as any;
  const original = { id: "own", userId: "owner", name: "乐乐", description: "蓝衣", imageUrl: null, styleImages: { watercolor: "before" }, updatedAt: new Date() };
  let row = original;
  Object.assign(service, { prisma: { pictureBookCharacter: { findFirst: async () => row }, mediaAsset: { findFirst: async () => null } }, mediaService: { assertPictureBookR2Ready() {} }, styleReference: async () => ({ buffer: Buffer.from("style"), mimetype: "image/webp" }), aiService: { generatePictureBookImage: async () => { row = { ...original, styleImages: { watercolor: "new-upload" } }; return { images: [{ url: "stale" }] }; } } });
  await assert.rejects(service.generateCharacterImage({ userId: "owner", mode: "ACCOUNT" }, "own", undefined, "watercolor"), /形象.*修改/);
});
