import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { MediaService } from "../media/media.service.js";
import { snapshotCourseMaterial } from "../courses/course-domain.js";
import { pictureBookAudiences } from "../picture-books/picture-book-audience.js";
import { inspectPictureBookImage } from "../picture-books/picture-book-image.js";
import { playbackFromSnapshot } from "../picture-books/picture-book-playback.js";
import { guideBookPdf } from "./picture-book-guide-book-pdf.js";
import { guidePdfMaxPages } from "./picture-book-guide-content.js";
import type { GuideBookImportDto, GuideBookQueryDto } from "./picture-book-guide.dto.js";
import { PictureBookGuideService } from "./picture-book-guide.service.js";

const publicBooks = (): Prisma.CourseMaterialPublicationWhereInput => ({
  materialType: "PICTURE_BOOK", pictureBookId: { not: null }, status: "APPROVED", approvedHash: { not: null },
  approvedSnapshot: { path: ["type"], equals: "PICTURE_BOOK" },
  revisionItems: { some: { materialType: "PICTURE_BOOK", revision: { status: "APPROVED", approvedFor: { is: { publishedAt: { not: null } } } } } }
});

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
    const where: Prisma.CourseMaterialPublicationWhereInput = { ...publicBooks(), ...(search ? { AND: [{ approvedSnapshot: { path: ["title"], string_contains: search } }] } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.courseMaterialPublication.findMany({ where, select: { pictureBookId: true, approvedSnapshot: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take: pageSize }),
      this.prisma.courseMaterialPublication.count({ where })
    ]);
    return { items: rows.map(row => { const book = playbackFromSnapshot(row.pictureBookId!, row.approvedSnapshot); return { bookId: book.id, title: book.title, pageCount: book.pages.length, scope: query.scope, completed: true }; }), total, page: query.page, pageSize };
  }

  async import(userId: string, dto: GuideBookImportDto) {
    let snapshot: unknown, audience = "幼儿园", publicationId: string | null = null, approvedHash: string | null = null;
    if (dto.scope === "MINE") {
      const book = await this.prisma.pictureBook.findFirst({ where: { id: dto.bookId, userId } });
      if (!book) throw new AppException(40401, "绘本不存在或不可选择", 404);
      snapshot = snapshotCourseMaterial("PICTURE_BOOK", book);
      audience = pictureBookAudiences.some(value => value === book.audience) ? book.audience : audience;
    } else {
      const publication = await this.prisma.courseMaterialPublication.findFirst({ where: { ...publicBooks(), pictureBookId: dto.bookId }, select: { id: true, approvedSnapshot: true, approvedHash: true } });
      if (!publication) throw new AppException(40401, "绘本不存在或尚未审核发布", 404);
      snapshot = publication.approvedSnapshot; publicationId = publication.id; approvedHash = publication.approvedHash;
    }
    const book = playbackFromSnapshot(dto.bookId, snapshot);
    if (!book.pages.length) throw new AppException(40001, "绘本尚无页面，请先完成分镜", 400);
    if (book.pages.length > guidePdfMaxPages) throw new AppException(40001, "绘本不能超过 80 页", 400);
    if (new Set(book.pages.map(page => page.position)).size !== book.pages.length) throw new AppException(40001, "绘本页码异常，请整理后重试", 400);
    const buffer = await guideBookPdf(book, url => this.readImage(url));
    if (publicationId && !await this.prisma.courseMaterialPublication.findFirst({ where: { ...publicBooks(), id: publicationId, approvedHash }, select: { id: true } })) throw new AppException(40901, "绘本发布状态已变化，请重新选择", 409);
    const title = book.title.trim().slice(0, 100) || "未命名绘本";
    return this.guides.upload(userId, { originalname: `${title}.pdf`, mimetype: "application/pdf", size: buffer.length, buffer }, { audience });
  }

  private async readImage(url: string) {
    if (!url.startsWith("/")) return (await this.media.readPictureBookStoredImage(url)).buffer;
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
    return inspectPictureBookImage({ originalname: url, mimetype: response.headers.get("content-type")?.split(";")[0] ?? "", size, buffer: Buffer.concat(chunks) }).buffer;
  }
}
