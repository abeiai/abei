import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertAbEiImportTarget, assertImportOwner, buildLeleBookRecord } from "./lele-import.mjs";

// 仅由受信任的本地运营者执行；不提供 HTTP 导入入口，也不重置现有账号密码。
const userId = "abei-lele-studio";
const email = "lele-studio@abei.example";
const seriesName = "熊猫乐乐的森林朋友";
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf("=");
  return [arg.slice(0, at), arg.slice(at + 1)];
}));
if (!["--admin-id", "--data", "--cover"].every(key => args[key])) throw new Error("请指定现有管理员 --admin-id、作品数据 --data 和系列封面 --cover");
assertAbEiImportTarget(process.env.DATABASE_URL);
const books = JSON.parse(await readFile(args["--data"], "utf8"));
if (!Array.isArray(books) || books.length !== 3 || [...books.map(b => b.slug)].sort().join(",") !== "lele-hedgehog,lele-rabbit,lele-squirrel") throw new Error("只能导入熊猫乐乐系列的三本作品");
const records = books.map(book => buildLeleBookRecord(book, userId));
const coverBuffer = await readFile(args["--cover"]);
const runtimeImport = path => import(pathToFileURL(resolve(process.cwd(), path)).href);
createRequire(resolve(process.cwd(), "apps/api-core/package.json"))("reflect-metadata");
const [{ getPrismaClient, hashPassword }, { CoursesService }, { CourseReviewService }, { MediaService }, { hashCourseSnapshot, snapshotCourseMaterial }, { writeAdminOperationLog }] = await Promise.all([
  runtimeImport("packages/database/dist/index.js"),
  runtimeImport("apps/api-core/dist/courses/courses.service.js"),
  runtimeImport("apps/api-core/dist/courses/course-review.service.js"),
  runtimeImport("apps/api-core/dist/media/media.service.js"),
  runtimeImport("apps/api-core/dist/courses/course-domain.js"),
  runtimeImport("apps/api-core/dist/security/admin-operation-log.js")
]);
const { Client } = createRequire(resolve(process.cwd(), "packages/database/package.json"))("pg");
const lock = new Client({ connectionString: process.env.DATABASE_URL });
const prisma = getPrismaClient();
const courses = new CoursesService();
const reviews = new CourseReviewService();
const media = new MediaService();

async function ensureApprovalLog(courseId) {
  const approval = await prisma.courseReviewRequest.findFirst({ where: { courseId, scope: "COURSE_REVISION", status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
  if (!approval || !approval.reviewedByAdminId) throw new Error("资源缺少正式审核记录");
  const where = { action: "APPROVE_COURSE_REVIEW", resourceType: "COURSE_REVIEW_REQUEST", resourceId: approval.id };
  if (!(await prisma.adminOperationLog.findFirst({ where }))) {
    await writeAdminOperationLog({ ...where, adminUserId: approval.reviewedByAdminId, description: `经授权导入并发布系列资源《${seriesName}》，投稿账号：乐乐绘本工作室` });
    if (!(await prisma.adminOperationLog.findFirst({ where }))) throw new Error("审核已通过，但操作日志写入失败，请重跑补全");
  }
}

try {
  await lock.connect();
  const { rows } = await lock.query("SELECT pg_try_advisory_lock(hashtext('abei-lele-series-import')) AS locked");
  if (!rows[0].locked) throw new Error("系列导入正在执行，请勿并发运行");
  const admin = await prisma.adminUser.findUnique({ where: { id: args["--admin-id"] } });
  if (!admin || admin.status !== "ACTIVE" || admin.role !== "SUPER_ADMIN") throw new Error("必须指定现有的有效超级管理员");
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ id: userId }, { email }] } });
  if (existingUser && (existingUser.id !== userId || existingUser.email !== email || existingUser.status !== "ACTIVE" || existingUser.passwordLoginEnabled)) throw new Error("虚拟账号标识已被占用，不能接管或修改现有账号");
  const existingCourses = await prisma.course.findMany({ where: { userId, revisions: { some: { name: seriesName } } }, include: { approvedRevision: { include: { items: true } }, workingRevision: { include: { items: true } } } });
  if (existingCourses.length > 1) throw new Error("存在多个同名系列资源，请先人工核对");
  let course = existingCourses[0];
  if (course) {
    const revision = course.approvedRevision ?? course.workingRevision;
    if (!revision || revision.items.length !== 3 || revision.items.some(item => item.materialType !== "PICTURE_BOOK" || !records.some(record => record.id === item.pictureBookId))) throw new Error("现有系列资源的目录与导入作品不一致");
    if (course.reviewState === "REJECTED" || course.workingRevision?.status === "REJECTED") throw new Error("资源已被拒绝，不能通过重跑绕过审核");
  }
  // 验证全部现有作品后一次性新增；重跑保留已有作品，不覆盖创作修改。
  const passwordHash = existingUser ? null : await hashPassword(randomBytes(48).toString("base64url"));
  await prisma.$transaction(async tx => {
    for (const record of records) {
      const existing = await tx.pictureBook.findUnique({ where: { id: record.id } });
      assertImportOwner(existing, userId);
      if (existing && (existing.status !== "COMPLETED" || hashCourseSnapshot(snapshotCourseMaterial("PICTURE_BOOK", existing)) !== hashCourseSnapshot(snapshotCourseMaterial("PICTURE_BOOK", record)))) throw new Error("现有作品已修改，请人工处理，导入不会覆盖");
    }
    if (!existingUser) await tx.user.create({ data: { id: userId, email, nickname: "乐乐绘本工作室", passwordHash, passwordLoginEnabled: false } });
    for (const record of records) if (!(await tx.pictureBook.findUnique({ where: { id: record.id } }))) await tx.pictureBook.create({ data: record });
  });
  if (!course) {
    let cover = await prisma.mediaAsset.findFirst({ where: { createdByUserId: userId, originalName: "lele-series-cover.webp", mediaType: "IMAGE", storageProvider: "S3" }, orderBy: { createdAt: "desc" } });
    if (!cover) cover = await media.uploadUserCourseCover(userId, { originalname: "lele-series-cover.webp", mimetype: "image/webp", size: coverBuffer.length, buffer: coverBuffer });
    course = await courses.createCourse(userId, { name: seriesName, coverMediaId: cover.id, summary: "和熊猫乐乐一起，在森林里认识三位朋友。三个独立的12页故事，陪孩子学习照顾彼此的节奏、尊重边界、遵守约定与修复信任。适合4–7岁亲子共读。", tags: ["绘本", "友谊", "人际关系", "亲子阅读"], items: records.map(record => ({ materialType: "PICTURE_BOOK", materialId: record.id, displayName: record.title })) });
  }
  if (!course.approvedRevisionId) {
    let review = await prisma.courseReviewRequest.findFirst({ where: { courseId: course.id, scope: "COURSE_REVISION", status: "PENDING" }, orderBy: { submittedAt: "desc" } });
    if (!review) review = await reviews.submitCourse(userId, course.id);
    await reviews.approve(admin.id, review.id, review.updatedAt.toISOString());
  }
  await ensureApprovalLog(course.id);
  const published = await courses.getPublicCourse(course.id);
  if (!published || published.items.length !== 3 || published.items.some(item => !item.launchHref)) throw new Error("资源发布验证失败");
  console.log(JSON.stringify({ author: published.author.nickname, resource: published.name, courseId: course.id, href: `/c/${course.id}`, books: published.items.map(item => item.displayName), alreadyPublished: Boolean(existingCourses[0]?.approvedRevisionId) }, null, 2));
} finally {
  await lock.end();
  await prisma.$disconnect();
}
