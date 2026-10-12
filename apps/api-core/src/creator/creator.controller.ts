import { Body, Controller, Get, Headers, Inject, Param, Post, Req, Res } from '@nestjs/common';
type Response = {
    setHeader(name: string, value: string | number): void;
    status(code: number): void;
    send(body: Buffer): void;
};
import { getPrismaClient } from '@xueleai/database';
import { CreatorAuthService, type CreatorScope } from '../creator-auth/creator-auth.service.js';
import { CREATOR_API_AUDIENCE, CreatorOAuthError, creatorUnauthorizedChallenge } from '../creator-auth/creator-auth.protocol.js';
import { AuthService } from '../auth/auth.service.js';
import { AdminAuthService } from '../admin-auth/admin-auth.service.js';
import { ProfileContextService } from '../profiles/profile-context.service.js';
import { successResponse } from '../common/api-response.js';
import type { HeaderRequestLike } from '../security/request-types.js';
import { audioByteRange } from '../picture-books/picture-book.controller.js';
import { CreatorService } from './creator.service.js';
import { CreatorMediaService, type CreatorMediaViewer } from './creator-media.service.js';
import { creatorAssetUrl, readCreatorAssetReference } from './creator-assets.service.js';
import { exact, fail, integer, object } from './creator-common.js';
function privateHeaders(res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
}
function send(res: Response, file: {
    buffer: Buffer;
    mimetype: string;
}, range?: string) {
    privateHeaders(res);
    res.setHeader('Content-Type', file.mimetype);
    let body = file.buffer;
    if (range) {
        const bytes = audioByteRange(range, body.length);
        if (!bytes) {
            res.status(416);
            res.setHeader('Content-Range', `bytes */${body.length}`);
            body = Buffer.alloc(0);
        }
        else {
            res.status(206);
            res.setHeader('Content-Range', `bytes ${bytes.start}-${bytes.end}/${body.length}`);
            body = body.subarray(bytes.start, bytes.end + 1);
        }
    }
    res.setHeader('Content-Length', body.length);
    res.send(body);
}
@Controller('creator/v1')
export class CreatorController {
    constructor(
    @Inject(CreatorService)
    private readonly service: CreatorService, 
    @Inject(CreatorAuthService)
    private readonly auth: CreatorAuthService) {
    }
    private async principal(req: HeaderRequestLike, res: Response, scope: CreatorScope) {
        privateHeaders(res);
        try {
            return await this.auth.authenticateBearer(req, CREATOR_API_AUDIENCE, [scope]);
        }
        catch (error) {
            if (error instanceof CreatorOAuthError) {
                if (error.getStatus() === 401)
                    res.setHeader('WWW-Authenticate', creatorUnauthorizedChallenge(CREATOR_API_AUDIENCE));
                fail(error.getStatus() === 403 ? '客户端未获此操作授权' : '授权已失效，请重新授权', error.getStatus());
            }
            throw error;
        }
    }
    @Get('capabilities')
    async capabilities(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response) {
        return successResponse(await this.service.capabilities(await this.principal(req, res, 'creator:read')));
    }
    @Get('account')
    async account(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response) {
        return successResponse(await this.service.account(await this.principal(req, res, 'creator:read')));
    }
    @Get('books')
    async books(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response) {
        return successResponse(await this.service.listBooks(await this.principal(req, res, 'creator:read')));
    }
    @Get('books/:id')
    async book(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string) {
        return successResponse(await this.service.getBook(await this.principal(req, res, 'creator:read'), id));
    }
    @Post('books')
    async saveBook(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Body()
    b: unknown) {
        return successResponse(await this.service.saveBook(await this.principal(req, res, 'creator:write'), b));
    }
    @Post('books/:id/validate')
    async validateBook(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string) {
        return successResponse(await this.service.validateBook(await this.principal(req, res, 'creator:read'), id));
    }
    @Post('books/:id/submit')
    async submitBook(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string, 
    @Body()
    b: unknown) {
        return successResponse(await this.service.submitBook(await this.principal(req, res, 'creator:submit'), id, b));
    }
    @Get('albums')
    async albums(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response) {
        return successResponse(await this.service.listAlbums(await this.principal(req, res, 'creator:read')));
    }
    @Get('albums/:id')
    async album(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string) {
        return successResponse(await this.service.getAlbum(await this.principal(req, res, 'creator:read'), id));
    }
    @Post('albums')
    async saveAlbum(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Body()
    b: unknown) {
        return successResponse(await this.service.saveAlbum(await this.principal(req, res, 'creator:write'), b));
    }
    @Post('albums/:id/validate')
    async validateAlbum(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string) {
        return successResponse(await this.service.validateAlbum(await this.principal(req, res, 'creator:read'), id));
    }
    @Post('albums/:id/submit')
    async submitAlbum(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string, 
    @Body()
    b: unknown) {
        return successResponse(await this.service.submitAlbum(await this.principal(req, res, 'creator:submit'), id, b));
    }
    @Post('assets')
    async upload(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Body()
    b: unknown) {
        return successResponse(await this.service.assets.createUpload(await this.principal(req, res, 'creator:write'), b));
    }
    @Get('assets/:id')
    async uploadStatus(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string, 
    @Headers('x-creator-upload-capability')
    cap?: string) {
        privateHeaders(res);
        return successResponse(cap ? await this.service.assets.statusWithCapability(id, cap) : await this.service.assets.uploadStatus(await this.principal(req, res, 'creator:read'), id));
    }
    @Post('assets/:id/chunks')
    async chunk(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string, 
    @Body()
    input: unknown, 
    @Headers('x-creator-upload-capability')
    cap?: string) {
        privateHeaders(res);
        const b = object(input);
        exact(b, ['offset', 'data']);
        const offset = integer(b.offset, 0, 25 * 1024 * 1024);
        if (typeof b.data !== 'string' || b.data.length > 1398104 || b.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))
            fail('上传内容格式错误');
        const bytes = Buffer.from(b.data, 'base64');
        if (bytes.toString('base64') !== b.data)
            fail('上传内容格式错误');
        return successResponse(cap ? await this.service.assets.chunkWithCapability(id, cap, offset, bytes) : await this.service.assets.chunk(await this.principal(req, res, 'creator:write'), id, offset, bytes));
    }
    @Post('assets/:id/complete')
    async complete(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string, 
    @Headers('x-creator-upload-capability')
    cap?: string) {
        privateHeaders(res);
        return successResponse(cap ? await this.service.assets.completeWithCapability(id, cap) : await this.service.assets.complete(await this.principal(req, res, 'creator:write'), id));
    }
    @Get('assets/:id/data')
    async data(
    @Req()
    req: HeaderRequestLike, 
    @Res()
    res: Response, 
    @Param('id')
    id: string) {
        send(res, await this.service.assets.readOwn(await this.principal(req, res, 'creator:read'), id));
    }
}
@Controller()
export class CreatorMediaController {
    constructor(
    @Inject(CreatorMediaService)
    private readonly media: CreatorMediaService, 
    @Inject(AuthService)
    private readonly auth: AuthService, 
    @Inject(AdminAuthService)
    private readonly admins: AdminAuthService, 
    @Inject(ProfileContextService)
    private readonly profiles: ProfileContextService) {
    }
    private async viewer(req: HeaderRequestLike): Promise<CreatorMediaViewer> {
        try {
            await this.admins.me(req);
            return { admin: true };
        }
        catch { /* A regular account is not an administrator. */
        }
        let user;
        try {
            user = await this.auth.me(req);
        }
        catch {
            return {};
        }
        const subject = await this.profiles.requireSelected(req, user.id);
        return { userId: user.id, ...(subject.mode === 'LEARNER' ? { learnerId: subject.learnerId } : {}) };
    }
    @Get('creator-assets/:id')
    async own(
    @Req()
    req: HeaderRequestLike, 
    @Res()
    res: Response, 
    @Param('id')
    id: string) {
        const user = await this.auth.me(req);
        await this.profiles.requireAccount(req, user.id);
        const row = await getPrismaClient().creatorAsset.findFirst({ where: { id, userId: user.id, status: 'COMPLETED' } });
        if (!row)
            fail('素材不存在', 404);
        send(res, await readCreatorAssetReference(creatorAssetUrl(id)));
    }
    @Get('creator-media/revisions/:id/cover')
    async cover(
    @Req()
    req: HeaderRequestLike, 
    @Res()
    res: Response, 
    @Param('id')
    id: string) {
        send(res, await this.media.cover(id, await this.viewer(req)));
    }
    @Get('creator-media/items/:id/play')
    async play(
    @Req()
    req: HeaderRequestLike, 
    @Res({ passthrough: true })
    res: Response, 
    @Param('id')
    id: string) {
        privateHeaders(res);
        return successResponse(await this.media.play(id, await this.viewer(req)));
    }
    @Get('creator-media/items/:id/pages/:position/:kind')
    async page(
    @Req()
    req: HeaderRequestLike, 
    @Res()
    res: Response, 
    @Param('id')
    id: string, 
    @Param('position')
    position: string, 
    @Param('kind')
    kind: string, 
    @Headers('range')
    range?: string) {
        if (kind !== 'image' && kind !== 'audio')
            fail('素材类型不存在', 404);
        send(res, await this.media.page(id, Number(position), kind, await this.viewer(req)), range);
    }
}
