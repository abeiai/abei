import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseInterceptors, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { successResponse } from '../common/api-response.js';
import type { HeaderRequestLike } from '../security/request-types.js';
import { CreatorAuthService } from './creator-auth.service.js';
import { oauthMetadata, protectedResourceMetadata } from './creator-auth.protocol.js';

@Injectable()
class CreatorPrivateResponse implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return next.handle();
  }
}
@Controller('creator-auth')
@UseInterceptors(CreatorPrivateResponse)
export class CreatorAuthController {
  constructor(@Inject(CreatorAuthService) private readonly auth: CreatorAuthService) {}
  private ip(request: HeaderRequestLike) { return request.ip ?? request.socket?.remoteAddress ?? 'unknown'; }
  @Get('metadata') metadata() { return oauthMetadata(); }
  @Get('resource-metadata') resourceMetadata(@Query('resource') resource: string) { return protectedResourceMetadata(resource); }
  @Get('oauth/authorize')
  async oauthAuthorize(@Query() query: unknown, @Req() request: HeaderRequestLike, @Res() response: { redirect(status: number, url: string): void }) {
    response.redirect(302, await this.auth.authorize(query, this.ip(request)));
  }
  @Post('oauth/register')
  oauthRegister(@Body() body: unknown, @Req() request: HeaderRequestLike) { return this.auth.register(body, this.ip(request)); }
  @Post('oauth/device') @HttpCode(200)
  oauthDevice(@Body() body: unknown, @Req() request: HeaderRequestLike) { return this.auth.device(body, this.ip(request)); }
  @Post('oauth/token') @HttpCode(200)
  async oauthToken(@Body() body: unknown, @Req() request: HeaderRequestLike) {
    await this.auth.rateLimit(`token-ip:${this.ip(request)}`, 240);
    return this.auth.token(body);
  }
  @Post('oauth/revoke') @HttpCode(200)
  async oauthRevoke(@Body() body: unknown, @Req() request: HeaderRequestLike) {
    await this.auth.rateLimit(`revoke-ip:${this.ip(request)}`, 120);
    return this.auth.revoke(body);
  }
  @Get('requests/:id')
  async authorizationRequest(@Req() request: HeaderRequestLike, @Param('id') id: string) { return successResponse(await this.auth.readRequest(request, id)); }
  @Post('requests/:id') @HttpCode(200)
  async authorizationDecision(@Req() request: HeaderRequestLike, @Param('id') id: string, @Body() body: unknown) { return successResponse(await this.auth.decide(request, id, body)); }
  @Post('device/lookup') @HttpCode(200)
  async deviceLookup(@Req() request: HeaderRequestLike, @Body() body: unknown) { return successResponse(await this.auth.lookupDevice(request, body)); }
  @Post('device/decision') @HttpCode(200)
  async deviceDecision(@Req() request: HeaderRequestLike, @Body() body: unknown) { return successResponse(await this.auth.decideDevice(request, body)); }
  @Get('connections')
  async connections(@Req() request: HeaderRequestLike) { return successResponse(await this.auth.connections(request)); }
  @Delete('connections/:id')
  async revokeConnection(@Req() request: HeaderRequestLike, @Param('id') id: string) { return successResponse(await this.auth.revokeConnection(request, id)); }
}
