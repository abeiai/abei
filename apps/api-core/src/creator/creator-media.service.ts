import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { getPrismaClient } from '@xueleai/database';
import { MediaService } from '../media/media.service.js';
import { readPictureBookDemoImage } from '../picture-books/picture-book-demo-image.js';
import { playbackFromSnapshot } from '../picture-books/picture-book-playback.js';
import { creatorAssetId, readCreatorAssetReference } from './creator-assets.service.js';
import { fail } from './creator-common.js';
const publicR2Origin = 'https://r.abeiai.com';
const signedParameter = /signature|token|credential|authorization|accesskey|keypair|policy|expires|jwt|hmac|secret|ticket|verify|^sign$|^sig$|^auth|^x(?:amz|goog|cos)|^qsign/i;
function publicR2MediaUrl(source: string | null, kind: 'image' | 'audio') {
    if (!source?.startsWith(`${publicR2Origin}/`)) return undefined;
    try {
        const url = new URL(source);
        // Match the existing authorized R2 reader so CDN failures can fall back safely.
        const key = source.slice(publicR2Origin.length + 1).split(/[?#]/, 1)[0]!;
        const allowedKey = kind === 'image' ? /^[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/ : /^[a-zA-Z0-9/_-]+\.(?:mp3|wav|ogg|aac|m4a)$/;
        if (url.origin !== publicR2Origin || url.username || url.password || key.length > 2048 || !allowedKey.test(key)) return undefined;
        if ([...url.searchParams.keys()].some(key => signedParameter.test(key.replace(/[-_]/g, '')))) return undefined;
        return source;
    } catch { return undefined; }
}
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
        const revision = await this.revision(row.revisionId, v);
        const snapshot = row.pinnedSnapshot ?? row.publication.approvedSnapshot;
        if (!snapshot)
            fail('绘本尚未发布', 404);
        const book = playbackFromSnapshot(row.pictureBookId!, snapshot);
        const publicMedia = !v.learnerId && revision.status === 'APPROVED' && Boolean(revision.course.publishedAt) && revision.course.approvedRevisionId === revision.id;
        return { book, publicMedia };
    }
    async play(id: string, v: CreatorMediaViewer) {
        const { book, publicMedia } = await this.item(id, v);
        return { ...book, pages: book.pages.map(page => {
            const publicImageUrl = publicMedia ? publicR2MediaUrl(page.imageUrl, 'image') : undefined;
            const publicAudioUrl = publicMedia ? publicR2MediaUrl(page.audioUrl, 'audio') : undefined;
            return { ...page,
                imageUrl: page.imageUrl ? `/api/creator-media/items/${id}/pages/${page.position}/image` : null,
                audioUrl: page.audioUrl ? `/api/creator-media/items/${id}/pages/${page.position}/audio` : null,
                ...(publicImageUrl ? { publicImageUrl } : {}), ...(publicAudioUrl ? { publicAudioUrl } : {}),
                ...(page.translations ? { translations: page.translations.map(translation => {
                    const translationUrl = publicMedia ? publicR2MediaUrl(translation.audioUrl, 'audio') : undefined;
                    return { ...translation, audioUrl: translation.audioUrl ? `/api/creator-media/items/${id}/pages/${page.position}/audio?language=${encodeURIComponent(translation.language)}` : null, ...(translationUrl ? { publicAudioUrl: translationUrl } : {}) };
                }) } : {})
            };
        }) };
    }
    async page(id: string, position: number, kind: 'image' | 'audio', v: CreatorMediaViewer, language?: string, width?: number) {
        const { book, publicMedia } = await this.item(id, v), page = book.pages.find(p => p.position === position), url = kind === 'image' ? page?.imageUrl : language ? page?.translations?.find(translation => translation.language === language)?.audioUrl : page?.audioUrl;
        if (!url)
            fail('页面素材不存在', 404);
        if (kind === 'image' && url.startsWith('/picture-book-demos/'))
            return readPictureBookDemoImage(url);
        // The signed S3 reader expects an object key without ordinary public URL parameters.
        // Never strip parameters from private or signed URLs.
        const source = publicMedia && publicR2MediaUrl(url, kind) ? url.split(/[?#]/, 1)[0]! : url;
        const result = await (creatorAssetId(source) ? readCreatorAssetReference(source, false, kind === 'image' ? width : undefined) : kind === 'image' ? this.media.readPictureBookStoredImage(source, width, url) : this.media.readPictureBookStoredAudio(source));
        if (kind === 'image' && width && publicMedia && publicR2MediaUrl(url, 'image')) {
            try {
                const metadata = await sharp(result.buffer, { animated: true, limitInputPixels: 40_000_000 }).metadata();
                const displayWidth = [5, 6, 7, 8].includes(metadata.orientation ?? 1) ? metadata.height : metadata.width;
                if (!displayWidth || displayWidth > width || (metadata.pages ?? 1) > 1) fail('图片处理失败，请稍后重试', 502);
            } catch { fail('图片处理失败，请稍后重试', 502); }
        }
        return result;
    }
}
