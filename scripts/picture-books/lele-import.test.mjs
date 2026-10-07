import assert from "node:assert/strict";
import test from "node:test";
import { assertAbEiImportTarget, assertImportOwner, buildLeleBookRecord, validateLeleSeriesBooks, planLeleSeriesImport, assertLeleDraftMatches } from "./lele-import.mjs";

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

const slugs = ["lele-rabbit", "lele-hedgehog", "lele-squirrel", "lele-fox", "lele-deer", "lele-bear", "lele-raccoon", "lele-turtle", "lele-owl", "lele-beaver", "lele-badger", "lele-bird"];
const series = () => slugs.map(slug => ({ ...story(), slug }));
const revision = (count, status = "APPROVED") => ({ id: `revision-${count}`, status, items: slugs.slice(0, count).map(slug => ({ materialType: "PICTURE_BOOK", pictureBookId: `abei-${slug}` })) });
const records = () => series().map(b => buildLeleBookRecord(b, "author"));

test("12集导入必须完整且按既有三集在前的顺序，不接受缺集或重复集", () => {
  assert.doesNotThrow(() => validateLeleSeriesBooks(series()));
  const missing = series(); missing.pop();
  assert.throws(() => validateLeleSeriesBooks(missing), /3|12|完整/);
  const duplicate = series(); duplicate[3].slug = "lele-rabbit";
  assert.throws(() => validateLeleSeriesBooks(duplicate), /顺序|重复|目录/);
});

test("新动物保留自身角色描述，不能误写成松鼠", () => {
  const book = { ...story(), slug: "lele-deer", companion: "小鹿朵朵", companionDescription: "浅棕色小鹿，白色斑点，浅黄色丝带，没有鹿角。" };
  assert.equal(buildLeleBookRecord(book, "author").characters[1].description, book.companionDescription);
});

test("在同一资源上把已发布3集扩展为12集，完整重跑不重复发布", () => {
  assert.equal(planLeleSeriesImport({ reviewState: "PUBLISHED", approvedRevision: revision(3) }, records()), "UPDATE");
  assert.equal(planLeleSeriesImport({ reviewState: "PUBLISHED", approvedRevision: revision(12) }, records()), "PUBLISHED");
});

test("12集待审和草稿可以恢复，旧待审目录或拒绝记录不能被导入覆盖", () => {
  assert.equal(planLeleSeriesImport({ reviewState: "PENDING_REVIEW", approvedRevision: revision(3), workingRevision: revision(12, "PENDING") }, records()), "PENDING");
  assert.equal(planLeleSeriesImport({ reviewState: "DRAFT", approvedRevision: revision(3), workingRevision: revision(12, "DRAFT") }, records()), "DRAFT");
  assert.throws(() => planLeleSeriesImport({ reviewState: "PENDING_REVIEW", workingRevision: revision(3, "PENDING") }, records()), /目录|审核/);
  assert.throws(() => planLeleSeriesImport({ reviewState: "REJECTED", workingRevision: revision(12, "REJECTED") }, records()), /拒绝/);
});

test("异常既有目录不能偷偷替换，完整12集不得回退为3集", () => {
  const damaged = revision(3); damaged.items[1].pictureBookId = "unrelated-book";
  assert.throws(() => planLeleSeriesImport({ reviewState: "PUBLISHED", approvedRevision: damaged }, records()), /目录/);
  assert.throws(() => planLeleSeriesImport({ reviewState: "PUBLISHED", approvedRevision: revision(12) }, records().slice(0, 3)), /回退|目录/);
});

test("数据库查询参数不能把实际连接目标覆盖到其他项目", () => {
  for (const query of ["host=other", "port=3324", "database=xueleai", "dbname=xueleai", "hostaddr=127.0.0.1"]) {
    assert.throws(() => assertAbEiImportTarget(`postgresql://u:p@postgres:3604/abei?${query}`), /参数|覆盖|abei/);
  }
});

test("恢复草稿及待审版本前必须核对完整资源信息和目录显示名", () => {
  const expected = { name: "熊猫乐乐的森林朋友", summary: "12集森林故事", tags: ["绘本", "友谊"], coverMediaId: "series-cover", items: records().map(r => ({ displayName: r.title, materialId: r.id, materialType: "PICTURE_BOOK" })) };
  const draft = { ...expected, items: expected.items.map((item, i) => ({ ...item, pictureBookId: item.materialId, sortOrder: i })) };
  assert.doesNotThrow(() => assertLeleDraftMatches(draft, expected));
  for (const field of ["name", "summary", "coverMediaId", "tags"]) {
    assert.throws(() => assertLeleDraftMatches({ ...draft, [field]: field === "tags" ? ["其他"] : "被人工修改" }, expected), /修改|资源信息/);
  }
  const edited = structuredClone(draft); edited.items[0].displayName = "未经授权标题";
  assert.throws(() => assertLeleDraftMatches(edited, expected), /修改|目录/);
});
