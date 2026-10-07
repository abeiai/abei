export function assertAbEiImportTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("请使用 abei 的数据库连接"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.port !== "3604" || url.pathname !== "/abei" || !["postgres", "localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("仅允许导入 abei 的 3604 数据库");
  if ([...url.searchParams.keys()].some(key => !["schema", "sslmode", "connection_limit", "pool_timeout"].includes(key))) throw new Error("数据库连接参数不能覆盖 abei 的连接目标");
}

export function assertImportOwner(record, userId) {
  if (record && record.userId !== userId) throw new Error("不能接管其他账号的作品");
}

const episodeSlugs = ["lele-rabbit", "lele-hedgehog", "lele-squirrel", "lele-fox", "lele-deer", "lele-bear", "lele-raccoon", "lele-turtle", "lele-owl", "lele-beaver", "lele-badger", "lele-bird"];
export function validateLeleSeriesBooks(books) {
  if (!Array.isArray(books) || ![3, 12].includes(books.length)) throw new Error("必须导入完整3集或12集系列");
  if (books.some((book, i) => book.slug !== episodeSlugs[i])) throw new Error("系列目录顺序错误、缺集或重复");
}
export function planLeleSeriesImport(course, records) {
  if (!course) return "CREATE";
  if (course.reviewState === "REJECTED" || course.workingRevision?.status === "REJECTED") throw new Error("资源已被拒绝，不能通过重跑绕过审核");
  const matches = (revision, count) => revision && revision.items.length === count && revision.items.every((item, i) => item.materialType === "PICTURE_BOOK" && item.pictureBookId === records[i]?.id);
  const working = course.workingRevision;
  if (working && working.status !== "APPROVED") {
    if (!matches(working, records.length)) throw new Error("现有草稿或审核目录不一致，请人工处理");
    if (working.status === "PENDING") return "PENDING";
    if (working.status === "DRAFT") return "DRAFT";
    throw new Error("资源审核状态不支持导入");
  }
  if (matches(course.approvedRevision, records.length)) return "PUBLISHED";
  if (records.length === 12 && matches(course.approvedRevision, 3)) return "UPDATE";
  throw new Error("现有公开目录不一致，不能覆盖或回退系列");
}
export function assertLeleDraftMatches(revision, input) {
  if (["name", "summary", "coverMediaId"].some(key => revision[key] !== input[key]) || JSON.stringify(revision.tags) !== JSON.stringify(input.tags)) throw new Error("草稿或待审资源信息已被修改，请人工核对");
  if (revision.items.length !== input.items.length || revision.items.some((item, i) => item.materialType !== input.items[i].materialType || item.pictureBookId !== input.items[i].materialId || item.displayName !== input.items[i].displayName || item.sortOrder !== i)) throw new Error("草稿或待审目录已被修改，请人工核对");
}

export function buildLeleBookRecord(book, userId) {
  if (book.pageCount !== 12 || book.pages?.length !== 12) throw new Error("每本必须有12页正文");
  for (const [index, page] of book.pages.entries()) {
    if (page.position !== index + 1) throw new Error("正文页码必须连续且不能重复");
    if (!page.caption?.trim() || !page.imageUrl?.trim()) throw new Error("正文必须有配文和插画");
  }
  const coverUrl = book.coverUrl.split("?")[0];
  return {
    id: `abei-${book.slug}`, userId, title: book.title, brief: `${book.title}：${book.theme}`, theme: book.theme,
    audience: "幼儿园", style: book.style, aspectRatio: book.aspectRatio, pageCount: 12, status: "COMPLETED", messages: [],
    plot: book.pages.map(p => p.caption).join("\n"),
    characters: [
      { name: "熊猫乐乐", description: "黑白毛色、圆耳朵、红脸颊，戴砖红色小领巾，温暖友善。", imageUrl: null },
      { name: book.companion, description: book.companionDescription || (book.slug === "lele-rabbit" ? "白兔，粉色耳朵，青蓝色背带裤。" : book.slug === "lele-hedgehog" ? "棕色尖刺，奶油色圆脸和肚子，不穿衣服。" : "橙红色松鼠，蓬松卷尾巴，鼠尾草绿色小挎包。"), imageUrl: null }
    ],
    pages: [{ position: 0, caption: book.title, narration: book.title, imagePrompt: book.coverPrompt, imageUrl: coverUrl, audioUrl: null }, ...book.pages]
  };
}
