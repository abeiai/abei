import { assertStandaloneSharingAllowed, pictureBookSharingState, publishedAlbumRevisionWhere } from '../courses/album-sharing.js';
import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient, type Prisma } from '@xueleai/database';
import type { CreatorPrincipal } from '../creator-auth/creator-auth.service.js';
import { createCourseId, hashCourseSnapshot, snapshotCourseMaterial, diffCourseRevision } from '../courses/course-domain.js';
import { hasCompletePictureBookPlayback } from '../picture-books/picture-book-playback.js';
import { pictureBookAspectRatios } from '../picture-books/picture-book-ratio.js';
import { CreatorAssetsService, creatorAssetUrl } from './creator-assets.service.js';
import { exact, fail, integer, lock, object, requirePrincipal, str, versioned, type Tx } from './creator-common.js';
type CreatorWork = Prisma.CreatorWorkGetPayload<Record<string, never>>;
const json = (v: unknown) => v as Prisma.InputJsonValue;
function expected(input: unknown) {
    const b = object(input);
    exact(b, ['expectedVersion']);
    return integer(b.expectedVersion, 0, 2147483647);
}
@Injectable()
export class CreatorService {
    private readonly db = getPrismaClient();
    constructor(
    @Inject(CreatorAssetsService)
    readonly assets: CreatorAssetsService) {
    }
    async capabilities(p: CreatorPrincipal) {
        await requirePrincipal(p, 'creator:read');
        return { schemaVersion: 1, workScope: 'CLIENT_SYNCED_OWN_WORKS', listLimit: 100, books: { title: 100, brief: 30000, style: 80, caption: 500, narration: 1000, imagePrompt: 2000, minPages: 4, maxPages: 24, aspectRatios: pictureBookAspectRatios }, albums: { title: 80, summary: 2000, maxItems: 200 }, assets: this.assets.limits() };
    }
    async account(p: CreatorPrincipal) {
        await requirePrincipal(p, 'creator:read');
        const user = await this.db.user.findUniqueOrThrow({ where: { id: p.userId }, select: { accountNumber: true, nickname: true } });
        return { accountId: String(user.accountNumber), nickname: user.nickname, scopes: p.scopes };
    }
    async listBooks(p: CreatorPrincipal) {
        await requirePrincipal(p, 'creator:read');
        const rows = await this.db.creatorWork.findMany({ where: { userId: p.userId, kind: 'BOOK' }, orderBy: { updatedAt: 'desc' }, take: 100 });
        return Promise.all(rows.map(r => this.bookResult(this.db, r)));
    }
    async getBook(p: CreatorPrincipal, id: string) {
        await requirePrincipal(p, 'creator:read');
        return this.bookResult(this.db, await this.work(this.db, p, 'BOOK', id), true);
    }
    async listAlbums(p: CreatorPrincipal) {
        await requirePrincipal(p, 'creator:read');
        const rows = await this.db.creatorWork.findMany({ where: { userId: p.userId, kind: 'ALBUM' }, orderBy: { updatedAt: 'desc' }, take: 100 });
        return Promise.all(rows.map(r => this.albumResult(this.db, r)));
    }
    async getAlbum(p: CreatorPrincipal, id: string) {
        await requirePrincipal(p, 'creator:read');
        return this.albumResult(this.db, await this.work(this.db, p, 'ALBUM', id), true);
    }
    private async work(tx: Tx, p: CreatorPrincipal, kind: string, resourceId: string) {
        const row = await tx.creatorWork.findFirst({ where: { resourceId, userId: p.userId, kind } });
        if (!row)
            fail('作品不存在', 404);
        return row;
    }
    private async bookResult(tx: Tx, w: CreatorWork, full = false) {
        const book = await tx.pictureBook.findFirst({ where: { id: w.resourceId, userId: w.userId }, include: { submission: true, revisionItems: { where: { revision: publishedAlbumRevisionWhere }, select: { id: true }, take: 1 } } });
        if (!book)
            fail('作品不存在', 404);
        const { sharedViaAlbum, submission } = pictureBookSharingState(book);
        return { sharedViaAlbum, id: book.id, externalId: w.externalId, version: book.version, title: book.title, status: book.status, previewHref: `/picture-books/${book.id}/play`, publishedHref: submission?.publishedAt ? `/library/${book.id}` : null, review: submission ? { id: submission.id, status: submission.status, note: submission.reviewNote, published: !!submission.publishedAt, publishedVersion: submission.publishedVersion } : null, ...(full ? { manifest: w.input, book: { ...book, submission, sharedViaAlbum } } : {}) };
    }
    private async albumResult(tx: Tx, w: CreatorWork, full = false) {
        const course = await tx.course.findFirst({ where: { id: w.resourceId, userId: w.userId }, include: { workingRevision: { include: { items: { orderBy: { sortOrder: 'asc' } }, coverMedia: true } }, approvedRevision: true } });
        if (!course)
            fail('作品不存在', 404);
        return { id: course.id, externalId: w.externalId, version: w.version, title: (course.workingRevision ?? course.approvedRevision)?.name ?? '', status: course.reviewState, published: !!course.publishedAt, approvedRevisionId: course.approvedRevisionId, workingRevisionId: course.workingRevisionId, previewHref: `/c/${course.id}`, publishedHref: course.publishedAt ? `/c/${course.id}` : null, review: await tx.courseReviewRequest.findFirst({ where: { courseId: course.id }, orderBy: { submittedAt: 'desc' }, select: { id: true, status: true, reviewNote: true, submittedVersion: true, updatedAt: true } }), ...(full ? { manifest: w.input, currentRevision: course.workingRevision } : {}) };
    }
    private async ownedAsset(tx: Tx, p: CreatorPrincipal, id: unknown, kind = 'IMAGE') {
        const row = await tx.creatorAsset.findFirst({ where: { id: str(id, 80), userId: p.userId, status: 'COMPLETED', kind } });
        if (!row)
            fail('素材不存在或尚未完成', 404);
        return row;
    }
    async saveBook(p: CreatorPrincipal, input: unknown) {
        const b = object(input);
        exact(b, ['schemaVersion', 'externalId', 'expectedVersion', 'title', 'brief', 'audience', 'style', 'aspectRatio', 'isSpread', 'pageCount', 'coverAssetId', 'pages']);
        versioned(b);
        const title = str(b.title, 100), brief = str(b.brief ?? '', 30000, 0), audience = str(b.audience ?? '', 100, 0), style = str(b.style, 80), aspectRatio = str(b.aspectRatio ?? '1:1', 8), pageCount = integer(b.pageCount, 4, 24);
        if (!pictureBookAspectRatios.includes(aspectRatio as never) || (b.isSpread !== undefined && typeof b.isSpread !== 'boolean') || !Array.isArray(b.pages) || b.pages.length > 25)
            fail('绘本页面参数错误');
        const pages = b.pages.map((value, index) => {
            const page = object(value);
            exact(page, ['position', 'caption', 'narration', 'imagePrompt', 'textInImage', 'imageAssetId', 'audioAssetId']);
            if (page.position !== index || index > pageCount || (page.textInImage !== undefined && typeof page.textInImage !== 'boolean'))
                fail('绘本页码必须从封面 0 连续排列');
            return { position: index, caption: str(page.caption ?? '', 500, 0), narration: str(page.narration ?? page.caption ?? '', 1000, 0), imagePrompt: str(page.imagePrompt ?? '', 2000, 0), textInImage: page.textInImage === true, imageAssetId: page.imageAssetId ?? null, audioAssetId: page.audioAssetId ?? null };
        });
        const externalId = str(b.externalId, 120), requestHash = hashCourseSnapshot({ ...b, expectedVersion: undefined });
        return this.db.$transaction(async (tx) => {
            await requirePrincipal(p, 'creator:write', tx);
            await lock(tx, `creator-work:${p.userId}:BOOK:${externalId}`);
            const prior = await tx.creatorWork.findUnique({ where: { userId_kind_externalId: { userId: p.userId, kind: 'BOOK', externalId } } });
            const live = prior ? await tx.pictureBook.findUnique({ where: { id: prior.resourceId } }) : null;
            if (prior && live && prior.requestHash === requestHash && prior.version === live.version && [live.version, live.version - 1].includes(Number(b.expectedVersion)))
                return this.bookResult(tx, prior);
            if (Number(b.expectedVersion) !== (live?.version ?? 0) || (!!prior && !live))
                fail('作品版本已变化，请重新读取', 409);
            const cover = b.coverAssetId ? await this.ownedAsset(tx, p, b.coverAssetId) : null;
            const stored = [];
            for (const page of pages) {
                const image = page.imageAssetId ? await this.ownedAsset(tx, p, page.imageAssetId) : null;
                const audio = page.audioAssetId ? await this.ownedAsset(tx, p, page.audioAssetId, 'AUDIO') : null;
                stored.push({ position: page.position, caption: page.caption, narration: page.narration, imagePrompt: page.imagePrompt, textInImage: page.textInImage, imageUrl: image ? creatorAssetUrl(image.id) : null, audioUrl: audio ? creatorAssetUrl(audio.id) : null, imageTaskId: null, audioTaskId: null, status: image ? 'READY' : 'DRAFT' });
            }
            const complete = hasCompletePictureBookPlayback({ title, pageCount, pages: stored }, { requireDirectoryCover: true, directoryCoverUrl: cover ? creatorAssetUrl(cover.id) : null });
            const data = { title, brief, audience, style, aspectRatio, isSpread: b.isSpread === true, pageCount, pages: json(stored), status: complete ? 'COMPLETED' : 'EDITING', version: (live?.version ?? 0) + 1 };
            let bookId = live?.id;
            if (live) {
                const changed = await tx.pictureBook.updateMany({ where: { id: live.id, userId: p.userId, version: live.version }, data });
                if (changed.count !== 1)
                    fail('作品版本已变化', 409);
            }
            else
                bookId = (await tx.pictureBook.create({ data: { ...data, userId: p.userId, messages: [], characters: [] } })).id;
            const work = await tx.creatorWork.upsert({ where: { userId_kind_externalId: { userId: p.userId, kind: 'BOOK', externalId } }, create: { userId: p.userId, kind: 'BOOK', externalId, resourceId: bookId!, version: data.version, requestHash, input: json(b) }, update: { version: data.version, requestHash, input: json(b) } });
            return this.bookResult(tx, work);
        });
    }
    async validateBook(p: CreatorPrincipal, id: string) {
        await requirePrincipal(p, 'creator:read');
        const w = await this.work(this.db, p, 'BOOK', id);
        const book = await this.db.pictureBook.findUniqueOrThrow({ where: { id: w.resourceId } });
        const coverId = object(w.input).coverAssetId;
        const cover = typeof coverId === 'string' ? await this.db.creatorAsset.findFirst({ where: { id: coverId, userId: p.userId, kind: 'IMAGE', status: 'COMPLETED' } }) : null;
        const valid = book.status === 'COMPLETED' && hasCompletePictureBookPlayback(book, { requireDirectoryCover: true, directoryCoverUrl: cover ? creatorAssetUrl(cover.id) : null });
        return { id, version: book.version, valid, issues: valid ? [] : ['请补全封面与全部页面图文'] };
    }
    async submitBook(p: CreatorPrincipal, id: string, input: unknown) {
        const version = expected(input);
        return this.db.$transaction(async (tx) => {
            await requirePrincipal(p, 'creator:submit', tx);
            await lock(tx, `picture-book-submission:${id}`);
            const work = await this.work(tx, p, 'BOOK', id);
            await assertStandaloneSharingAllowed(tx, id);
            // Row lock makes the snapshot and its expectedVersion inseparable from ordinary studio updates.
            await tx.$queryRaw `SELECT id FROM picture_books WHERE id=${id} FOR UPDATE`;
            const existing = await tx.pictureBookSubmission.findUnique({ where: { pictureBookId: id } });
            if (existing?.submittedVersion === version && (existing.status === 'PENDING' || (existing.status === 'APPROVED' && existing.publishedAt)))
                return this.submissionResult(existing);
            const book = await tx.pictureBook.findUniqueOrThrow({ where: { id } });
            if (book.version !== version)
                fail('作品版本已变化', 409);
            if (book.status !== 'COMPLETED' || !hasCompletePictureBookPlayback(book))
                fail('请补全封面与全部页面图文后再公开分享');
            const manifest = object(work.input), cover = await this.ownedAsset(tx, p, manifest.coverAssetId), snapshot = { ...snapshotCourseMaterial('PICTURE_BOOK', book), libraryCoverUrl: creatorAssetUrl(cover.id) }, snapshotHash = hashCourseSnapshot(snapshot);
            if (existing?.status === 'PENDING') {
                if (existing.snapshotHash !== snapshotHash)
                    fail('已有不同版本正在审核', 409);
                return this.submissionResult(existing);
            }
            if (existing?.publishedHash === snapshotHash && existing.publishedAt)
                return this.submissionResult(existing);
            const row = await tx.pictureBookSubmission.upsert({ where: { pictureBookId: id }, create: { submittedVersion: version, pictureBookId: id, snapshot: json(snapshot), snapshotHash, coverUrl: creatorAssetUrl(cover.id) }, update: { submittedVersion: version, snapshot: json(snapshot), snapshotHash, coverUrl: creatorAssetUrl(cover.id), status: 'PENDING', submittedAt: new Date(), reviewNote: null, reviewedAt: null, reviewedByAdminId: null, coverToken: null, coverExpiresAt: null } });
            return this.submissionResult(row);
        });
    }
    private submissionResult(row: {
        id: string;
        status: string;
        updatedAt: Date;
        reviewNote: string | null;
    }) {
        return { id: row.id, status: row.status, updatedAt: row.updatedAt, reviewNote: row.reviewNote };
    }
    async saveAlbum(p: CreatorPrincipal, input: unknown) {
        const b = object(input);
        exact(b, ['schemaVersion', 'externalId', 'expectedVersion', 'title', 'summary', 'coverAssetId', 'items']);
        versioned(b);
        const externalId = str(b.externalId, 120), name = str(b.title, 80, 2), summary = str(b.summary, 2000), requestHash = hashCourseSnapshot({ ...b, expectedVersion: undefined });
        if (!Array.isArray(b.items) || !b.items.length || b.items.length > 200)
            fail('专辑须包含 1 到 200 本绘本');
        const items = b.items.map(value => {
            const item = object(value);
            exact(item, ['bookId', 'expectedVersion', 'displayName']);
            return { bookId: str(item.bookId, 80), version: integer(item.expectedVersion, 0, 2147483647), displayName: str(item.displayName, 120) };
        });
        if (new Set(items.map(i => i.bookId)).size !== items.length)
            fail('专辑不能重复引用绘本');
        return this.db.$transaction(async (tx) => {
            await requirePrincipal(p, 'creator:write', tx);
            await lock(tx, `creator-work:${p.userId}:ALBUM:${externalId}`);
            let prior = await tx.creatorWork.findUnique({ where: { userId_kind_externalId: { userId: p.userId, kind: 'ALBUM', externalId } } });
            const id = prior?.resourceId ?? createCourseId();
            await lock(tx, `course:${id}`);
            await tx.$queryRaw `SELECT id FROM courses WHERE id=${id} FOR UPDATE`;
            if (prior)
                prior = await tx.creatorWork.findUnique({ where: { id: prior.id } });
            if (prior && prior.requestHash === requestHash && [prior.version, prior.version - 1].includes(Number(b.expectedVersion)))
                return this.albumResult(tx, prior);
            if (Number(b.expectedVersion) !== (prior?.version ?? 0))
                fail('专辑版本已变化', 409);
            const cover = await this.ownedAsset(tx, p, b.coverAssetId);
            if (!prior)
                await tx.course.create({ data: { id, userId: p.userId } });
            const revisionId = (await tx.courseRevision.create({ data: { course: { connect: { id } }, name, summary, coverMedia: { create: { filename: `creator-${cover.id}`, originalName: '专辑封面', mimeType: cover.mimeType, size: cover.size, url: creatorAssetUrl(cover.id), createdByUserId: p.userId } } } })).id;
            for (const [index, item] of items.entries()) {
                await tx.$queryRaw `SELECT id FROM picture_books WHERE id=${item.bookId} FOR SHARE`;
                const book = await tx.pictureBook.findFirst({ where: { id: item.bookId, userId: p.userId } });
                if (!book)
                    fail('绘本作品不存在', 404);
                if (book.version !== item.version)
                    fail('成员绘本版本已变化', 409);
                if (book.status !== 'COMPLETED' || !hasCompletePictureBookPlayback(book))
                    fail('专辑成员须为完整绘本');
                const snapshot = snapshotCourseMaterial('PICTURE_BOOK', book), hash = hashCourseSnapshot(snapshot);
                const publication = await tx.courseMaterialPublication.upsert({ where: { pictureBookId: book.id }, create: { materialType: 'PICTURE_BOOK', pictureBookId: book.id, currentHash: hash, currentSnapshot: json(snapshot) }, update: {} });
                await tx.courseRevisionItem.create({ data: { revisionId, publicationId: publication.id, materialType: 'PICTURE_BOOK', pictureBookId: book.id, displayName: item.displayName, sortOrder: index, pinnedVersion: book.version, pinnedSnapshot: json(snapshot), pinnedHash: hash } });
            }
            const course = await tx.course.findUniqueOrThrow({ where: { id } });
            await tx.course.update({ where: { id }, data: { workingRevisionId: revisionId, reviewState: course.reviewState === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : course.publishedAt ? 'PUBLISHED' : 'DRAFT' } });
            const work = await tx.creatorWork.upsert({ where: { userId_kind_externalId: { userId: p.userId, kind: 'ALBUM', externalId } }, create: { userId: p.userId, kind: 'ALBUM', externalId, resourceId: id, requestHash, input: json(b) }, update: { version: { increment: 1 }, requestHash, input: json(b) } });
            return this.albumResult(tx, work);
        }, { timeout: 30000 });
    }
    async validateAlbum(p: CreatorPrincipal, id: string) {
        const album = await this.getAlbum(p, id);
        const revision = await this.db.courseRevision.findUnique({ where: { id: album.workingRevisionId ?? album.approvedRevisionId ?? '' }, include: { items: true } });
        const issues: string[] = [];
        if (!revision || !revision.items.length)
            issues.push('专辑须包含完整绘本');
        for (const item of revision?.items ?? []) {
            if (item.materialType !== 'PICTURE_BOOK')
                issues.push('创作专辑只能包含绘本');
            else if (item.pinnedHash) {
                if (!item.pinnedSnapshot || hashCourseSnapshot(item.pinnedSnapshot) !== item.pinnedHash)
                    issues.push('成员绘本快照已变化');
            }
            else {
                const book = await this.db.pictureBook.findFirst({ where: { id: item.pictureBookId!, userId: p.userId, status: 'COMPLETED' } });
                if (!book || !hasCompletePictureBookPlayback(book)) issues.push('成员绘本尚未完整');
            }
        }
        return { id, version: album.version, valid: !issues.length, issues: [...new Set(issues)] };
    }
    async submitAlbum(p: CreatorPrincipal, id: string, input: unknown) {
        const version = expected(input);
        return this.db.$transaction(async (tx) => {
            await requirePrincipal(p, 'creator:submit', tx);
            await lock(tx, `course:${id}`);
            await tx.$queryRaw `SELECT id FROM courses WHERE id=${id} FOR UPDATE`;
            const work = await this.work(tx, p, 'ALBUM', id);
            const retried = await tx.courseReviewRequest.findFirst({ where: { courseId: id, submittedVersion: version, status: { in: ['PENDING', 'APPROVED'] } } });
            if (retried)
                return this.submissionResult(retried);
            if (work.version !== version)
                fail('专辑版本已变化', 409);
            const course = await tx.course.findUniqueOrThrow({ where: { id }, include: { workingRevision: { include: { coverMedia: true, items: { orderBy: { sortOrder: 'asc' } } } } } });
            const pending = await tx.courseReviewRequest.findFirst({ where: { courseId: id, status: 'PENDING', scope: 'COURSE_REVISION' } });
            if (pending) {
                if (pending.courseRevisionId !== course.workingRevisionId)
                    fail('已有不同专辑版本正在审核', 409);
                return this.submissionResult(pending);
            }
            const revision = course.workingRevision;
            if (!revision) {
                const prior = await tx.courseReviewRequest.findFirst({ where: { courseId: id, courseRevisionId: course.approvedRevisionId, status: 'APPROVED' } });
                if (prior)
                    return this.submissionResult(prior);
                fail('专辑没有可提交版本', 409);
            }
            for (const item of revision.items) {
                if (item.materialType !== 'PICTURE_BOOK')
                    fail('创作专辑只能包含绘本');
                if (!item.pinnedHash) {
                    await tx.$queryRaw `SELECT id FROM picture_books WHERE id=${item.pictureBookId!} FOR SHARE`;
                    const book = await tx.pictureBook.findFirst({ where: { id: item.pictureBookId!, userId: p.userId, status: 'COMPLETED' } });
                    if (!book || !hasCompletePictureBookPlayback(book))
                        fail('绘本尚未完整');
                    const snapshot = snapshotCourseMaterial('PICTURE_BOOK', book);
                    item.pinnedSnapshot = json(snapshot) as Prisma.JsonValue;
                    item.pinnedHash = hashCourseSnapshot(snapshot);
                    item.pinnedVersion = book.version;
                    await tx.courseRevisionItem.update({ where: { id: item.id }, data: { pinnedSnapshot: json(snapshot), pinnedHash: item.pinnedHash, pinnedVersion: book.version } });
                }
            }
            const after = { name: revision.name, summary: revision.summary, coverMediaId: revision.coverMediaId, coverUrl: `/api/creator-media/revisions/${revision.id}/cover`, tags: revision.tags, items: revision.items.map(item => ({ publicationId: item.publicationId, materialType: 'PICTURE_BOOK' as const, pictureBookId: item.pictureBookId, displayName: item.displayName, sortOrder: item.sortOrder, firstPublication: true, materialHash: item.pinnedHash, materialSnapshot: item.pinnedSnapshot })) };
            await tx.courseRevision.update({ where: { id: revision.id }, data: { status: 'PENDING', submittedAt: new Date() } });
            await tx.course.update({ where: { id }, data: { reviewState: 'PENDING_REVIEW' } });
            return this.submissionResult(await tx.courseReviewRequest.create({ data: { submittedVersion: version, scope: 'COURSE_REVISION', courseId: id, courseRevisionId: revision.id, submittedByUserId: p.userId, beforeSnapshot: {}, afterSnapshot: json(after), diff: json(diffCourseRevision({}, after)) } }));
        });
    }
    async status(p: CreatorPrincipal, kind: 'BOOK' | 'ALBUM', id: string) {
        return kind === 'BOOK' ? this.getBook(p, id) : this.getAlbum(p, id);
    }
}
