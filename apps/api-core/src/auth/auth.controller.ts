import { referralCookie } from "../referrals/referral-rules.js";
import { readCookie } from "../security/cookies.js";
import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { successResponse } from "../common/api-response.js";
import { avatarUploadMaxBytes, MediaService, type UploadedFileLike } from "../media/media.service.js";
import { clearProfileContextCookie, type ResponseLike } from "../security/cookies.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { AuthService } from "./auth.service.js";
import { ChangePasswordDto, VerifyPasswordDto } from "./dto/change-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { LearnerLoginDto } from "./dto/learner-login.dto.js";
import { LogoutDto } from "./dto/logout.dto.js";
import { BindPhoneDto, PhoneLoginDto, SendPhoneCodeDto } from "./dto/phone-auth.dto.js";
import { ResetPasswordWithTokenDto, VerifyPasswordResetCodeDto } from "./dto/password-reset.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { ChangeEmailDto, ResetPasswordDto, SendChangeEmailCodeDto, SendEmailCodeDto } from "./dto/email-auth.dto.js";
import { UpdateProfileDto } from "./dto/update-profile.dto.js";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: unknown, @Req() request?: unknown) {
    const result = await this.authService.register(dto, response as never, request ? readCookie(request as never, referralCookie) : null);
    clearProfileContextCookie(response as ResponseLike);
    return successResponse(result);
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: unknown) {
    const result = await this.authService.login(dto, response as never);
    clearProfileContextCookie(response as ResponseLike);
    return successResponse(result);
  }

  @Post("learner-login")
  async learnerLogin(
    @Body() dto: LearnerLoginDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    return successResponse(await this.authService.loginAsLearner(dto, response as never));
  }

  @Post("phone-code")
  async sendPhoneCode(@Req() request: unknown, @Body() dto: SendPhoneCodeDto) {
    const purpose = dto.purpose ?? "LOGIN";
    const user = purpose === "BIND_PHONE" ? await this.authService.me(request as never) : null;
    if (user) await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.sendPhoneCode(dto, user?.id));
  }

  @Post("email-code")
  async sendEmailCode(@Body() dto: SendEmailCodeDto) {
    return successResponse(await this.authService.sendEmailCode(dto));
  }

  @Post("email-change-code")
  async sendChangeEmailCode(@Req() request: unknown, @Body() dto: SendChangeEmailCodeDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.sendChangeEmailCode(user.id, dto));
  }

  @Post("phone-login")
  async phoneLogin(@Body() dto: PhoneLoginDto, @Res({ passthrough: true }) response: unknown, @Req() request?: unknown) {
    const result = await this.authService.loginByPhone(dto, response as never, request ? readCookie(request as never, referralCookie) : null);
    clearProfileContextCookie(response as ResponseLike);
    return successResponse(result);
  }

  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return successResponse(await this.authService.resetPassword(dto));
  }

  @Post("password-reset/verify-code")
  async verifyPasswordResetCode(@Body() dto: VerifyPasswordResetCodeDto) {
    return successResponse(await this.authService.verifyPasswordResetCode(dto));
  }

  @Post("password-reset/confirm")
  async resetPasswordWithToken(@Body() dto: ResetPasswordWithTokenDto) {
    return successResponse(await this.authService.resetPasswordWithToken(dto));
  }

  @Post("logout")
  async logout(
    @Req() request: unknown,
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    return successResponse(await this.authService.logout(request as never, response as never, dto));
  }

  @Post("refresh")
  async refresh(@Req() request: unknown, @Res({ passthrough: true }) response: unknown) {
    return successResponse(await this.authService.refresh(request as never, response as never));
  }

  @Get("me")
  async me(@Req() request: unknown) {
    return successResponse(await this.authService.me(request as never));
  }

  @Patch("profile")
  async updateProfile(@Req() request: unknown, @Body() dto: UpdateProfileDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.updateProfile(user.id, dto));
  }

  @Patch("avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: avatarUploadMaxBytes()
      }
    })
  )
  async updateAvatar(@Req() request: unknown, @UploadedFile() file?: UploadedFileLike) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    const asset = await this.mediaService.uploadUserAvatar(user.id, file);

    return successResponse(await this.authService.updateAvatar(user.id, asset.url));
  }

  @Patch("phone")
  async bindPhone(@Req() request: unknown, @Body() dto: BindPhoneDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.bindPhone(user.id, dto));
  }

  @Patch("email")
  async changeEmail(@Req() request: unknown, @Body() dto: ChangeEmailDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.changeEmail(user.id, dto));
  }

  @Patch("password")
  async changePassword(@Req() request: unknown, @Body() dto: ChangePasswordDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.changePassword(user.id, dto));
  }

  @Post("verify-password")
  async verifyPassword(@Req() request: unknown, @Body() dto: VerifyPasswordDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.authService.verifyLoginPassword(user.id, dto));
  }
}
