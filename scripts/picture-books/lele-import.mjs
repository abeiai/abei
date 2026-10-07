export function assertAbEiImportTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("请使用 abei 的数据库连接"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.port !== "3604" || url.pathname !== "/abei" || !["postgres", "localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("仅允许导入 abei 的 3604 数据库");
}

export function assertImportOwner(record, userId) {
  if (record && record.userId !== userId) throw new Error("不能接管其他账号的作品");
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
      { name: book.companion, description: book.slug === "lele-rabbit" ? "白兔，粉色耳朵，青蓝色背带裤。" : book.slug === "lele-hedgehog" ? "棕色尖刺，奶油色圆脸和肚子，不穿衣服。" : "橙红色松鼠，蓬松卷尾巴，鼠尾草绿色小挎包。", imageUrl: null }
    ],
    pages: [{ position: 0, caption: book.title, narration: book.title, imagePrompt: book.coverPrompt, imageUrl: coverUrl, audioUrl: null }, ...book.pages]
  };
}
