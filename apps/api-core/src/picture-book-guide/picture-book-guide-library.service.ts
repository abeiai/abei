import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { readFile } from "node:fs/promises";
import { AppException } from "../common/app-exception.js";
import { creatorAssetId, readCreatorAssetReference } from "../creator/creator-assets.service.js";
import { MediaService } from "../media/media.service.js";
import { pictureBookAudiences } from "../picture-books/picture-book-audience.js";
import { inspectPictureBookImage } from "../picture-books/picture-book-image.js";
import { playbackFromSnapshot } from "../picture-books/picture-book-playback.js";
import { guidePdfMaxPages } from "./picture-book-guide-content.js";
import type { GuideBookImportDto, GuideBookQueryDto } from "./picture-book-guide.dto.js";
import { PictureBookGuideService } from "./picture-book-guide.service.js";

const publishedItems = (search?: string): Prisma.CourseRevisionItemWhereInput => ({
  materialType: "PICTURE_BOOK", pinnedHash: { not: null }, pinnedSnapshot: { path: ["type"], equals: "PICTURE_BOOK" },
  ...(search ? { AND: [{ pinnedSnapshot: { path: ["title"], string_contains: search, mode: "insensitive" } }] } : {}),
  revision: { status: "APPROVED", approvedFor: { is: { publishedAt: { not: null } } } }
});
const publicBooks = (search?: string): Prisma.CourseMaterialPublicationWhereInput => ({
  materialType: "PICTURE_BOOK", pictureBookId: { not: null }, status: "APPROVED", approvedHash: { not: null },
  revisionItems: { some: publishedItems(search) }
});
const sharedBooks = (): Prisma.PictureBookSubmissionWhereInput => ({ publishedAt: { not: null }, publishedCoverUrl: { not: null }, publishedHash: { not: null }, publishedSnapshot: { path: ["type"], equals: "PICTURE_BOOK" } });

@Injectable()
export class PictureBookGuideLibraryService {
  private readonly prisma = getPrismaClient();
  constructor(@Inject(MediaService) private readonly media: MediaService, @Inject(PictureBookGuideService) private readonly guides: PictureBookGuideService) {}

