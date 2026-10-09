import { isDeepStrictEqual } from "node:util";
import { assertLeleDraftMatches } from "./lele-import.mjs";

const adultDescriptions = {
  doctor: "中国女性医生，黑色齐颈短发，白色医生外套、浅蓝色工作服、青绿色听诊器，耐心亲切。",
  firefighter: "中国男性消防员，黑色短发，米黄色消防防护服、黄银色反光条、黄色头盔、黑色防护靴，细心负责。",
  teacher: "中国男性幼儿园老师，黑色短发、圆框眼镜、薄荷绿色上衣、米色长裤、灰色平底鞋，善于倾听与鼓励。",
};
export function assertCareerReviewTarget(review, input, materials, context) {
  if (review.scope !== "COURSE_REVISION" || review.status !== "PENDING" || review.courseId !== context.courseId || review.courseRevisionId !== context.revisionId || review.submittedByUserId !== context.userId) throw new Error("审核目标超出本次发布授权");
  assertLeleDraftMatches(review.afterSnapshot, input);
  if (review.afterSnapshot.coverUrl !== context.coverUrl) throw new Error("审核封面超出发布授权");
  review.afterSnapshot.items.forEach((item, index) => {
    const target = materials[index];
    if (!target || item.publicationId !== target.publicationId || item.pictureBookId !== target.pictureBookId) throw new Error("审核课件引用超出授权");
    const matches = item.firstPublication === true
      ? item.materialHash === target.hash && isDeepStrictEqual(item.materialSnapshot, target.snapshot)
      : target.approvedHash === target.hash && isDeepStrictEqual(target.approvedSnapshot, target.snapshot);
    if (!matches) throw new Error("课件审核快照超出本次文稿授权");
  });
}

export function buildCareerBookRecord(book, userId, images) {
  if (!adultDescriptions[book.slug] || book.story.length !== 16) throw new Error("职业绘本必须有16页完整正文");
  const pages = [[book.title], ...book.story].map(([caption], position) => {
    let url; try { url = new URL(images[position]); } catch { throw new Error("绘本图片尚未就绪"); }
    if (url.protocol !== "https:" || url.username || url.password || !caption?.trim() || caption.length > 500) throw new Error("绘本图片或配文无效");
    return { position, caption, narration: caption, imagePrompt: `《${book.title}》${position === 0 ? "带书名的封面" : `第${position}页`}：${caption}。中国城市日常生活，明亮配色、圆润卡通造型，3:4竖版。`, imageUrl: url.href, audioUrl: null, imageTaskId: null, audioTaskId: null };
  });
  return { id: `abei-career-${book.slug}`, userId, title: book.title, brief: `${book.title}：${book.theme}`, theme: book.theme, audience: "幼儿园", style: "3d-animation", aspectRatio: "3:4", pageCount: 16, status: "COMPLETED", messages: [], plot: book.story.map(([caption]) => caption).join("\n"),
    characters: [{ name: "小安", description: "五岁中国小朋友，黑色短发、圆脸、红脸颊，黄色短袖上衣、青蓝色背带裤、白色运动鞋。", imageUrl: null }, { name: book.adultName, description: adultDescriptions[book.slug], imageUrl: null }], pages };
}

export function assertCareerRecordMatches(current, expected) {
  if (!current || Object.keys(expected).some(key => !isDeepStrictEqual(current[key], expected[key]))) throw new Error("作品归属或内容已修改，导入不会覆盖");
}

export function planCareerPublication(course, input) {
  if (!course) return "CREATE";
  if (course.reviewState === "REJECTED" || course.workingRevision?.status === "REJECTED") throw new Error("投稿已被拒绝，不能重跑绕过审核");
  const working = course.workingRevision;
  if (working && ["DRAFT", "PENDING"].includes(working.status)) { assertLeleDraftMatches(working, input); return working.status; }
  if (course.reviewState === "PUBLISHED" && course.approvedRevision?.status === "APPROVED") { assertLeleDraftMatches(course.approvedRevision, input); return "PUBLISHED"; }
  throw new Error("现有资源状态不支持导入，请人工核对");
}
