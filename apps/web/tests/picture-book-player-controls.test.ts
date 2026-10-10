import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookAfterPage, pictureBookAlbumEntries, pictureBookAlbumLaunchHref, pictureBookFullscreenZones, pictureBookSilentPageDuration } from "../src/lib/picture-book-player-controls";
import type { PublicCourseItem } from "../src/lib/course-types";

test("只有专辑中的绘本播放链接带专辑标记，保留学习上下文", () => {
  assert.equal(pictureBookAlbumLaunchHref("/picture-books/a/play?courseId=c&courseRevisionItemId=i", "c"), "/picture-books/a/play?courseId=c&courseRevisionItemId=i&album=c");
  assert.equal(pictureBookAlbumLaunchHref("/video-guide/a", "c"), "/video-guide/a");
  assert.equal(pictureBookAlbumLaunchHref("https://example.com/picture-books/a/play", "c"), "https://example.com/picture-books/a/play");
});

test("专辑队列只包含可播放绘本，按目录顺序排列并保留重复课件身份", () => {
  const items: PublicCourseItem[] = [
    { id: "i2", sortOrder: 2, displayName: "B", materialType: "PICTURE_BOOK", reviewState: "READY", launchHref: "/picture-books/b/play" },
    { id: "i1", sortOrder: 1, displayName: "A", materialType: "PICTURE_BOOK", reviewState: "READY", launchHref: "/picture-books/a/play" },
    { id: "i3", sortOrder: 3, displayName: "A again", materialType: "PICTURE_BOOK", reviewState: "READY", launchHref: "/picture-books/a/play" },
    { id: "pending", sortOrder: 0, displayName: "待审", materialType: "PICTURE_BOOK", reviewState: "PENDING", launchHref: "/picture-books/p/play" },
    { id: "external", sortOrder: 0, displayName: "外链", materialType: "PICTURE_BOOK", reviewState: "READY", launchHref: "https://example.com/play" },
    { id: "video", sortOrder: 0, displayName: "视频", materialType: "VIDEO_GUIDE", reviewState: "READY", launchHref: "/video-guide/v" }
  ];
  const entries = pictureBookAlbumEntries("c", items);
  assert.deepEqual(entries.map(item => [item.bookId, item.revisionItemId]), [["a", "i1"], ["b", "i2"], ["a", "i3"]]);
  assert.equal(entries[0]!.href, "/picture-books/a/play?courseId=c&courseRevisionItemId=i1&album=c");
  assert.equal(items[0]!.id, "i2");
});

test("播放结束遵循自动翻页和三种循环模式", () => {
  const last = { autoTurn: true, mode: "none" as const, pageIndex: 2, pageCount: 3, albumIndex: 1, albumCount: 3 };
  assert.deepEqual(pictureBookAfterPage({ ...last, pageIndex: 0 }), { page: 1 });
  assert.equal(pictureBookAfterPage(last), null);
  assert.deepEqual(pictureBookAfterPage({ ...last, mode: "book" }), { page: 0 });
  assert.deepEqual(pictureBookAfterPage({ ...last, mode: "album" }), { album: 2 });
  assert.deepEqual(pictureBookAfterPage({ ...last, mode: "album", albumIndex: 2 }), { album: 0 });
  assert.deepEqual(pictureBookAfterPage({ ...last, mode: "album", albumCount: 1, albumIndex: 0 }), { album: 0 });
  assert.equal(pictureBookAfterPage({ ...last, mode: "album", albumIndex: -1 }), null);
  assert.equal(pictureBookAfterPage({ ...last, mode: "album", albumCount: 0 }), null);
  assert.equal(pictureBookAfterPage({ ...last, mode: "book", autoTurn: false }), null);
  assert.equal(pictureBookAfterPage({ ...last, pageCount: 0 }), null);
});

test("全屏仅在底部、右上角和左右四分之一区域显示对应控制器", () => {
  assert.deepEqual(pictureBookFullscreenZones(500, 400, 1000, 800), { controls: false, close: false, previous: false, next: false });
  assert.equal(pictureBookFullscreenZones(250, 400, 1000, 800).previous, true);
  assert.equal(pictureBookFullscreenZones(750, 400, 1000, 800).next, true);
  assert.deepEqual(pictureBookFullscreenZones(980, 30, 1000, 800), { controls: false, close: true, previous: false, next: false });
  assert.deepEqual(pictureBookFullscreenZones(980, 790, 1000, 800), { controls: true, close: false, previous: false, next: false });
});

test("无语音页面留出阅读时间，使封面和静音绘本也能自动完成循环", () => {
  assert.equal(pictureBookSilentPageDuration(""), 5000);
  assert.equal(pictureBookSilentPageDuration("", true), 6000);
  assert.equal(pictureBookSilentPageDuration("字".repeat(30)), 7500);
  assert.equal(pictureBookSilentPageDuration("字".repeat(30), true), 8500);
  assert.equal(pictureBookSilentPageDuration("字".repeat(100)), 12000);
  assert.equal(pictureBookSilentPageDuration("字".repeat(100), true), 13000);
});
