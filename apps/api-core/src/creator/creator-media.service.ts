import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@xueleai/database';
import { MediaService } from '../media/media.service.js';
import { readPictureBookDemoImage } from '../picture-books/picture-book-demo-image.js';
import { playbackFromSnapshot } from '../picture-books/picture-book-playback.js';
import { creatorAssetId, readCreatorAssetReference } from './creator-assets.service.js';
import { fail } from './creator-common.js';
export type CreatorMediaViewer = {
    userId?: string;
    admin?: boolean;
    learnerId?: string;
};
@Injectable()
export class CreatorMediaService {
    private readonly db = getPrismaClient();
    constructor(
    @Inject(MediaService)
    private readonly media: MediaService) {
    }
    private async revision(id: string, v: CreatorMediaViewer) {
        const row = await this.db.courseRevision.findUnique({ where: { id }, include: { course: true, coverMedia: true } });
        if (!row)
            fail('专辑版本不存在', 404);
        if (v.admin || (!v.learnerId && v.userId === row.course.userId))
            return row;
        if (row.status !== 'APPROVED' || !row.course.publishedAt || row.course.approvedRevisionId !== id)
            fail('专辑尚未发布', 404);
        if (v.learnerId) {
            const allowed = await this.db.course.count({ where: { id: row.courseId, learnerAuthorizations: { some: { learnerId: v.learnerId } }, OR: [{ userId: v.userId }, { enrollments: { some: { userId: v.userId } } }] } });
            if (!allowed)
                fail('专辑尚未授权', 404);
        }
        return row;
    }
    async cover(id: string, v: CreatorMediaViewer) {
        const r = await this.revision(id, v);
        return creatorAssetId(r.coverMedia.url) ? readCreatorAssetReference(r.coverMedia.url, true) : this.media.readPictureBookStoredImage(r.coverMedia.url);
    }
    private async item(id: string, v: CreatorMediaViewer) {
        const row = await this.db.courseRevisionItem.findUnique({ where: { id }, include: { publication: true } });
        if (!row || row.materialType !== 'PICTURE_BOOK')
            fail('绘本版本不存在', 404);
        await this.revision(row.revisionId, v);
        const snapshot = row.pinnedSnapshot ?? row.publication.approvedSnapshot;
        if (!snapshot)
            fail('绘本尚未发布', 404);
        return playbackFromSnapshot(row.pictureBookId!, snapshot);
    }
    async play(id: string, v: CreatorMediaViewer) {
        const book = await this.item(id, v);
        return { ...book, pages: book.pages.map(page => ({ ...page, imageUrl: page.imageUrl ? `/api/creator-media/items/${id}/pages/${page.position}/image` : null, audioUrl: page.audioUrl ? `/api/creator-media/items/${id}/pages/${page.position}/audio` : null })) };
    }
    async page(id: string, position: number, kind: 'image' | 'audio', v: CreatorMediaViewer) {
        const book = await this.item(id, v), page = book.pages.find(p => p.position === position), url = kind === 'image' ? page?.imageUrl : page?.audioUrl;
        if (!url)
            fail('页面素材不存在', 404);
        if (kind === 'image' && url.startsWith('/picture-book-demos/'))
            return readPictureBookDemoImage(url);
        return creatorAssetId(url) ? readCreatorAssetReference(url) : kind === 'image' ? this.media.readPictureBookStoredImage(url) : this.media.readPictureBookStoredAudio(url);
    }
}
