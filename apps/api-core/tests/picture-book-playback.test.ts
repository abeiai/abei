import assert from "node:assert/strict";
import test from "node:test";
import { playbackFromSnapshot } from "../src/picture-books/picture-book-playback.js";
import { snapshotCourseMaterial, hashCourseSnapshot } from "../src/courses/course-domain.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";

test("绘本播放数据只包含已审核的页面字段", () => {
  const playback = playbackFromSnapshot("book-1", {
    type: "PICTURE_BOOK", title: "森林冒险", style: "水彩", aspectRatio: "3:2",
    messages: [{ role: "user", content: "私密讨论" }],
    pages: [
      { position: 1, caption: "第一幕", narration: "旁白", imageUrl: "https://r.example/1.png", audioUrl: "https://r.example/1.mp3", imagePrompt: "不公开" },
      { position: 0, caption: "封面", narration: "封面", imageUrl: null, audioUrl: "/api/audio/files/cover.mp3" }
    ]
  });
  assert.deepEqual(playback, {
    id: "book-1", title: "森林冒险", style: "水彩", aspectRatio: "3:2", isSpread: false,
    pages: [
      { position: 0, caption: "封面", narration: "封面", imageUrl: null, audioUrl: "/api/audio/files/cover.mp3" },
      { position: 1, caption: "第一幕", narration: "旁白", imageUrl: "https://r.example/1.png", audioUrl: "https://r.example/1.mp3" }
    ]
  });
});

test("非作者只能读取已发布课程审核通过的绘本快照", async () => {
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  let approved = false;
  (service as unknown as { prisma: object }).prisma = {
    pictureBook: { findFirst: async () => null },
    courseRevisionItem: {
      findFirst: async (query: { where: { pictureBookId: string; revision: { approvedFor: { is: { learnerAuthorizations: { some: { learnerId: string } } } } }; publication: unknown } }) => {
        assert.equal(query.where.pictureBookId, "book-1");
        assert.equal(query.where.revision.approvedFor.is.learnerAuthorizations.some.learnerId, "learner-1");
        assert.ok(query.where.publication);
        return approved ? { publication: { approvedHash: "hash", approvedSnapshot: { title: "审核版", pages: [{ position: 1, caption: "已审核", imageUrl: null, audioUrl: null }] } } } : null;
      }
    }
  };
  await assert.rejects(service.playback({ userId: "reader-1", mode: "LEARNER", learnerId: "learner-1" }, "book-1"), /尚未发布/);
  approved = true;
  const result = await service.playback({ userId: "reader-1", mode: "LEARNER", learnerId: "learner-1" }, "book-1");
  assert.equal(result.title, "审核版");
  assert.equal(result.pages[0]?.caption, "已审核");
});

test("绘本图片读取遵守作品权限且只读取审核快照中的本页图片", async () => {
  const service = Object.create(PictureBookService.prototype) as PictureBookService;
  const image = { buffer: Buffer.from("image"), mimetype: "image/png" };
  let approved = false;
  let reads = 0;
  Object.assign(service, {
    prisma: {
      pictureBook: { findFirst: async () => null },
      courseRevisionItem: { findFirst: async () => approved ? { publication: {
        approvedHash: "hash", approvedSnapshot: { title: "审核版", pages: [{ position: 2, imageUrl: "https://r.example/approved.png" }] }
      } } : null }
    },
    mediaService: { readPictureBookStoredImage: async (url: string) => {
      assert.equal(url, "https://r.example/approved.png");
      reads++;
      return image;
    } }
  });
  const subject = { userId: "reader", mode: "LEARNER" as const, learnerId: "learner" };
  await assert.rejects(service.pageImage(subject, "book", 2), /尚未发布/);
  assert.equal(reads, 0);
  approved = true;
  await assert.rejects(service.pageImage(subject, "book", 1), /图片不存在/);
  assert.deepEqual(await service.pageImage(subject, "book", 2), image);
});


test("跨页设置进入审核快照并传到播放器，旧版默认不跨页且快照哈希不变", () => {
  const source = { title: "森林冒险", style: "水彩", aspectRatio: "1:1", pages: [] };
  const oldSnapshot = snapshotCourseMaterial("PICTURE_BOOK", source);
  const normalSnapshot = snapshotCourseMaterial("PICTURE_BOOK", { ...source, isSpread: false });
  assert.equal(hashCourseSnapshot(normalSnapshot), hashCourseSnapshot(oldSnapshot));
  assert.equal(playbackFromSnapshot("old", oldSnapshot).isSpread, false);
  const spreadSnapshot = snapshotCourseMaterial("PICTURE_BOOK", { ...source, isSpread: true });
  assert.equal(playbackFromSnapshot("spread", spreadSnapshot).isSpread, true);
  assert.notEqual(hashCourseSnapshot(spreadSnapshot), hashCourseSnapshot(oldSnapshot));
});

test("图片内文字标记经过审核快照传给播放器，同时保留可访问配文", () => {
  const source = { title: "长大以后", style: "watercolor", aspectRatio: "5:4", pages: [
    { position: 1, caption: "原来我是蝉！", narration: "原来我是蝉！", imageUrl: "/cicada.webp", audioUrl: null, textInImage: true }
  ] };
  const snapshot = snapshotCourseMaterial("PICTURE_BOOK", source);
  const page = playbackFromSnapshot("growth", snapshot).pages[0];
  assert.equal(page.textInImage, true);
  assert.equal(page.caption, "原来我是蝉！");
  assert.equal(page.imageUrl, "/cicada.webp");
});

test("缺省、false及非布尔图片内文字标记不改变既有审核快照哈希", () => {
  const page = { position: 1, caption: "旧绘本", narration: "旧绘本", imageUrl: "/old.webp", audioUrl: null };
  const source = { title: "旧绘本", style: "watercolor", aspectRatio: "5:4", pages: [page] };
  const original = snapshotCourseMaterial("PICTURE_BOOK", source);
  for (const value of [false, "true", 1, null]) {
    const candidate = snapshotCourseMaterial("PICTURE_BOOK", { ...source, pages: [{ ...page, textInImage: value }] });
    assert.equal(hashCourseSnapshot(candidate), hashCourseSnapshot(original));
    assert.equal(Object.hasOwn(playbackFromSnapshot("old", candidate).pages[0], "textInImage"), false);
  }
});
