import assert from "node:assert/strict";
import test from "node:test";
import { updatePictureBookPage } from "../src/picture-books/picture-book-plan.js";
import { playbackFromSnapshot } from "../src/picture-books/picture-book-playback.js";
import { snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { layoutNarration } from "../src/picture-books/picture-book-text-layout.js";

const box = (id: string, text: string, speak = true) => ({ id, text, x: 0.1, y: 0.2, width: 0.5, height: 0.2, fontSize: 32, fontFamily: "sans", color: "#111111", bold: false, align: "left" as const, lineHeight: 1.5, speak });
const layout = { enabled: true, versions: [{ language: "original", boxes: [box("a", "标题", false), box("b", "第一句"), box("c", "第二句")], audioUrl: "https://r.example/old.mp3" }] };
const page = { position: 1, caption: "旧文字", narration: "旧旁白", imagePrompt: "画面", imageUrl: "https://r.example/image.png", imageTaskId: null, audioUrl: "https://r.example/legacy.mp3", audioTaskId: null, textLayout: layout };

test("按文本框顺序仅合成选中的内容", () => {
  assert.equal(layoutNarration(layout.versions[0]!), "第一句\n第二句");
});

test("编辑文字层保留图片，只有配音内容变化才使当前语言语音失效", () => {
  const moved = structuredClone(layout); moved.versions[0]!.boxes[1]!.x = 0.3;
  const unchanged = updatePictureBookPage(page, { textLayout: moved });
  assert.equal(unchanged.imageUrl, page.imageUrl);
  assert.equal(unchanged.textLayout?.versions[0]?.audioUrl, "https://r.example/old.mp3");
  const changed = structuredClone(layout); changed.versions[0]!.boxes[1]!.text = "改写";
  const updated = updatePictureBookPage(page, { textLayout: changed });
  assert.equal(updated.textLayout?.versions[0]?.audioUrl, null);
  assert.equal(updated.audioUrl, page.audioUrl);
});

test("审核快照和播放器保留图文编排，且不公开额外字段", () => {
  const snapshot = snapshotCourseMaterial("PICTURE_BOOK", { title: "书", pages: [{ ...page, textLayout: { ...layout, secret: "private" } }] });
  const playback = playbackFromSnapshot("book", snapshot);
  assert.equal(playback.pages[0]?.textLayout?.versions[0]?.boxes[1]?.text, "第一句");
  assert.equal(JSON.stringify(snapshot).includes("private"), false);
});

test("英文原书的图文编排允许同图中文文字层，不需要语音", () => {
  const bilingual = { enabled: true, versions: [
    { language: "original", boxes: [box("cover", "Shongololo's Shoes")], audioUrl: null },
    { language: "zh-CN", boxes: [box("cover", "松果洛洛的鞋子")], audioUrl: null }
  ] };
  const snapshot = snapshotCourseMaterial("PICTURE_BOOK", { title: "Shongololo's Shoes", pages: [{ ...page, textLayout: bilingual }] });
  const versions = playbackFromSnapshot("book", snapshot).pages[0]?.textLayout?.versions;
  assert.equal(versions?.find(version => version.language === "zh-CN")?.boxes[0]?.text, "松果洛洛的鞋子");
  assert.equal(versions?.find(version => version.language === "original")?.boxes[0]?.text, "Shongololo's Shoes");
});

test("快照只公开当前生效的文字，关闭编排不暴露未审核的图层草稿", () => {
  const active = snapshotCourseMaterial("PICTURE_BOOK", { pages: [{ ...page, caption: "不展示的旧内容", narration: "旧文稿", translations: [{ language: "fr", caption: "未展示的旧译文", audioUrl: null }] }] });
  assert.doesNotMatch(JSON.stringify(active), /不展示的旧内容|旧文稿|未展示的旧译文/);
  const disabled = snapshotCourseMaterial("PICTURE_BOOK", { pages: [{ ...page, textLayout: { ...layout, enabled: false } }] });
  assert.doesNotMatch(JSON.stringify(disabled), /第一句|第二句|old\.mp3/);
  assert.equal(playbackFromSnapshot("book", disabled).pages[0]?.caption, "旧文字");
});

test("拒绝过大的布局，以保证首次保存后仍能提交并发基线", async () => {
  const { parseTextLayout } = await import("../src/picture-books/picture-book-text-layout.js");
  const versions = Array.from({ length: 5 }, (_, i) => ({ language: ["original", "en", "fr", "de", "es"][i]!, audioUrl: null, boxes: Array.from({ length: 40 }, (_, j) => box(`${i}-${j}`, "文".repeat(1000))) }));
  assert.throws(() => parseTextLayout({ enabled: true, versions }), /图文编排数据无效/);
});

test("图文编排生成语音按序取文本框并只写入指定语言", async () => {
  const { PictureBookService } = await import("../src/picture-books/picture-book.service.js");
  const book = { pages: [{ ...page, textLayout: { enabled: true, versions: [layout.versions[0]!, { language: "en", boxes: [box("x", "One"), box("y", "Skip", false), box("z", "Two")], audioUrl: null }] } }] };
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  Object.assign(service, { get: async () => book, mediaService: { assertPictureBookR2Ready: () => undefined }, audioService: {
    listVoiceAssets: async () => ({ defaultVoice: { voiceAssetId: null, systemVoiceId: "voice" }, systemVoices: [] }),
    createTtsTask: async (_user: unknown, request: { text: string }) => { assert.equal(request.text, "One\nTwo"); return { id: "task", status: "SUCCEEDED", outputAudioAsset: { url: "https://r.example/en.mp3" } }; }
  }, mutate: async (_user: string, _id: string, change: (current: typeof book) => { pages: typeof book.pages }) => { book.pages = change(book).pages; return book; } });
  await service.generateAudio({ userId: "owner", mode: "ACCOUNT" }, "book", 1, { language: "en", textLayout: true });
  assert.equal(book.pages[0]?.textLayout.versions[1]?.audioUrl, "https://r.example/en.mp3");
  assert.equal(book.pages[0]?.textLayout.versions[0]?.audioUrl, "https://r.example/old.mp3");
  assert.equal(book.pages[0]?.audioUrl, "https://r.example/legacy.mp3");
  await assert.rejects(service.generateAudio({ userId: "owner", mode: "ACCOUNT" }, "book", 1, { language: "en", textLayout: true, expectedLayoutNarration: "过期的确认文稿" }), /重新确认费用/);
});

test("改变语言声音会使该语言原语音失效，且声音资产标识不会进入公开快照", () => {
  const old = structuredClone(layout); Object.assign(old.versions[0]!, { voiceKey: "voice:private-voice" });
  const current = { ...page, textLayout: old };
  const next = structuredClone(old); Object.assign(next.versions[0]!, { voiceKey: "voice:new-voice" });
  assert.equal(updatePictureBookPage(current, { textLayout: next }).textLayout?.versions[0]?.audioUrl, null);
  const snapshot = snapshotCourseMaterial("PICTURE_BOOK", { pages: [current] });
  assert.doesNotMatch(JSON.stringify(snapshot), /private-voice|voiceKey/);
});

test("图文编排文字通过绘本完整性检查，旧版无文字页面仍按原规则拒绝", async () => {
  const { hasCompletePictureBookPlayback } = await import("../src/picture-books/picture-book-playback.js");
  const cover = { ...page, position: 0 };
  assert.equal(hasCompletePictureBookPlayback({ title: "书", pageCount: 1, pages: [cover, page] }), true);
  assert.equal(hasCompletePictureBookPlayback({ title: "书", pageCount: 1, pages: [cover, { ...page, caption: "", textLayout: undefined }] }), false);
});

test("创作者客户端同步保留原有文字层，移除含文字层的页面时拒绝覆盖", async () => {
  const { preserveCreatorTextLayouts } = await import("../src/picture-books/picture-book-text-layout.js");
  const previous = [{ position: 0 }, { position: 1, textLayout: layout }];
  const updated = preserveCreatorTextLayouts(previous, [{ position: 0 }, { position: 1 }]);
  assert.equal(updated[1]?.textLayout?.versions[0]?.boxes[1]?.text, "第一句");
  assert.equal(updated[1]?.textLayout?.versions[0]?.audioUrl, "https://r.example/old.mp3");
  assert.throws(() => preserveCreatorTextLayouts(previous, [{ position: 0 }]), /文字/);
});

test("公开及专辑播放对文字层语音使用受控代理地址", async () => {
  const { PictureBookSubmissionService } = await import("../src/picture-books/picture-book-submission.service.js");
  const { CreatorMediaService } = await import("../src/creator/creator-media.service.js");
  const stored = { ...layout, versions: [{ ...layout.versions[0]!, audioUrl: "https://private.example/secret.mp3" }, { language: "en", boxes: [box("en", "Hello")], audioUrl: "https://private.example/en.mp3" }] };
  const snap = { title: "书", pages: [{ ...page, textLayout: stored }] };
  const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  Object.assign(service, { published: async () => ({ pictureBookId: "book", publishedSnapshot: snap }), prisma: { pictureBookEdition: { findUnique: async () => null } } });
  const publicBook = await service.publicBook("book");
  assert.equal(publicBook.pages[0]?.textLayout?.versions[0]?.audioUrl, "/api/public/picture-books/book/pages/1/audio");
  assert.equal(publicBook.pages[0]?.textLayout?.versions[1]?.audioUrl, "/api/public/picture-books/book/pages/1/audio?language=en");
  const media = Object.create(CreatorMediaService.prototype) as CreatorMediaService;
  Object.assign(media, { item: async () => ({ book: playbackFromSnapshot("book", snap), publicMedia: true }), media: { readPictureBookStoredAudio: async (url: string) => url } });
  const album = await media.play("item", {});
  assert.equal(album.pages[0]?.textLayout?.versions[1]?.audioUrl, "/api/creator-media/items/item/pages/1/audio?language=en");
  assert.equal(await media.page("item", 1, "audio", {}, "en"), "https://private.example/en.mp3");
});

test("创作者同步已有绘本时，网页文字层随页面保留", async () => {
  const { CreatorService } = await import("../src/creator/creator.service.js");
  const principal = { userId: "owner", grantId: "grant", clientId: "client", audience: "aud", scopes: ["creator:write"] };
  const priorPages = Array.from({ length: 5 }, (_, position) => ({ position, ...(position === 1 ? { textLayout: layout } : {}) }));
  let saved: any;
  const tx = { $executeRaw: async () => 1, creatorGrant: { findUnique: async () => ({ userId: "owner", clientId: "client", audience: "aud", revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: { status: "ACTIVE" }, scopes: ["creator:write"] }) }, creatorWork: { findUnique: async () => ({ resourceId: "book", requestHash: "old", version: 4 }), upsert: async () => ({}) }, pictureBook: { findUnique: async () => ({ id: "book", version: 4, pages: priorPages }), updateMany: async ({ data }: any) => { saved = data; return { count: 1 }; } } };
  const service = Object.create(CreatorService.prototype) as CreatorService;
  Object.assign(service, { db: { $transaction: async (fn: any) => fn(tx) }, ownedAsset: async (_tx: unknown, _p: unknown, id: string) => ({ id }), bookResult: async () => ({ id: "book" }) });
  await service.saveBook(principal as never, { schemaVersion: 1, externalId: "ext", expectedVersion: 4, title: "书", style: "watercolor", pageCount: 4, coverAssetId: "cover", pages: Array.from({ length: 5 }, (_, position) => ({ position, caption: "正文", imageAssetId: `image-${position}` })) });
  assert.equal(saved.pages[1].textLayout.versions[0].boxes[1].text, "第一句");
  assert.equal(saved.pages[1].textLayout.versions[0].audioUrl, "https://r.example/old.mp3");
});