  async list(userId: string, query: GuideBookQueryDto) {
    const pageSize = 20, skip = (query.page - 1) * pageSize, search = query.search?.trim();
    if (query.scope === "MINE") {
      const where: Prisma.PictureBookWhereInput = { userId, ...(search ? { title: { contains: search, mode: "insensitive" } } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.pictureBook.findMany({ where, select: { id: true, title: true, pages: true, status: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take: pageSize }),
        this.prisma.pictureBook.count({ where })
      ]);
      return { items: rows.map(row => ({ bookId: row.id, title: row.title, pageCount: playbackFromSnapshot(row.id, row).pages.length, scope: query.scope, completed: row.status === "COMPLETED" })), total, page: query.page, pageSize };
    }
    const sharedWhere: Prisma.PictureBookSubmissionWhereInput = { ...sharedBooks(), ...(search ? { AND: [{ publishedSnapshot: { path: ["title"], string_contains: search, mode: "insensitive" } }] } : {}) };
    const courseWhere: Prisma.CourseMaterialPublicationWhereInput = { ...publicBooks(search), NOT: { pictureBook: { is: { submission: { is: sharedBooks() } } } } };
    const [sharedCount, courseCount] = await Promise.all([
      this.prisma.pictureBookSubmission.count({ where: sharedWhere }),
      this.prisma.courseMaterialPublication.count({ where: courseWhere })
    ]);
    const [shared, courses] = await Promise.all([
      skip < sharedCount ? this.prisma.pictureBookSubmission.findMany({ where: sharedWhere, select: { pictureBookId: true, publishedSnapshot: true }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip, take: pageSize }) : [],
      skip + pageSize > sharedCount ? this.prisma.courseMaterialPublication.findMany({ where: courseWhere, select: { pictureBookId: true, revisionItems: { where: publishedItems(search), select: { id: true, pinnedSnapshot: true }, orderBy: { id: "asc" }, take: 1 } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: Math.max(0, skip - sharedCount), take: Math.min(pageSize, skip + pageSize - sharedCount) }) : []
    ]);
    const items = [...shared.map(row => ({ id: row.pictureBookId, snapshot: row.publishedSnapshot, revisionItemId: undefined as string | undefined })), ...courses.map(row => ({ id: row.pictureBookId!, snapshot: row.revisionItems[0]!.pinnedSnapshot, revisionItemId: row.revisionItems[0]!.id }))];
    return { items: items.map(row => { const book = playbackFromSnapshot(row.id, row.snapshot); return { bookId: book.id, title: book.title, pageCount: book.pages.length, scope: query.scope, completed: true, ...(row.revisionItemId ? { revisionItemId: row.revisionItemId } : {}) }; }), total: sharedCount + courseCount, page: query.page, pageSize };
  }

  async import(userId: string, dto: GuideBookImportDto) {
    let snapshot: unknown, audience = "幼儿园", revisionItemId: string | null = null, pinnedHash: string | null = null, submissionId: string | null = null, publishedHash: string | null = null;
    if (dto.scope === "MINE") {
      const book = await this.prisma.pictureBook.findFirst({ where: { id: dto.bookId, userId } });
      if (!book) throw new AppException(40401, "绘本不存在或不可选择", 404);
      snapshot = book;
      audience = pictureBookAudiences.some(value => value === book.audience) ? book.audience : audience;
    } else {
      const submission = dto.revisionItemId ? null : await this.prisma.pictureBookSubmission.findFirst({ where: { ...sharedBooks(), pictureBookId: dto.bookId }, select: { id: true, publishedSnapshot: true, publishedHash: true } });
      if (submission) { snapshot = submission.publishedSnapshot; submissionId = submission.id; publishedHash = submission.publishedHash; }
      else {
        const item = await this.prisma.courseRevisionItem.findFirst({ where: { ...publishedItems(), pictureBookId: dto.bookId, ...(dto.revisionItemId ? { id: dto.revisionItemId } : {}), publication: { status: "APPROVED", approvedHash: { not: null } } }, select: { id: true, pinnedSnapshot: true, pinnedHash: true }, orderBy: { id: "asc" } });
        if (!item) throw new AppException(40401, "绘本不存在或尚未审核发布", 404);
        snapshot = item.pinnedSnapshot; revisionItemId = item.id; pinnedHash = item.pinnedHash;
      }
    }
    const book = playbackFromSnapshot(dto.bookId, snapshot);
    if (!book.pages.length) throw new AppException(40001, "绘本尚无页面，请先完成分镜", 400);
    if (book.pages.length > guidePdfMaxPages) throw new AppException(40001, "绘本不能超过 80 页", 400);
    if (new Set(book.pages.map(page => page.position)).size !== book.pages.length) throw new AppException(40001, "绘本页码异常，请整理后重试", 400);
    const rawPages = (snapshot && typeof snapshot === "object" && "pages" in snapshot && Array.isArray(snapshot.pages)) ? snapshot.pages : [];
    const prompts = new Map<number, string>();
    for (const page of rawPages) {
      if (page && typeof page === "object" && Number.isInteger(page.position) && typeof page.imagePrompt === "string") prompts.set(page.position, page.imagePrompt.slice(0, 2000));
    }
    if (book.pages.some(page => !page.imageUrl)) throw new AppException(40001, "绘本有页面尚未生成图片，请完成后再选择", 400);
    return this.guides.importBook(userId, { title: book.title, audience, pages: book.pages.map(page => ({ sourceText: page.caption, imagePrompt: prompts.get(page.position), imageUrl: page.imageUrl! })) }, url => this.readImage(url), async () => {
      if (revisionItemId && !await this.prisma.courseRevisionItem.findFirst({ where: { ...publishedItems(), id: revisionItemId, pinnedHash: pinnedHash!, publication: { status: "APPROVED", approvedHash: { not: null } } }, select: { id: true } })) throw new AppException(40901, "绘本发布状态已变化，请重新选择", 409);
      if (submissionId && !await this.prisma.pictureBookSubmission.findFirst({ where: { ...sharedBooks(), id: submissionId, publishedHash: publishedHash! }, select: { id: true } })) throw new AppException(40901, "绘本发布状态已变化，请重新选择", 409);
    });
  }

  private async readImage(url: string) {
    if (creatorAssetId(url)) {
      const image = await readCreatorAssetReference(url);
      return { ...image, buffer: inspectPictureBookImage({ originalname: "creator-image", mimetype: image.mimetype, size: image.buffer.length, buffer: image.buffer }).buffer };
    }
    if (!url.startsWith("/")) return this.media.readPictureBookStoredImage(url);
    const local = /^\/api\/media\/files\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/.exec(url);
    if (local) {
      const file = await this.media.getLocalFile(local[1]!);
      const buffer = await readFile(file.filepath);
      return { buffer: inspectPictureBookImage({ originalname: local[1]!, mimetype: file.mimeType, size: buffer.length, buffer }).buffer, mimetype: file.mimeType };
    }
    if (!/^\/picture-book-demos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(url)) throw new AppException(40001, "绘本图片地址无效", 400);
    const base = process.env.PICTURE_BOOK_GUIDE_WEB_BASE_URL || (process.env.NODE_ENV === "production" ? "http://web:3601" : "http://localhost:3601");
    const response = await fetch(new URL(url, base), { redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new AppException(50201, "绘本图片读取失败，请稍后重试", 502);
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) throw new AppException(50201, "绘本单页图片超过 10MB", 502);
      chunks.push(Buffer.from(chunk));
    }
    const image = inspectPictureBookImage({ originalname: url, mimetype: response.headers.get("content-type")?.split(";")[0] ?? "", size, buffer: Buffer.concat(chunks) });
    return { buffer: image.buffer, mimetype: image.mimetype };
  }
}
