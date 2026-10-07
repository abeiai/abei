import assert from "node:assert/strict";
import test from "node:test";
import { assertAbEiImportTarget, assertImportOwner, buildLeleBookRecord } from "./lele-import.mjs";

function story() {
  return { slug: "lele-rabbit", title: "等等我，小兔", theme: "友谊", audience: "4–7岁", style: "森林肌理插画", aspectRatio: "1:1", pageCount: 12, coverUrl: "/picture-book-demos/lele-rabbit/cover.webp?v=title-position-v3", coverPrompt: "带标题的封面", companion: "小兔米米", pages: Array.from({ length: 12 }, (_, i) => ({ position: i + 1, caption: "乐乐说：“一起走吧！”", narration: "乐乐说：“一起走吧！”", imagePrompt: "森林里的两位朋友", imageUrl: `/picture-book-demos/lele-rabbit/${String(i + 1).padStart(2, "0")}.webp`, audioUrl: null })) };
}

test("只允许写入 abei 的 3604 数据库，拒绝其他项目和未知连接", () => {
  assert.doesNotThrow(() => assertAbEiImportTarget("postgresql://user:password@postgres:3604/abei?schema=public"));
  for (const url of ["postgresql://u:p@localhost:3324/xueleai", "postgresql://u:p@postgres:3604/xueleai", "postgresql://u:p@localhost:5432/abei", "invalid"]) assert.throws(() => assertAbEiImportTarget(url), /abei/);
});

test("导入真实作品时包含封面和12页正文，封面地址可被正式播放器解析", () => {
  const record = buildLeleBookRecord(story(), "virtual-author");
  assert.ok(record, "应生成可写入数据库的绘本记录");
  assert.equal(record.userId, "virtual-author");
  assert.equal(record.status, "COMPLETED");
  assert.equal(record.pageCount, 12);
  assert.deepEqual(record.pages.map(p => p.position), Array.from({ length: 13 }, (_, i) => i));
  assert.equal(record.pages[0].imageUrl, "/picture-book-demos/lele-rabbit/cover.webp");
  assert.equal(record.pages[2].narration, "乐乐说：“一起走吧！”");
  assert.equal(record.characters.length, 2);
});

test("正文缺页或页码重复时拒绝导入", () => {
  const missing = story(); missing.pages.pop();
  assert.throws(() => buildLeleBookRecord(missing, "author"), /12/);
  const duplicate = story(); duplicate.pages[1].position = 1;
  assert.throws(() => buildLeleBookRecord(duplicate, "author"), /页码/);
});

test("正文缺少配文或插画时拒绝导入，不能作为完成作品投稿", () => {
  for (const field of ["caption", "imageUrl"]) {
    const book = story(); book.pages[1][field] = "";
    assert.throws(() => buildLeleBookRecord(book, "author"), /配文|插画/);
  }
});

test("重跑导入不得接管其他账号的作品", () => {
  assert.doesNotThrow(() => assertImportOwner({ userId: "author" }, "author"));
  assert.throws(() => assertImportOwner({ userId: "other" }, "author"), /其他账号/);
});
