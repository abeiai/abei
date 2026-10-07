import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertAbEiImportTarget, assertImportOwner, buildLeleBookRecord, validateLeleSeriesBooks, planLeleSeriesImport, assertLeleDraftMatches } from "./lele-import.mjs";

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
validateLeleSeriesBooks(books);
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
    await writeAdminOperationLog({ ...where, adminUserId: approval.reviewedByAdminId, description: `经授权发布系列资源《${seriesName}》共${records.length}集，投稿账号：乐乐绘本工作室` });
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
  const existingCourses = await prisma.course.findMany({ where: { userId, revisions: { some: { name: seriesName } } }, include: { approvedRevision: { include: { items: { orderBy: { sortOrder: "asc" } } } }, workingRevision: { include: { items: { orderBy: { sortOrder: "asc" } } } } } });
  if (existingCourses.length > 1) throw new Error("存在多个同名系列资源，请先人工核对");
  let course = existingCourses[0];
  const importPlan = planLeleSeriesImport(course, records);
  let existingCover = await prisma.mediaAsset.findFirst({ where: { createdByUserId: userId, originalName: "lele-series-cover.webp", mediaType: "IMAGE", storageProvider: "S3" }, orderBy: { createdAt: "asc" } });
  const input = { name: seriesName, coverMediaId: course?.approvedRevision?.coverMediaId ?? existingCover?.id, summary: `和熊猫乐乐一起，在森林里认识${records.length}位小动物朋友。本系列共${records.length}集，每集12页正文，故事独立完整，陪孩子学习照顾彼此的节奏、诚实表达、尊重边界、分享与合作。适合4–7岁亲子共读。`, tags: ["绘本", "友谊", "人际关系", "亲子阅读"], items: records.map(record => ({ materialType: "PICTURE_BOOK", materialId: record.id, displayName: record.title })) };
  if (["DRAFT", "PENDING"].includes(importPlan)) assertLeleDraftMatches(course.workingRevision, input);
  // 所有素材已部署到本项目 Web 后才能投稿，不能发布缺图的完成作品。
  await Promise.all(records.flatMap(record => record.pages).map(async page => {
    if (!/^\/picture-book-demos\/lele-[a-z]+\/(cover|0[1-9]|1[0-2])(?:-v\d+)?\.webp$/.test(page.imageUrl)) throw new Error("绘本素材地址不属于本系列");
    const response = await fetch(`http://web:3601${page.imageUrl}`, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("image/webp")) throw new Error(`绘本素材尚未就绪：${page.imageUrl}`);
  }));
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
    if (!existingCover) existingCover = await media.uploadUserCourseCover(userId, { originalname: "lele-series-cover.webp", mimetype: "image/webp", size: coverBuffer.length, buffer: coverBuffer });
    input.coverMediaId = existingCover.id;
  }
  if (importPlan === "CREATE") course = await courses.createCourse(userId, input);
  if (importPlan === "UPDATE") course = await courses.saveCourse(userId, course.id, input);
  if (importPlan !== "PUBLISHED") {
    let review = await prisma.courseReviewRequest.findFirst({ where: { courseId: course.id, courseRevisionId: course.workingRevisionId, scope: "COURSE_REVISION", status: "PENDING" }, orderBy: { submittedAt: "desc" } });
    if (!review) review = await reviews.submitCourse(userId, course.id);
    await reviews.approve(admin.id, review.id, review.updatedAt.toISOString());
  }
  await ensureApprovalLog(course.id);
  const published = await courses.getPublicCourse(course.id);
  if (!published || published.items.length !== records.length || published.items.some(item => !item.launchHref)) throw new Error("资源发布验证失败");
  console.log(JSON.stringify({ author: published.author.nickname, resource: published.name, courseId: course.id, href: `/c/${course.id}`, books: published.items.map(item => item.displayName), alreadyPublished: importPlan === "PUBLISHED" }, null, 2));
} finally {
  await lock.end();
  await prisma.$disconnect();
}
