import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { successResponse } from "../common/api-response.js";
import {
  clearProfileContextCookie,
  type ResponseLike,
} from "../security/cookies.js";
import { referralCookie } from "../referrals/referral-rules.js";
import { AuthService } from "./auth.service.js";
import { WechatAuthService } from "./wechat-auth.service.js";
import {
  loadWechatMpConfig,
  wechatScanCookieName,
  WechatAuthError,
} from "./wechat-mp.types.js";
import { WechatMessageCodec } from "./wechat-mp-message.js";
import type { HeaderRequestLike } from "../security/request-types.js";
class ChallengeDto {
  @IsOptional() @IsString() @MaxLength(2048) next?: string;
}
class PhoneCodeDto {
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" }) phone!: string;
}
class EmailResolutionDto {
  @IsEmail({}, { message: "邮箱格式不正确" }) @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
class PhoneResolutionDto extends PhoneCodeDto {
  @Matches(/^\d{4,8}$/, { message: "验证码格式不正确" }) code!: string;
  @IsIn(["BIND", "CREATE"], { message: "请选择绑定或创建账号" }) action!:
    | "BIND"
    | "CREATE";
}
interface HttpResponse extends ResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponse;
  type(value: string): HttpResponse;
  send(body: string): void;
}
function origin() {
  try {
    return new URL(process.env.APP_BASE_URL ?? "http://localhost:3600").origin;
  } catch {
    throw new WechatAuthError("config");
  }
}
const cookieName = wechatScanCookieName;
function cookieOptions() {
  return {
    httpOnly: true,
    secure: origin().startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 600_000,
  };
}
function cookie(request: HeaderRequestLike, name: string) {
  const header = request.headers.cookie;
  if (typeof header !== "string" || header.length > 8192) return null;
  const values = header
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + "="));
  if (values.length !== 1) return null;
  try {
    return decodeURIComponent(values[0]!.slice(name.length + 1));
  } catch {
    return null;
  }
}
function singleHeader(request: HeaderRequestLike, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : null;
}
function browserOrigin(request: HeaderRequestLike) {
  const expected = origin(),
    supplied = singleHeader(request, "origin"),
    site = singleHeader(request, "sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    throw new WechatAuthError("csrf");
  if (supplied) {
    if (supplied !== expected) throw new WechatAuthError("csrf");
    return;
  }
  const referer = singleHeader(request, "referer");
  try {
    if (referer && new URL(referer).origin === expected) return;
  } catch {
    throw new WechatAuthError("csrf");
  }
  throw new WechatAuthError("csrf");
}
@Controller("auth/wechat/mp")
export class WechatAuthController {
  constructor(
    @Inject(WechatAuthService) private readonly service: WechatAuthService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async browser(request: HeaderRequestLike, response: HttpResponse) {
    response.setHeader("Cache-Control", "no-store");
    browserOrigin(request);
    try {
      await this.auth.me(request as never);
      throw new WechatAuthError("already_logged_in");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "getStatus" in error &&
        typeof error.getStatus === "function" &&
        error.getStatus() === 401
      )
        return;
      throw error;
    }
  }
  private credentials(request: HeaderRequestLike) {
    const context = cookie(request, cookieName()),
      csrf = singleHeader(request, "x-wechat-csrf");
    if (!context || !csrf || csrf.length > 128)
      throw new WechatAuthError("state");
    return { context, csrf };
  }
  private finish(result: { status: string }, response: HttpResponse) {
    if (result.status === "AUTHENTICATED") {
      response.clearCookie(cookieName(), cookieOptions());
      clearProfileContextCookie(response);
    }
  }
  @Get("bootstrap")
  async bootstrap(
    @Req() request: HeaderRequestLike,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const result = await this.service.bootstrap(cookie(request, cookieName()));
    response.cookie(cookieName(), result.contextId, cookieOptions());
    return successResponse({
      csrfToken: result.csrfToken,
      registrationEnabled: result.registrationEnabled,
    });
  }
  @Post("challenges")
  async create(
    @Req() request: HeaderRequestLike,
    @Body() body: ChallengeDto,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const { context, csrf } = this.credentials(request);
    return successResponse(
      await this.service.createChallenge(
        context,
        csrf,
        body.next,
        cookie(request, referralCookie),
      ),
    );
  }
  @Get("challenges/:id")
  async poll(
    @Req() request: HeaderRequestLike,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const context = cookie(request, cookieName());
    if (!context) throw new WechatAuthError("state");
    return successResponse(await this.service.poll(context, id));
  }
  @Delete("challenges/:id")
  async cancel(
    @Req() request: HeaderRequestLike,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const { context, csrf } = this.credentials(request);
    await this.service.cancel(context, csrf, id);
    return successResponse({ cancelled: true });
  }
  @Post("challenges/:id/complete")
  async complete(
    @Req() request: HeaderRequestLike,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const { context, csrf } = this.credentials(request);
    const result = await this.service.complete(context, csrf, id, response);
    this.finish(result, response);
    return successResponse(result);
  }
  @Post("resolution/phone-code")
  async phoneCode(
    @Req() request: HeaderRequestLike,
    @Body() body: PhoneCodeDto,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const { context, csrf } = this.credentials(request);
    return successResponse(
      await this.service.sendResolutionCode(context, csrf, body.phone),
    );
  }
  @Post("resolution/phone")
  async resolvePhone(
    @Req() request: HeaderRequestLike,
    @Body() body: PhoneResolutionDto,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const { context, csrf } = this.credentials(request);
    const result = await this.service.resolvePhone(
      context,
      csrf,
      body,
      response,
    );
    this.finish(result, response);
    return successResponse(result);
  }
  @Post("resolution/email")
  async resolveEmail(
    @Req() request: HeaderRequestLike,
    @Body() body: EmailResolutionDto,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    await this.browser(request, response);
    const { context, csrf } = this.credentials(request);
    const result = await this.service.resolveEmail(
      context,
      csrf,
      body,
      response,
    );
    this.finish(result, response);
    return successResponse(result);
  }
  @Get("events")
  verify(
    @Query() query: Record<string, string | undefined>,
    @Res() response: HttpResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    try {
      response
        .type("text/plain")
        .send(new WechatMessageCodec(loadWechatMpConfig()).verify(query));
    } catch {
      response.status(400).send("");
    }
  }
  @Post("events")
  @HttpCode(200)
  async events(
    @Query() query: Record<string, string | undefined>,
    @Body() body: unknown,
    @Res() response: HttpResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    try {
      if (typeof body !== "string") throw new WechatAuthError("state");
      const codec = new WechatMessageCodec(loadWechatMpConfig()),
        message = codec.decode(query, body),
        reply = await this.service.handleMessage(message);
      response
        .type(reply ? "application/xml" : "text/plain")
        .send(reply ? codec.reply(message.FromUserName!, reply) : "success");
    } catch (error) {
      response
        .status(
          error instanceof WechatAuthError && error.reason === "upstream"
            ? 503
            : 400,
        )
        .send("");
    }
  }
}
