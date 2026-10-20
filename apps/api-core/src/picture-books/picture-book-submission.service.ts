import { creatorAssetId, creatorAssetUrl, readCreatorAssetReference } from "../creator/creator-assets.service.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AiService } from "../ai/ai.service.js";
import { displayImage } from "../media/image-variants.js";
import { MediaService } from "../media/media.service.js";
import { mediaAssetPublicUrl } from "../media/media-object-url.js";
import { normalizePictureBookLibraryCover } from "./picture-book-library-cover.js";
import { inspectImage } from "../media/image-inspection.js";
import { readPictureBookDemoImage } from "./picture-book-demo-image.js";
import { inspectPictureBookImage } from "./picture-book-image.js";
import { AppException } from "../common/app-exception.js";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../courses/course-domain.js";
import { playbackFromSnapshot } from "./picture-book-playback.js";
import { publicPictureBookHref, resolvePublicPictureBookId } from "./picture-book-public-slug.js";

@Injectable()
export class PictureBookSubmissionService {
  private readonly prisma = getPrismaClient();

  constructor(@Inject(AiService) private readonly ai: AiService, @Inject(MediaService) private readonly media: MediaService) {}

  async submit(userId: string, pictureBookId: string) {
    return this.prisma.$transaction(async transaction => {
      await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`picture-book-submission:${pictureBookId}`}))`;
      const book = await transaction.pictureBook.findFirst({ where: { id: pictureBookId, userId } });
      if (!book) throw new AppException(40401, "绘本作品不存在", 404);
      const imported = await transaction.creatorWork.findFirst({ where: { resourceId: pictureBookId, userId, kind: "BOOK" } });
      const coverId = imported && typeof imported.input === "object" && imported.input && !Array.isArray(imported.input) ? imported.input.coverAssetId : null;
      const cover = typeof coverId === "string" ? await transaction.creatorAsset.findFirst({ where: { id: coverId, userId, kind: "IMAGE", status: "COMPLETED" } }) : null;
      const pages = Array.isArray(book.pages) ? book.pages : [];
      // Legacy readers use the first image as their cover, count it in pageCount, and number from 1.
      const legacyPages = pages.length > 0 && pages.length === book.pageCount && pages.every((page, index) => page && typeof page === "object" && !Array.isArray(page) && page.position === index + 1);
      const source = legacyPages ? { ...book, pages: pages.map((page, index) => ({ ...(page as Prisma.JsonObject), position: index })) } : book;
      const snapshot = { ...snapshotCourseMaterial("PICTURE_BOOK", source), ...(cover ? { libraryCoverUrl: creatorAssetUrl(cover.id) } : {}) };
      const playback = playbackFromSnapshot(book.id, snapshot);
      if (book.status !== "COMPLETED") throw new AppException(40001, "请先保存为作品后再投稿", 400);
      if (!book.title.trim()) throw new AppException(40001, "请先填写绘本名称", 400);
      if (playback.pages[0]?.position !== 0 || playback.pages.length !== book.pageCount + (legacyPages ? 0 : 1) || playback.pages.some((page, index) => page.position !== index)) {
        throw new AppException(40001, "绘本页数或页码不完整，请检查页面后再投稿", 400);
      }
      if (playback.pages.some(page => !page.imageUrl)) throw new AppException(40001, "请补齐封面和每页图片后再投稿", 400);
      const snapshotHash = hashCourseSnapshot(snapshot);
      const existing = await transaction.pictureBookSubmission.findUnique({ where: { pictureBookId } });
      if (existing?.status === "PENDING") {
        if (existing.snapshotHash !== snapshotHash) throw new AppException(40901, "已有投稿正在审核，请审核完成后再提交修改", 409);
        return this.summary(existing);
      }
      if (existing?.status === "APPROVED" && existing.snapshotHash === snapshotHash) return this.summary(existing);
      const row = await transaction.pictureBookSubmission.upsert({
        where: { pictureBookId },
        create: { pictureBookId, submittedVersion: book.version, coverUrl: cover ? creatorAssetUrl(cover.id) : null, snapshot: snapshot as Prisma.InputJsonValue, snapshotHash },
        update: { submittedVersion: book.version, snapshot: snapshot as Prisma.InputJsonValue, snapshotHash, status: "PENDING", coverUrl: cover ? creatorAssetUrl(cover.id) : null, coverTaskId: null, coverToken: null, coverExpiresAt: null, reviewedByAdminId: null, reviewNote: null, reviewedAt: null, submittedAt: new Date() }
      });
      return this.summary(row);
    });
  }

  async listReviews(status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
    const rows = await this.prisma.pictureBookSubmission.findMany({ where: { status }, include: { pictureBook: { select: { user: { select: { nickname: true } } } } }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }] });
    return rows.map(row => ({ ...this.summary(row), pictureBookId: row.pictureBookId, title: playbackFromSnapshot(row.pictureBookId, row.snapshot).title, author: row.pictureBook.user.nickname, coverUrl: row.coverUrl, coverGenerating: Boolean(row.coverToken && row.coverExpiresAt && row.coverExpiresAt > new Date()) }));
  }

  async review(id: string) {
    const row = await this.prisma.pictureBookSubmission.findUnique({ where: { id }, include: { pictureBook: { select: { user: { select: { nickname: true } } } } } });
    if (!row) throw new AppException(40401, "绘本投稿不存在", 404);
    return { ...this.summary(row), pictureBookId: row.pictureBookId, author: row.pictureBook.user.nickname, coverUrl: row.coverUrl, coverGenerating: Boolean(row.coverToken && row.coverExpiresAt && row.coverExpiresAt > new Date()), book: playbackFromSnapshot(row.pictureBookId, row.snapshot) };
  }

  async generateCover(id: string, regenerate = false) {
    const row = await this.prisma.pictureBookSubmission.findUnique({ where: { id }, include: { pictureBook: { select: { userId: true } } } });
    if (!row) throw new AppException(40401, "绘本投稿不存在", 404);
    if (row.status !== "PENDING") throw new AppException(40901, "该投稿已审核，请刷新列表", 409);
    if (row.coverUrl && !regenerate) return this.review(id);
    const token = randomUUID(), now = new Date();
    const claimed = await this.prisma.pictureBookSubmission.updateMany({ where: { id, status: "PENDING", coverUrl: row.coverUrl, snapshotHash: row.snapshotHash, OR: [{ coverExpiresAt: null }, { coverExpiresAt: { lte: now } }] }, data: { coverToken: token, coverExpiresAt: new Date(now.getTime() + 15 * 60_000) } });
    if (!claimed.count) return this.review(id);
    try {
      const model = (await this.ai.listImageModels()).find(item => item.providerKey === "dashscope" && item.modelName === "qwen-image-3.0" && item.maxReferenceImages >= 1);
      if (!model) throw new AppException(40001, "绘本审核封面模型 Qwen Image 3.0 尚未配置或启用", 400);
      const book = playbackFromSnapshot(row.pictureBookId, row.snapshot);
      const source = book.pages.find(page => page.position === 0)?.imageUrl;
      if (!source) throw new AppException(40001, "投稿绘本缺少封面，请重新投稿", 400);
      const original = await this.readImage(source);
      const image = inspectPictureBookImage({ originalname: "cover", mimetype: original.mimetype, size: original.buffer.length, buffer: original.buffer });
      const generated = await this.ai.generateImage({ userId: row.pictureBook.userId, mode: "ACCOUNT", learnerId: null }, {
        modelInstanceId: model.id, width: 1536, height: 1152, count: 1,
        prompt: `请将这张绘本封面图调整为4:3的横版比例。要求如下：

1. 【风格保留】严格保持原图的绘画风格、色彩基调、笔触质感和整体氛围不变。
2. 【主体保留】画面中的核心主体（人物/动物/场景）必须完整保留，不得裁切、变形或遮挡。
3. 【文字保留】封面标题文字必须原样保留，包括字体样式、颜色、大小和位置关系，不得修改、模糊或重新生成文字内容。
4. 【扩展填充】新增的画面区域必须基于原图风格自然延伸原有场景、背景和笔触纹理，使插画连续覆盖完整画布并延伸至四个边缘，保持构图和谐、过渡自然，避免拼接痕迹或空白区域。
5. 【输出质量】输出高清、无水印、无额外添加元素的完整封面图。
6. 【禁止补边】严禁为了凑足4:3比例，在上下或左右添加纯色条、纯色块、白边、黑边、留白、边框或模糊背景；不得将原图缩小后居中贴在纯色画布上。必须通过自然补绘场景完成扩图；若参考图已有补边，也必须用连续的插画内容补绘，不能保留或复制这些色块。`,
        referenceImages: [{ name: "绘本原封面", type: "image", mimeType: image.mimetype, size: image.buffer.length, dataUrl: `data:${image.mimetype};base64,${image.buffer.toString("base64")}` }]
      }, { pictureBookR2: true, fixedCredits: 0 });
      let coverUrl = generated.images[0]?.url;
      if (!coverUrl) throw new Error("missing generated image");
      const output = await this.media.readPictureBookStoredImage(coverUrl);
      const dimensions = inspectImage(output.buffer);
      if (!dimensions) throw new Error("invalid cover image");
      if (dimensions.width !== 1536 || dimensions.height !== 1152) {
        const normalized = await normalizePictureBookLibraryCover(output.buffer);
        coverUrl = (await this.media.storePictureBookGeneratedImage(row.pictureBook.userId, { originalname: "library-cover.png", mimetype: "image/png", size: normalized.length, buffer: normalized })).url;
      }
      const saved = await this.prisma.pictureBookSubmission.updateMany({ where: { id, status: "PENDING", snapshotHash: row.snapshotHash, coverToken: token }, data: { coverUrl, coverTaskId: generated.id, coverToken: null, coverExpiresAt: null } });
      if (!saved.count) throw new AppException(40901, "投稿状态已变化，请刷新列表", 409);
      return this.review(id);
    } catch (error) {
      await this.prisma.pictureBookSubmission.updateMany({ where: { id, coverToken: token }, data: { coverToken: null, coverExpiresAt: null } });
      if (error instanceof AppException && error.getStatus() === 409) throw error;
      throw new AppException(50201, "绘本封面生成失败，请重试，投稿尚未通过审核", 502);
    }
  }

  async decide(adminId: string, id: string, expectedUpdatedAt: string, status: "APPROVED" | "REJECTED", reason?: string) {
    const date = new Date(expectedUpdatedAt);
    if (!Number.isFinite(date.getTime())) throw new AppException(40001, "审核版本参数格式错误", 400);
    if (status === "REJECTED" && (!reason || reason.trim().length < 2 || reason.trim().length > 500)) throw new AppException(40001, "请输入 2 到 500 个字符的拒绝原因", 400);
    await this.prisma.$transaction(async tx => {
      const row = await tx.pictureBookSubmission.findUnique({ where: { id } });
      if (!row) throw new AppException(40401, "绘本投稿不存在", 404);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`picture-book-submission:${row.pictureBookId}`}))`;
      if (hashCourseSnapshot(row.snapshot) !== row.snapshotHash) throw new AppException(40901, "审核快照校验失败，请重新投稿", 409);
      const changed = await tx.pictureBookSubmission.updateMany({ where: { id, status: "PENDING", snapshotHash: row.snapshotHash, updatedAt: date, ...(status === "APPROVED" ? { coverUrl: { not: null }, coverToken: null } : {}) }, data: { status, reviewedByAdminId: adminId, reviewedAt: new Date(), reviewNote: status === "REJECTED" ? reason!.trim() : null, coverToken: null, coverExpiresAt: null,
        ...(status === "APPROVED" ? { publishedSnapshot: row.snapshot as Prisma.InputJsonValue, publishedHash: row.snapshotHash, publishedCoverUrl: row.coverUrl, publishedAt: new Date(), publishedVersion: { increment: 1 } } : {}) } });
      if (!changed.count) throw new AppException(40901, "投稿状态已变化或封面尚未生成，请刷新后重试", 409);
    });
    return this.review(id);
  }

  async publicList(page = 1, pageSize = 20, q = "") {
    const search = q.trim();
    const where: Prisma.PictureBookSubmissionWhereInput = { publishedAt: { not: null }, publishedCoverUrl: { not: null }, ...(search ? { publishedSnapshot: { path: ["title"], string_contains: search, mode: "insensitive" } } : {}) };
    const publicMediaBaseUrl = this.publicMediaBaseUrl();
    const [rows, total] = await Promise.all([
      this.prisma.pictureBookSubmission.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: { pictureBookId: true, publishedSnapshot: true, publishedCoverUrl: true } }),
      this.prisma.pictureBookSubmission.count({ where })
    ]);
    return { items: rows.map(row => { const book = playbackFromSnapshot(row.pictureBookId, row.publishedSnapshot); return { id: book.id, title: book.title, coverUrl: this.publicMediaUrl(row.publishedCoverUrl, publicMediaBaseUrl) ?? `/api/public/picture-books/${encodeURIComponent(book.id)}/cover`, pageCount: book.pages.filter(page => page.position > 0).length, hasAudio: book.pages.some(page => page.audioUrl || page.translations?.some(item => item.audioUrl)), href: publicPictureBookHref(book.id) }; }), total, page, pageSize };
  }

  async albums() {
    return (await this.publicAlbumList(1, 8)).items;
  }

  async publicAlbumList(page = 1, pageSize = 20, q = "") {
    const search = q.trim();
    const where: Prisma.CourseWhereInput = { publishedAt: { not: null }, approvedRevision: { is: { status: "APPROVED", items: { some: { materialType: "PICTURE_BOOK" } }, ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) } } };
    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true, approvedRevision: { select: { id: true, name: true, coverMedia: { select: { url: true, filename: true, storageProvider: true } }, _count: { select: { items: { where: { materialType: "PICTURE_BOOK" } } } } } } } }),
      this.prisma.course.count({ where })
    ]);
    return { items: rows.flatMap(row => row.approvedRevision ? [{ id: row.id, title: row.approvedRevision.name, coverUrl: creatorAssetId(row.approvedRevision.coverMedia.url) ? `/api/creator-media/revisions/${row.approvedRevision.id}/cover` : mediaAssetPublicUrl(row.approvedRevision.coverMedia), bookCount: row.approvedRevision._count.items, href: `/c/${encodeURIComponent(row.id)}` }] : []), total, page, pageSize };
  }

  async publicBook(pictureBookId: string) {
    const row = await this.published(pictureBookId);
    const book = playbackFromSnapshot(row.pictureBookId, row.publishedSnapshot);
    const publicMediaBaseUrl = this.publicMediaBaseUrl();
    return { ...book, ...(publicMediaBaseUrl ? { publicMediaBaseUrl } : {}), pages: book.pages.map(page => ({
      ...page,
      imageUrl: page.imageUrl ? this.publicMediaUrl(page.imageUrl, publicMediaBaseUrl) ?? `/api/public/picture-books/${encodeURIComponent(row.pictureBookId)}/pages/${page.position}/image` : null,
      audioUrl: page.audioUrl ? this.publicMediaUrl(page.audioUrl, publicMediaBaseUrl, true) ?? `/api/public/picture-books/${encodeURIComponent(row.pictureBookId)}/pages/${page.position}/audio` : null,
      ...(page.translations ? { translations: page.translations.map(translation => ({ ...translation, audioUrl: translation.audioUrl ? this.publicMediaUrl(translation.audioUrl, publicMediaBaseUrl, true) ?? `/api/public/picture-books/${encodeURIComponent(row.pictureBookId)}/pages/${page.position}/audio?language=${encodeURIComponent(translation.language)}` : null })) } : {})
    })) };
  }

  private publicMediaBaseUrl() {
    const base = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    return base && /^https:\/\//.test(base) ? base : "";
  }

  private publicMediaUrl(sourceUrl: string | null, base: string, audio = false) {
    if (!base || !sourceUrl?.startsWith(`${base}/`)) return null;
    const key = sourceUrl.slice(base.length + 1);
    const pattern = audio ? /^[a-zA-Z0-9/_-]+\.(?:mp3|wav|ogg|aac|m4a|webm)$/ : /^[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/;
    return pattern.test(key) ? sourceUrl : null;
  }

  private async published(pictureBookId: string) {
    const row = await this.prisma.pictureBookSubmission.findFirst({ where: { pictureBookId: resolvePublicPictureBookId(pictureBookId), publishedAt: { not: null }, publishedCoverUrl: { not: null } } });
    if (!row) throw new AppException(40401, "绘本不存在或尚未审核发布", 404);
    return row;
  }

  async image(pictureBookId: string, position?: number, width?: number) {
    const row = await this.published(pictureBookId);
    const url = position === undefined ? row.publishedCoverUrl : playbackFromSnapshot(row.pictureBookId, row.publishedSnapshot).pages.find(page => page.position === position)?.imageUrl;
    if (!url) throw new AppException(40401, "绘本图片不存在", 404);
    return creatorAssetId(url) ? readCreatorAssetReference(url, position === undefined, width) : this.readImage(url, width);
  }

  async reviewImage(id: string, position?: number, width?: number) {
    const row = await this.review(id);
    const url = position === undefined ? row.coverUrl : row.book.pages.find(page => page.position === position)?.imageUrl;
    if (!url) throw new AppException(40401, "绘本图片不存在", 404);
    return creatorAssetId(url) ? readCreatorAssetReference(url, position === undefined, width) : this.readImage(url, width);
  }

  async audio(pictureBookId: string, position: number, language?: string) {
    const row = await this.published(pictureBookId);
    const book = playbackFromSnapshot(row.pictureBookId, row.publishedSnapshot);
    const page = book.pages.find(item => item.position === position);
    const url = language ? page?.translations?.find(item => item.language === language)?.audioUrl : page?.audioUrl;
    if (!url) throw new AppException(40401, "本页语音不存在", 404);
    return creatorAssetId(url) ? readCreatorAssetReference(url) : this.media.readPictureBookStoredAudio(url);
  }

  async reviewAudio(id: string, position: number, language?: string) {
    const row = await this.review(id);
    const page = row.book.pages.find(item => item.position === position);
    const url = language ? page?.translations?.find(item => item.language === language)?.audioUrl : page?.audioUrl;
    if (!url) throw new AppException(40401, "本页语音不存在", 404);
    return creatorAssetId(url) ? readCreatorAssetReference(url) : this.media.readPictureBookStoredAudio(url);
  }

  private async readImage(url: string, width?: number): Promise<{ buffer: Buffer; mimetype: string }> {
    if (creatorAssetId(url)) return readCreatorAssetReference(url, false, width);
    if (!url.startsWith("/")) return this.media.readPictureBookStoredImage(url, width);
    const local = /^\/api\/media\/files\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/.exec(url);
    if (local) return displayImage(url, width, async () => {
      const file = await this.media.getLocalFile(local[1]!);
      const buffer = await readFile(file.filepath);
      return { buffer: inspectPictureBookImage({ originalname: local[1]!, mimetype: file.mimeType, size: buffer.length, buffer }).buffer, mimetype: file.mimeType };
    });
    return displayImage(url, width, () => readPictureBookDemoImage(url));
  }

  async unpublish(adminId: string, id: string, expectedVersion: number) {
    if (!Number.isSafeInteger(expectedVersion)) throw new AppException(40001, "发布版本参数错误", 400);
    return this.prisma.$transaction(async tx => {
      const row = await tx.pictureBookSubmission.findUnique({ where: { id } });
      if (!row) throw new AppException(40401, "绘本投稿不存在", 404);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`picture-book-submission:${row.pictureBookId}`}))`;
      const current = await tx.pictureBookSubmission.findUniqueOrThrow({ where: { id } });
      const changed = await tx.pictureBookSubmission.updateMany({ where: { id, publishedVersion: expectedVersion, publishedAt: { not: null } }, data: { publishedAt: null, publishedVersion: { increment: 1 }, updatedAt: current.updatedAt } });
      if (!changed.count) throw new AppException(40901, "发布版本已变化，请刷新", 409);
      await tx.adminOperationLog.create({ data: { adminUserId: adminId, action: "UNPUBLISH_PICTURE_BOOK", resourceType: "PICTURE_BOOK_SUBMISSION", resourceId: id, description: "下架已发布绘本，保留待审稿" } });
      return { unpublished: true };
    });
  }

  private summary(row: { id: string; status: string; reviewNote: string | null; submittedAt: Date; updatedAt: Date; publishedVersion?: number; publishedAt?: Date | null }) {
    return { id: row.id, status: row.status, reviewNote: row.reviewNote, submittedAt: row.submittedAt, updatedAt: row.updatedAt, publishedVersion: row.publishedVersion ?? 0, published: !!row.publishedAt };
  }
}
